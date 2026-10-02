import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { today } from "../utils/helpers.js";

const router = Router();

router.get(
  "/",
  auth,
  asyncRoute(async (_req: any, res: { json: (arg0: { members: number; bookingsToday: number; revenue: number; activeCourts: number; coaches: number; }) => void; }) => {
    const [
      members,
      bookingsToday,
      revenue,
      activeCourts,
      coaches,
    ] = await Promise.all([
      prisma.user.count({
        where: { role: "member" },
      }),
      prisma.booking.count({
        where: {
          date: today(),
          status: {
            in: ["pending", "confirmed"],
          },
        },
      }),
      prisma.transaction.aggregate({
        where: { status: "paid" },
        _sum: { finalAmount: true },
      }),
      prisma.court.count({
        where: { status: "available" },
      }),
      prisma.coach.count({
        where: { status: "active" },
      }),
    ]);

    res.json({
      members,
      bookingsToday,
      revenue:
        revenue._sum.finalAmount || 0,
      activeCourts,
      coaches,
    });
  })
);

export default router;
