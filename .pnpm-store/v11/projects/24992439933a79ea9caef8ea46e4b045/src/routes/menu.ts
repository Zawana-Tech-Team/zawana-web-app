import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { isStoredImageUrl } from "../services/mediaStorage.js";

const router = Router();
const managerRoles = roles("admin", "cafe_fo");
const imageUrl = z.string().max(2048).refine(isStoredImageUrl, "Choose an uploaded image URL.").nullable().optional();

router.get("/", auth, asyncRoute(async (_req, res) => {
  res.json(await prisma.cafeMenuItem.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }));
}));
router.post("/", auth, managerRoles, asyncRoute(async (req, res) => {
  const data = z.object({ name: z.string().min(1), category: z.string().min(1), description: z.string().default(""), price: z.coerce.number().int().nonnegative(), available: z.boolean().optional(), imageUrl }).parse(req.body);
  res.status(201).json(await prisma.cafeMenuItem.create({ data }));
}));
router.patch("/:id", auth, managerRoles, asyncRoute(async (req, res) => {
  const data = z.object({ name: z.string().min(1).optional(), category: z.string().min(1).optional(), description: z.string().optional(), price: z.coerce.number().int().nonnegative().optional(), available: z.boolean().optional(), imageUrl }).parse(req.body);
  res.json(await prisma.cafeMenuItem.update({ where: { id: String(req.params.id) }, data }));
}));
router.delete("/:id", auth, managerRoles, asyncRoute(async (req, res) => {
  await prisma.cafeMenuItem.delete({ where: { id: String(req.params.id) } });
  res.status(204).end();
}));

export default router;
