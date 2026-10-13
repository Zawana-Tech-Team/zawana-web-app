import { Router } from "express";
import { z } from "zod";
import { $Enums, Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";

const router = Router();

router.get(
  "/",
  auth,
  roles("admin"),
  asyncRoute(
    async (
      _req: any,
      res: {
        json: (
          arg0: {
            name: string;
            id: string;
            createdAt: Date;
            role: $Enums.Role;
            email: string;
            phone: string | null;
            membership: string | null;
            avatar: string | null;
          }[]
        ) => void;
      }
    ) => {
      res.json(
        await prisma.user.findMany({
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            membership: true,
            avatar: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      );
    }
  )
);

router.patch(
  "/:id",
  auth,
  roles("admin"),
  asyncRoute(
    async (
      req: { body: unknown; params: { id: any; }; },
      res: {
        json: (arg0: {
          name: string;
          id: string;
          email: string;
          role: $Enums.Role;
          phone: string | null;
          membership: string | null;
        }) => void;
      }
    ) => {
      const body = z
        .object({
          name: z.string().optional(),
          phone: z.string().optional(),
          role: z.nativeEnum(Role).optional(),
          membership: z.string().optional(),
        })
        .parse(req.body);

      res.json(
        await prisma.user.update({
          where: { id: req.params.id },
          data: body,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            membership: true,
          },
        })
      );
    }
  )
);

export default router;
