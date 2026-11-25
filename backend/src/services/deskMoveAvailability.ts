import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { Actor } from './deskMoves.js';
import { bookingFailure, occupyingStatuses } from './courtBooking.js';
import { blockOccurs } from './blockSchedule.js';
import { closingMinute, formatRange, openingMinute, overlaps, range } from './courtPolicy.js';
import { scheduleInstant } from './courtChanges.js';
import { isDateKey } from '../utils/dateKeys.js';

export const deskMoveAvailabilityInput = z.object({
  bookingIds: z.array(z.string().min(1)).min(1).max(30),
  targets: z.array(z.object({ bookingId: z.string().min(1), courtId: z.string().min(1), date: z.string().refine(isDateKey, 'Choose a valid date.') }).strict()).min(1).max(30),
}).strict().superRefine((input, context) => {
  if (new Set(input.bookingIds).size !== input.bookingIds.length || new Set(input.targets.map(target => target.bookingId)).size !== input.targets.length || input.targets.some(target => !input.bookingIds.includes(target.bookingId)))
    context.addIssue({ code: 'custom', message: 'Select each rental once and include every target rental in the selection.' });
});

/** One read-only calendar snapshot for all selected rental destinations. Final quote/confirm still revalidate. */
export async function deskMoveAvailability(db: PrismaClient, actor: Actor, raw: z.infer<typeof deskMoveAvailabilityInput>, now = new Date()) {
  if (!['admin', 'badminton_fo'].includes(actor.role)) throw bookingFailure(403, 'Only badminton desk staff can check rental replacements.');
  const input = deskMoveAvailabilityInput.parse(raw);
  const courtIds = [...new Set(input.targets.map(target => target.courtId))];
  const dates = [...new Set(input.targets.map(target => target.date))];
  const [sources, courts, overrides, blocks, reservations] = await Promise.all([
    db.booking.findMany({ where: { id: { in: input.bookingIds }, kind: 'court' }, select: { id: true, date: true, time: true, status: true, paymentStatus: true } }),
    db.court.findMany({ where: { id: { in: courtIds } }, select: { id: true, status: true } }),
    db.courtDateOverride.findMany({ where: { date: { in: dates } } }),
    db.courtBlock.findMany({ where: { courtId: { in: courtIds }, active: true, OR: [{ date: { in: dates } }, { dayOfWeek: { not: null } }] } }),
    db.booking.findMany({ where: { id: { notIn: input.bookingIds }, courtId: { in: courtIds }, date: { in: dates }, status: { in: occupyingStatuses } }, select: { courtId: true, date: true, time: true } }),
  ]);
  if (sources.length !== input.bookingIds.length) throw bookingFailure(404, 'A selected court rental no longer exists.');
  if (courts.length !== courtIds.length) throw bookingFailure(404, 'A destination court no longer exists.');
  for (const source of sources) {
    if (!['confirmed', 'CONFIRMED'].includes(source.status) || source.paymentStatus === 'refunded' || scheduleInstant(source.date, source.time) <= now)
      throw bookingFailure(409, 'Only future confirmed, non-refunded rentals can be moved.');
  }
  return { rows: input.targets.map(target => {
    const source = sources.find(booking => booking.id === target.bookingId)!;
    const span = range(source.time);
    if (!span) throw bookingFailure(409, 'The stored session duration needs staff review.');
    const durationMinutes = span.end - span.start;
    const court = courts.find(court => court.id === target.courtId)!;
    const override = overrides.find(override => override.date === target.date);
    const blocked = blocks.filter(block => block.courtId === court.id && blockOccurs(block, target.date, override));
    const booked = reservations.filter(booking => booking.courtId === court.id && booking.date === target.date);
    const slots: { time: string }[] = [];
    if (court.status === 'available' && override?.type !== 'closed') {
      for (let start = openingMinute; start + durationMinutes <= closingMinute; start += 60) {
        const time = formatRange(start, start + durationMinutes);
        if (scheduleInstant(target.date, time) <= now || booked.some(booking => overlaps(booking.time, time)) || blocked.some(block => overlaps(`${block.start} — ${block.end}`, time))) continue;
        slots.push({ time });
      }
    }
    return { bookingId: source.id, courtId: court.id, date: target.date, durationMinutes, slots };
  }) };
}
