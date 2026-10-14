import { createHash } from "node:crypto";
import type { Booking, BookingSubmission, PrismaClient, BookingStatus } from "@prisma/client";
import { isDateKey } from "../utils/dateKeys.js";
import { businessNow, today, range, overlaps, formatRange, code } from "./courtPolicy.js";

export const occupyingStatuses: BookingStatus[] = ["pending", "confirmed", "CONFIRMED", "PENDING_COACH_CONFIRMATION", "AWAITING_PAYMENT"];
export type Selection = { date: string; courtId: string; time: string };
type Conflict = Selection & { courtName: string; reason: string };
type Input = { bookings?: Selection[]; slots?: {courtId: string; time: string}[]; date?: string; courtId?: string; time?: string; location?: string; meta?: string };
export const bookingFailure = (statusCode: number, message: string, conflicts?: Conflict[]) => Object.assign(new Error(message), { statusCode, conflicts, code: statusCode === 409 ? "BOOKING_CONFLICT" : "INVALID_BOOKING" });
const result = (bookings: Booking[]) => ({ booking: bookings[0], bookings, totalPrice: bookings.reduce((sum, row) => sum + row.price, 0) });
const hashPayload = (selections: Selection[], notes?: string) => createHash("sha256").update(JSON.stringify({ selections: [...selections].sort((a,b) => `${a.date}|${a.courtId}|${a.time}`.localeCompare(`${b.date}|${b.courtId}|${b.time}`)), notes: notes || "" })).digest("hex");
async function replay(db: PrismaClient, receipt: BookingSubmission, expectedHash?: string) {
 if (expectedHash && receipt.payloadHash !== expectedHash) throw bookingFailure(409, "This retry key belongs to a different booking. Start a new reservation.");
 const ids: string[] = JSON.parse(receipt.bookingIds);
 const rows = await db.booking.findMany({where: {id: {in: ids}, userId: receipt.userId}});
 return result(ids.map(id => rows.find(row => row.id === id)).filter((row): row is Booking => !!row));
}
export async function findSubmission(db: PrismaClient, userId: string, key: string) {
 const receipt = await db.bookingSubmission.findUnique({where: {userId_key: {userId,key}}});
 return receipt ? replay(db, receipt) : null;
}
export async function createCourtBooking(prisma: PrismaClient, user: {id: string; name: string}, b: Input, key?: string) {
 try {
      const requested = (b.bookings ||
        b.slots?.map(s => ({ date: b.date || "", ...s })) ||
        ((b.courtId && b.time && b.date)? [{ date: b.date, courtId: b.courtId, time: b.time }] : []));
      if (!requested.length)
        throw bookingFailure(400, "Choose at least one court and time slot.");
      for (const item of requested) {
        const span = range(item.time);
        if (span) item.time = formatRange(span.start, span.end);
      }
      const invalidDates = requested.filter(s => !isDateKey(s.date));
      if (invalidDates.length)
        throw bookingFailure(400, "Each booking must have a valid date.");
      if (requested.some(s => s.date < today()))
        throw bookingFailure(400, "Choose today or a future date for every session.");
      const ids = [...new Set(requested.map(s => s.courtId))],
        courts = await prisma.court.findMany({ where: { id: { in: ids } } }),
        courtById = new Map(courts.map(c => [c.id, c]));
      const invalid: Conflict[] = [],
        seen: Selection[] = [];
      for (const item of requested) {
        const r = range(item.time),
          court = courtById.get(item.courtId);
        let reason = "";
        if (!r || r.end - r.start !== 60 || r.start < 360 || r.end > 1260 || r.start % 60 !== 0)
          reason = "Choose one-hour slots between 6:00 AM and 9:00 PM.";
        else if (item.date === today() && r.start <= businessNow().hour * 60 + businessNow().minute)
          reason = "This time has already passed.";
        else if (!court) reason = "Court not found.";
        else if (court.status !== "available")
          reason = `${court.name} is currently ${court.status}.`;
        else if (
          seen.some(s => s.date === item.date && s.courtId === item.courtId && s.time === item.time)
        )
          reason = "This slot is selected more than once.";
        else if (
          seen.some(
            s => s.date === item.date && s.courtId === item.courtId && overlaps(s.time, item.time)
          )
        )
          reason = "The selected slots overlap.";
        if (reason) invalid.push({ ...item, courtName: court?.name || item.courtId, reason });
        seen.push(item);
      }
      if (invalid.length)
        throw bookingFailure(409, "Review the unavailable slot(s) and try again.", invalid);
      const payloadHash = hashPayload(requested, b.meta);
      if (key) {
        const receipt = await prisma.bookingSubmission.findUnique({ where: { userId_key: { userId: user.id, key } } });
        if (receipt) return replay(prisma, receipt, payloadHash);
      }
      const created = await prisma.$transaction(async tx => {
        if (key) {
          // Insert first: one owner per retry key, and SQLite obtains its write lock before reads.
          await tx.bookingSubmission.create({ data: { userId: user.id, key, payloadHash, bookingIds: "[]" } });
        }
        for (const id of [...ids].sort())
          await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${id}`;
        const dates = [...new Set(requested.map(s => s.date))];
        const [overrides, currentCourts, existing, blocks, holidays] = await Promise.all([
          tx.courtDateOverride.findMany({ where: { date: { in: dates } } }),
          tx.court.findMany({ where: { id: { in: ids } } }),
          tx.booking.findMany({
            where: { date: { in: dates }, courtId: { in: ids }, status: { in: occupyingStatuses } },
            select: { date: true, courtId: true, time: true }
          }),
          tx.courtBlock.findMany({
            where: {
              courtId: { in: ids },
              active: true,
              OR: [{ date: { in: dates } }, { dayOfWeek: { not: null } }]
            }
          }),
          tx.holidayRate.findMany({ where: { date: { in: dates }, active: true } })
        ]);
        const currentById = new Map(currentCourts.map(c => [c.id, c])),
          overrideByDate = new Map(overrides.map(x => [x.date, x])),
          holidayByDate = new Map(holidays.map(x => [x.date, x])),
          conflicts: Conflict[] = [];
        for (const item of requested) {
          const r = range(item.time),
            court = currentById.get(item.courtId);
          const override = overrideByDate.get(item.date),
            dow = new Date(`${item.date}T00:00:00`).getDay();
          const dateBlocks = blocks.filter(
            x =>
              x.courtId === item.courtId &&
              (x.date === item.date || (override?.type !== "open" && x.dayOfWeek === dow))
          );
          let reason = "";
          if (override?.type === "closed") reason = `Courts are closed on ${item.date}.`;
          else if (!court || court.status !== "available")
            reason = court
              ? `${court.name} is no longer available.`
              : "Court is no longer available.";
          else if (
            r &&
            item.date === today() &&
            r.start <= businessNow().hour * 60 + businessNow().minute
          )
            reason = "This time has already passed.";
          else if (
            existing.some(
              x =>
                x.date === item.date && x.courtId === item.courtId && overlaps(x.time, item.time)
            )
          )
            reason = "This slot was just booked by someone else.";
          else if (dateBlocks.some(x => overlaps(`${x.start} — ${x.end}`, item.time)))
            reason = "This slot is reserved for a class or facility block.";
          if (reason) conflicts.push({ ...item, courtName: court?.name || item.courtId, reason });
        }
        if (conflicts.length)
          throw Object.assign(
            new Error(
              "One or more selected slots are no longer available. No bookings were created."
            ),
            { statusCode: 409, conflicts }
          );
        const rows = [];
        for (const item of requested) {
          const court = currentById.get(item.courtId)!,
            r = range(item.time)!,
            holiday = holidayByDate.get(item.date);
          const price = holiday ? holiday.price : court.price + (r.start >= 900 ? 5000 : 0);
          const row = await tx.booking.create({
            data: {
              kind: "court",
              title: court.name,
              date: item.date,
              time: item.time,
              location: b.location || "Zawana Badminton Arena",
              courtId: court.id,
              price,
              code: code("ZW"),
              userId: user.id,
              status: "CONFIRMED",
              paymentStatus: "pending",
              meta: b.meta || null,
              reservationExpiresAt: null
            }
          });
          await tx.notification.create({
            data: {
              userId: user.id,
              title: "Court booking confirmed",
              body: `${court.name} · ${item.date} · ${item.time}.`,
              link: "/bookings",
              audience: "member",
              type: "booking",
              icon: "calendar",
              entityType: "booking",
              entityId: row.id
            }
          });
          await tx.notification.create({
            data: {
              userId: null,
              title: "New court booking",
              body: `${user.name} · ${court.name} · ${item.date} · ${item.time}.`,
              link: "/badminton-fo/bookings",
              audience: "badminton_fo",
              type: "booking",
              icon: "calendar",
              actionLabel: "View bookings",
              entityType: "booking",
              entityId: row.id
            }
          });
          await tx.notification.create({
            data: {
              userId: null,
              title: "New badminton booking",
              body: `${user.name} · ${court.name} · ${item.date} · ${item.time}.`,
              link: "/admin/bookings",
              audience: "admin",
              type: "booking",
              icon: "calendar",
              actionLabel: "View bookings",
              entityType: "booking",
              entityId: row.id
            }
          });
          rows.push(row);
        }
        if (key) await tx.bookingSubmission.update({ where: { userId_key: { userId: user.id, key } }, data: { bookingIds: JSON.stringify(rows.map(row => row.id)) } });
        return rows;
      }, { maxWait: 10000, timeout: 15000 });
      return result(created);
 } catch (error) {
   // A concurrent retry may have committed while our insert waited on the unique key.
   if (key) {
     const receipt = await prisma.bookingSubmission.findUnique({where: {userId_key: {userId: user.id,key}}});
     if (receipt) {
       const selections = b.bookings || b.slots?.map(slot => ({date: b.date || "", ...slot})) || [{date: b.date || "", courtId: b.courtId || "", time: b.time || ""}];
       return replay(prisma, receipt, hashPayload(selections.map(item => {const span=range(item.time); return {...item,time:span?formatRange(span.start,span.end):item.time};}), b.meta));
     }
   }
   throw error;
 }
}
