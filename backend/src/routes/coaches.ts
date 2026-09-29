import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { $Enums } from "@prisma/client";

const router = Router();

router.get(
  "/",
  asyncRoute(async (_req: any, res: { json: (arg0: ({ schedules: { coachId: string | null; id: string; end: string; active: boolean; role: $Enums.ScheduleRole; day: string; person: string; start: string; service: string | null; }[]; } & { id: string; status: $Enums.CoachStatus; name: string; email: string; phone: string; specialty: string; color: string; })[]) => void; }) => {
    res.json(
      await prisma.coach.findMany({
        include: { schedules: true },
        orderBy: { name: "asc" },
      })
    );
  })
);

router.post(
  "/",
  auth,
  roles("admin", "gym_fo"),
  asyncRoute(async (req: { body: unknown; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { name: string; id: string; specialty: string; phone: string; email: string; status: $Enums.CoachStatus; color: string; }): void; new(): any; }; }; }) => {
    const b = z
      .object({
        name: z.string(),
        specialty: z.string(),
        phone: z.string(),
        email: z.string().email(),
        status: z.enum(["active", "inactive"]).optional(),
        color: z.string().optional(),
      })
      .parse(req.body);

    res.status(201).json(
      await prisma.coach.create({
        data: {
          ...b,
          status: b.status || "active",
          color: b.color || "#D6FF3F",
        },
      })
    );
  })
);

router.patch(
  "/:id",
  auth,
  roles("admin", "gym_fo"),
  asyncRoute(async (req: { body: unknown; params: { id: any; }; }, res: { json: (arg0: { name: string; id: string; specialty: string; phone: string; email: string; status: $Enums.CoachStatus; color: string; }) => void; }) => {
    const b = z
      .object({
        name: z.string().optional(),
        specialty: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        status: z.enum(["active", "inactive"]).optional(),
        color: z.string().optional(),
      })
      .parse(req.body);

    res.json(
      await prisma.coach.update({
        where: { id: req.params.id },
        data: b,
      })
    );
  })
);


router.delete("/:id", auth, roles("admin"), asyncRoute(async (req, res) => {
  await prisma.coach.delete({ where: { id: String(req.params.id) } });
  res.status(204).end();
}));

export default router;
