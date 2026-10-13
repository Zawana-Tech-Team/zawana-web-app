import { Router } from "express";
import { PrivateTrainingStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { isDateKey } from "../utils/dateKeys.js";
import type { AuthRequest } from "../types/auth.js";

const router = Router();
const sessionStatuses = ["SCHEDULED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
const timeMinutes = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};
const dateKeyToday = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: process.env.BUSINESS_TIME_ZONE || "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const sessionInclude = {
  member: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
  coach: {
    include: {
      user: {
        select: { id: true, name: true, email: true, phone: true, avatar: true, active: true }
      }
    }
  },
  createdBy: { select: { id: true, name: true } },
} as const;

router.get(
  "/gym/private-training/coaches",
  auth,
  roles("admin", "owner", "gym_fo"),
  asyncRoute(async (_req, res) => {
    const coaches = await prisma.coach.findMany({
      where: { department: "Gym", status: "active", user: { is: { role: "coach", active: true } } },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, avatar: true } }
      },
      orderBy: { name: "asc" },
    });
    res.json(coaches);
  })
);

router.get(
  "/gym/private-training/members",
  auth,
  roles("admin", "owner", "gym_fo"),
  asyncRoute(async (req, res) => {
    const q = String(req.query.q || "").trim();
    res.json(
      await prisma.user.findMany({
        where: {
          role: "member",
          active: true,
          ...(q
            ? {
                OR: [
                  { name: { contains: q } },
                  { email: { contains: q } },
                  { phone: { contains: q } }
                ]
              }
            : {})
        },
        select: { id: true, name: true, email: true, phone: true, avatar: true },
        orderBy: { name: "asc" },
        take: 100,
      })
    );
  })
);

router.get(
  "/gym/private-training",
  auth,
  asyncRoute(async (req: AuthRequest, res) => {
    const role = req.user!.role;
    if (!["admin", "owner", "gym_fo", "coach", "member"].includes(role))
      return res.status(403).json({ message: "Insufficient permissions." });
    const today = dateKeyToday();
    const where: any = role === "member" ? { memberId: req.user!.id } : {};
    if (role === "coach") {
      const coach = await prisma.coach.findFirst({
        where: { userId: req.user!.id, department: "Gym", status: "active" }
      });
      if (!coach) return res.json([]);
      where.coachId = coach.id;
    }
    const scope = String(req.query.scope || "all");
    if (scope === "today") where.date = today;
    else if (scope === "upcoming") {
      where.date = { gte: today };
      where.status = { in: ["SCHEDULED", "CHECKED_IN"] };
    } else if (scope === "completed") where.status = { in: ["COMPLETED", "NO_SHOW", "CANCELLED"] };
    else if (scope !== "all")
      return res
        .status(400)
        .json({ message: "Choose today, upcoming, completed, or all sessions." });
    const rows = await prisma.privateTrainingSession.findMany({
      where,
      include: sessionInclude,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 300
    });
    res.json(rows);
  })
);

