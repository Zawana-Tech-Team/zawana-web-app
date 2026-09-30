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

router.post("/orders", auth, storeRoles, asyncRoute(async (req: any, res) => {
  const body = z.object({
    customer: z.string().default("Walk-in Customer"), itemSummary: z.string().default("Store sale"), total: z.number().int().nonnegative(), paid: z.number().int().nonnegative(), paymentMethod: z.enum(["Cash", "KPay", "Pay Later"]),
    dueDate: z.string().optional(), status: z.enum(["pending", "partially_paid", "paid", "overdue"]), items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() }))
  }).parse(req.body);
  const order = await prisma.$transaction(async tx => {
    for (const item of body.items) {
      const p = await tx.product.findUnique({ where: { id: item.productId } });
      if (!p || p.stock < item.quantity) throw new Error(`${p?.name || "Product"} has insufficient stock.`);
      await tx.product.update({ where: { id: p.id }, data: { stock: { decrement: item.quantity } } });
      await tx.inventoryTransaction.create({ data: { productId: p.id, type: "remove", quantity: item.quantity, note: `POS sale ${body.status === "pending" || body.status === "partially_paid" ? "pay later" : "sale"}`, date: today() } });
    }
    const order = await tx.storeOrder.create({ data: { customer: body.customer, total: body.total, paid: body.paid, dueDate: body.dueDate, status: body.status, items: body.items } });
    await tx.transaction.create({ data: {
      date: today(), customer: body.customer, business: "Store", item: body.itemSummary,
      amount: body.total, discount: 0, tax: 0, finalAmount: body.total, paymentMethod: body.paymentMethod,
      staff: req.user?.name || "Store FO", status: body.paymentMethod === "Pay Later" ? "pending" : "paid"
    }});
    return order;
  });
  res.status(201).json(order);
}));

export default router;
