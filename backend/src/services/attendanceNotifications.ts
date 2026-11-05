import type { PrismaClient } from '@prisma/client';
import { today } from './courtPolicy.js';

/** Idempotent across processes/restarts; expiry dates identify each entitlement cycle. */
export async function notifyExpiredBadmintonPackages(db: PrismaClient) {
  const rows = await db.badmintonEnrollment.findMany({ where: { status: 'active', expiryDate: { lt: today() } }, select: { id: true, userId: true, studentName: true, packageName: true, expiryDate: true } });
  if (!rows.length) return;
  const staff = await db.user.findMany({ where: { active: true, deletedAt: null, role: { in: ['admin', 'badminton_fo'] } }, select: { id: true } });
  for (const row of rows) {
    const recipients = [...new Set([...staff.map(s => s.id), ...(row.userId ? [row.userId] : [])])];
    for (const userId of recipients) {
      const dedupeKey = `badminton-expiry:${row.id}:${row.expiryDate}:${userId}`;
      await db.notification.upsert({ where: { dedupeKey }, update: {}, create: { dedupeKey, userId, title: 'Package expired',
        body: `${userId === row.userId ? 'Your' : row.studentName + ' ·'} ${row.packageName} expired on ${row.expiryDate}.`, type: 'package', entityType: 'badminton-enrollment', entityId: row.id,
        ...(userId === row.userId ? { link: '/membership' } : {}) } });
    }
  }
}
