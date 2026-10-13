import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { z } from "zod";
import { today } from "../utils/helpers.js";

const router = Router();

router.get(
  "/",
  auth,
  asyncRoute(async (req: any, res) => {
    if (!['admin', 'owner', 'gym_fo'].includes(req.user.role))
      return res.status(403).json({ message: 'Insufficient permissions' });
    res.json(
      await prisma.membership.findMany({
        include: { checkIns: { orderBy: [{ date: 'desc' }, { time: 'desc' }], take: 10 } },
        orderBy: { expiryDate: "asc" },
      })
    );
  })
);

router.post(
  "/",
  auth,
  roles("admin", "gym_fo"),
  asyncRoute(async (req: any, res) => {
    const body = z
      .object({
        packageId: z.string().min(1),
        userId: z.string().optional(),
        customer: z.string().min(2),
        phone: z.string().default(''),
        startDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .default(today())
      })
      .parse(req.body);
    const pkg = await prisma.gymPackage.findFirst({
      where: { id: body.packageId, status: 'active' }
    });
    if (!pkg) return res.status(400).json({ message: 'Select an active Gym package.' });
    if (pkg.sessions <= 0)
      return res
        .status(400)
        .json({ message: 'Set a session allowance on this Gym package before activating it.' });
    const expiry = new Date(`${body.startDate}T00:00:00`);
    expiry.setDate(expiry.getDate() + pkg.duration);
    const row = await prisma.membership.create({
      data: {
        customerId: body.userId || `GYM-${Date.now()}`,
        userId: body.userId || null,
        customer: body.customer,
        phone: body.phone,
        packageId: pkg.id,
        package: pkg.title,
        startDate: body.startDate,
        expiryDate: expiry.toISOString().slice(0, 10),
        status: 'active',
        sessionsTotal: pkg.sessions,
        sessionsRemaining: pkg.sessions
      }
    });
    res.status(201).json(row);
  })
);

router.post(
  '/check-in',
  auth,
  roles('admin', 'owner', 'gym_fo'),
  asyncRoute(async (req: any, res) => {
    const body = z
      .object({ membershipId: z.string().min(1), note: z.string().optional() })
      .parse(req.body);
    const date = today(),
      time = new Date().toTimeString().slice(0, 5);
    const result = await prisma.$transaction(async tx => {
      const row = await tx.membership.findUnique({ where: { id: body.membershipId } });
      if (!row) return { error: 'Gym membership not found.', status: 404 };
      if (row.status !== 'active' || row.expiryDate < date)
        return { error: 'This Gym membership has expired.', status: 409 };
      if (row.sessionsRemaining <= 0)
        return { error: 'No Gym sessions remain on this package.', status: 409 };
      const prior = await tx.gymCheckIn.findUnique({
        where: { membershipId_date: { membershipId: row.id, date } }
      });
      if (prior) return { error: 'This membership is already checked in today.', status: 409 };
      const changed = await tx.membership.updateMany({
        where: {
          id: row.id,
          status: 'active',
          expiryDate: { gte: date },
          sessionsRemaining: { gt: 0 }
        },
        data: { sessionsRemaining: { decrement: 1 }, lastCheckIn: `${date} ${time}` }
      });
      if (!changed.count)
        return { error: 'Membership access changed. Refresh and try again.', status: 409 };
      const checkIn = await tx.gymCheckIn.create({
        data: { membershipId: row.id, date, time, staffId: req.user.id, note: body.note }
      });
      const membership = await tx.membership.findUnique({ where: { id: row.id } });
      return { membership, checkIn };
    });
    if ('error' in result) return res.status(result.status).json({ message: result.error });
    res.status(201).json(result);
  })
);

export default router;
