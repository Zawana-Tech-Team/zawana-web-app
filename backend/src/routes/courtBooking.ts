import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import type { AuthRequest } from "../types/auth.js";
import {
  courtAvailability,
  courtMonthAvailability,
} from "../services/courtAvailability.js";
import { findSubmission } from "../services/courtBooking.js";

export function createCourtBookingRoutes(
  db: PrismaClient,
  expire: () => Promise<void> = async () => {},
) {
  const router = Router();
  router.use("/court-booking", auth, roles("member", "admin", "badminton_fo"));
  router.get(
    "/court-booking/availability",
    asyncRoute(async (req, res) => {
      await expire();
      res.json(await courtAvailability(db, z.string().parse(req.query.date)));
    }),
  );
  router.get(
    "/court-booking/month",
    asyncRoute(async (req, res) => {
      await expire();
      res.json(
        await courtMonthAvailability(db, z.string().parse(req.query.month)),
      );
    }),
  );
  router.get(
    "/court-booking/submissions/:key",
    asyncRoute(async (req: AuthRequest, res) => {
      const result = await findSubmission(
        db,
        req.user!.id,
        z.string().uuid().parse(req.params.key),
      );
      if (!result)
        return res
          .status(404)
          .json({ message: "No reservation has committed for this request." });
      res.json(result);
    }),
  );
  router.get(
    "/court-booking/bookings/:id",
    asyncRoute(async (req: AuthRequest, res) => {
      const booking = await db.booking.findFirst({
        where: {
          id: String(req.params.id),
          userId: req.user!.id,
          kind: "court",
        },
        include: { court: true },
      });
      if (!booking)
        return res.status(404).json({ message: "Reservation not found." });
      res.json(booking);
    }),
  );
  return router;
}
