import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { $Enums } from "@prisma/client";

const router = Router();

router.get(
  "/",
  auth,
  roles(
    "admin",
    "gym_fo",
    "badminton_fo",
    "clinic_fo",
    "store_fo",
    "cafe_fo"
  ),
  asyncRoute(async (_req: any, res: { json: (arg0: { id: string; status: string; finalAmount: number; date: string; customer: string; business: $Enums.TransactionBusiness; item: string; amount: number; discount: number; tax: number; paymentMethod: string; staff: string; createdAt: Date; }[]) => void; }) => {
    res.json(
      await prisma.transaction.findMany({
        orderBy: { createdAt: "desc" },
      })
    );
  })
);

router.post(
  "/",
  auth,
  roles(
    "admin",
    "gym_fo",
    "badminton_fo",
    "clinic_fo",
    "store_fo",
    "cafe_fo"
  ),
  asyncRoute(async (req: { body: any; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { id: string; date: string; customer: string; business: $Enums.TransactionBusiness; item: string; amount: number; discount: number; tax: number; finalAmount: number; paymentMethod: string; staff: string; status: string; createdAt: Date; }): void; new(): any; }; }; }) => {
    res.status(201).json(
      await prisma.transaction.create({
        data: req.body,
      })
    );
  })
);

export default router;
