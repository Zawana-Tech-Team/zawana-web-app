import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '../src/lib/prisma.js';
import { firebaseAdminAuth } from '../src/services/firebaseAdmin.js';

// Review against the actual deployment database first. No account is restored or merged.
// Usage: tsx scripts/release-deleted-account-email.ts EMAIL [--apply --user-id=ID]
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new Error('Supply the email to release from a deleted account.');
  const matches = await prisma.user.findMany({
    where: { email: { equals: email } },
    select: { id: true, email: true, active: true, deletedAt: true, firebaseUid: true }
  });
  if (matches.length !== 1) throw new Error('Expected exactly one account with this email.');
  const user = matches[0];
  if (user.active || !user.deletedAt) throw new Error('Only an inactive, deleted account can release its email.');
  const identity = await firebaseAdminAuth().getUserByEmail(email);
  if (identity.disabled || !identity.emailVerified || identity.uid === user.firebaseUid)
    throw new Error('A separate, enabled, verified Firebase identity is required.');
  const [mappedUser, mappedIdentity, emailIdentity] = await Promise.all([
    prisma.user.findUnique({ where: { firebaseUid: identity.uid } }),
    prisma.authIdentity.findFirst({ where: { kind: { in: ['firebase', 'google', 'apple'] }, value: identity.uid } }),
    prisma.authIdentity.findUnique({ where: { kind_value: { kind: 'email', value: email } } })
  ]);
  if (mappedUser || mappedIdentity || (emailIdentity && emailIdentity.userId !== user.id))
    throw new Error('An identity is already owned by another account; manual review required.');
  console.log(JSON.stringify({ mode: 'review', userId: user.id, deleted: true, separateVerifiedIdentity: true }));
  if (!process.argv.includes('--apply')) return;
  if (!process.argv.includes('--user-id=' + user.id))
    throw new Error('Apply requires --user-id=ID matching the reviewed deleted account.');
  const archivedEmail = `deleted-${user.id}@accounts.invalid`;
  const directory = join(homedir(), '.codex/backups/zawana-auth');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const backup = join(directory, `email-release-${user.id}-${Date.now()}.json`);
  await writeFile(backup, JSON.stringify({ user, emailIdentity }, null, 2), { mode: 0o600, flag: 'wx' });
  await prisma.$transaction(async tx => {
    const changed = await tx.user.updateMany({
      where: { id: user.id, email, active: false, deletedAt: user.deletedAt, firebaseUid: user.firebaseUid },
      data: { email: archivedEmail }
    });
    if (changed.count !== 1) throw new Error('Account changed during repair; no changes applied.');
    await tx.authIdentity.updateMany({
      where: { userId: user.id, kind: 'email', value: email }, data: { value: archivedEmail }
    });
    await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.authSecurityEvent.create({ data: { userId: user.id, kind: 'deleted_account_email_released_for_fresh_registration' } });
  });
  const [reserved, reservedIdentity] = await Promise.all([
    prisma.user.count({ where: { email } }),
    prisma.authIdentity.count({ where: { kind: 'email', value: email } })
  ]);
  if (reserved || reservedIdentity) throw new Error('Email was reserved again; review concurrent registrations.');
  console.log(JSON.stringify({ emailReleased: true, oldAccountStillDeleted: true, backup }));
}

void main().catch(() => {
  console.error('Email release stopped. Check the reviewed account, Firebase identity, database access, and arguments. No credentials were printed.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
