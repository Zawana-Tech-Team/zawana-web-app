import type { Prisma, PrismaClient } from '@prisma/client';

/** Shared by attendance capabilities, QR generation and scan-time issuer validation. */
export async function canManageCategoryQr(db: PrismaClient | Prisma.TransactionClient, id: string) {
  const user = await db.user.findFirst({ where: { id, active: true, deletedAt: null }, select: { role: true, coachProfile: { select: { department: true, status: true } } } });
  return !!user && (['admin', 'badminton_fo'].includes(user.role) || (user.role === 'coach' && user.coachProfile?.department.trim().toLowerCase() === 'badminton' && user.coachProfile.status === 'active'));
}
