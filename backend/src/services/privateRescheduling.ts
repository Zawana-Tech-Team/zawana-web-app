import { replacementSlots } from './rescheduleAvailability.js';
import { createStaffRequest, requestStaffNotice, requestEvent } from './bookingRequests.js';
import type { Booking, Prisma, PrismaClient } from '@prisma/client';
import { assertDestination, digest, validateDestination, type Actor } from './deskMoves.js';
import { bookingFailure as fail } from './courtBooking.js';
import { scheduleInstant, rescheduleEligibility } from './courtChanges.js';
import { range, today } from './courtPolicy.js';
type Tx = Prisma.TransactionClient;
const snapshot = (b: Booking) => ({ id: b.id, courtId: b.courtId, coachId: b.coachId, date: b.date, time: b.time, status: b.status, price: b.price, paymentStatus: b.paymentStatus });
async function revision(tx: Tx, b: Booking) { return digest([snapshot(b), await tx.bookingChangeHistory.count({ where: { bookingId: b.id, action: { not: 'PRIVATE_RESCHEDULE_INVITED' } } })]); }
async function getBooking(tx: Tx, id: string, actor: Actor) {
  const b = await tx.booking.findUnique({ where: { id }, include: { coach: true } });
  if (!b || b.kind !== 'private_course') throw fail(404, 'Private course booking not found.');
  if ((actor.role === 'member' && b.userId !== actor.id) || (actor.role === 'coach' && b.coach?.userId !== actor.id) || !['member', 'coach', 'admin', 'badminton_fo'].includes(actor.role)) throw fail(403, 'This booking is not assigned to you.');
  return b;
}
async function notice(tx: Tx, userId: string, title: string, body: string, bookingId: string, coach = false) {
  await tx.notification.create({ data: { userId, title, body, link: coach ? '/coach/bookings' : '/bookings', type: 'reschedule', entityType: 'private_reschedule', entityId: bookingId } });
}
export async function expirePrivateReschedules(db: PrismaClient) {
  const pending = await db.privateRescheduleRequest.findMany({ where: { status: 'PENDING', booking: { date: { lte: today() } } }, include: { booking: true } });
  for (const request of pending) if (scheduleInstant(request.booking.date, request.booking.time) <= new Date()) await db.$transaction(async tx => {
    const changed = await tx.privateRescheduleRequest.updateMany({ where: { id: request.id, status: 'PENDING' }, data: { status: 'EXPIRED', pendingKey: null, reviewedAt: new Date(), reviewReason: 'Original session has started.' } });
    if (changed.count) {
      await notice(tx, request.booking.userId, 'Reschedule proposal expired', 'The original session time is unchanged.', request.bookingId);
      const parent=await tx.bookingRescheduleRequest.findUnique({where:{privateProposalId:request.id}});
      if(parent?.activeKey){await tx.bookingRescheduleRequest.update({where:{id:parent.id},data:{status:'EXPIRED',activeKey:null}});await requestEvent(tx,parent.id,parent.requestedById,'EXPIRED',{originalSessionStarted:true});await requestStaffNotice(tx,parent.id,'Reschedule request expired',request.booking.code);}
    }
  });
}
export async function listPrivateReschedules(db: PrismaClient, actor: Actor, bookingId?: string) {
  await expirePrivateReschedules(db);
  if (!['member', 'coach', 'admin', 'badminton_fo'].includes(actor.role)) throw fail(403, 'Not allowed.');
  const rows = await db.privateRescheduleRequest.findMany({ where: { ...(bookingId ? { bookingId } : {}), booking: actor.role === 'member' ? { userId: actor.id } : actor.role === 'coach' ? { coach: { userId: actor.id } } : {} }, include: { booking: { select: { id: true, title: true, date: true, time: true, courtId: true, userId: true, status: true, user: { select: { name: true } }, coach: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  const courts = await db.court.findMany({ where: { id: { in: [...new Set(rows.flatMap(row => [row.courtId, (row.original as { courtId?: string }).courtId].filter((id): id is string => !!id)))] } }, select: { id: true, name: true } });
  const names = new Map(courts.map(court => [court.id, court.name]));
  return rows.map(row => ({ ...row, courtName: names.get(row.courtId) || row.courtId, originalCourtName: names.get((row.original as { courtId?: string }).courtId || '') || 'Original court', customerName: row.booking.user.name }));
}
export async function invitePrivateReschedule(db: PrismaClient, actor: Actor, bookingId: string, reason: string) {
  const request = await createStaffRequest(db, actor, bookingId, reason);
  return { message: 'The customer has been notified to choose a new time.', request };
}
export async function proposePrivateReschedule(db: PrismaClient, actor: Actor, bookingId: string, target: { courtId: string; date: string; time: string; reason: string; staffRequestId?: string }) {
  if (actor.role !== 'member') throw fail(403, 'Only the customer can choose a new private-course session.');
  await expirePrivateReschedules(db);
  return db.$transaction(async tx => {
    const initial = await getBooking(tx, bookingId, actor);
    for (const id of [...new Set([initial.courtId, target.courtId].filter((id): id is string => !!id))].sort()) await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${id}`;
    await tx.$executeRaw`UPDATE "Booking" SET date=date WHERE id=${bookingId}`;
    const b = await getBooking(tx, bookingId, actor);
    if(await tx.bookingRescheduleRequest.findFirst({where:{activeKey:b.id,status:'REFUND_REQUESTED'}}))throw fail(409,'Resolve the refund review before proposing another session.');
    const policy = rescheduleEligibility(b);
    const explicitScope = target.staffRequestId ? await tx.bookingRescheduleRequest.findFirst({ where: { id: target.staffRequestId, bookingId, customerId: actor.id, activeKey: bookingId, kind: 'private_course', status: { in: ['PENDING_CUSTOMER', 'CUSTOMER_SELECTING'] }, expiresAt: { gt: new Date() } } }) : null;
    let staffRequest = explicitScope || (policy.eligible && !target.staffRequestId ? await tx.bookingRescheduleRequest.findFirst({where:{activeKey:bookingId,customerId:actor.id,kind:'private_course',status:{in:['PENDING_CUSTOMER','CUSTOMER_SELECTING']},expiresAt:{gt:new Date()}}}) : null);
    if (staffRequest && !explicitScope && Object.entries(snapshot(b)).some(([key,value]) => (staffRequest!.oldSchedule as Record<string,unknown>)[key] !== value)) staffRequest = null;
    if (target.staffRequestId && !explicitScope) throw fail(403, 'This staff request does not authorize a response.');
    if (staffRequest && Object.entries(snapshot(b)).some(([key,value]) => (staffRequest.oldSchedule as Record<string,unknown>)[key] !== value)) throw fail(409, 'The original booking changed. Ask staff to review.');
    if (!policy.eligible && (!explicitScope || explicitScope.requestedById === actor.id)) throw fail(409, policy.message);
    if (scheduleInstant(b.date, b.time) <= new Date()) throw fail(409, 'The original session has started.');
    if (!b.coachId || !b.coach?.userId || b.coach.status !== 'active' || b.paymentStatus === 'refunded') throw fail(409, 'This course needs staff review before rescheduling.');
    const duration = range(b.time)!; validateDestination(target, duration.end - duration.start);
    if (b.courtId === target.courtId && b.date === target.date && b.time === target.time) throw fail(400, 'Choose a different court or session time.');
    await assertDestination(tx, target, [b.id], b.coachId);
    if (await tx.privateRescheduleRequest.findFirst({ where: { pendingKey: b.id } })) throw fail(409, 'Withdraw the existing proposal before submitting a replacement.');
    const request = await tx.privateRescheduleRequest.create({ data: { bookingId, pendingKey: bookingId, requestedById: actor.id, originalRevision: await revision(tx, b), original: snapshot(b), courtId: target.courtId, date: target.date, time: target.time, reason: target.reason } });
    if (staffRequest) {
      await tx.bookingRescheduleRequest.update({ where: { id: staffRequest.id }, data: { status: 'CUSTOMER_SELECTING', response: 'RESCHEDULE', privateProposalId: request.id, proposed: { courtId: target.courtId, date: target.date, time: target.time }, newPrice: b.price, priceDifference: 0 } });
      await requestEvent(tx, staffRequest.id, actor.id, 'CUSTOMER_SELECTING', { proposalId: request.id, awaitingCoach: true });
      await requestStaffNotice(tx, staffRequest.id, 'Customer proposed a private course replacement', `${b.code} · Awaiting assigned coach approval.`);
    }
    await notice(tx, b.coach.userId, 'Reschedule proposal awaiting review', `${b.title} · ${target.date} · ${target.time}. The original session stays reserved.`, b.id, true);
    return request;
  }, { maxWait: 10000, timeout: 15000 });
}
export async function decidePrivateReschedule(db: PrismaClient, actor: Actor, requestId: string, decision: 'approve' | 'reject' | 'withdraw', reason: string) {
  await expirePrivateReschedules(db);
  return db.$transaction(async tx => {
    const initial = await tx.privateRescheduleRequest.findUnique({ where: { id: requestId }, include: { booking: true } });
    if (!initial) throw fail(404, 'Proposal not found.');
    for (const id of [...new Set([initial.booking.courtId, initial.courtId].filter((id): id is string => !!id))].sort()) await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${id}`;
    if (initial.booking.coachId) await tx.$executeRaw`UPDATE "Coach" SET status=status WHERE id=${initial.booking.coachId}`;
    await tx.$executeRaw`UPDATE "Booking" SET date=date WHERE id=${initial.bookingId}`;
    const b = await getBooking(tx, initial.bookingId, actor);
    if ((decision === 'withdraw' && actor.role !== 'member') || (decision !== 'withdraw' && actor.role !== 'coach')) throw fail(403, 'Only the customer may withdraw; only the assigned coach may decide.');
    const request = await tx.privateRescheduleRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (request.status !== 'PENDING') return request;
    let status = decision === 'approve' ? 'APPROVED' : decision === 'reject' ? 'REJECTED' : 'WITHDRAWN', resultReason = reason;
    if (decision === 'approve') {
      try {
        if (b.coach?.status !== 'active' || await revision(tx, b) !== request.originalRevision || !['confirmed', 'CONFIRMED'].includes(b.status) || scheduleInstant(b.date, b.time) <= new Date()) throw fail(409, 'The original booking changed or started.');
        const duration = range(b.time)!; validateDestination(request, duration.end - duration.start);
        await assertDestination(tx, request, [b.id], b.coachId || undefined);
        if (await tx.paymentAttempt.findFirst({ where: { resourceId: b.id, status: { in: ['INITIATING', 'PENDING'] } } })) throw fail(409, 'Resolve the active payment checkout first.');
      } catch (error) { if (![400, 409].includes((error as { statusCode?: number }).statusCode || 0)) throw error; status = 'CONFLICTED'; resultReason = error instanceof Error ? error.message : 'The destination is unavailable.'; }
      if (status === 'APPROVED') await tx.booking.update({ where: { id: b.id }, data: { date: request.date, time: request.time, courtId: request.courtId } });
    }
    const result = await tx.privateRescheduleRequest.update({ where: { id: request.id }, data: { status, pendingKey: null, reviewedById: actor.id, reviewedAt: new Date(), reviewReason: resultReason } });
    await tx.bookingChangeHistory.create({ data: { bookingId: b.id, requestedById: request.requestedById, approvedById: actor.id, action: `PRIVATE_RESCHEDULE_${status}`, previous: JSON.stringify(snapshot(b)), current: JSON.stringify({ requestId, courtId: request.courtId, date: request.date, time: request.time, status }), reason: resultReason } });
    const staffRequest = await tx.bookingRescheduleRequest.findUnique({ where: { privateProposalId: request.id } });
    if (staffRequest && staffRequest.activeKey) {
      const next = status === 'APPROVED' ? 'COMPLETED' : 'PENDING_CUSTOMER';
      await tx.bookingRescheduleRequest.update({ where: { id: staffRequest.id }, data: { status: next, ...(next === 'COMPLETED' ? { activeKey: null, completedAt: new Date() } : { privateProposalId: null }) } });
      await requestEvent(tx, staffRequest.id, actor.id, next, { proposalStatus: status, reason: resultReason });
      await requestStaffNotice(tx, staffRequest.id, `Private reschedule ${status.toLowerCase()}`, `${b.code} · ${resultReason}`);
    }
    await notice(tx, b.userId, `Reschedule proposal ${status.toLowerCase()}`, status === 'APPROVED' ? `${b.title} · ${request.date} · ${request.time}. Your existing payment is unchanged.` : `${resultReason} The original session is unchanged.`, b.id);
    if (decision === 'withdraw' && b.coach?.userId) await notice(tx, b.coach.userId, 'Reschedule proposal withdrawn', 'The customer withdrew their proposed change. The original session remains.', b.id, true);
    return result;
  }, { maxWait: 10000, timeout: 15000 });
}

export async function privateReplacementAvailability(db: PrismaClient, actor: Actor, bookingId: string, date: string, courtId: string) {
  if (actor.role !== 'member') throw fail(403, 'Only the customer can choose a replacement session.');
  return db.$transaction(async tx => {
    const booking = await getBooking(tx, bookingId, actor);
    const policy = rescheduleEligibility(booking);
    if (!policy.eligible) throw fail(409, policy.message);
    return replacementSlots(tx, booking, date, courtId);
  });
}
