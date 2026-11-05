import type { Notification, PrismaClient } from '@prisma/client';
import { scheduleInstant } from './courtChanges.js';

export const NOTIFICATION_LIFETIME_MS = 7 * 86400_000;
const terminal = (status: string) => ['completed', 'cancelled', 'canceled', 'expired', 'coach_declined', 'delivered', 'served', 'refunded', 'exhausted'].includes(status.toLowerCase());

/** Derive expiry from durable timestamps and actual resource state, never browser state. */
export async function notificationLifecycle(db: PrismaClient, rows: Notification[], now = new Date()) {
  const ids = (...types: string[]) => [...new Set(rows.filter(n => n.entityId && types.includes(n.entityType || '')).map(n => n.entityId!))];
  const [bookings, cafe, store, gymSessions, gymEnrollments, qrs] = await Promise.all([
    db.booking.findMany({ where: { id: { in: ids('booking', 'court', 'private_course') } }, select: { id: true, status: true, date: true, time: true, reservationExpiresAt: true, paymentExpiresAt: true } }),
    db.cafeOrder.findMany({ where: { id: { in: ids('cafe_order') } }, select: { id: true, status: true } }),
    db.storeOrder.findMany({ where: { id: { in: ids('store_order') } }, select: { id: true, status: true } }),
    db.privateTrainingSession.findMany({ where: { id: { in: ids('gym_session') } }, select: { id: true, status: true } }),
    db.gymEnrollment.findMany({ where: { id: { in: ids('gym_enrollment') } }, select: { id: true, status: true } }),
    db.badmintonEntryQr.findMany({ where: { id: { in: ids('qr', 'badminton-qr') } }, select: { id: true, status: true, expiresAt: true, revokedAt: true } }),
  ]);
  return rows.map(row => {
    let expiresAt = new Date(row.createdAt.getTime() + NOTIFICATION_LIFETIME_MS), done = false;
    const sooner = (date: Date | null | undefined) => { if (date && date < expiresAt) expiresAt = date; };
    const type = row.entityType || '', id = row.entityId;
    if (id && ['booking', 'court', 'private_course'].includes(type)) {
      const booking = bookings.find(b => b.id === id);
      done = !booking || terminal(booking.status);
      if (booking) {
        const status = booking.status.toUpperCase();
        if (row.title === 'New private course request') done ||= status !== 'PENDING_COACH_CONFIRMATION';
        if (row.title === 'Coach confirmed your private course') done ||= status !== 'AWAITING_PAYMENT';
        if (status === 'PENDING_COACH_CONFIRMATION') sooner(booking.reservationExpiresAt);
        if (status === 'AWAITING_PAYMENT') sooner(booking.paymentExpiresAt || booking.reservationExpiresAt);
        try { sooner(scheduleInstant(booking.date, booking.time, true)); } catch { /* Legacy unparseable schedules retain the general lifetime. */ }
      }
    }
    for (const [entityType, entities] of [['cafe_order', cafe], ['store_order', store], ['gym_session', gymSessions], ['gym_enrollment', gymEnrollments]] as const) {
      if (id && type === entityType) {
        const entity = entities.find(e => e.id === id);
        done = !entity || terminal(entity.status) || (type === 'gym_enrollment' && row.type === 'payment' && entity.status === 'ACTIVE');
      }
    }
    if (id && ['qr', 'badminton-qr'].includes(type)) {
      const qr = qrs.find(q => q.id === id);
      done = !qr || qr.status !== 'ACTIVE' || !!qr.revokedAt;
      sooner(qr?.expiresAt);
    }
    return { ...row, expiresAt, activeInInbox: row.activeInInbox && !done && expiresAt > now };
  });
}
