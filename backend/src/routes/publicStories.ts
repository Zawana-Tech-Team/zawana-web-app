import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { asyncRoute } from "../utils/asyncRoute.js";
import { today } from "../services/courtPolicy.js";

export function createPublicStoriesRoutes(db: PrismaClient) {
  const router = Router();
  router.get("/achievements", asyncRoute(async (_req, res) => {
    res.json(await db.contentItem.findMany({
      where: { kind: "achievement", status: "published", publishDate: { lte: today() } },
      select: { id: true, title: true, kind: true, category: true, description: true, image: true, publishDate: true },
      orderBy: [{ publishDate: "desc" }, { id: "desc" }],
      take: 100
    }));
  }));
  router.get("/achievements/:id", asyncRoute(async (req, res) => {
    const item = await db.contentItem.findFirst({
      where: { id: String(req.params.id), kind: "achievement", status: "published", publishDate: { lte: today() } }
    });
    if (!item) return res.status(404).json({ message: "This achievement is not available." });
    res.json(item);
  }));
  router.get("/public/coaches", asyncRoute(async (_req, res) => {
    res.json(await db.coach.findMany({
      where: { department: "Badminton", status: "active", user: { is: { active: true, role: "coach", deletedAt: null } } },
      select: { id: true, name: true, specialty: true, department: true, imageUrl: true },
      orderBy: { name: "asc" },
      take: 200
    }));
  }));
  return router;
}
