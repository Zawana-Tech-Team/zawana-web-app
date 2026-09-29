import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { today } from "../utils/helpers.js";
import { $Enums } from "@prisma/client";

const router = Router();

router.get(
  "/",
  asyncRoute(async (_req: any, res: { json: (arg0: { name: string; id: string; price: number; description: string; status: $Enums.ProductStatus; tax: number; category: string; sku: string; barcode: string; stock: number; cost: number; }[]) => void; }) => {
    res.json(
      await prisma.product.findMany({
        orderBy: { name: "asc" },
      })
    );
  })
);

router.post(
  "/",
  auth,
  roles("admin", "store_fo"),
  asyncRoute(async (req: { body: any; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { name: string; id: string; price: number; category: string; description: string; sku: string; barcode: string; stock: number; cost: number; tax: number; status: $Enums.ProductStatus; }): void; new(): any; }; }; }) => {
    res.status(201).json(
      await prisma.product.create({
        data: req.body,
      })
    );
  })
);

router.patch(
  "/:id",
  auth,
  roles("admin", "store_fo"),
  asyncRoute(async (req: { params: { id: any; }; body: any; }, res: { json: (arg0: { name: string; id: string; price: number; category: string; description: string; sku: string; barcode: string; stock: number; cost: number; tax: number; status: $Enums.ProductStatus; }) => void; }) => {
    res.json(
      await prisma.product.update({
        where: { id: req.params.id },
        data: req.body,
      })
    );
  })
);

router.post(
  "/:id/stock",
  auth,
  roles("admin", "store_fo"),
  asyncRoute(async (req: { body: unknown; params: { id: any; }; }, res: { json: (arg0: { name: string; id: string; price: number; category: string; description: string; sku: string; barcode: string; stock: number; cost: number; tax: number; status: $Enums.ProductStatus; }) => void; }) => {
    const b = z
      .object({
        quantity: z.number().int(),
        note: z.string().default(""),
      })
      .parse(req.body);

    const result = await prisma.$transaction(
      async (tx) => {
        const p = await tx.product.update({
          where: { id: req.params.id },
          data: {
            stock: {
              increment: b.quantity,
            },
          },
        });

        await tx.inventoryTransaction.create({
          data: {
            productId: p.id,
            type:
              b.quantity >= 0
                ? "add"
                : "remove",
            quantity: Math.abs(b.quantity),
            note: b.note,
            date: today(),
          },
        });

        return p;
      }
    );

    res.json(result);
  })
);

router.get(
  "/inventory",
  auth,
  roles("admin", "store_fo"),
  asyncRoute(async (_req: any, res: { json: (arg0: ({ product: { name: string; id: string; price: number; category: string; description: string; sku: string; barcode: string; stock: number; cost: number; tax: number; status: $Enums.ProductStatus; }; } & { id: string; type: string; quantity: number; note: string; date: string; productId: string; })[]) => void; }) => {
    res.json(
      await prisma.inventoryTransaction.findMany({
        include: { product: true },
        orderBy: { date: "desc" },
      })
    );
  })
);


router.delete("/:id", auth, roles("admin"), asyncRoute(async (req, res) => {
  await prisma.product.delete({ where: { id: String(req.params.id) } });
  res.status(204).end();
}));

export default router;
