import { Router } from "express";
import { z } from "zod";
import { $Enums, CourtStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { JsonValue } from "@prisma/client/runtime/library";

const router = Router();

router.get(
  "/",
  asyncRoute(
    async (
      _req: any,
      res: {
        json: (
          arg0: {
            name: string;
            id: string;
            status: $Enums.CourtStatus;
            createdAt: Date;
            type: string;
            price: number;
            surface: string;
            features: JsonValue;
          }[]
        ) => void;
      }
    ) => {
      res.json(
        await prisma.court.findMany({
          orderBy: { name: "asc" },
        })
      );
    }
  )
);

router.post(
  "/",
  auth,
  roles("admin", "badminton_fo"),
  asyncRoute(
    async (
      req: { body: unknown; },
      res: {
        status: (arg0: number) => {
          (): any;
          new (): any;
          json: {
            (arg0: {
              name: string;
              id: string;
              type: string;
              surface: string;
              price: number;
              status: $Enums.CourtStatus;
              features: JsonValue;
              createdAt: Date;
            }): void;
            new (): any;
          };
        };
      }
    ) => {
      const b = z
        .object({
          name: z.string(),
          type: z.enum(["Premium", "Standard"]),
          surface: z.string(),
          price: z.number().int().nonnegative(),
          status: z.nativeEnum(CourtStatus).optional(),
          features: z.array(z.string()).default([]),
        })
        .parse(req.body);

      res.status(201).json(
        await prisma.court.create({
          data: {
            ...b,
            status: b.status || "available",
            features: b.features,
          },
        })
      );
    }
  )
);

router.patch(
  "/:id",
  auth,
  roles("admin", "badminton_fo"),
  asyncRoute(
    async (
      req: { body: unknown; params: { id: any; }; },
      res: {
        json: (arg0: {
          name: string;
          id: string;
          type: string;
          surface: string;
          price: number;
          status: $Enums.CourtStatus;
          features: JsonValue;
          createdAt: Date;
        }) => void;
      }
    ) => {
      const b = z
        .object({
          name: z.string().optional(),
          type: z.enum(["Premium", "Standard"]).optional(),
          surface: z.string().optional(),
          price: z.number().int().nonnegative().optional(),
          status: z.nativeEnum(CourtStatus).optional(),
          features: z.array(z.string()).optional(),
        })
        .parse(req.body);

      res.json(
        await prisma.court.update({
          where: { id: req.params.id },
          data: b,
        })
      );
    }
  )
);

router.delete(
  "/:id",
  auth,
  roles("admin"),
  asyncRoute(
    async (
      req: { params: { id: any; }; },
      res: { status: (arg0: number) => { (): any; new (): any; end: { (): void; new (): any; }; }; }
    ) => {
      await prisma.court.delete({
        where: { id: req.params.id },
      });

      res.status(204).end();
    }
  )
);

export default router;
