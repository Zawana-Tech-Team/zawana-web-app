import { createHash } from "node:crypto";
import type { Prisma, PrismaClient, Role } from "@prisma/client";
import { z } from "zod";
import { privateCourseAvailability } from "./privateCourseAvailability.js";
import { code, today } from "./courtPolicy.js";
import { bookingFailure as fail } from "./courtBooking.js";

type Actor = { id: string; role: Role; name: string };
type Tx = Prisma.TransactionClient;
const hash = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
export const staffCourseInput = z
  .object({
    memberId: z.string().min(1),
    courseId: z.string().min(1),
    coachId: z.string().min(1),
    courtId: z.string().min(1),
    date: z.string(),
    time: z.string(),
    expectedPrice: z.number().int().nonnegative(),
    paymentSource: z.enum(["BADMINTON_FO", "COACH", "ONLINE", "UNPAID"]),
    reference: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
    requestKey: z.string().min(16).max(100),
  })
  .strict();
export async function lockCourseBooking(tx: Tx, id: string, actor?: Actor) {
  await tx.$executeRaw`UPDATE "Booking" SET "id"="id" WHERE "id"=${id}`;
  const b = await tx.booking.findUnique({
    where: { id },
    include: { user: true, coach: true, privateCoursePayment: true },
  });
  if (!b || b.kind !== "private_course")
    throw fail(404, "Private course booking not found.");
  if (actor?.role === "coach" && b.coach?.userId !== actor.id)
    throw fail(403, "This booking belongs to another coach.");
  return b;
}
export async function recordCourseCash(
  tx: Tx,
  id: string,
  actor: Actor,
  reference?: string,
  notes?: string,
) {
  const b = await lockCourseBooking(tx, id, actor);
  if (b.privateCoursePayment) {
    if (
      b.privateCoursePayment.collectedByUserId !== actor.id ||
      b.privateCoursePayment.status !== "PAID"
    )
      throw fail(409, "A payment is already recorded.");
    return b.privateCoursePayment;
  }
  if (
    b.paymentStatus !== "pending" ||
    !["PENDING_COACH_CONFIRMATION", "AWAITING_PAYMENT"].includes(b.status)
  )
    throw fail(409, "This booking is no longer payable.");
  if (b.paymentExpiresAt && b.paymentExpiresAt <= new Date())
    throw fail(409, "Payment deadline expired.");
  const transaction = await tx.transaction.create({
    data: {
      userId: b.userId,
      date: today(),
      customer: b.user.name,
      business: "Badminton",
      item: `Private course · ${b.title}`,
      amount: b.price,
      discount: 0,
      tax: 0,
      finalAmount: b.price,
      paymentMethod: "Cash",
      staff: actor.name,
      status: "paid",
    },
  });
  const payment = await tx.privateCoursePayment.create({
    data: {
      bookingId: id,
      transactionId: transaction.id,
      amount: b.price,
      paymentSource: actor.role === "coach" ? "COACH" : "BADMINTON_FO",
      paymentMethod: "CASH",
      collectedByUserId: actor.id,
      receivedAt: new Date(),
      verifiedByUserId: actor.id,
      verifiedAt: new Date(),
      externalReceiptReference: reference,
      notes,
    },
  });
  await tx.booking.update({
    where: { id },
    data: {
      paymentStatus: "paid",
      status: "CONFIRMED",
      paymentExpiresAt: null,
      reservationExpiresAt: null,
    },
  });
  await tx.paymentAttempt.updateMany({
    where: {
      resourceType: "private_course",
      resourceId: id,
      status: { in: ["PENDING", "INITIATING"] },
    },
    data: {
      status: "EXPIRED",
      failureReason:
        "Paid at staff desk; late provider receipts require reconciliation.",
    },
  });
  return payment;
}
export async function createStaffCourse(
  db: PrismaClient,
  actor: Actor,
  raw: unknown,
) {
  const b = staffCourseInput.parse(raw),
    payloadHash = hash(b);
  const replay = async () => {
    const r = await db.bookingSubmission.findUnique({
      where: { userId_key: { userId: actor.id, key: b.requestKey } },
    });
    if (!r) return null;
    if (r.payloadHash !== payloadHash)
      throw fail(409, "Retry key belongs to a different request.");
    return db.booking.findUniqueOrThrow({
      where: { id: JSON.parse(r.bookingIds)[0] },
      include: { privateCoursePayment: true },
    });
  };
  const previous = await replay();
  if (previous) return previous;
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.bookingSubmission.create({
          data: {
            userId: actor.id,
            key: b.requestKey,
            payloadHash,
            bookingIds: "[]",
          },
        });
        await tx.$executeRaw`UPDATE "Court" SET "status"="status" WHERE "id"=${b.courtId}`;
        await tx.$executeRaw`UPDATE "Coach" SET "status"="status" WHERE "id"=${b.coachId}`;
        const [member, coach, course] = await Promise.all([
          tx.user.findFirst({
            where: {
              id: b.memberId,
              role: "member",
              active: true,
              deletedAt: null,
            },
          }),
          tx.coach.findUnique({ where: { id: b.coachId } }),
          tx.privateCourse.findUnique({ where: { id: b.courseId } }),
        ]);
        if (!member || !course)
          throw fail(400, "Choose an existing active member and course.");
        if (actor.role === "coach" && coach?.userId !== actor.id)
          throw fail(403, "Coaches may only book their own courses.");
        if (
          (b.paymentSource === "COACH" && actor.role !== "coach") ||
          (b.paymentSource === "BADMINTON_FO" && actor.role === "coach")
        )
          throw fail(403, "Only the actual collector may record cash.");
        const availability = await privateCourseAvailability(tx, {
          ...b,
          durationMinutes: course.duration,
        });
        if (availability.price !== b.expectedPrice)
          throw fail(409, "Price changed. Review the course again.");
        if (!availability.slots.some((s) => s.time === b.time && s.available))
          throw fail(409, "Court or coach is no longer available.");
        const booking = await tx.booking.create({
          data: {
            userId: member.id,
            code: code("PC"),
            kind: "private_course",
            title: course.title,
            courtId: b.courtId,
            coachId: b.coachId,
            date: b.date,
            time: b.time,
            location: "Zawana Badminton Arena",
            price: course.price,
            status: "PENDING_COACH_CONFIRMATION",
            meta: JSON.stringify({
              courseId: course.id,
              createdById: actor.id,
              requestedPaymentSource: b.paymentSource,
            }),
          },
        });
        if (["COACH", "BADMINTON_FO"].includes(b.paymentSource))
          await recordCourseCash(tx, booking.id, actor, b.reference, b.notes);
        await tx.bookingSubmission.update({
          where: { userId_key: { userId: actor.id, key: b.requestKey } },
          data: { bookingIds: JSON.stringify([booking.id]) },
        });
        await tx.notification.createMany({
          data: [
            {
              userId: member.id,
              title: "Private course booking created",
              body: `${course.title} · ${b.date} · ${b.time}`,
              link: "/bookings",
              type: "booking",
              entityId: booking.id,
            },
            {
              userId: coach!.userId,
              title: "Private course booking created",
              body: `${member.name} · ${course.title} · ${b.date} · ${b.time}`,
              link: "/coach/bookings",
              type: "booking",
              entityId: booking.id,
            },
          ],
        });
        return tx.booking.findUniqueOrThrow({
          where: { id: booking.id },
          include: { privateCoursePayment: true },
        });
      },
      { maxWait: 10000, timeout: 15000 },
    );
  } catch (error) {
    const saved = await replay();
    if (saved) return saved;
    throw error;
  }
}
export const settlementInput = z
  .object({
    requestKey: z.string().min(16).max(100),
    notes: z.string().max(2000).optional(),
    items: z
      .array(
        z
          .object({
            paymentId: z.string(),
            amount: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export async function submitCourseSettlement(
  db: PrismaClient,
  actor: Actor,
  raw: unknown,
) {
  const b = settlementInput.parse(raw),
    payloadHash = hash(b);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "User" SET "active"="active" WHERE "id"=${actor.id}`;
    const previous = await tx.privateCourseSettlement.findUnique({
      where: {
        collectorId_requestKey: {
          collectorId: actor.id,
          requestKey: b.requestKey,
        },
      },
    });
    if (previous) {
      if (previous.payloadHash !== payloadHash)
        throw fail(409, "Retry key already used.");
      return previous;
    }
    if (new Set(b.items.map((i) => i.paymentId)).size !== b.items.length)
      throw fail(400, "Choose each payment once.");
    for (const item of [...b.items].sort((a, c) =>
      a.paymentId.localeCompare(c.paymentId),
    )) {
      await tx.$executeRaw`UPDATE "PrivateCoursePayment" SET "id"="id" WHERE "id"=${item.paymentId}`;
      const p = await tx.privateCoursePayment.findUnique({
        where: { id: item.paymentId },
        include: { allocations: true },
      });
      if (
        !p ||
        p.collectedByUserId !== actor.id ||
        p.paymentSource !== "COACH" ||
        p.status !== "PAID"
      )
        throw fail(
          403,
          "Only your own paid coach collections can be handed over.",
        );
      if (
        p.allocations.reduce((sum, i) => sum + i.amount, 0) + item.amount >
        p.amount
      )
        throw fail(409, "Amount exceeds cash available for handover.");
    }
    return tx.privateCourseSettlement.create({
      data: {
        collectorId: actor.id,
        requestKey: b.requestKey,
        payloadHash,
        notes: b.notes,
        amount: b.items.reduce((sum, i) => sum + i.amount, 0),
        items: { create: b.items },
      },
    });
  });
}
