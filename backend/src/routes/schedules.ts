import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { $Enums } from "@prisma/client";

const router = Router();

router.get(
  "/",
  auth,
  asyncRoute(async (_req: any, res: { json: (arg0: ({ coach: { id: string; name: string; status: $Enums.CoachStatus; email: string; phone: string; specialty: string; color: string; } | null; } & { id: string; active: boolean; end: string; role: $Enums.ScheduleRole; day: string; coachId: string | null; person: string; start: string; service: string | null; })[]) => void; }) => {
    res.json(
      await prisma.schedule.findMany({
        include: { coach: true },
        orderBy: [
          { day: "asc" },
          { start: "asc" },
        ],
      })
    );
  })
);

router.post(
  "/",
  auth,
  roles("admin", "gym_fo", "coach", "doctor"),
  asyncRoute(async (req: { body: unknown; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { coach: { name: string; id: string; specialty: string; phone: string; email: string; status: $Enums.CoachStatus; color: string; } | null; } & { active: boolean; id: string; person: string; role: $Enums.ScheduleRole; day: string; start: string; end: string; service: string | null; coachId: string | null; }): void; new(): any; }; }; }) => {
    const b = z
      .object({
        person: z.string(),
        role: z.enum(["coach", "doctor"]),
        day: z.string(),
        start: z.string(),
        end: z.string(),
        service: z.string().optional(),
        active: z.boolean().default(true),
        coachId: z.string().optional(),
      })
      .parse(req.body);

    res.status(201).json(
      await prisma.schedule.create({
        data: b,
        include: { coach: true },
      })
    );
  })
);

router.patch(
  "/:id",
  auth,
  roles("admin", "gym_fo", "coach", "doctor"),
  asyncRoute(async (req: { body: unknown; params: { id: any; }; }, res: { json: (arg0: { coach: { name: string; id: string; specialty: string; phone: string; email: string; status: $Enums.CoachStatus; color: string; } | null; } & { active: boolean; id: string; person: string; role: $Enums.ScheduleRole; day: string; start: string; end: string; service: string | null; coachId: string | null; }) => void; }) => {
    const b = z
      .object({
        person: z.string().optional(),
        day: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        service: z.string().optional(),
        active: z.boolean().optional(),
        coachId: z.string().nullable().optional(),
      })
      .parse(req.body);

    res.json(
      await prisma.schedule.update({
        where: { id: req.params.id },
        data: b,
        include: { coach: true },
      })
    );
  })
);

router.delete(
  "/:id",
  auth,
  roles("admin", "gym_fo"),
  asyncRoute(async (req: { params: { id: any; }; }, res: { status: (arg0: number) => { (): any; new(): any; end: { (): void; new(): any; }; }; }) => {
    await prisma.schedule.delete({
      where: { id: req.params.id },
    });

    res.status(204).end();
  })
);

export default router;
