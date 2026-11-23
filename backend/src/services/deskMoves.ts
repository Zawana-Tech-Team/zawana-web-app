import { rentalDestinationPrice } from './rentalPricing.js';
import { paidRentalAmount } from './rentalPaymentBalance.js';
import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient, Role, CourtBlock, Booking } from '@prisma/client';
import { z } from 'zod';
import { bookingFailure as fail, occupyingStatuses } from './courtBooking.js';
import { scheduleInstant } from './courtChanges.js';
import { today, range, formatRange, overlaps } from './courtPolicy.js';
import { addDateKeyDays, isDateKey } from '../utils/dateKeys.js';
import { blockOccurs, blocksShareDate, blockExcludedDates } from './blockSchedule.js';
export type Actor = { id: string; role: Role; name: string };
export const moveInput = z.object({
  kind: z.enum(['court', 'weekly']), reason: z.string().trim().min(3).max(1000),
  moves: z.array(z.object({ id: z.string().min(1), sourceDate: z.string().optional(), scope: z.enum(['occurrence', 'future']).optional(), courtId: z.string().min(1), date: z.string(), time: z.string() }).strict()).min(1).max(30),
}).strict();
export type MoveInput = z.infer<typeof moveInput>;
type Tx = Prisma.TransactionClient;
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function validateDestination(target: { date: string; time: string }, minutes = 60) {
  const r = range(target.time);
  if (!isDateKey(target.date) || !r || r.end - r.start !== minutes || r.start < 360 || r.end > 1260 || r.start % 60 || scheduleInstant(target.date, target.time) <= new Date()) throw fail(400, `Choose a future ${minutes}-minute session between 6 AM and 9 PM.`);
  return r;
}
export async function assertDestination(tx: Tx, target: { date: string; time: string; courtId: string }, ignore: string[] = [], coachId?: string) {
  if(coachId && !await tx.coach.findFirst({where:{id:coachId,status:'active',department:'Badminton',user:{is:{role:'coach',active:true}}}})) throw fail(409,'The assigned coach is unavailable. The original booking is unchanged.');
  const [court, override, blocks, bookings] = await Promise.all([
    tx.court.findUnique({ where: { id: target.courtId } }), tx.courtDateOverride.findUnique({ where: { date: target.date } }),
    tx.courtBlock.findMany({ where: { courtId: target.courtId, active: true } }),
    tx.booking.findMany({ where: { id: { notIn: ignore }, date: target.date, status: { in: occupyingStatuses }, OR: [{ courtId: target.courtId }, ...(coachId ? [{ coachId }] : [])] } }),
  ]);
  if (!court || court.status !== 'available' || override?.type === 'closed' || bookings.some(row => overlaps(row.time, target.time)) || blocks.some(row => blockOccurs(row, target.date, override) && overlaps(`${row.start} — ${row.end}`, target.time))) throw fail(409, 'The destination court or coach is unavailable. The original booking is unchanged.');
  return court;
}
async function plan(tx: Tx, actor: Actor, raw: MoveInput) {
  if (!['admin', 'badminton_fo'].includes(actor.role)) throw fail(403, 'Only badminton desk staff can move these bookings.');
  const input = moveInput.parse(raw);
  const sourceKeys = input.moves.map(m => `${m.id}|${input.kind === 'weekly' ? m.sourceDate : ''}`);
  if (new Set(sourceKeys).size !== sourceKeys.length) throw fail(400, 'A source session is selected more than once.');
  const sourceIds = [...new Set(input.moves.map(m => m.id))];
  const [rentals, sourceBlocks, allBlocks, bookings] = await Promise.all([
    input.kind === 'court' ? tx.booking.findMany({ where: { id: { in: sourceIds }, kind: 'court' } }) : Promise.resolve([] as Booking[]),
    input.kind === 'weekly' ? tx.courtBlock.findMany({ where: { id: { in: sourceIds }, type: 'class' } }) : Promise.resolve([] as CourtBlock[]),
    tx.courtBlock.findMany({ where: { active: true } }),
    tx.booking.findMany({ where: { date: { gte: today() }, status: { in: occupyingStatuses }, ...(input.kind === 'court' ? { id: { notIn: sourceIds } } : {}) } }),
  ]);
  if ((input.kind === 'court' ? rentals.length : sourceBlocks.length) !== sourceIds.length) throw fail(404, 'A selected reservation no longer exists.');
  const updates = new Map(sourceBlocks.map(b => [b.id, { ...b }]));
  const targets: (CourtBlock & { sourceId: string })[] = [];
  const rows = [];
  for (const [i, m] of input.moves.entries()) {
    const sourceTime = input.kind === 'court' ? rentals.find(b => b.id === m.id)!.time : `${sourceBlocks.find(b => b.id === m.id)!.start} — ${sourceBlocks.find(b => b.id === m.id)!.end}`;
    const sourceSpan = range(sourceTime);
    if (!sourceSpan) throw fail(409, 'The stored session duration needs staff review.');
    const duration = sourceSpan.end - sourceSpan.start;
    const r = validateDestination(m, duration);
    const [court, override, holiday] = await Promise.all([tx.court.findUnique({ where: { id: m.courtId } }), tx.courtDateOverride.findUnique({ where: { date: m.date } }), tx.holidayRate.findUnique({ where: { date: m.date } })]);
    if (!court || court.status !== 'available' || override?.type === 'closed') throw fail(409, 'A destination court is unavailable or closed.');
    if (input.kind === 'court') {
      const b = rentals.find(b => b.id === m.id)!;
      if (!['confirmed', 'CONFIRMED'].includes(b.status) || b.paymentStatus === 'refunded' || scheduleInstant(b.date, b.time) <= new Date()) throw fail(409, 'Only future confirmed, non-refunded rentals can be moved.');
      if (await tx.paymentAttempt.findFirst({ where: { resourceId: b.id, status: { in: ['INITIATING', 'PENDING'] } } })) throw fail(409, 'Resolve the existing payment checkout before moving this rental.');
      if (await tx.bookingRescheduleRequest.findFirst({where:{activeKey:b.id,status:'REFUND_REQUESTED'}})) throw fail(409,'Resolve the pending refund review before rescheduling.');
      const historyCount = await tx.bookingChangeHistory.count({ where: { bookingId: b.id } });
      const destinationPrice = rentalDestinationPrice(court.price,r.start,duration,holiday);
      const customerRequest = await tx.bookingRescheduleRequest.findUnique({where:{activeKey:b.id}});
      const recordedPaid = customerRequest && b.paymentStatus==='paid' ? await paidRentalAmount(tx,b) : b.price;
      if(recordedPaid==null)throw fail(409,'The original paid amount needs reconciliation before this move.');
      const surcharge=Math.max(0,destinationPrice-recordedPaid);
      if (surcharge > 0 && b.paymentStatus !== 'paid') throw fail(409, 'Confirm the original rental payment before collecting an additional rescheduling charge.');
      rows.push({ id: b.id, original: b, historyCount, target: { courtId: court.id, courtName: court.name, date: m.date, time: formatRange(r.start, r.end), price: Math.max(b.price, destinationPrice) }, destinationPrice, paidBasis: recordedPaid, surcharge, scope: null });
    } else {
      const b = sourceBlocks.find(b => b.id === m.id)!;
      if (!m.sourceDate || !isDateKey(m.sourceDate) || !blockOccurs(b, m.sourceDate) || scheduleInstant(m.sourceDate, `${b.start} — ${b.end}`) <= new Date() || !m.scope) throw fail(409, 'Choose a future occurrence and its change scope.');
      if (m.scope === 'future' && input.moves.filter(row => row.id === m.id).length !== 1) throw fail(400, 'Move a future series once per batch.');
      const source = updates.get(b.id)!;
      if (b.dayOfWeek == null) source.active = false;
      else if (m.scope === 'future') source.effectiveUntil = addDateKeyDays(m.sourceDate, -1);
      else source.excludedDates = [...new Set([...blockExcludedDates(source), m.sourceDate])];
      const target = { ...b, id: `proposed-${i}`, sourceId: b.id, courtId: m.courtId, date: m.scope === 'future' && b.dayOfWeek != null ? '' : m.date, dayOfWeek: m.scope === 'future' && b.dayOfWeek != null ? new Date(`${m.date}T12:00:00Z`).getUTCDay() : null, effectiveFrom: m.scope === 'future' ? m.date : null, effectiveUntil: b.effectiveUntil, excludedDates: m.scope === 'future' ? blockExcludedDates(b).filter(d => d >= m.sourceDate!).map(d => addDateKeyDays(d, Math.round((new Date(`${m.date}T12:00:00Z`).getTime() - new Date(`${m.sourceDate}T12:00:00Z`).getTime()) / 86400000))) : [], start: `${String(Math.floor(r.start / 60)).padStart(2, '0')}:${String(r.start % 60).padStart(2, '0')}`, end: `${String(Math.floor(r.end / 60)).padStart(2, '0')}:${String(r.end % 60).padStart(2, '0')}`, active: true };
      if (target.effectiveUntil && m.date > target.effectiveUntil) throw fail(409, 'The destination is beyond the series end date.');
      targets.push(target);
      rows.push({ id: b.id, original: b, historyCount: 0, target: { courtId: court.id, courtName: court.name, date: m.date, time: formatRange(r.start, r.end), price: 0 }, destinationPrice: 0, surcharge: 0, scope: m.scope });
    }
  }
  const remainingBlocks = allBlocks.map(b => updates.get(b.id) || b);
  if (input.kind === 'court') {
    for (const [i, row] of rows.entries()) {
      const t = row.target, override = await tx.courtDateOverride.findUnique({ where: { date: t.date } });
      if (bookings.some(b => b.courtId === t.courtId && b.date === t.date && overlaps(b.time, t.time)) || remainingBlocks.some(b => b.courtId === t.courtId && blockOccurs(b, t.date, override) && overlaps(`${b.start} — ${b.end}`, t.time)) || rows.some((other, j) => j < i && other.target.courtId === t.courtId && other.target.date === t.date && overlaps(other.target.time, t.time))) throw fail(409, 'The proposed final schedule contains a conflict. No bookings were moved.');
    }
  } else {
    const overrides = new Map((await tx.courtDateOverride.findMany()).map(o => [o.date, o]));
    for (const [i, t] of targets.entries()) {
      if (bookings.some(b => b.courtId === t.courtId && blockOccurs(t, b.date, overrides.get(b.date)) && overlaps(b.time, `${t.start} — ${t.end}`)) || [...remainingBlocks, ...targets.slice(0, i)].some(b => b.courtId === t.courtId && blocksShareDate(b, t, today(), overrides) && overlaps(`${b.start} — ${b.end}`, `${t.start} — ${t.end}`))) throw fail(409, 'The weekly destination conflicts with a current or future reservation. No classes were moved.');
    }
  }
  const surcharge = rows.reduce((sum, row) => sum + row.surcharge, 0);
  return { input, rows, surcharge, revision: digest({ rows, surcharge, reason: input.reason }), updates, targets, rentals };
}
export async function quoteDeskMoves(db: PrismaClient, actor: Actor, input: MoveInput) {
  return db.$transaction(async tx => { const p = await plan(tx, actor, input); return { rows: p.rows, surcharge: p.surcharge, revision: p.revision }; });
}
export async function confirmDeskMoves(db: PrismaClient, actor: Actor, input: MoveInput, revision: string, requestKey: string, payment?: { method: 'CASH' | 'ONLINE'; received: true; reference?: string }) {
  if (!['admin', 'badminton_fo'].includes(actor.role)) throw fail(403, 'Only desk staff can move these bookings.');
  const payloadHash = digest({ input, revision, payment });
  try { return await db.$transaction(async tx => {
    // Receipt inserted first serializes duplicate submissions, including SQLite writers.
    const existing = await tx.deskMoveBatch.findUnique({ where: { actorId_requestKey: { actorId: actor.id, requestKey } } });
    if (existing) { if (existing.payloadHash !== payloadHash) throw fail(409, 'Retry key belongs to another move.'); return existing.result; }
    if (!['admin', 'badminton_fo'].includes(actor.role)) throw fail(403, 'Only desk staff can move these bookings.');
    const batch = await tx.deskMoveBatch.create({ data: { actorId: actor.id, requestKey, payloadHash, result: {}, reason: input.reason } });
    const sources = input.kind === 'court' ? await tx.booking.findMany({ where: { id: { in: input.moves.map(m => m.id) } }, select: { courtId: true } }) : await tx.courtBlock.findMany({ where: { id: { in: input.moves.map(m => m.id) } }, select: { courtId: true } });
    for (const id of [...new Set([...sources.map(s => s.courtId), ...input.moves.map(m => m.courtId)].filter((id): id is string => !!id))].sort()) await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${id}`;
    if (input.kind === 'court') for (const id of [...new Set(input.moves.map(m => m.id))].sort()) await tx.$executeRaw`UPDATE "Booking" SET date=date WHERE id=${id}`;
    const p = await plan(tx, actor, input);
    if (p.revision !== revision) throw fail(409, 'The bookings or prices changed. Review a fresh preview.');
    if (p.surcharge && (!payment?.received || !['CASH', 'ONLINE'].includes(payment.method))) throw fail(400, 'Confirm receipt of the additional payment.');
    let surchargeReceipt: { id: string; method: string; reference: string | null; amount: number; confirmedById: string } | null = null;
    if (p.surcharge) {
      const reference = payment!.reference?.trim();
      if (payment!.method === 'ONLINE' && !reference) throw fail(400, 'Enter the received online payment reference.');
      const receiptId = payment!.method === 'ONLINE' ? `desk-online-${createHash('sha256').update(reference!.toLowerCase()).digest('hex')}` : `move-${batch.id}`;
      if (reference && (await tx.paymentAttempt.findFirst({ where: { providerReference: reference, status: 'SUCCEEDED' } }) || await tx.privateCoursePayment.findFirst({ where: { OR: [{ externalReceiptReference: reference }, { providerReference: reference }] } }))) throw fail(409, 'This payment reference is already recorded.');
      surchargeReceipt = { id: receiptId, method: payment!.method, reference: reference || null, amount: p.surcharge, confirmedById: actor.id };
      await tx.transaction.create({ data: { id: receiptId, userId: null, date: today(), customer: 'Court rental rescheduling', business: 'Badminton', item: `Rental move surcharge · ${batch.id}`, amount: p.surcharge, discount: 0, tax: 0, finalAmount: p.surcharge, paymentMethod: payment!.method === 'CASH' ? 'Cash' : 'Online (staff verified)', staff: actor.name, status: 'paid', resourceType: 'court_reschedule', resourceId: batch.id, confirmedById: actor.id, confirmationMode: 'MANUAL' } });
    }
    if (input.kind === 'court') {
      // Release only inside this transaction so swaps satisfy the existing overlap guards.
      await tx.booking.updateMany({ where: { id: { in: p.rentals.map(b => b.id) } }, data: { status: 'cancelled' } });
      for (const row of p.rows) {
        const original = p.rentals.find(b => b.id === row.id)!;
        const changed = await tx.booking.update({ where: { id: row.id }, data: { courtId: row.target.courtId, title: row.target.courtName, date: row.target.date, time: row.target.time, price: row.target.price, status: original.status } });
        await tx.bookingChangeHistory.create({ data: { bookingId: row.id, requestedById: actor.id, approvedById: actor.id, action: 'DESK_BATCH_RESCHEDULED', previous: JSON.stringify(original), current: JSON.stringify({ booking: changed, batchId: batch.id, surcharge: row.surcharge }), reason: input.reason, policyException: false } });
        const customerRequest = await tx.bookingRescheduleRequest.findUnique({ where: { activeKey: original.id } });
        if (customerRequest && customerRequest.status !== 'REFUND_REQUESTED') {
          await tx.bookingRescheduleRequest.update({ where: { id: customerRequest.id }, data: { status: 'COMPLETED', activeKey: null, completedAt: new Date(), proposed: row.target, newPrice: row.destinationPrice, priceDifference: row.surcharge } });
          await tx.rescheduleRequestEvent.create({ data: { requestId: customerRequest.id, actorId: actor.id, status: 'COMPLETED', detail: { batchId: batch.id, surcharge: row.surcharge, staffConfirmed: true } } });
        }
        await tx.notification.create({ data: { userId: original.userId, title: 'Court rental rescheduled', body: `${changed.title} · ${changed.date} · ${changed.time}`, link: '/bookings', type: 'booking', entityType: 'booking', entityId: row.id } });
      }
    } else {
      for (const [id, block] of p.updates) await tx.courtBlock.update({ where: { id }, data: { effectiveUntil: block.effectiveUntil, excludedDates: block.excludedDates ?? undefined, active: block.active } });
      for (const t of p.targets) { const { sourceId, ...data } = t; await tx.courtBlock.create({ data: { ...data, id: undefined, excludedDates: data.excludedDates ?? [], note: `Moved from ${sourceId} · ${batch.id}` } }); }
    }
    const result = json({ batchId: batch.id, rows: p.rows, surcharge: p.surcharge, payment: surchargeReceipt });
    await tx.deskMoveBatch.update({ where: { id: batch.id }, data: { result } });
    return result;
  }, { maxWait: 10000, timeout: 20000 });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      const receipt = await db.deskMoveBatch.findUnique({ where: { actorId_requestKey: { actorId: actor.id, requestKey } } });
      if (receipt) { if (receipt.payloadHash !== payloadHash) throw fail(409, 'Retry key belongs to another move.'); return receipt.result; }
    }
    throw error;
  }
}
