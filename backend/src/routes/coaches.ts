import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();
router.get(
  "/",
  auth,
  asyncRoute(async (req: Request & { user?: { role: string } }, res: Response) =>
    res.json(
      await prisma.coach.findMany({
        where:
          req.user?.role === "admin"
            ? {}
            : { status: "active", user: { is: { active: true, role: "coach" } } },
        include: { user: { select: { id: true, name: true, avatar: true, active: true } } },
        orderBy: { name: "asc" }
      })
    )
  )
);
router.post(
  "/",
  auth,
  roles("admin"),
  asyncRoute(async (req: Request, res: Response) => {
    const b = z
      .object({
        name: z.string(),
        specialty: z.string(),
        phone: z.string(),
        email: z.string().email(),
        status: z.enum(["active", "inactive"]).optional(),
        color: z.string().optional()
      })
      .parse(req.body);
    const user = await prisma.user.findFirst({
      where: { email: b.email.toLowerCase(), role: "coach", active: true }
    });
    if (!user) return res.status(400).json({ message: "Link an active Coach account first." });
    res
      .status(201)
      .json(
        await prisma.coach.create({
          data: {
            ...b,
            email: user.email,
            userId: user.id,
            status: b.status || "active",
            color: b.color || "#D6FF3F"
          }
        })
      );
  })
);
router.patch(
  "/:id",
  auth,
  roles("admin"),
  asyncRoute(async (req: Request, res: Response) =>
    res.json(
      await prisma.coach.update({
        where: { id: String(req.params.id) },
        data: z
          .object({
            name: z.string().optional(),
            specialty: z.string().optional(),
            phone: z.string().optional(),
            status: z.enum(["active", "inactive"]).optional(),
            color: z.string().optional(),
            imageUrl: z.string().nullable().optional()
          })
          .parse(req.body)
      })
    )
  )
);
router.delete(
  "/:id",
  auth,
  roles("admin"),
  asyncRoute(async (req: Request, res: Response) => {
    await prisma.coach.update({
      where: { id: String(req.params.id) },
      data: { status: "inactive" }
    });
    res.status(204).end()
  })
);
export default router;
