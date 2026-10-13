import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { today } from "../utils/helpers.js";

const router = Router();

router.get(
  "/overview",
  auth,
  roles("admin"),
  asyncRoute(
    async (
      _req: any,
      res: {
        json: (arg0: {
          members: number;
          revenue: number;
          bookings: number;
          appointments: number;
          lowStock: number;
          series: number[];
        }) => void;
      }
    ) => {
      const [members, revenue, bookings, appointments, lowStock,
    ] = await Promise.all([
        prisma.user.count({
          where: { role: "member" },
        }),
        prisma.transaction.aggregate({
          where: { status: "paid" },
          _sum: { finalAmount: true },
        }),
        prisma.booking.count({
          where: {
            status: {
              in: ["pending", "confirmed"],
            },
          },
        }),
        prisma.appointment.count({
          where: { date: today() },
        }),
        prisma.product.count({
          where: {
            stock: { lte: 5 },
            status: "active",
          },
        }),
      ]);

      const transactions = await prisma.transaction.findMany({
        where: { status: "paid" },
        select: {
          date: true,
          finalAmount: true,
        },
      });

      const grouped = transactions.reduce(
        (acc, transaction) => {
          (acc[transaction.date] ??= []).push(transaction.finalAmount);
          return acc;
        },
        {} as Record<string, number[]>
      );

      const series = Object.values(grouped).map(
      (values) =>
        values.reduce((sum, value) => sum + value, 0)
      );

      res.json({
        members,
        revenue: revenue._sum.finalAmount || 0,
        bookings,
        appointments,
        lowStock,
        series,
      });
    }
  )
);

export default router;
