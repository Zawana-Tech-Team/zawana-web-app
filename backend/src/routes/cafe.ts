import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import type { AuthRequest } from "../types/auth.js";

export const CAFE_LOCATIONS = ["Office", "1st Floor", "2nd Floor — Badminton Court", "3rd Floor — Badminton Court", "Cafe", "6th Floor"] as const;
export const CAFE_ORDER_STATUSES = ["NEW", "PREPARING", "READY", "DELIVERING", "COMPLETED", "CANCELLED"] as const;
export const CAFE_PAYMENT_METHODS = ["CASH", "ONLINE", "PAY_LATER"] as const;

const router = Router();
const manager = roles("admin", "cafe_fo");
const newOrderSchema = z.object({
  location: z.enum(CAFE_LOCATIONS).optional(),
  floor: z.enum(["Ground Floor", "First Floor", "Outdoor"]).optional(),
  courtId: z.string().min(1).nullable().optional(),
  customer: z.string().trim().min(1).max(120).optional(),
  items: z.array(z.object({ id: z.string().min(1), quantity: z.coerce.number().int().min(1).max(30), notes: z.string().trim().max(250).optional() })).min(1).max(50),
  discount: z.coerce.number().int().nonnegative().default(0),
  paymentMethod: z.enum(CAFE_PAYMENT_METHODS).or(z.enum(["Cash", "KPay", "Pay Later"]).transform(value => ({ Cash: "CASH", KPay: "ONLINE", "Pay Later": "PAY_LATER" }[value] as typeof CAFE_PAYMENT_METHODS[number]))).default("CASH"),
}).strict();

function displayOrder(order: any) {
  let legacyItems: any[] = [];
  if (Array.isArray(order.items)) legacyItems = order.items;
  else if (typeof order.items === "string") { try { legacyItems = JSON.parse(order.items); } catch { legacyItems = []; } }
  const orderItems = order.orderItems?.length ? order.orderItems.map((item: any) => ({
    id: item.menuItemId || item.id,
    name: item.name,
    quantity: item.quantity,
    price: item.unitPrice,
    notes: item.notes,
  })) : legacyItems.map(item => ({ ...item, quantity: item.quantity ?? item.qty ?? 1, price: item.price ?? item.unitPrice ?? 0 }));
  const statusMap: Record<string, string> = { pending: "NEW", confirmed: "NEW", preparing: "PREPARING", ready: "READY", delivering: "DELIVERING", completed: "COMPLETED", cancelled: "CANCELLED" };
  const legacyTotal = orderItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0);
  const location = order.location === "Cafe" && order.floor && order.floor !== "Ground Floor" ? order.floor : order.location || order.floor || "Cafe";
  const hasCurrentSnapshot = Boolean(order.orderNumber || order.orderItems?.length);
  return { ...order, items: orderItems, location, subtotal: hasCurrentSnapshot ? order.subtotal : order.subtotal || legacyTotal, total: hasCurrentSnapshot ? order.total : order.total || legacyTotal, status: statusMap[order.status] || order.status };
}

