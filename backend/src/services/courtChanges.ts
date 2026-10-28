import { createHash } from 'node:crypto';
import type { Booking, Prisma, PrismaClient, Role } from '@prisma/client';
import { courtAvailability } from './courtAvailability.js';
import { formatRange, range } from './courtPolicy.js';
import { isDateKey } from '../utils/dateKeys.js';

type Actor = { id: string; role: Role };
type Target = { date: string; time: string; courtId: string };
export const changeError = (code: string, message: string, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });
export function scheduleInstant(date: string, time: string, end = false) {
  const span = range(time);
  if (!isDateKey(date) || !span) throw changeError('INVALID_SCHEDULE', 'The stored schedule requires staff review.');
  // Existing Booking date/time fields are Yangon wall-clock values. Event timestamps remain UTC.
  return new Date(new Date(`${date}T00:00:00+06:30`).getTime() + (end ? span.end : span.start) * 60_000);
}
export function rescheduleEligibility(b: Pick<Booking, 'date' | 'time' | 'status'>, now = new Date()) {
  if (!['confirmed', 'CONFIRMED'].includes(b.status))
    return { eligible: false, code: 'BOOKING_NOT_ELIGIBLE', message: `A ${b.status.toLowerCase()} booking cannot be rescheduled.` };
  const deadline = new Date(scheduleInstant(b.date, b.time).getTime() - 24 * 60 * 60_000);
  return { eligible: now <= deadline, deadline: deadline.toISOString(), code: now <= deadline ? null : 'POLICY_WINDOW_EXPIRED',
    message: now <= deadline ? 'Eligible: at least 24 hours before the session.' : 'Changes require at least 24 hours before the session.' };
}
const snapshot = (b: Booking) => ({ courtId: b.courtId, date: b.date, time: b.time, price: b.price, status: b.status, paymentStatus: b.paymentStatus });
async function authorized(db: Prisma.TransactionClient, id: string, actor: Actor) {
  if (!['member', 'admin', 'badminton_fo'].includes(actor.role)) throw changeError('UNAUTHORIZED_ACTION', 'Not allowed.', 403);
  const b = await db.booking.findFirst({ where: { id, kind: 'court', ...(actor.role === 'member' ? { userId: actor.id } : {}) } });
  if (!b) throw changeError('BOOKING_NOT_FOUND', 'Reservation not found.', 404);
  return b;
}
async function revision(db: Prisma.TransactionClient, b: Booking) {
  const changes = await db.bookingChangeHistory.count({ where: { bookingId: b.id } });
  return createHash('sha256').update(JSON.stringify([snapshot(b), changes])).digest('hex');
}
export async function courtChangeDetail(db: PrismaClient, id: string, actor: Actor) {
  const b = await authorized(db, id, actor);
  const [history, cancellations, customer] = await Promise.all([
    db.bookingChangeHistory.findMany({ where: { bookingId: id }, orderBy: { createdAt: 'desc' } }),
    db.bookingCancellationRequest.findMany({ where: { bookingId: id }, orderBy: { createdAt: 'desc' } }),
    db.user.findUnique({ where: { id: b.userId }, select: { name: true } }),
  ]);
  return { booking: b, customer: customer?.name, history, cancellations, revision: await revision(db, b), eligibility: rescheduleEligibility(b),
    cancellationPolicy: { automaticRefunds: false, message: 'Unpaid active bookings may be cancelled. Paid cancellations require staff review; refunds and credits require separate approval.' },
    exceptionsEnabled: process.env.COURT_MANAGER_EXCEPTIONS_ENABLED === 'true' };
}
function enforcePolicy(b: Booking, actor: Actor, exceptionReason?: string) {
  const policy = rescheduleEligibility(b);
  if (policy.eligible) return false;
  if (policy.code === 'POLICY_WINDOW_EXPIRED' && actor.role === 'admin' &&
      process.env.COURT_MANAGER_EXCEPTIONS_ENABLED === 'true' && exceptionReason?.trim() && scheduleInstant(b.date, b.time) > new Date()) return true;
  throw changeError(policy.code!, policy.message);
}
async function destination(db: Prisma.TransactionClient, target: Target) {
  const span = range(target.time);
  if (!isDateKey(target.date) || !span || span.end - span.start !== 60 || span.start % 60 !== 0)
    throw changeError('INVALID_SLOT', 'Choose a valid dated one-hour slot.', 400);
  const availability = await courtAvailability(db as PrismaClient, target.date);
  const slot = availability.slots.find(s => s.courtId === target.courtId && s.time === formatRange(span.start, span.end));
  if (!slot?.available) throw changeError('COURT_UNAVAILABLE', slot?.reason || 'The destination court is unavailable.');
  return slot;
}
export async function quoteCourtChange(db: PrismaClient, id: string, actor: Actor, target: Target, exceptionReason?: string) {
  const b = await authorized(db, id, actor);
  const policyException = enforcePolicy(b, actor, exceptionReason);
  const slot = await destination(db, target);
  return { original: snapshot(b), proposed: slot, difference: slot.price - b.price, revision: await revision(db, b), policyException };
}
async function log(tx: Prisma.TransactionClient, b: Booking, actor: Actor, action: string, current: unknown, reason: string, exception = false) {
  await tx.bookingChangeHistory.create({ data: { bookingId: b.id, action, previous: JSON.stringify(snapshot(b)), current: JSON.stringify(current),
    requestedById: actor.id, approvedById: exception ? actor.id : null, reason, policyException: exception } });
}
async function notify(tx: Prisma.TransactionClient, b: Booking, title: string, body: string) {
  await tx.notification.createMany({ data: [
    { userId: b.userId, title, body, link: '/bookings', audience: 'member', type: 'booking', entityType: 'booking', entityId: b.id },
    { userId: null, title, body: `${b.code} · ${body}`, link: '/badminton-fo/bookings', audience: 'badminton_fo', type: 'booking', entityType: 'booking', entityId: b.id },
  ] });
}
async function activePayment(tx: Prisma.TransactionClient, id: string) {
  if (await tx.paymentAttempt.findFirst({ where: { resourceId: id, status: { in: ['INITIATING', 'PENDING'] } } }))
    throw changeError('PAYMENT_ADJUSTMENT_REQUIRED', 'An active payment checkout must be resolved before changing this reservation.');
}
export async function rescheduleCourt(db: PrismaClient, id: string, actor: Actor, target: Target, expectedRevision: string, reason: string, exceptionReason?: string) {
  const initial = await authorized(db, id, actor);
  return db.$transaction(async tx => {
    // Same sorted court locks as reservation creation; keep both slots until commit.
    for (const courtId of [...new Set([initial.courtId, target.courtId].filter((x): x is string => !!x))].sort())
      await tx.$executeRaw`UPDATE "Court" SET "status"="status" WHERE "id"=${courtId}`;
    await tx.$executeRaw`UPDATE "Booking" SET "date"="date" WHERE "id"=${id}`;
    const b = await authorized(tx, id, actor);
    if (await revision(tx, b) !== expectedRevision) throw changeError('CONCURRENT_BOOKING_MODIFICATION', 'This reservation changed. Refresh and review it again.');
    const exception = enforcePolicy(b, actor, exceptionReason);
    await activePayment(tx, id);
    const slot = await destination(tx, target);
    if (slot.price !== b.price) throw changeError('PAYMENT_ADJUSTMENT_REQUIRED', `The price difference is ${slot.price - b.price} MMK. Contact staff to arrange the payment adjustment before moving.`);
    if (b.paymentStatus === 'refunded') throw changeError('BOOKING_NOT_ELIGIBLE', 'A refunded reservation requires staff review.');
    const changed = await tx.booking.update({ where: { id }, data: { date: slot.date, time: slot.time, courtId: slot.courtId, title: slot.courtName } });
    await log(tx, b, actor, 'rescheduled', snapshot(changed), exception ? exceptionReason! : reason, exception);
    await notify(tx, b, 'Court booking rescheduled', `${slot.courtName} · ${slot.date} · ${slot.time}.`);
    return changed;
  }, { maxWait: 10000, timeout: 15000 });
}
export async function requestCourtCancellation(db: PrismaClient, id: string, actor: Actor, reason: string) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`UPDATE "Booking" SET "date"="date" WHERE "id"=${id}`;
    const b = await authorized(tx, id, actor);
    if (!['pending', 'confirmed', 'CONFIRMED'].includes(b.status)) throw changeError('BOOKING_NOT_ELIGIBLE', 'Only active reservations can be cancelled.');
    const existing = await tx.bookingCancellationRequest.findFirst({ where: { bookingId: id, status: 'requested' } });
    if (existing) return existing;
    await activePayment(tx, id);
    const unpaid = b.paymentStatus === 'pending';
    const request = await tx.bookingCancellationRequest.create({ data: { bookingId: id, requestedById: actor.id, reason,
      status: unpaid ? 'completed' : 'requested', refundStatus: unpaid ? 'not_applicable' : 'manual_review' } });
    if (unpaid) await tx.booking.update({ where: { id }, data: { status: 'cancelled' } });
    await log(tx, b, actor, unpaid ? 'cancelled' : 'cancellation_requested', { requestId: request.id, status: request.status }, reason);
    await notify(tx, b, unpaid ? 'Court booking cancelled' : 'Cancellation requested', unpaid ? 'Your reservation was cancelled. No refund was issued.' : 'Staff will review the cancellation. Your court remains reserved until approval.');
    return request;
  });
}
export async function reviewCourtCancellation(db: PrismaClient, id: string, requestId: string, actor: Actor, approve: boolean, reason: string) {
  if (!['admin', 'badminton_fo'].includes(actor.role)) throw changeError('UNAUTHORIZED_ACTION', 'Only badminton staff can review cancellation requests.', 403);
  return db.$transaction(async tx => {
    await tx.$executeRaw`UPDATE "Booking" SET "date"="date" WHERE "id"=${id}`;
    const b = await authorized(tx, id, actor);
    const request = await tx.bookingCancellationRequest.findFirst({ where: { id: requestId, bookingId: id, status: 'requested' } });
    if (!request) throw changeError('INVALID_CANCELLATION_TRANSITION', 'This request has already been reviewed or does not exist.');
    if (!['pending', 'confirmed', 'CONFIRMED'].includes(b.status)) throw changeError('BOOKING_NOT_ELIGIBLE', 'The reservation is no longer active.');
    await activePayment(tx, id);
    // Approval and completion share a transaction; reviewedBy/reviewedAt preserve approval evidence.
    const result = await tx.bookingCancellationRequest.update({ where: { id: requestId }, data: { status: approve ? 'completed' : 'rejected', reviewedById: actor.id, reviewedAt: new Date(), reviewReason: reason } });
    if (approve) await tx.booking.update({ where: { id }, data: { status: 'cancelled' } });
    await log(tx, b, actor, approve ? 'cancellation_approved' : 'cancellation_rejected', { requestId, status: result.status }, reason);
    await notify(tx, b, approve ? 'Court booking cancelled' : 'Cancellation rejected', approve ? 'Cancellation approved. Any refund or credit still requires separate financial review.' : reason);
    return result;
  });
}
