import { Router } from "express";
import { z } from "zod";
import { $Enums, BookingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { today, code } from "../utils/helpers.js";
import type { AuthRequest } from "../types/auth.js";
import { JsonValue } from "@prisma/client/runtime/library";

const router = Router();

const toMinutes = (value: string) => {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return NaN;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3].toUpperCase();
  if (h === 12) h = 0;
  if (ap === "PM") h += 12;
  return h * 60 + min;
};

const slotRange = (value: string) => {
  const parts = value.split(/\s*(?:—|–|-)\s*/);
  if (parts.length !== 2) return null;
  const start = toMinutes(parts[0]);
  const end = toMinutes(parts[1]);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
};

const overlaps = (a: string, b: string) => {
  const ra = slotRange(a), rb = slotRange(b);
  return !!ra && !!rb && ra.start < rb.end && rb.start < ra.end;
};

router.get(
  "/availability",
  asyncRoute(async (req: { query: { date: any; courtId: any; coachId: any; }; }, res: { json: (arg0: { id: string; status: $Enums.BookingStatus; date: string; time: string; courtId: string | null; coachId: string | null; }[]) => void; }) => {
    const date = String(req.query.date || today());
    const courtId = String(req.query.courtId || "");
    const coachId = String(req.query.coachId || "");

    const where: any = {
      date,
      status: { in: ["pending", "confirmed"] },
    };

    if (courtId) where.courtId = courtId;
    if (coachId) where.coachId = coachId;

    res.json(
      await prisma.booking.findMany({
        where,
        select: {
          id: true,
          date: true,
          time: true,
          courtId: true,
          coachId: true,
          status: true,
        },
      })
    );
  })
);

router.get(
  "/",
  auth,
  asyncRoute(async (req: AuthRequest, res: { json: (arg0: ({ coach: { status: $Enums.CoachStatus; id: string; name: string; email: string; phone: string; specialty: string; color: string; } | null; user: { id: string; name: string; email: string; }; court: { status: $Enums.CourtStatus; id: string; createdAt: Date; name: string; type: string; price: number; surface: string; features: JsonValue; } | null; } & { status: $Enums.BookingStatus; id: string; date: string; createdAt: Date; time: string; paymentStatus: $Enums.PaymentStatus; code: string; userId: string; kind: $Enums.BookingKind; title: string; location: string; price: number; courtId: string | null; coachId: string | null; meta: string | null; })[]) => void; }) => {
    const isStaff = [
      "admin",
      "gym_fo",
      "badminton_fo",
      "coach",
      "clinic_fo",
    ].includes(req.user!.role);

    const where = isStaff
      ? {}
      : { userId: req.user!.id };

    res.json(
      await prisma.booking.findMany({
        where,
        include: {
          court: true,
          coach: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    );
  })
);

router.post(
  "/",
  auth,
  asyncRoute(async (req: AuthRequest, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { courtId: string | null; coachId: string | null; id: string; code: string; userId: string; kind: $Enums.BookingKind; title: string; date: string; time: string; location: string; status: $Enums.BookingStatus; price: number; meta: string | null; paymentStatus: $Enums.PaymentStatus; createdAt: Date; }): void; new(): any; }; }; }) => {
    const b = z
      .object({
        kind: z.enum([
          "court",
          "class",
          "pt",
          "recovery",
        ]),
        title: z.string(),
        date: z.string(),
        time: z.string(),
        location: z.string(),
        price: z.number().int().nonnegative(),
        courtId: z.string().optional(),
        coachId: z.string().optional(),
        meta: z.string().optional(),
        paymentStatus: z
          .enum(["pending", "paid", "refunded"])
          .optional(),
      })
      .parse(req.body);

    if (b.courtId) {
      const court = await prisma.court.findUnique({ where: { id: b.courtId } });
      if (!court) {
        return res.status(404).json({ message: "Court not found" } as any);
      }
      if (court.status !== "available") {
        return res.status(409).json({
          message: `${court.name} is currently ${court.status} and cannot be booked.`,
        } as any);
      }
    }

    const candidates = await prisma.booking.findMany({
      where: {
        date: b.date,
        status: { in: ["pending", "confirmed"] },
        ...(b.courtId ? { courtId: b.courtId } : {}),
        ...(b.coachId ? { coachId: b.coachId } : {}),
      },
      select: { id: true, time: true },
    });

    const overlap = candidates.find(x => overlaps(x.time, b.time));
    if (overlap) {
      return res.status(409).json({
        message: "That court/time overlaps an existing booking.",
      } as any);
    }

    const booking =
      await prisma.booking.create({
        data: {
          ...b,
          code: code("ZW"),
          userId: req.user!.id,
          status: "confirmed",
          paymentStatus:
            b.paymentStatus || "pending",
        },
      });

    await prisma.notification.create({
      data: {
        userId: req.user!.id,
        title: "Booking confirmed",
        body: `${b.title} is reserved for ${b.date} at ${b.time}.`,
        link: "/bookings",
        audience: "member",
        type: "booking",
      },
    });

    res.status(201).json(booking);
  })
);

router.patch(
  "/:id/status",
  auth,
  asyncRoute(async (req: AuthRequest, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { message: string; }): any; new(): any; }; }; json: (arg0: { id: string; title: string; createdAt: Date; userId: string; kind: $Enums.BookingKind; date: string; time: string; location: string; price: number; courtId: string | null; coachId: string | null; meta: string | null; paymentStatus: $Enums.PaymentStatus; code: string; status: $Enums.BookingStatus; }) => void; }) => {
    const b = z
      .object({
        status: z.nativeEnum(BookingStatus),
      })
      .parse(req.body);

    const existing =
      await prisma.booking.findUnique({
        where: { id: String(req.params.id) },
      });

    if (!existing) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    const staff = [
      "admin",
      "gym_fo",
      "badminton_fo",
      "coach",
    ].includes(req.user!.role);

    if (
      !staff &&
      existing.userId !== req.user!.id
    ) {
      return res.status(403).json({
        message: "Not allowed",
      });
    }

    res.json(
      await prisma.booking.update({
        where: { id: String(req.params.id) },
        data: { status: b.status },
      })
    );
  })
);

export default router;
