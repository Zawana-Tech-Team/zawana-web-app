import type { Prisma, PrismaClient } from "@prisma/client";
import { isDateKey } from "../utils/dateKeys.js";
import { bookingFailure, occupyingStatuses } from "./courtBooking.js";
import {
  businessNow,
  today,
  timeZone,
  openingMinute,
  closingMinute,
  formatRange,
  overlaps,
} from "./courtPolicy.js";

type Database = PrismaClient | Prisma.TransactionClient;
export type CourseSelection = {
  courseId: string;
  coachId: string;
  courtId: string;
  date: string;
  durationMinutes: number;
};
/** Eligibility, coach commitments, court bookings and facility blocks are independent checks. */
export async function privateCourseAvailability(
  db: Database,
  input: CourseSelection,
  now = new Date(),
) {
  if (!isDateKey(input.date) || input.date < today(now))
    throw bookingFailure(400, "Choose a valid current or future date.");
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 30 ||
    input.durationMinutes > 900
  )
    throw bookingFailure(400, "Choose a valid course duration.");
  const [course, coach, court, override] = await Promise.all([
    db.privateCourse.findFirst({
      where: {
        id: input.courseId,
        status: "active",
        coaches: { some: { id: input.coachId } },
      },
    }),
    db.coach.findFirst({
      where: {
        id: input.coachId,
        department: "Badminton",
        status: "active",
        user: { is: { role: "coach", active: true } },
      },
    }),
    db.court.findUnique({ where: { id: input.courtId } }),
    db.courtDateOverride.findUnique({ where: { date: input.date } }),
  ]);
  if (!course || !coach)
    throw bookingFailure(
      409,
      "This coach is no longer eligible for the selected badminton course.",
    );
  if (!court) throw bookingFailure(409, "Choose a badminton court.");
  if (course.duration !== input.durationMinutes)
    throw bookingFailure(
      409,
      "The course duration has changed. Select the course again.",
    );
  const [bookings, blocks] = await Promise.all([
    db.booking.findMany({
      where: {
        date: input.date,
        status: { in: occupyingStatuses },
        OR: [{ courtId: court.id }, { coachId: coach.id }],
      },
      select: { time: true, courtId: true, coachId: true },
    }),
    db.courtBlock.findMany({
      where: {
        courtId: court.id,
        active: true,
        OR:
          override?.type === "open"
            ? [{ date: input.date }]
            : [
                { date: input.date },
                { dayOfWeek: new Date(`${input.date}T12:00:00Z`).getUTCDay() },
              ],
      },
    }),
  ]);
  const current = businessNow(now);
  const slots = Array.from(
    {
      length: Math.max(
        0,
        Math.floor((closingMinute - openingMinute - course.duration) / 60) + 1,
      ),
    },
    (_, i) => {
      const startMinute = openingMinute + i * 60,
        endMinute = startMinute + course.duration;
      const time = formatRange(startMinute, endMinute);
      const coachAvailable = !bookings.some(
        (b) => b.coachId === coach.id && overlaps(b.time, time),
      );
      const courtAvailable =
        court.status === "available" &&
        override?.type !== "closed" &&
        !bookings.some(
          (b) => b.courtId === court.id && overlaps(b.time, time),
        ) &&
        !blocks.some((b) => overlaps(`${b.start} — ${b.end}`, time));
      const future =
        input.date !== today(now) ||
        startMinute > current.hour * 60 + current.minute;
      return {
        time,
        startMinute,
        endMinute,
        coachAvailable,
        courtAvailable,
        available: future && coachAvailable && courtAvailable,
        reason: !future
          ? "Time has passed"
          : !courtAvailable
            ? "Court unavailable"
            : !coachAvailable
              ? "Coach unavailable"
              : null,
      };
    },
  );
  return {
    ...input,
    price: course.price,
    currency: "MMK",
    timeZone,
    today: today(now),
    slots,
  };
}
