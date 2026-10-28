import { Router } from "express";
import type { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { auth, roles } from "../middleware/auth.js";
import type { AuthRequest } from "../types/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import {
  createStaffCourse,
  lockCourseBooking,
  recordCourseCash,
  submitCourseSettlement,
} from "../services/privateCourseFinance.js";
import { bookingFailure as fail } from "../services/courtBooking.js";

export function createPrivateCourseFinanceRouter(db: PrismaClient) {
  const r = Router();
  r.use(auth, roles("admin", "badminton_fo", "coach"));
  r.get(
    "/members",
    asyncRoute(async (req: AuthRequest, res) => {
      const q = z.string().min(2).max(100).parse(req.query.q);
      res.json(
        await db.user.findMany({
          where: {
            role: "member",
            active: true,
            deletedAt: null,
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
            ],
          },
          select: { id: true, name: true, email: true, phone: true },
          take: 20,
        }),
      );
    }),
  );
  r.get(
    "/catalog",
    asyncRoute(async (req: AuthRequest, res) => {
      const coachWhere = {
        department: "Badminton",
        status: "active" as const,
        user: { is: { role: "coach" as const, active: true } },
        ...(req.user!.role === "coach" ? { userId: req.user!.id } : {}),
      };
      res.json({
        courses: await db.privateCourse.findMany({
          where: { status: "active", coaches: { some: coachWhere } },
          include: {
            coaches: { where: coachWhere, select: { id: true, name: true } },
          },
        }),
        courts: await db.court.findMany({
          where: { status: "available" },
          select: { id: true, name: true },
        }),
      });
    }),
  );
  r.post(
    "/bookings",
    asyncRoute(async (req: AuthRequest, res) =>
      res.status(201).json(await createStaffCourse(db, req.user!, req.body)),
    ),
  );
  r.post(
    "/bookings/:id/cancel",
    asyncRoute(async (req: AuthRequest, res) => {
      const input = z
        .object({ reason: z.string().min(10).max(2000) })
        .strict()
        .parse(req.body);
      res.json(
        await db.$transaction(async (tx) => {
          const b = await lockCourseBooking(
            tx,
            String(req.params.id),
            req.user!,
          );
          if (b.paymentStatus !== "pending")
            throw fail(
              409,
              "Paid cancellations require the audited refund workflow.",
            );
          if (b.status === "CANCELLED") return b;
          if (
            !["PENDING_COACH_CONFIRMATION", "AWAITING_PAYMENT"].includes(
              b.status,
            )
          )
            throw fail(409, "This booking cannot be cancelled.");
          const updated = await tx.booking.update({
            where: { id: b.id },
            data: {
              status: "CANCELLED",
              reservationExpiresAt: null,
              paymentExpiresAt: null,
            },
          });
          await tx.bookingChangeHistory.create({
            data: {
              bookingId: b.id,
              action: "STAFF_CANCEL",
              previous: b.status,
              current: "CANCELLED",
              requestedById: req.user!.id,
              reason: input.reason,
            },
          });
          return updated;
        }),
      );
    }),
  );
  r.post(
    "/bookings/:id/cash",
    asyncRoute(async (req: AuthRequest, res) => {
      const b = z
        .object({
          reference: z.string().max(200).optional(),
          notes: z.string().max(2000).optional(),
        })
        .strict()
        .parse(req.body);
      res.json(
        await db.$transaction((tx) =>
          recordCourseCash(
            tx,
            String(req.params.id),
            req.user!,
            b.reference,
            b.notes,
          ),
        ),
      );
    }),
  );
  r.get(
    "/bookings/:id/online",
    asyncRoute(async (req: AuthRequest, res) => {
      const b = await db.$transaction((tx) =>
        lockCourseBooking(tx, String(req.params.id), req.user!),
      );
      res.json(
        await db.paymentAttempt.findMany({
          where: {
            resourceType: "private_course",
            resourceId: b.id,
            userId: b.userId,
          },
          select: {
            id: true,
            reference: true,
            provider: true,
            providerReference: true,
            amount: true,
            status: true,
            paidAt: true,
          },
        }),
      );
    }),
  );
  r.post(
    "/bookings/:id/reconcile-online",
    roles("admin", "badminton_fo"),
    asyncRoute(async (req: AuthRequest, res) => {
      const input = z
        .object({ paymentAttemptId: z.string() })
        .strict()
        .parse(req.body);
      res.json(
        await db.$transaction(async (tx) => {
          const b = await lockCourseBooking(tx, String(req.params.id));
          const p = await tx.paymentAttempt.findUnique({
            where: { id: input.paymentAttemptId },
          });
          if (
            !p ||
            p.status !== "SUCCEEDED" ||
            p.resourceType !== "private_course" ||
            p.resourceId !== b.id ||
            p.userId !== b.userId ||
            p.amount !== b.price ||
            p.currency !== "MMK" ||
            !p.providerReference
          )
            throw fail(
              409,
              "A verified successful payment for this booking and member is required.",
            );
          if (b.privateCoursePayment) {
            if (b.privateCoursePayment.paymentAttemptId !== p.id)
              throw fail(409, "Booking already has a payment.");
            return b.privateCoursePayment;
          }
          // Existing successful callbacks already posted revenue. Never post it again.
          if (b.paymentStatus !== "paid")
            throw fail(
              409,
              "Payment and booking disagree. Admin investigation is required.",
            );
          return tx.privateCoursePayment.create({
            data: {
              bookingId: b.id,
              paymentAttemptId: p.id,
              amount: p.amount,
              paymentSource: "ONLINE",
              paymentMethod: p.provider,
              providerReference: p.providerReference,
              receivedAt: p.paidAt,
              verifiedAt: new Date(),
              verifiedByUserId: req.user!.id,
              notes:
                "Linked existing verified provider receipt; original sales transaction preserved.",
            },
          });
        }),
      );
    }),
  );
  r.post(
    "/bookings/:id/link-transaction",
    roles("admin"),
    asyncRoute(async (req: AuthRequest, res) => {
      const input = z
        .object({
          transactionId: z.string().min(1),
          reason: z.string().min(10).max(2000),
          evidence: z.string().min(10).max(2000),
        })
        .strict()
        .parse(req.body);
      res.json(
        await db.$transaction(async (tx) => {
          const b = await lockCourseBooking(tx, String(req.params.id));
          const p = b.privateCoursePayment;
          if (!p || p.status !== "PAID")
            throw fail(409, "Verify the payment receipt first.");
          if (p.transactionId) {
            if (p.transactionId !== input.transactionId)
              throw fail(409, "Original sales transaction already linked.");
            return p;
          }
          const original = await tx.transaction.findUnique({
            where: { id: input.transactionId },
            include: { privateCoursePayment: true },
          });
          if (
            !original ||
            original.privateCoursePayment ||
            original.business !== "Badminton" ||
            original.userId !== b.userId ||
            original.finalAmount !== p.amount ||
            original.status !== "paid" ||
            !original.item.startsWith("Private course")
          )
            throw fail(
              409,
              "Select an unlinked paid private-course sales transaction for the same member and amount.",
            );
          const updated = await tx.privateCoursePayment.update({
            where: { id: p.id },
            data: { transactionId: original.id },
          });
          await tx.bookingChangeHistory.create({
            data: {
              bookingId: b.id,
              action: "LINK_ORIGINAL_SALES_TRANSACTION",
              previous: JSON.stringify(p),
              current: JSON.stringify(updated),
              requestedById: req.user!.id,
              approvedById: req.user!.id,
              reason: `${input.reason}\nEvidence: ${input.evidence}`,
            },
          });
          return updated;
        }),
      );
    }),
  );
  r.post(
    "/bookings/:id/verify-legacy",
    roles("admin"),
    asyncRoute(async (req: AuthRequest, res) => {
      const input = z
        .object({
          evidence: z.string().min(10).max(2000),
          reason: z.string().min(10).max(1000),
          reference: z.string().min(3).max(200),
          method: z.string().min(2).max(50),
        })
        .strict()
        .parse(req.body);
      res.json(
        await db.$transaction(async (tx) => {
          const b = await lockCourseBooking(tx, String(req.params.id));
          if (b.privateCoursePayment)
            throw fail(409, "Payment already classified.");
          if (b.paymentStatus !== "paid")
            throw fail(
              409,
              "Manual legacy review applies only to historically paid bookings.",
            );
          const p = await tx.privateCoursePayment.create({
            data: {
              bookingId: b.id,
              amount: b.price,
              paymentSource: "ONLINE",
              paymentMethod: input.method,
              externalReceiptReference: input.reference,
              verifiedByUserId: req.user!.id,
              verifiedAt: new Date(),
              notes: `Manual historical verification: ${input.reason}\nEvidence: ${input.evidence}`,
            },
          });
          await tx.bookingChangeHistory.create({
            data: {
              bookingId: b.id,
              action: "VERIFY_LEGACY_PAYMENT",
              previous: "LEGACY_UNKNOWN",
              current: JSON.stringify(p),
              requestedById: req.user!.id,
              approvedById: req.user!.id,
              reason: input.reason,
            },
          });
          return p;
        }),
      );
    }),
  );
  r.get(
    "/finance",
    asyncRoute(async (req: AuthRequest, res) => {
      const f = z
        .object({
          from: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          to: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          coachId: z.string().optional(),
          paymentSource: z.string().optional(),
          paymentMethod: z.string().optional(),
          status: z.string().optional(),
          paymentStatus: z.string().optional(),
        })
        .parse(req.query);
      if (f.from && f.to && f.from > f.to)
        throw fail(400, "Start date must be before end date.");
      const where: Prisma.BookingWhereInput = {
        kind: "private_course",
        ...(req.user!.role === "coach"
          ? { coach: { is: { userId: req.user!.id } } }
          : f.coachId
            ? { coachId: f.coachId }
            : {}),
        ...(f.from || f.to ? { date: { gte: f.from, lte: f.to } } : {}),
      };
      // Status strings are validated by Prisma's generated enum below.
      if (f.status)
        where.status = z
          .enum([
            "PENDING_COACH_CONFIRMATION",
            "AWAITING_PAYMENT",
            "CONFIRMED",
            "COMPLETED",
            "CANCELLED",
            "EXPIRED",
            "COACH_DECLINED",
            "confirmed",
            "completed",
            "cancelled",
            "pending",
          ])
          .parse(f.status);
      if (f.paymentStatus)
        where.paymentStatus = z
          .enum(["paid", "pending", "refunded"])
          .parse(f.paymentStatus);
      const bookings = await db.booking.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          coach: { select: { id: true, name: true } },
          privateCoursePayment: {
            include: {
              allocations: { include: { settlement: true } },
              adjustments: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      const successful = await db.paymentAttempt.findMany({
        where: {
          resourceType: "private_course",
          resourceId: {
            in: bookings
              .filter((b) => b.paymentStatus === "paid")
              .map((b) => b.id),
          },
          status: "SUCCEEDED",
        },
      });
      const rows = bookings
        .map((b) => {
          const p = b.privateCoursePayment;
          const verified = successful.find(
            (a) =>
              a.resourceId === b.id &&
              a.userId === b.userId &&
              a.amount === b.price,
          );
          const received =
            p?.allocations
              .filter((i) => i.settlement.status === "RECEIVED")
              .reduce((s, i) => s + i.amount, 0) || 0;
          const allocated =
            p?.allocations.reduce((s, i) => s + i.amount, 0) || 0;
          return {
            ...b,
            source:
              p?.paymentSource ||
              (verified
                ? "ONLINE"
                : b.paymentStatus === "pending"
                  ? "UNPAID"
                  : "LEGACY_UNKNOWN"),
            method: p?.paymentMethod || verified?.provider || null,
            verificationStatus: p?.verifiedAt
              ? "VERIFIED"
              : verified
                ? "VERIFIED_PROVIDER"
                : b.paymentStatus === "paid"
                  ? "LEGACY_UNVERIFIED"
                  : "PENDING",
            payment: p,
            received,
            availableForHandover:
              p?.status === "PAID" ? p.amount - allocated : 0,
            cashHeld:
              p?.paymentSource === "COACH" && p.status === "PAID"
                ? p.amount - received
                : 0,
          };
        })
        .filter(
          (b) =>
            (!f.paymentSource || b.source === f.paymentSource) &&
            (!f.paymentMethod || b.method === f.paymentMethod),
        );
      const sum = (predicate: (b: (typeof rows)[number]) => boolean) =>
        rows.filter(predicate).reduce((s, b) => s + b.price, 0);
      const paid = (b: (typeof rows)[number]) => b.paymentStatus === "paid";
      const settlements = await db.privateCourseSettlement.findMany({
        where: req.user!.role === "coach" ? { collectorId: req.user!.id } : {},
        include: { items: true },
        orderBy: { submittedAt: "desc" },
      });
      const ids = [
        ...new Set([
          ...rows.flatMap((b) =>
            b.payment?.collectedByUserId ? [b.payment.collectedByUserId] : [],
          ),
          ...settlements.flatMap((s) => [
            s.collectorId,
            ...(s.receivedById ? [s.receivedById] : []),
          ]),
        ]),
      ];
      const actors = await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      res.json({
        rows,
        settlements,
        actors,
        summary: {
          revenue: sum(
            (b) =>
              paid(b) &&
              ["CONFIRMED", "COMPLETED", "confirmed", "completed"].includes(
                b.status,
              ),
          ),
          foCash: sum((b) => paid(b) && b.source === "BADMINTON_FO"),
          coachCash: sum((b) => paid(b) && b.source === "COACH"),
          online: sum((b) => paid(b) && b.source === "ONLINE"),
          unpaid: sum((b) => b.paymentStatus === "pending"),
          refunds: sum((b) => b.paymentStatus === "refunded"),
          personallyCollected: sum(
            (b) => paid(b) && b.payment?.collectedByUserId === req.user!.id,
          ),
          cashHeld: rows.reduce((s, b) => s + b.cashHeld, 0),
          received: rows.reduce((s, b) => s + b.received, 0),
        },
      });
    }),
  );
  r.post(
    "/settlements",
    roles("coach"),
    asyncRoute(async (req: AuthRequest, res) =>
      res
        .status(201)
        .json(await submitCourseSettlement(db, req.user!, req.body)),
    ),
  );
  r.post(
    "/settlements/:id/receive",
    roles("admin", "badminton_fo"),
    asyncRoute(async (req: AuthRequest, res) => {
      z.object({}).strict().parse(req.body);
      res.json(
        await db.$transaction(async (tx) => {
          const id = String(req.params.id);
          await tx.$executeRaw`UPDATE "PrivateCourseSettlement" SET "id"="id" WHERE "id"=${id}`;
          const s = await tx.privateCourseSettlement.findUnique({
            where: { id },
          });
          if (!s) throw fail(404, "Settlement not found.");
          if (s.collectorId === req.user!.id)
            throw fail(
              403,
              "A different receiving staff member must acknowledge cash.",
            );
          if (s.status === "RECEIVED") return s;
          if (s.status !== "SUBMITTED")
            throw fail(409, "Settlement is not submitted.");
          return tx.privateCourseSettlement.update({
            where: { id },
            data: {
              status: "RECEIVED",
              receivedById: req.user!.id,
              receivedAt: new Date(),
            },
          });
        }),
      );
    }),
  );
  r.post(
    "/bookings/:id/refund",
    roles("admin"),
    asyncRoute(async (req: AuthRequest, res) => {
      const input = z
        .object({
          reason: z.string().min(10).max(2000),
          evidence: z.string().min(10).max(2000),
          reference: z.string().min(3).max(200),
        })
        .strict()
        .parse(req.body);
      res.json(
        await db.$transaction(async (tx) => {
          const b = await lockCourseBooking(tx, String(req.params.id));
          const p = b.privateCoursePayment;
          if (!p)
            throw fail(
              409,
              "Reconcile the historical payment before recording a refund.",
            );
          const existing = await tx.privateCourseAdjustment.findUnique({
            where: { paymentId: p.id },
          });
          if (existing) {
            if (existing.reference !== input.reference)
              throw fail(409, "Refund already recorded.");
            return existing;
          }
          if (p.status !== "PAID")
            throw fail(409, "Payment cannot be refunded.");
          if (!p.transactionId)
            throw fail(
              409,
              "Link the original sales transaction with admin evidence review before recording a historical refund.",
            );
          await tx.$executeRaw`UPDATE "PrivateCoursePayment" SET "id"="id" WHERE "id"=${p.id}`;
          const allocations = await tx.privateCourseSettlementItem.count({
            where: { paymentId: p.id },
          });
          if (allocations)
            throw fail(
              409,
              "Settled or submitted collections require a separate treasury refund review.",
            );
          const adjustment = await tx.privateCourseAdjustment.create({
            data: {
              paymentId: p.id,
              actorId: req.user!.id,
              amount: p.amount,
              ...input,
            },
          });
          await tx.privateCoursePayment.update({
            where: { id: p.id },
            data: { status: "REFUNDED" },
          });
          if (p.transactionId)
            await tx.transaction.update({
              where: { id: p.transactionId },
              data: { status: "refunded" },
            });
          await tx.booking.update({
            where: { id: b.id },
            data: {
              status: "CANCELLED",
              paymentStatus: "refunded",
              paymentExpiresAt: null,
              reservationExpiresAt: null,
            },
          });
          return adjustment;
        }),
      );
    }),
  );
  return r;
}
