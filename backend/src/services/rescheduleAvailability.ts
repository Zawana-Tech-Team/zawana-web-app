import type { Prisma } from '@prisma/client';
import { assertDestination, validateDestination } from './deskMoves.js';
import { range, formatRange } from './courtPolicy.js';
import { isDateKey } from '../utils/dateKeys.js';
import { bookingFailure } from './courtBooking.js';
/** Both booking types use the same duration-preserving destination checks. */
export async function replacementSlots(tx: Prisma.TransactionClient, booking: { id: string; time: string; kind: string; coachId: string | null }, date: string, courtId: string) {
  const span = range(booking.time);
  if (!isDateKey(date) || !courtId || !span) throw bookingFailure(400, 'Choose a valid date and court.');
  const slots: { time: string; available: boolean }[] = [];
  for (let start = 360; start + span.end - span.start <= 1260; start += 60) {
    const time = formatRange(start, start + span.end - span.start);
    let available = true;
    try {
      validateDestination({ date, time }, span.end - span.start);
      await assertDestination(tx, { date, time, courtId }, [booking.id], booking.kind === 'private_course' ? booking.coachId || undefined : undefined);
    } catch (error) {
      // Infrastructure failures must remain errors, never an apparently fully booked day.
      if (![400, 409].includes((error as { statusCode?: number }).statusCode || 0)) throw error;
      available = false;
    }
    slots.push({ time, available });
  }
  return { slots };
}
