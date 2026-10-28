import type { PrismaClient } from '@prisma/client';

export async function releaseDeletedAccountEmail(db: PrismaClient, id: string, confirmationName: string) {
  return db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id } });
    if (!user || !user.deletedAt || user.active)
      throw Object.assign(new Error('Only a deleted account can release its email.'), { statusCode: 409 });
    if (confirmationName !== user.name)
      throw Object.assign(new Error('Type the account name exactly to confirm.'), { statusCode: 400 });
    const archivedEmail = `deleted-${user.id}@accounts.invalid`;
    if (user.email === archivedEmail) return { emailReleased: true };
    const identity = await tx.authIdentity.findUnique({
      where: { kind_value: { kind: 'email', value: user.email.toLowerCase() } }
    });
    if (identity && identity.userId !== id)
      throw Object.assign(new Error('This email is linked to another account. Review its identities first.'), { statusCode: 409 });
    const changed = await tx.user.updateMany({
      where: { id, email: user.email, deletedAt: user.deletedAt, active: false },
      data: { email: archivedEmail }
    });
    if (changed.count !== 1)
      throw Object.assign(new Error('The account changed. Refresh and try again.'), { statusCode: 409 });
    await tx.authIdentity.updateMany({
      where: { userId: id, kind: 'email', value: user.email.toLowerCase() },
      data: { value: archivedEmail }
    });
    await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.authSecurityEvent.create({ data: { userId: id, kind: 'deleted_account_email_released_for_fresh_registration' } });
    return { emailReleased: true };
  });
}
