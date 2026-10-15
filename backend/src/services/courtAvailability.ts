import type { PrismaClient } from "@prisma/client";
import { isDateKey } from "../utils/dateKeys.js";
import { bookingFailure, occupyingStatuses } from "./courtBooking.js";
import {
  businessNow,
  today,
  openingMinute,
  closingMinute,
  clock,
  formatRange,
  overlaps,
  timeZone,
} from "./courtPolicy.js";

async function readCalendar(db: PrismaClient, from: string, to: string) {
  const [courts, bookings, blocks, holidays, overrides] = await Promise.all([
    db.court.findMany({
      where: { status: { not: "inactive" } },
      orderBy: { name: "asc" },
    }),
    db.booking.findMany({
      where: {
        date: { gte: from, lte: to },
        status: { in: occupyingStatuses },
        courtId: { not: null },
      },
      select: { date: true, courtId: true, time: true, status: true },
    }),
    db.courtBlock.findMany({
      where: {
        active: true,
        OR: [{ date: { gte: from, lte: to } }, { dayOfWeek: { not: null } }],
      },
    }),
    db.holidayRate.findMany({
      where: { date: { gte: from, lte: to }, active: true },
    }),
    db.courtDateOverride.findMany({ where: { date: { gte: from, lte: to } } }),
  ]);
  return { courts, bookings, blocks, holidays, overrides };
}
function build(date: string, data: Awaited<ReturnType<typeof readCalendar>>) {
  const { courts } = data,
    bookings = data.bookings.filter((b) => b.date === date),
    holiday = data.holidays.find((h) => h.date === date),
    override = data.overrides.find((o) => o.date === date);
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const blocks = data.blocks.filter(
    (b) =>
      b.date === date || (override?.type !== "open" && b.dayOfWeek === dow),
  );
  const current = businessNow(),
    minDate = today();
  const slots = courts.flatMap((court) =>
    Array.from({ length: (closingMinute - openingMinute) / 60 }, (_, index) => {
      const start = openingMinute + index * 60,
        time = formatRange(start, start + 60);
      let status:
        | "available"
        | "booked"
        | "reserved"
        | "blocked"
        | "closed"
        | "maintenance"
        | "expired" = "available";
      let reason: string | null = null;
      const reservation = bookings.find(
        (row) => row.courtId === court.id && overlaps(row.time, time),
      );
      const block = blocks.find(
        (row) =>
          row.courtId === court.id &&
          overlaps(`${row.start} — ${row.end}`, time),
      );
      if (
        date < minDate ||
        (date === minDate && start <= current.hour * 60 + current.minute)
      ) {
        status = "expired";
        reason = "Time has passed";
      } else if (override?.type === "closed") {
        status = "closed";
        reason = override.reason || override.title || "Facility closed";
      } else if (court.status !== "available") {
        status = "maintenance";
        reason = "Court under maintenance";
      } else if (reservation) {
        status = ["confirmed", "CONFIRMED"].includes(reservation.status)
          ? "booked"
          : "reserved";
        reason = status === "booked" ? "Booked" : "Reserved";
      } else if (block) {
        status = "blocked";
        reason =
          block.type.trim().toLowerCase() === "class" ? "Class" : "Reserved";
      }
      return {
        id: `${date}|${court.id}|${start}`,
        date,
        courtId: court.id,
        courtName: court.name,
        time,
        startMinute: start,
        endMinute: start + 60,
        label: clock(start),
        price: holiday
          ? holiday.price
          : court.price + (start >= 900 ? 5000 : 0),
        available: status === "available",
        status,
        reason,
      };
    }),
  );
  return {
    date,
    today: minDate,
    timeZone,
    currency: "MMK",
    openingTime: clock(openingMinute),
    closingTime: clock(closingMinute),
    maxSelections: 60,
    paymentPolicy: "venue",
    courts,
    slots,
  };
}
export async function courtAvailability(db: PrismaClient, date: string) {
  if (!isDateKey(date)) throw bookingFailure(400, "Choose a valid date.");
  return build(date, await readCalendar(db, date, date));
}
export async function courtMonthAvailability(db: PrismaClient, month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw bookingFailure(400, "Choose a valid month.");
  const count = new Date(
    Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0),
  ).getUTCDate();
  const data = await readCalendar(db, `${month}-01`, `${month}-${count}`);
  return {
    month,
    today: today(),
    days: Array.from({ length: count }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, "0")}`,
        available = build(date, data).slots.filter((s) => s.available);
      return {
        date,
        available: available.length > 0,
        availableSlots: available.length,
      };
    }),
  };
}