router.post(
  "/gym/private-training",
  auth,
  roles("admin", "owner", "gym_fo"),
  asyncRoute(async (req: AuthRequest, res) => {
    const body = z
      .object({
        memberId: z.string().min(1),
        coachId: z.string().min(1),
        date: z.string().refine(isDateKey, "Choose a valid date."),
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        durationMinutes: z.coerce
          .number()
          .int()
          .refine(value => [30, 45, 60, 90, 120].includes(value)),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(req.body);
    const today = dateKeyToday();
    const start = timeMinutes(body.startTime);
    const end = start + body.durationMinutes;
    if (end > 24 * 60)
      return res
        .status(400)
        .json({ message: "A private training session must finish before midnight." });
    if (
      body.date < today ||
      (body.date === today &&
        start <=
          timeMinutes(
            new Intl.DateTimeFormat("en-GB", {
              timeZone: process.env.BUSINESS_TIME_ZONE || "Asia/Yangon",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23"
            }).format(new Date())
          ))
    ) {
      return res.status(400).json({ message: "Choose a start time that has not passed." });
    }
    const member = await prisma.user.findFirst({
      where: { id: body.memberId, role: "member", active: true },
      select: { id: true, name: true }
    });
    if (!member) return res.status(404).json({ message: "Select an active member account." });
    const coach = await prisma.coach.findFirst({
      where: {
        id: body.coachId,
        department: "Gym",
        status: "active",
        user: { is: { role: "coach", active: true } }
      },
      include: { user: { select: { id: true, name: true } } }
    });
    if (!coach?.user)
      return res.status(409).json({ message: "Select an active linked Gym coach." });
    const endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;

    const created = await prisma.$transaction(async tx => {
      const existing = await tx.privateTrainingSession.findMany({
        where: {
          date: body.date,
          status: { in: ["SCHEDULED", "CHECKED_IN"] },
          OR: [{ coachId: coach.id }, { memberId: member.id }]
        },
        select: { coachId: true, memberId: true, startTime: true, endTime: true }
      });
      if (
        existing.some(
          session =>
            timeMinutes(body.startTime) < timeMinutes(session.endTime) &&
            timeMinutes(session.startTime) < end
        )
      ) {
        throw Object.assign(
          new Error(
            "The selected coach or member already has a private training session at that time."
          ),
          { statusCode: 409 }
        );
      }
      const session = await tx.privateTrainingSession.create({
        data: {
          memberId: member.id,
          coachId: coach.id,
          date: body.date,
          startTime: body.startTime,
          endTime,
          durationMinutes: body.durationMinutes,
          notes: body.notes || null,
          createdById: req.user!.id,
        },
        include: sessionInclude
      });
      await tx.notification.create({
        data: {
          userId: coach.user!.id,
          title: "Private training scheduled",
          body: `${member.name} · ${body.date} · ${body.startTime}–${endTime}`,
          link: "/coach",
          type: "training",
          icon: "dumbbell",
          entityType: "private_training",
          entityId: session.id
        }
      });
      await tx.notification.create({
        data: {
          userId: member.id,
          title: "Private training booked",
          body: `${coach.name} · ${body.date} · ${body.startTime}–${endTime}`,
          link: "/member/training",
          type: "training",
          icon: "dumbbell",
          entityType: "private_training",
          entityId: session.id
        }
      });
      return session;
    });
    res.status(201).json(created);
  })
);

router.get(
  "/coach/private-training",
  auth,
  roles("coach"),
  asyncRoute(async (req: AuthRequest, res) => {
    const coach = await prisma.coach.findFirst({
      where: { userId: req.user!.id, department: "Gym", status: "active" }
    });
    if (!coach) return res.json([]);
    const today = dateKeyToday();
    const scope = String(req.query.scope || "all");
    const date =
      scope === "today" ? { equals: today } : scope === "upcoming" ? { gte: today } : undefined;
    const status =
      scope === "completed"
        ? {
            in: [
              PrivateTrainingStatus.COMPLETED,
              PrivateTrainingStatus.NO_SHOW,
              PrivateTrainingStatus.CANCELLED
            ]
          }
        : scope === "upcoming"
          ? { in: [PrivateTrainingStatus.SCHEDULED, PrivateTrainingStatus.CHECKED_IN] }
          : undefined;
    if (!(["all", "today", "upcoming", "completed"].includes(scope))) return res
        .status(400)
        .json({ message: "Choose today, upcoming, completed, or all sessions." });
    res.json(
      await prisma.privateTrainingSession.findMany({
        where: { coachId: coach.id, ...(date ? { date } : {}), ...(status ? { status } : {}) },
        include: sessionInclude,
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 300
      })
    );
  })
);

router.patch(
  "/gym/private-training/:id/status",
  auth,
  roles("admin", "owner", "gym_fo", "coach"),
  asyncRoute(async (req: AuthRequest, res) => {
    const { status } = z.object({ status: z.enum(sessionStatuses) }).parse(req.body);
    const session = await prisma.privateTrainingSession.findUnique({
      where: { id: String(req.params.id) },
      include: { coach: true, member: { select: { id: true, name: true } } }
    });
    if (!session) return res.status(404).json({ message: "Private training session not found." });
    if (req.user!.role === "coach" && session.coach.userId !== req.user!.id)
      return res
        .status(403)
        .json({ message: "You can only manage sessions assigned to your coach profile." });
    if (status === "CHECKED_IN" && session.date !== dateKeyToday())
      return res
        .status(409)
        .json({ message: "Attendance can only be checked in on the session date." });
    if (["COMPLETED", "NO_SHOW"].includes(status) && session.date > dateKeyToday())
      return res
        .status(409)
        .json({ message: "A future session cannot be completed or marked as a no-show." });
    const allowed: Record<string, string[]> = {
      SCHEDULED: ["CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"],
      CHECKED_IN: ["COMPLETED", "CANCELLED", "NO_SHOW"]
    };
    if (!allowed[session.status]?.includes(status))
      return res
        .status(409)
        .json({ message: `A session cannot move from ${session.status} to ${status}.` });
    const updated = await prisma.privateTrainingSession.update({
      where: { id: session.id },
      data: { status },
      include: sessionInclude
    });
    res.json(updated);
  })
);

export default router;
