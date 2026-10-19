import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import type { AuthRequest } from "../types/auth.js";
import { gymError, today, personSelect } from "../services/gymPolicy.js";
import { scheduleGymSession, sessionInclude, updateGymSession } from "../services/gymSessions.js";

const router = Router();
const staff = roles("admin", "owner", "gym_fo");
router.get("/gym/private-training/coaches", auth, staff, asyncRoute(async (_req, res) => {
  res.json(await prisma.coach.findMany({
    where: { department: "Gym", status: "active", user: { is: { role: "coach", active: true, deletedAt: null } } },
    include: { user: { select: personSelect } }, orderBy: { name: "asc" },
  }));
}));
router.get("/gym/private-training/members", auth, staff, asyncRoute(async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 120);
  res.json(await prisma.user.findMany({
    where: { role: "member", active: true, deletedAt: null, ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] } : {}) },
    select: personSelect, orderBy: { name: "asc" }, take: 100,
  }));
}));
const list = asyncRoute(async (req: AuthRequest, res) => {
  const role = req.user!.role;
  if (!["admin", "owner", "gym_fo", "coach", "member"].includes(role)) throw gymError("Insufficient permissions.", 403);
  const scope = z.enum(["today", "upcoming", "completed", "all"]).parse(req.query.scope || "all");
  let coachId: string | undefined;
  if (role === "coach") {
    const coach = await prisma.coach.findFirst({ where: { userId: req.user!.id, department: "Gym", status: "active" } });
    if (!coach) return res.json([]);
    coachId = coach.id;
  }
  res.json(await prisma.privateTrainingSession.findMany({ where: {
    ...(role === "member" ? { OR: [{ memberId: req.user!.id }, { attendance: { some: { userId: req.user!.id } } }] } : {}),
    ...(coachId ? { coachId } : {}),
    ...(scope === "today" ? { date: today() } : scope === "upcoming" ? { date: { gte: today() }, status: { in: ["SCHEDULED", "CHECKED_IN"] } } : scope === "completed" ? { status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] } } : {}),
  }, include: sessionInclude, orderBy: [{ date: "asc" }, { startTime: "asc" }], take: 300 }));
});
router.get("/gym/private-training", auth, list);
router.get("/coach/private-training", auth, roles("coach"), list);
router.post("/gym/private-training", auth, staff, asyncRoute(async (req: AuthRequest, res) => {
  res.status(201).json(await scheduleGymSession(prisma, req.user!.id, req.body));
}));
router.patch("/gym/private-training/:id", auth, staff, asyncRoute(async (req: AuthRequest, res) => {
  res.json(await scheduleGymSession(prisma, req.user!.id, req.body, String(req.params.id)));
}));
router.patch("/gym/private-training/:id/status", auth, roles("admin", "owner", "gym_fo", "coach"), asyncRoute(async (req: AuthRequest, res) => {
  const b = z.object({ status: z.enum(["CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"]), presentMemberIds: z.array(z.string()).max(100).optional() }).parse(req.body);
  res.json(await updateGymSession(prisma, String(req.params.id), req.user!, b.status, b.presentMemberIds));
}));
export default router;