router.get("/orders", auth, asyncRoute(async (req: AuthRequest, res) => {
  const role = req.user!.role;
  if (!(["admin", "owner", "cafe_fo", "member"].includes(role))) return res.status(403).json({ message: "Insufficient permissions." });
  const where = role === "member" ? { customerId: req.user!.id } : {};
  const orders = await prisma.cafeOrder.findMany({ where, include: { orderItems: true, court: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  res.json(orders.map(displayOrder));
}));

router.post("/orders", auth, asyncRoute(async (req: AuthRequest, res) => {
  const role = req.user!.role;
  if (!(["admin", "cafe_fo", "member"].includes(role))) return res.status(403).json({ message: "Insufficient permissions." });
  const input = newOrderSchema.parse(req.body);
  const location = input.location || (input.floor === "Ground Floor" ? "Cafe" : input.floor === "First Floor" ? "1st Floor" : "Office");
  if (input.courtId && !location.includes("Badminton Court")) return res.status(400).json({ message: "Select a badminton court location before choosing a court." });
  const staffCreating = role !== "member";
  if (!staffCreating && input.paymentMethod !== "ONLINE") return res.status(403).json({ message: "Members must choose online payment for cafe orders." });
  const merged = [...new Map(input.items.map(item => [item.id, { ...item, quantity: input.items.filter(other => other.id === item.id).reduce((sum, other) => sum + other.quantity, 0) }])).values()];
  if (merged.some(item => item.quantity > 30)) return res.status(400).json({ message: "An item quantity cannot exceed 30." });
  const menu = await prisma.cafeMenuItem.findMany({ where: { id: { in: merged.map(item => item.id) }, available: true } });
  if (menu.length !== merged.length) return res.status(409).json({ message: "One or more menu items are unavailable. Refresh the menu and try again." });
  if (input.courtId) {
    const court = await prisma.court.findFirst({ where: { id: input.courtId, status: "available" } });
    if (!court) return res.status(409).json({ message: "That court could not be found or is unavailable." });
  }
  const lines = merged.map(line => {
    const item = menu.find(menuItem => menuItem.id === line.id)!;
    return { menuItemId: item.id, name: item.name, quantity: line.quantity, unitPrice: item.price, notes: line.notes || null };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  if (input.discount > subtotal) return res.status(400).json({ message: "Discount cannot be higher than the order subtotal." });
  const total = subtotal - input.discount;
  const now = new Date();
  const orderNumber = `C-${now.getTime().toString().slice(-6)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const customer = staffCreating ? input.customer || "Walk-in Customer" : req.user!.name;
  const paymentStatus = input.paymentMethod === "CASH" ? "paid" : "pending";
  const paymentLabel = input.paymentMethod === "CASH" ? "Cash" : input.paymentMethod === "PAY_LATER" ? "Pay Later" : "Online";
  const order = await prisma.$transaction(async tx => {
    const transaction = await tx.transaction.create({ data: {
      userId: role === "member" ? req.user!.id : null,
      date: now.toISOString().slice(0, 10), customer, business: "Cafe",
      item: `${orderNumber} · ${lines.map(line => `${line.name} ×${line.quantity}`).join(", ")}`,
      amount: subtotal, discount: input.discount, tax: 0, finalAmount: total,
      paymentMethod: paymentLabel, staff: req.user!.name, status: paymentStatus,
    } });
    const created = await tx.cafeOrder.create({ data: {
      orderNumber,
      customerId: role === "member" ? req.user!.id : null,
      customer,
      items: lines.map(line => ({ id: line.menuItemId, name: line.name, quantity: line.quantity, price: line.unitPrice, notes: line.notes })),
      orderItems: { create: lines },
      location,
      floor: location,
      courtId: input.courtId || null,
      orderTime: now.toISOString(),
      paymentMethod: input.paymentMethod,
      paymentStatus,
      subtotal,
      discount: input.discount,
      total,
      status: "NEW",
      createdById: req.user!.id,
      transactionId: transaction.id,
    }, include: { orderItems: true, court: { select: { id: true, name: true } } } });
    await tx.notification.create({ data: { userId: null, audience: "cafe_fo", title: "New cafe order", body: `${orderNumber} · ${customer} · ${location} · ${total.toLocaleString()} MMK`, link: "/cafe/orders", type: "booking", icon: "coffee", entityType: "cafe_order", entityId: created.id } });
    if (role === "member") await tx.notification.create({ data: { userId: req.user!.id, title: "Cafe order received", body: `${orderNumber} is in the cafe queue. Online payment is pending.`, link: "/cafe-order", type: "booking", entityType: "cafe_order", entityId: created.id } });
    return created;
  });
  res.status(201).json({ order: displayOrder(order), message: paymentStatus === "paid" ? "Cash payment recorded and order sent to the cafe." : "Order received. Payment is pending; no online payment has been collected." });
}));

router.patch("/orders/:id/status", auth, manager, asyncRoute(async (req, res) => {
  const { status } = z.object({ status: z.enum(CAFE_ORDER_STATUSES) }).parse(req.body);
  const current = await prisma.cafeOrder.findUnique({ where: { id: String(req.params.id) } });
  if (!current) return res.status(404).json({ message: "Cafe order not found." });
  const transitions: Record<string, string[]> = { NEW: ["PREPARING", "CANCELLED"], PREPARING: ["READY", "CANCELLED"], READY: ["DELIVERING", "COMPLETED", "CANCELLED"], DELIVERING: ["COMPLETED", "CANCELLED"], COMPLETED: [], CANCELLED: [] };
  const normalized = displayOrder(current).status;
  if (!transitions[normalized]?.includes(status)) return res.status(409).json({ message: `An order cannot move from ${normalized} to ${status}.` });
  const updated = await prisma.cafeOrder.update({ where: { id: current.id }, data: { status }, include: { orderItems: true, court: { select: { id: true, name: true } } } });
  res.json(displayOrder(updated));
}));

router.patch("/orders/:id/payment", auth, manager, asyncRoute(async (req, res) => {
  const { paymentMethod } = z.object({ paymentMethod: z.enum(["CASH", "ONLINE"]) }).parse(req.body);
  if (paymentMethod === "ONLINE") return res.status(503).json({ message: "Online cafe payment is not connected to a verified provider yet. The order remains unpaid." });
  const order = await prisma.cafeOrder.findUnique({ where: { id: String(req.params.id) }, include: { transaction: true } });
  if (!order) return res.status(404).json({ message: "Cafe order not found." });
  if (order.paymentStatus === "paid") return res.status(409).json({ message: "This order is already paid." });
  if (!order.transaction) return res.status(409).json({ message: "This order has no linked finance transaction." });
  const updated = await prisma.$transaction(async tx => {
    await tx.transaction.update({ where: { id: order.transaction!.id }, data: { paymentMethod: "Cash", status: "paid", staff: req.user!.name } });
    return tx.cafeOrder.update({ where: { id: order.id }, data: { paymentMethod, paymentStatus: "paid" }, include: { orderItems: true, court: { select: { id: true, name: true } } } });
  });
  res.json(displayOrder(updated));
}));

export default router;
