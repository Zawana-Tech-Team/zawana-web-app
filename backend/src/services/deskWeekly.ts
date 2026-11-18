import { createHash } from 'node:crypto';
import { blocksShareDate, blockOccurs } from './blockSchedule.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import { bookingFailure, occupyingStatuses } from './courtBooking.js';
import { businessNow, formatRange, overlaps, range, today } from './courtPolicy.js';
import { isDateKey } from '../utils/dateKeys.js';

/** Court locks match rental creation: validate the entire recurring batch before any writes. */
async function writeWeekly(db: Prisma.TransactionClient, actorId: string, input: { courtIds: string[]; date: string; time: string; title: string; requestKey: string }) {
  const span = range(input.time);
  if (!isDateKey(input.date) || input.date < today() || !span || span.end - span.start !== 60 || span.start < 360 || span.end > 1260 || span.start % 60)
    throw bookingFailure(400, 'Choose a future dated one-hour session between 6 AM and 9 PM.');
  if (input.date === today() && span.start <= businessNow().hour * 60 + businessNow().minute) throw bookingFailure(409, 'This session time has already passed.');
  const ids = [...new Set(input.courtIds)].sort();
  if (ids.length !== input.courtIds.length) throw bookingFailure(400, 'Choose each court only once.');
  const dayOfWeek = new Date(`${input.date}T12:00:00Z`).getUTCDay();
  const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  const requestPrefix = createHash('sha256').update(`${actorId}:${input.requestKey}`).digest('hex');
  const requestHash = createHash('sha256').update(JSON.stringify([ids, input.date, input.time, input.title])).digest('hex');
  const notePrefix = `Desk weekly request ${requestPrefix}:`;
  const note = `${notePrefix}${requestHash}`;
  try {
    const tx = db;
    {
      for (const id of ids) await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${id}`;
      const previous = await tx.courtBlock.findMany({ where: { note: { startsWith: notePrefix } } });
      if (previous.length) {
        if (previous.length !== ids.length || previous.some(row => row.note !== note || !ids.includes(row.courtId) || row.dayOfWeek !== dayOfWeek || row.start !== clock(span.start) || row.end !== clock(span.end) || row.title !== input.title))
          throw bookingFailure(409, 'This retry key belongs to another weekly reservation.');
        return previous;
      }
      const override = await tx.courtDateOverride.findUnique({ where: { date: input.date } });
      if (override?.type === 'closed') throw bookingFailure(409, 'Courts are closed on the selected date.');
      const courts = await tx.court.findMany({ where: { id: { in: ids }, status: 'available' } });
      if (courts.length !== ids.length) throw bookingFailure(409, 'One or more courts are no longer available.');
      const [bookings, blocks] = await Promise.all([
        tx.booking.findMany({ where: { courtId: { in: ids }, date: { gte: today() }, status: { in: occupyingStatuses } } }),
        tx.courtBlock.findMany({ where: { courtId: { in: ids }, active: true } }),
      ]);
      const overrides = new Map((await tx.courtDateOverride.findMany()).map(o => [o.date, o]));
      const template = { date: '', type: 'class', dayOfWeek, effectiveFrom: input.date };
      if (bookings.some(row => blockOccurs(template, row.date, overrides.get(row.date)) && overlaps(row.time, formatRange(span.start, span.end))) ||
          blocks.some(row => blocksShareDate(row, template, input.date, overrides) && overlaps(`${row.start} — ${row.end}`, input.time)))
        throw bookingFailure(409, 'A selected court has a conflicting current or future weekly session. No reservations were created.');
      const rows = [];
      for (const courtId of ids) rows.push(await tx.courtBlock.create({ data: {
        id: `weekly-${createHash('sha256').update(`${requestPrefix}:${courtId}`).digest('hex')}`,
        courtId, date: '', effectiveFrom: input.date, dayOfWeek, start: clock(span.start), end: clock(span.end), title: input.title, type: 'class', active: true, note,
      } }));
      return rows;
    }
  } catch (error) {
    if (['P2034', 'P2028', 'P2010', 'P2002'].includes((error as { code?: string }).code || '')) throw bookingFailure(409, 'Availability changed. Refresh and retry the whole selection.');
    throw error;
  }
}

export async function reserveDeskWeekly(db: PrismaClient, actorId: string, input: { courtIds: string[]; date: string; time: string; title: string; requestKey: string }) {
  return db.$transaction(tx => writeWeekly(tx, actorId, input));
}
export async function reserveWeeklySelections(db: PrismaClient, actorId: string, input: { selections: { courtId: string; date: string; time: string }[]; title: string; requestKey: string }) {
  const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return db.$transaction(async tx => {
    const existing = await tx.deskMoveBatch.findUnique({ where: { actorId_requestKey: { actorId, requestKey: input.requestKey } } });
    if (existing) { if (existing.payloadHash !== payloadHash) throw bookingFailure(409, 'Retry key belongs to another operation.'); return existing.result; }
    const receipt = await tx.deskMoveBatch.create({ data: { actorId, requestKey: input.requestKey, payloadHash, reason: 'Weekly class creation', result: {} } });
    for (const id of [...new Set(input.selections.map(s => s.courtId))].sort()) await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${id}`;
    const rows = [];
    for (const [i, selection] of input.selections.entries()) rows.push(...await writeWeekly(tx, actorId, { ...selection, courtIds: [selection.courtId], title: input.title, requestKey: `${input.requestKey}:${i}` }));
    const result = JSON.parse(JSON.stringify(rows));
    await tx.deskMoveBatch.update({ where: { id: receipt.id }, data: { result } });
    return result;
  }, { maxWait: 10000, timeout: 20000 });
}
