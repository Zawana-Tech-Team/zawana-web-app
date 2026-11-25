import { affectedBookingMessage } from '../domain/requestMessages.js';
import type { Notification, PrismaClient } from '@prisma/client';
import { scheduleInstant } from './courtChanges.js';

export const NOTIFICATION_LIFETIME_MS = 7 * 86400_000;
const terminal = (status: string) => ['completed', 'cancelled', 'canceled', 'expired', 'coach_declined', 'delivered', 'served', 'refunded', 'exhausted'].includes(status.toLowerCase());
const bookingOutcomes=new Set(['Coach declined your private course','Private course cancelled','Private course reservation released','Private course payment window expired','Private course request expired','Coach approved your paid private course','Booking rescheduled','Court rental rescheduled']);

/** Derive expiry from durable timestamps and actual resource state, never browser state. */
export async function notificationLifecycle(db: PrismaClient, rows: Notification[], now = new Date()) {
  const ids = (...types: string[]) => [...new Set(rows.filter(n => n.entityId && types.includes(n.entityType || '')).map(n => n.entityId!))];
  const [bookings, cafe, store, gymSessions, gymEnrollments, qrs, batches, requests, proposals] = await Promise.all([
    db.booking.findMany({ where: { id: { in: ids('booking', 'court', 'private_course') } }, select: { id: true, status: true, date: true, time: true, reservationExpiresAt: true, paymentExpiresAt: true } }),
    db.cafeOrder.findMany({ where: { id: { in: ids('cafe_order') } }, select: { id: true, status: true } }),
    db.storeOrder.findMany({ where: { id: { in: ids('store_order') } }, select: { id: true, status: true } }),
    db.privateTrainingSession.findMany({ where: { id: { in: ids('gym_session') } }, select: { id: true, status: true } }),
    db.gymEnrollment.findMany({ where: { id: { in: ids('gym_enrollment') } }, select: { id: true, status: true } }),
    db.badmintonEntryQr.findMany({ where: { id: { in: ids('qr', 'badminton-qr') } }, select: { id: true, status: true, expiresAt: true, revokedAt: true } }),
    db.bookingRequestBatch.findMany({ where: { id: { in: ids('reschedule_batch') } }, select: { id: true, reason: true, requests: { select: { status: true } } } }),
    db.bookingRescheduleRequest.findMany({where:{id:{in:ids('reschedule_request')}},select:{id:true,status:true,expiresAt:true}}),
    db.privateRescheduleRequest.findMany({where:{OR:[{bookingId:{in:ids('private_reschedule')}},{id:{in:ids('private_proposal')}}],status:'PENDING'},select:{id:true,bookingId:true}}),
  ]);
  return rows.map(row => {
    let expiresAt = new Date(row.createdAt.getTime() + NOTIFICATION_LIFETIME_MS), done = false;
    const sooner = (date: Date | null | undefined) => { if (date && date < expiresAt) expiresAt = date; };
    const type = row.entityType || '', id = row.entityId;
    if (id && ['booking', 'court', 'private_course'].includes(type)) {
      const booking = bookings.find(b => b.id === id);
      const outcome=bookingOutcomes.has(row.title);
      done = !booking || (!outcome&&terminal(booking.status));
      if (booking) {
        const status = booking.status.toUpperCase();
        if (row.title === 'New private course request') done ||= status !== 'PENDING_COACH_CONFIRMATION';
        if (row.title === 'Coach confirmed your private course') done ||= status !== 'AWAITING_PAYMENT';
        if (status === 'PENDING_COACH_CONFIRMATION') sooner(booking.reservationExpiresAt);
        if (status === 'AWAITING_PAYMENT') sooner(booking.paymentExpiresAt || booking.reservationExpiresAt);
        if(!outcome)try { sooner(scheduleInstant(booking.date, booking.time, true)); } catch { /* Legacy unparseable schedules retain the general lifetime. */ }
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
    const batch = row.entityType === 'reschedule_batch' ? batches.find(batch => batch.id === row.entityId) : undefined;
    const member=row.audience==='member'||!!row.userId&&(!row.audience||row.audience==='all');
    const pending=batch?.requests.filter(item=>item.status==='PENDING_CUSTOMER').length||0;
    if(type==='reschedule_batch')done=!batch||(member&&pending===0);
    if(type==='reschedule_request'){
      const request=requests.find(item=>item.id===id);
      done=!request||(member&&row.title==='Reschedule Request'&&request.status!=='PENDING_CUSTOMER');if(row.title==='Reschedule Request')sooner(request?.expiresAt);
    }
    if(type==='private_reschedule'&&row.title==='Reschedule proposal awaiting review')done=!proposals.some(item=>item.bookingId===id);
    if(type==='private_proposal')done=!proposals.some(item=>item.id===id);
    const body = batch&&member ? `${affectedBookingMessage(batch.reason)}\n\n${pending} ${pending===1?'Request':'Requests'} awaiting response.` : row.body;
    return { ...row, title: batch&&member ? `${pending} ${pending===1?'Request':'Requests'}` : row.title, body, expiresAt, activeInInbox: row.activeInInbox && !done && expiresAt > now };
  });
}
