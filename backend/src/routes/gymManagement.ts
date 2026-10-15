import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import type { AuthRequest } from "../types/auth.js";
import { audit, businessNow, dateInput, enrollmentInclude, gymError, gymTransaction, lockEnrollment, packageInput, personSelect, today } from "../services/gymPolicy.js";
import { saveGymPackage } from "../services/gymPackages.js";
import { activateGymEnrollment, cancelGymEnrollment, createGymEnrollment } from "../services/gymEnrollments.js";
import { assertGymSchedule, readGymSchedule } from "../services/gymSessions.js";
import { gymCheckIn } from "../services/gymCheckIn.js";

type StartPayment = (userId: string, resourceType: string, resourceId: string, amount: number, description: string) => Promise<unknown>;
export function createGymManagementRoutes(db: PrismaClient, startPayment: StartPayment) {
  const router = Router(), staff = roles("admin", "owner", "gym_fo"), admin = roles("admin");
  const packagePaths = ["/packages/gym", "/gym/packages"];
  router.get(packagePaths, auth, staff, asyncRoute(async (req: AuthRequest, res) => {
    res.json(await db.gymPackage.findMany({ where: req.user!.role === "gym_fo" || req.query.active === "true" ? { status: "active" } : {}, orderBy: [{ kind: "asc" }, { price: "asc" }] }));
  }));
  router.post(packagePaths, auth, admin, asyncRoute(async (req: AuthRequest, res) => {
    res.status(201).json(await saveGymPackage(db, req.user!.id, req.body));
  }));
  router.patch(["/packages/gym/:id", "/gym/packages/:id"], auth, admin, asyncRoute(async (req: AuthRequest, res) => {
    const id = String(req.params.id), old = await db.gymPackage.findUnique({ where: { id } });
    if (!old) throw gymError("Package not found.", 404);
    const { version } = z.object({ version: z.number().int().positive() }).parse(req.body);
    // Parse the merged record: defaults on a partial Zod schema can replace
    // omitted fields (including participant limits) during status-only edits.
    const data = packageInput.parse({ ...old, ...req.body, pricingMode: req.body.pricingMode || "total" });
    res.json(await saveGymPackage(db, req.user!.id, data, id, version));
  }));
  router.delete(["/packages/gym/:id", "/gym/packages/:id"], auth, admin, asyncRoute(async (req: AuthRequest, res) => {
    const old = await db.gymPackage.findUnique({ where: { id: String(req.params.id) } });
    if (!old) throw gymError("Package not found.", 404);
    await saveGymPackage(db, req.user!.id, packageInput.parse({ ...old, benefits: old.benefits as string[], status: "archived" }), old.id, z.number().int().parse(req.body.version));
    res.status(204).end();
  }));
  router.get("/gym/packages/:id/history", auth, roles("admin", "owner"), asyncRoute(async (req, res) => {
    const packageId = String(req.params.id);
    const [revisions, statistics] = await Promise.all([
      db.gymPackageRevision.findMany({ where: { packageId }, orderBy: { version: "desc" } }),
      db.gymEnrollment.groupBy({ by: ["status"], where: { packageId }, _count: { _all: true }, _sum: { totalPrice: true } }),
    ]);
    res.json({ revisions, statistics });
  }));
  router.get("/gym/policy", auth, staff, (_req, res) => res.json({
    today: today(), timeZone: process.env.BUSINESS_TIME_ZONE || "Asia/Yangon",
    paymentMethods: ["KPay", ...(process.env.GYM_ALLOW_CASH_PAYMENTS === "true" ? ["Cash"] : [])],
  }));
  router.post("/gym/members", auth, staff, asyncRoute(async (req: AuthRequest, res) => {
    const b = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().transform(s => s.toLowerCase()), phone: z.string().trim().min(5).max(30) }).parse(req.body);
    const row = await gymTransaction(db, async tx => {
      if (await tx.user.findFirst({ where: { OR: [{ email: b.email }, { phone: b.phone }] } })) throw gymError("A member with this email or phone already exists. Search for the existing account.");
      const member = await tx.user.create({ data: { ...b, role: "member" }, select: personSelect });
      await audit(tx, req.user!.id, "MEMBER_REGISTERED", "member", member.id, undefined, member);
      return member;
    });
    res.status(201).json(row);
  }));
  router.get("/gym/enrollments", auth, roles("admin", "owner", "gym_fo", "member"), asyncRoute(async (req: AuthRequest, res) => {
    const status = req.query.status ? z.enum(["ACTIVE", "PENDING_PAYMENT", "CANCELLED", "EXPIRED"]).parse(req.query.status) : undefined;
    const q = String(req.query.q || "").trim().slice(0, 120);
    const page = z.coerce.number().int().min(1).max(100000).parse(req.query.page || 1);
    const limit = z.coerce.number().int().min(1).max(100).parse(req.query.limit || 30);
    const category = z.enum(["training"]).optional().parse(req.query.category);
    const forScheduling = z.enum(["true", "false"]).parse(req.query.forScheduling || "false") === "true";
    const where = {
      ...(req.user!.role === "member" ? { members: { some: { userId: req.user!.id } } } : {}),
      ...(status === "EXPIRED" ? { status: { in: ["ACTIVE", "PENDING_PAYMENT"] }, expiryDate: { lt: today() } } : status ? { status, ...(status === "ACTIVE" ? { expiryDate: { gte: today() } } : {}) } : {}),
      ...(q ? { OR: [{ code: { contains: q } }, { package: { title: { contains: q } } }, { members: { some: { user: { name: { contains: q } } } } }] } : {}),
      ...(category === "training" || forScheduling ? { kind: { in: ["PT", "COUPLE_PT", "GROUP_PT"] } } : {}),
      ...(forScheduling ? { status: "ACTIVE", paidAt: { not: null }, expiryDate: { gte: today() }, sessionsRemaining: { gt: 0 } } : {}),
    };
    const [data, total] = await Promise.all([
      db.gymEnrollment.findMany({ where, include: enrollmentInclude, orderBy: { createdAt: "desc" }, take: limit, skip: (page - 1) * limit }), db.gymEnrollment.count({ where }),
    ]);
    res.json({ data: data.map(row => ({ ...row, effectiveStatus: row.status !== "CANCELLED" && row.expiryDate < today() ? "EXPIRED" : row.status })), pagination: { page, total, totalPages: Math.ceil(total / limit) } });
  }));
  router.post("/gym/enrollments", auth, staff, asyncRoute(async (req: AuthRequest, res) => {
    res.status(201).json(await createGymEnrollment(db, req.user!.id, req.body));
  }));
  router.post("/gym/enrollments/:id/payment", auth, staff, asyncRoute(async (req: AuthRequest, res) => {
    const id = String(req.params.id);
    const b = z.object({ method: z.enum(["KPay", "Cash"]), cashReceived: z.literal(true).optional() }).parse(req.body);
    if (b.method === "Cash") {
      if (process.env.GYM_ALLOW_CASH_PAYMENTS !== "true") throw gymError("Cash collection is not enabled for Gym.", 403);
      if (!b.cashReceived) throw gymError("Confirm cash has been received.", 400);
      const row = await gymTransaction(db, async tx => {
        const enrollment = await lockEnrollment(tx, id);
        if (await tx.paymentAttempt.count({ where: { resourceType: "gym_enrollment", resourceId: id, status: { in: ["PENDING", "INITIATING"] }, expiresAt: { gt: new Date() } } }))
          throw gymError("An online checkout is still active. Wait for it to expire before collecting cash.");
        return activateGymEnrollment(tx, id, enrollment.totalPrice, "Cash", req.user!.id, req.user!.name);
      });
      return res.json({ enrollment: row });
    }
    const row = await db.gymEnrollment.findUnique({ where: { id }, include: { members: true } });
    if (!row) throw gymError("Enrollment not found.", 404);
    const attempt = await startPayment(row.members[0].userId, "gym_enrollment", id, row.totalPrice, (row.snapshot as { title: string }).title);
    res.json({ attempt });
  }));
  router.post("/gym/enrollments/:id/cancel", auth, staff, asyncRoute(async (req: AuthRequest, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    res.json(await cancelGymEnrollment(db, String(req.params.id), req.user!.id, req.user!.role === "admin", reason));
  }));
  router.get("/gym/enrollments/:id/receipt", auth, roles("admin", "owner", "gym_fo", "member"), asyncRoute(async (req: AuthRequest, res) => {
    const row = await db.gymEnrollment.findFirst({ where: { id: String(req.params.id), ...(req.user!.role === "member" ? { members: { some: { userId: req.user!.id } } } : {}) }, include: enrollmentInclude });
    if (!row || !row.transactionId) throw gymError("Paid receipt not found.", 404);
    res.json({ enrollment: row, receipt: row.transaction });
  }));
  router.get("/gym/coach-availability", auth, staff, asyncRoute(async (req, res) => {
    const b = z.object({ coachId: z.string().min(1), date: dateInput, durationMinutes: z.coerce.number().int().min(15).max(180), enrollmentId: z.string().optional(), excludeId: z.string().optional() }).parse(req.query);
    const enrollment = b.enrollmentId ? await db.gymEnrollment.findUnique({ where: { id: b.enrollmentId }, include: { members: true } }) : null;
    const calendar = await readGymSchedule(db, b.coachId, enrollment?.members.map(m => m.userId) || [], b.date, b.excludeId);
    const slots = [], now = businessNow();
    for (let start = 360; start + b.durationMinutes <= 1260; start += 30) {
      const time = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
      let available = b.date > today() || (b.date === today() && start > now.hour * 60 + now.minute), reason = available ? "" : "Time has passed";
      if (available) {
        try { assertGymSchedule(calendar, start, start + b.durationMinutes); }
        catch (error: any) { if (!error.statusCode) throw error; available = false; reason = error.message; }
      }
      slots.push({ time, available, reason });
    }
    res.json({ date: b.date, coachId: b.coachId, slots });
  }));
  router.get("/gym/audit", auth, roles("admin", "owner"), asyncRoute(async (req, res) => {
    const page = z.coerce.number().int().min(1).parse(req.query.page || 1);
    const where = { ...(req.query.entityType ? { entityType: String(req.query.entityType) } : {}), ...(req.query.entityId ? { entityId: String(req.query.entityId) } : {}) };
    const [data, total] = await Promise.all([db.gymAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 50, skip: (page - 1) * 50 }), db.gymAuditLog.count({ where })]);
    res.json({ data, pagination: { page, total, totalPages: Math.ceil(total / 50) } });
  }));
  router.post("/memberships/check-in", auth, staff, asyncRoute(async (req: AuthRequest, res) => {
    const b = z.object({ membershipId: z.string().min(1), note: z.string().trim().max(500).optional() }).parse(req.body);
    res.status(201).json(await gymCheckIn(db, b.membershipId, req.user!.id, b.note));
  }));
  return router;
}
