import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { JsonValue } from "@prisma/client/runtime/library";

const router = Router();

router.get(
  "/orders",
  auth,
  asyncRoute(async (_req: any, res: { json: (arg0: { id: string; status: string; customer: string; paymentMethod: string; items: JsonValue; floor: string; orderTime: string; }[]) => void; }) => {
    res.json(
      await prisma.cafeOrder.findMany({
        orderBy: { id: "desc" },
      })
    );
  })
);

router.post(
  "/orders",
  auth,
  asyncRoute(async (req: { body: any; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { id: string; customer: string; items: JsonValue; floor: string; orderTime: string; paymentMethod: string; status: string; }): void; new(): any; }; }; }) => {
    res.status(201).json(
      await prisma.cafeOrder.create({
        data: req.body,
      })
    );
  })
);

router.patch(
  "/orders/:id/status",
  auth,
  roles("admin", "cafe_fo"),
  asyncRoute(async (req: { params: { id: any; }; body: { status: any; }; }, res: { json: (arg0: { id: string; customer: string; items: JsonValue; floor: string; orderTime: string; paymentMethod: string; status: string; }) => void; }) => {
    res.json(
      await prisma.cafeOrder.update({
        where: { id: req.params.id },
        data: { status: req.body.status },
      })
    );
  })
);

export default router;
