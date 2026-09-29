import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get(
  "/",
  auth,
  asyncRoute(async (_req: any, res: { json: (arg0: { status: string; id: string; customer: string; phone: string; customerId: string; packageId: string; package: string; startDate: string; expiryDate: string; lastCheckIn: string | null; }[]) => void; }) => {
    res.json(
      await prisma.membership.findMany({
        orderBy: { expiryDate: "asc" },
      })
    );
  })
);

router.post(
  "/",
  auth,
  roles("admin", "gym_fo"),
  asyncRoute(async (req: { body: any; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { id: string; customerId: string; customer: string; phone: string; packageId: string; package: string; startDate: string; expiryDate: string; status: string; lastCheckIn: string | null; }): void; new(): any; }; }; }) => {
    res.status(201).json(
      await prisma.membership.create({
        data: req.body,
      })
    );
  })
);

export default router;
