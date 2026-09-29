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
  asyncRoute(async (_req: any, res: { json: (arg0: { doctor: string; status: $Enums.AppointmentStatus; id: string; date: string; patient: string; time: string; type: string; notes: string | null; paymentStatus: $Enums.PaymentStatus; }[]) => void; }) => {
    res.json(
      await prisma.appointment.findMany({
        orderBy: [
          { date: "asc" },
          { time: "asc" },
        ],
      })
    );
  })
);

router.post(
  "/",
  auth,
  roles("admin", "clinic_fo", "doctor"),
  asyncRoute(async (req: { body: any; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { id: string; patient: string; doctor: string; date: string; time: string; type: string; status: $Enums.AppointmentStatus; notes: string | null; paymentStatus: $Enums.PaymentStatus; }): void; new(): any; }; }; }) => {
    res.status(201).json(
      await prisma.appointment.create({
        data: req.body,
      })
    );
  })
);

router.patch(
  "/:id/status",
  auth,
  roles("admin", "clinic_fo", "doctor"),
  asyncRoute(async (req: { body: unknown; params: { id: any; }; }, res: { json: (arg0: { id: string; patient: string; doctor: string; date: string; time: string; type: string; status: $Enums.AppointmentStatus; notes: string | null; paymentStatus: $Enums.PaymentStatus; }) => void; }) => {
    const b = z
      .object({
        status: z.enum([
          "pending",
          "confirmed",
          "checked_in",
          "completed",
          "cancelled",
        ]),
      })
      .parse(req.body);

    res.json(
      await prisma.appointment.update({
        where: { id: req.params.id },
        data: { status: b.status },
      })
    );
  })
);

export default router;
