import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import type { AuthRequest } from "../types/auth.js";

const router = Router();

router.get(
  "/",
  auth,
  asyncRoute(async (req: AuthRequest, res: { json: (arg0: { id: string; link: string | null; createdAt: Date; type: string | null; userId: string | null; title: string; body: string; read: boolean; audience: string | null; }[]) => void; }) => {
    const list =
      await prisma.notification.findMany({
        where: {
          OR: [
            { userId: req.user!.id },
            {
              userId: null,
              audience: "all",
            },
            {
              userId: null,
              audience: req.user!.role,
            },
          ],
        },
        orderBy: { createdAt: "desc" },
      });

    res.json(list);
  })
);

router.patch(
  "/:id/read",
  auth,
  asyncRoute(async (req: { params: { id: any; }; }, res: { json: (arg0: { id: string; userId: string | null; title: string; body: string; read: boolean; link: string | null; audience: string | null; type: string | null; createdAt: Date; }) => void; }) => {
    res.json(
      await prisma.notification.update({
        where: { id: req.params.id },
        data: { read: true },
      })
    );
  })
);

export default router;
