import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import type { AuthRequest } from "../types/auth.js";

const router = Router();
router.get(
  "/",
  auth,
  asyncRoute(async (req: AuthRequest, res: Response) => {
    if (!["admin", "clinic_fo", "doctor"].includes(req.user?.role || ""))
      return res.status(410).json({ message: "Coach schedule management has been removed." });
    const doctor =
      req.user?.role === "doctor"
        ? await prisma.doctor.findUnique({ where: { userId: req.user.id } })
        : null;
    res.json(
      await prisma.schedule.findMany({
        where: req.user?.role === "doctor" ? { doctorId: doctor?.id || "__none__" } : undefined,
        include: { doctor: { include: { user: { select: { id: true, name: true } } } } },
        orderBy: [{ day: "asc" }, { start: "asc" }]
      })
    );
  })
);
router.post(
  "/",
  auth,
  roles("admin", "clinic_fo", "doctor"),
  asyncRoute(async (req: AuthRequest, res: Response) => {
    const b = z
      .object({
        doctorId: z.string(),
        day: z.string(),
        start: z.string(),
        end: z.string(),
        service: z.string().optional(),
        active: z.boolean().default(true)
      })
      .parse(req.body);
    const doctor = await prisma.doctor.findUnique({
      where: { id: b.doctorId },
      include: { user: true }
    });
    if (!doctor || doctor.status !== "active")
      return res.status(400).json({ message: "Select an active doctor." });
    if (req.user!.role === "doctor" && doctor.userId !== req.user!.id)
      return res.status(403).json({ message: "You can only manage your own clinic schedule." });
    res
      .status(201)
      .json(
        await prisma.schedule.create({
          data: { ...b, person: doctor.user.name, role: "doctor" },
          include: { doctor: true }
        })
      );
  })
);
router.patch(
  "/:id",
  auth,
  roles("admin", "clinic_fo", "doctor"),
  asyncRoute(async (req: Request, res: Response) => {
    const b = z
      .object({
        person: z.string().optional(),
        day: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        service: z.string().optional(),
        active: z.boolean().optional()
      })
      .parse(req.body);
    res.json(
      await prisma.schedule.update({
        where: { id: String(req.params.id) },
        data: b,
        include: { doctor: true }
      })
    );
  })
);
router.delete(
  "/:id",
  auth,
  roles("admin", "clinic_fo"),
  asyncRoute(async (req: Request, res: Response) => {
    await prisma.schedule.delete({ where: { id: String(req.params.id) } });
    res.status(204).end()
  })
);
export default router;
