import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { today } from "../utils/helpers.js";

const router = Router();
const storeRoles = roles("admin", "store_fo");

const productSchema = z.object({
  name: z.string().min(1), price: z.coerce.number().int().nonnegative(), category: z.string().min(1),
  categoryId: z.string().optional().nullable(), description: z.string().default(""), sku: z.string().min(1),
  barcode: z.string().min(1), stock: z.coerce.number().int().nonnegative().default(0), cost: z.coerce.number().int().nonnegative().default(0),
  tax: z.coerce.number().int().nonnegative().default(0), status: z.enum(["active", "inactive"]).default("active")
});

router.get("/categories", auth, storeRoles, asyncRoute(async (_req, res) => {
  res.json(await prisma.productCategory.findMany({ orderBy: { name: "asc" } }));
}));
router.post("/categories", auth, storeRoles, asyncRoute(async (req, res) => {
  const data = z.object({ name: z.string().min(1), active: z.boolean().optional() }).parse(req.body);
  res.status(201).json(await prisma.productCategory.create({ data }));
}));
router.patch("/categories/:id", auth, storeRoles, asyncRoute(async (req, res) => {
  const data = z.object({ name: z.string().min(1).optional(), active: z.boolean().optional() }).parse(req.body);
  res.json(await prisma.productCategory.update({ where: { id: String(req.params.id) }, data }));
}));
router.delete("/categories/:id", auth, storeRoles, asyncRoute(async (req, res) => {
  await prisma.productCategory.delete({ where: { id: String(req.params.id) } });
  res.status(204).end();
}));

router.post("/products/import", auth, storeRoles, asyncRoute(async (req, res) => {
  const rows = z.array(productSchema).min(1).parse(req.body.rows);
  const result = await prisma.$transaction(async tx => {
    const created = [];
    for (const row of rows) {
      const category = await tx.productCategory.upsert({ where: { name: row.category }, update: {}, create: { name: row.category } });
      created.push(await tx.product.upsert({
        where: { sku: row.sku },
        update: { ...row, categoryId: category.id },
        create: { ...row, categoryId: category.id }
      }));
    }
    return created;
  });
  res.status(201).json({ imported: result.length, products: result });
}));

router.get("/orders", auth, storeRoles, asyncRoute(async (_req, res) => {
  res.json(await prisma.storeOrder.findMany({ orderBy: { id: "desc" } }));
}));

router.post("/orders", auth, storeRoles, asyncRoute(async (_req, res) => {
  return res.status(410).json({ message: "Store POS sales must use the verified KPay checkout flow. Direct cash, pay-later, and client-reported KPay transactions are disabled." });
}));

export default router;
