import type { Express, Request, RequestHandler, Response } from "express";
import type { PrismaClient, Role } from "@prisma/client";
import { addDateKeyDays, isDateKey } from "../utils/dateKeys.js";
import { paginationMetadata, readPagination } from "../utils/pagination.js";

type BookingRequest = Request & { user?: { id: string; role: Role } };

type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  auth: RequestHandler;
  memberOnly: RequestHandler;
  asyncRoute: (handler: (...args: any[]) => unknown) => RequestHandler;
  expireReservations: () => Promise<void>;
  today: () => string;
};

export function registerBookingQueryRoutes({
  app,
  prisma,
  auth,
  memberOnly,
  asyncRoute,
  expireReservations,
  today
}: Dependencies) {
  app.get(
    "/api/member/booking-filters",
    auth,
    memberOnly,
    asyncRoute(async (_req: Request, res: Response) => {
      const [courts, coaches] = await Promise.all([
        prisma.court.findMany({
          where: { status: { not: "inactive" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" }
        }),
        prisma.coach.findMany({
          where: {
            department: "Badminton",
            status: "active",
            user: { is: { role: "coach", active: true } }
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" }
        }),
      ]);
      res.json({ courts, coaches });
    })
  );

  app.get(
    "/api/bookings",
    auth,
    asyncRoute(async (req: BookingRequest, res: Response) => {
      await expireReservations();
      const { hasPage, page, limit } = readPagination(req.query as Record<string, unknown>);
      const broadRoles: Role[] = ["admin", "owner", "gym_fo", "badminton_fo", "clinic_fo"];
      const isAdmin = broadRoles.includes(req.user!.role);
      const coach =
        req.user!.role === "coach"
          ? await prisma.coach.findUnique({ where: { userId: req.user!.id } })
          : null;
      const filters: any = isAdmin
        ? {}
        : req.user!.role === "coach"
          ? { coachId: coach?.id || "__no_coach__" }
          : { userId: req.user!.id };
      const q = String(req.query.q || "").trim();
      if (q)
        filters.OR = [
          { code: { contains: q } },
          { title: { contains: q } },
          { location: { contains: q } },
          { meta: { contains: q } },
          { user: { is: { name: { contains: q } } } },
          { user: { is: { email: { contains: q } } } },
          { user: { is: { phone: { contains: q } } } },
          { court: { is: { name: { contains: q } } } },
        ];
      if (req.query.status) {
        const value = String(req.query.status);
        const recognized = [
          "pending",
          "confirmed",
          "completed",
          "cancelled",
          "CONFIRMED",
          "COMPLETED",
          "CANCELLED",
          "PENDING_COACH_CONFIRMATION",
          "AWAITING_PAYMENT",
          "COACH_DECLINED",
          "EXPIRED"
        ];
        if (!recognized.includes(value))
          return res.status(400).json({ message: "Choose a valid booking status." });
        const normalized = value.toLowerCase();
        filters.status = ["pending", "confirmed", "completed", "cancelled"].includes(normalized)
          ? { in: [...new Set([normalized, normalized.toUpperCase()])] }
          : value.toUpperCase();
      }
      if (req.query.paymentStatus) filters.paymentStatus = String(req.query.paymentStatus);
      if (req.query.kind) filters.kind = String(req.query.kind);
      if (req.query.courtId) filters.courtId = String(req.query.courtId);
      if (req.query.coachId) filters.coachId = String(req.query.coachId);

      const referenceDate = String(req.query.referenceDate || today());
      const preset = String(req.query.datePreset || "");
      if (!isDateKey(referenceDate))
        return res.status(400).json({ message: "Choose a valid reference date." });
      if (preset && !["today", "yesterday", "upcoming", "all"].includes(preset))
        return res.status(400).json({ message: "Choose a valid booking date filter." });
      const from = req.query.from ? String(req.query.from) : "";
      const to = req.query.to ? String(req.query.to) : "";
      const specificDate = req.query.date ? String(req.query.date) : "";
      if ([from, to, specificDate].some(value => value && !isDateKey(value)))
        return res.status(400).json({ message: "Choose a valid booking date range." });
      if (from && to && from > to)
        return res
          .status(400)
          .json({ message: "The start date must be on or before the end date." });

      const scopeWhere: any = { ...filters };
      const timeBounds = [req.query.timeFrom, req.query.timeTo];
      if (timeBounds.some(Boolean)) {
        const asMinutes = (value: string) => {
          const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
          if (!match) return NaN;
          let hour = Number(match[1]);
          const minute = Number(match[2]);
          if (match[3]) {
            if (hour === 12) hour = 0;
            if (match[3].toUpperCase() === "PM") hour += 12;
          }
          return hour * 60 + minute;
        };
        const minFrom = timeBounds[0] ? asMinutes(String(timeBounds[0])) : 0;
        const minTo = timeBounds[1] ? asMinutes(String(timeBounds[1])) : 1439;
        if (!Number.isFinite(minFrom) || !Number.isFinite(minTo) || minFrom > minTo)
          return res.status(400).json({ message: "Choose a valid time range." });
        const candidates = await prisma.booking.findMany({
          where: scopeWhere,
          select: { id: true, time: true }
        });
        const matching = candidates
          .filter(row => {
            const value = String(row.time).split(/\s*(?:—|–|-|to)\s*/i)[0];
            const minutes = asMinutes(value);
            return Number.isFinite(minutes) && minutes >= minFrom && minutes <= minTo;
          })
          .map(row => row.id);
        scopeWhere.id = { in: matching };
      }

      const [all, todayCount, yesterdayCount, upcomingCount] = await Promise.all([
        prisma.booking.count({ where: scopeWhere }),
        prisma.booking.count({ where: { ...scopeWhere, date: referenceDate } }),
        prisma.booking.count({ where: { ...scopeWhere, date: addDateKeyDays(referenceDate, -1) } }),
        prisma.booking.count({ where: { ...scopeWhere, date: { gt: referenceDate } } }),
      ]);
      const where: any = { ...scopeWhere };
      if (preset === "today") where.date = referenceDate;
      if (preset === "yesterday") where.date = addDateKeyDays(referenceDate, -1);
      if (preset === "upcoming") where.date = { gt: referenceDate };
      if (specificDate) where.date = specificDate;
      if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

      const include = {
        court: true,
        coach: true,
        user: { select: { id: true, name: true, email: true, phone: true } }
      };
      if (!hasPage)
        return res.json(
          await prisma.booking.findMany({
            where,
            include,
            orderBy: { createdAt: "desc" },
            take: 100
          })
        );
      const [total, data] = await Promise.all([
        prisma.booking.count({ where }),
        prisma.booking.findMany({
          where,
          include,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit
        }),
      ]);
      res.json({
        data,
        pagination: paginationMetadata(page, limit, total),
        dateCounts: { all, today: todayCount, yesterday: yesterdayCount, upcoming: upcomingCount }
      });
    })
  );
}
