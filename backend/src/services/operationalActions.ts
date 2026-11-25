import type { PrismaClient } from '@prisma/client';
import { bookingFailure } from './courtBooking.js';
import { requestSnapshot } from './bookingRequests.js';
import { scheduleInstant } from './courtChanges.js';

type Actor = { id: string; role: string };
export type OperationalAction = {
  id: string; bookingId: string; kind: string; state: string; label: string;
  required: boolean; action: 'refund' | 'request' | 'reschedule' | 'coach-booking' | 'coach-proposal' | null;
  requestId?: string; proposalId?: string;
};
/** Read-only projection of domain records. Notification read state is never consulted. */
export async function operationalActions(db: PrismaClient, actor: Actor, now = new Date()) {
  if (!['admin', 'badminton_fo', 'coach'].includes(actor.role)) throw bookingFailure(403, 'Operational actions are available to assigned staff only.');
  return db.$transaction(async tx => {
    const coach = actor.role === 'coach';
    const scope = coach ? { coach: { userId: actor.id } } : {};
    const confirmed = (status: string) => status.toLowerCase() === 'confirmed';
    const future = (date: string, time: string) => { try { return scheduleInstant(date, time) > now; } catch { return false; } };
    const [requests, cancellations, proposals, confirmations] = await Promise.all([
      coach ? [] : tx.bookingRescheduleRequest.findMany({ where: { OR: [{ activeKey: { not: null } }, { status: 'COMPLETED', completedAt: { gte: new Date(now.getTime() - 86400000) } }] }, include: { booking: { include: { refundRecord: { select: { id: true } } } } }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] }),
      coach ? [] : tx.bookingCancellationRequest.findMany({ where: { status: { in: ['requested', 'REFUND_PROCESSING'] }, refundStatus: { in: ['manual_review', 'REFUND_REQUESTED', 'REFUND_PROCESSING'] }, booking: { kind: { in: ['court', 'private_course'] }, refundRecord: { is: null }, paymentStatus: { not: 'refunded' } } }, select: { id: true, bookingId: true, refundStatus: true, booking: { select: { kind: true } } }, orderBy: { createdAt: 'desc' } }),
      tx.privateRescheduleRequest.findMany({ where: { status: 'PENDING', pendingKey: { not: null }, booking: { ...scope, status: { in: ['CONFIRMED', 'confirmed'] }, paymentStatus: { not: 'refunded' } } }, select: { id: true, bookingId: true, original: true, booking: true } }),
      coach ? tx.booking.findMany({ where: { ...scope, kind: 'private_course', status: 'PENDING_COACH_CONFIRMATION', OR: [{ reservationExpiresAt: null }, { reservationExpiresAt: { gt: now } }] }, select: { id: true, date: true, time: true } }) : [],
    ]);
    const items = new Map<string, OperationalAction>();
    for (const row of requests) {
      const base = { id: `request:${row.id}`, bookingId: row.bookingId, kind: row.kind, requestId: row.id };
      if (items.has(row.bookingId)) continue;
      if (row.status === 'COMPLETED') { items.set(row.bookingId, { ...base, state: 'completed', label: 'Change completed', required: false, action: null }); continue; }
      const refund = ['REFUND_REQUESTED', 'REFUND_PROCESSING'].includes(row.status);
      if (refund) {
        if (!row.booking.refundRecord && row.booking.paymentStatus !== 'refunded') items.set(row.bookingId, { ...base, state: 'refund', label: row.status === 'REFUND_PROCESSING' ? 'Refund in progress' : 'Refund Required', required: true, action: 'refund' });
        continue;
      }
      if (!row.activeKey || row.expiresAt <= now || !confirmed(row.booking.status) || Object.entries(requestSnapshot(row.booking)).some(([key, value]) => (row.oldSchedule as Record<string, unknown>)[key] !== value)) continue;
      if (row.status === 'ADMIN_HANDLING') items.set(row.bookingId, { ...base, state: 'admin', label: 'Admin Action Required', required: true, action: 'request' });
      else if (row.status === 'AWAITING_ADDITIONAL_PAYMENT') items.set(row.bookingId, { ...base, state: 'reschedule', label: 'Ready to Reschedule', required: true, action: 'reschedule' });
      else if (row.requestedById !== row.customerId && ['PENDING_CUSTOMER', 'CUSTOMER_SELECTING'].includes(row.status)) items.set(row.bookingId, { ...base, state: 'customer', label: 'Awaiting Customer', required: false, action: 'request' });
    }
    // A cancellation and reschedule request for the same booking represent one refund action.
    for (const row of cancellations) {
      const existing = items.get(row.bookingId);
      items.set(row.bookingId, { id: existing?.id || `refund:${row.id}`, requestId: existing?.requestId, bookingId: row.bookingId, kind: row.booking.kind, state: 'refund', label: row.refundStatus === 'REFUND_PROCESSING' ? 'Refund in progress' : 'Refund Required', required: true, action: 'refund' });
    }
    for (const row of proposals) {
      if (!future(row.booking.date, row.booking.time)) continue;
      const original = row.original as Record<string, unknown>;
      if (Object.entries(original).some(([key, value]) => key in row.booking && (row.booking as unknown as Record<string, unknown>)[key] !== value)) continue;
      const existing = items.get(row.bookingId);
      if (existing?.required && !coach) continue;
      items.set(row.bookingId, { id: `proposal:${row.id}`, bookingId: row.bookingId, kind: 'private_course', proposalId: row.id, ...(existing?.requestId ? { requestId: existing.requestId } : {}), state: 'coach', label: coach ? 'Coach Approval Required' : 'Awaiting Coach', required: coach, action: coach ? 'coach-proposal' : null });
    }
    for (const row of confirmations) if (future(row.date, row.time) && !items.has(row.id)) items.set(row.id, { id: `coach-booking:${row.id}`, bookingId: row.id, kind: 'private_course', state: 'coach', label: 'Booking Approval Required', required: true, action: 'coach-booking' });
    const values = [...items.values()], required = values.filter(item => item.required);
    return { generatedAt: now.toISOString(), items: values, counts: {
      total: required.length, court: required.filter(item => item.kind === 'court').length,
      private_course: required.filter(item => item.kind === 'private_course').length,
      requests: required.filter(item => !!item.requestId).length, refunds: required.filter(item => item.action === 'refund').length,
      coachRequests: coach ? required.length : 0,
    } };
  }, { maxWait: 10000, timeout: 15000 });
}
