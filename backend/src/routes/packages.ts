import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, roles } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { JsonValue } from "@prisma/client/runtime/library";

const router = Router();

router.get(
  "/badminton",
  auth,
  asyncRoute(
    async (
      _req: any,
      res: {
        json: (
          arg0: {
            id: string;
            title: string;
            status: string;
            description: string;
            price: number;
            sessions: number;
            validity: number;
          }[]
        ) => void;
      }
    ) => {
      res.json(
        await prisma.badmintonPackage.findMany({
          orderBy: { title: "asc" },
        })
      );
    }
  )
);

router.post(
  "/badminton",
  auth,
  roles("admin", "badminton_fo"),
  asyncRoute(
    async (
      req: { body: any; },
      res: {
        status: (arg0: number) => {
          (): any;
          new (): any;
          json: {
            (arg0: {
              id: string;
              title: string;
              price: number;
              sessions: number;
              validity: number;
              description: string;
              status: string;
            }): void;
            new (): any;
          };
        };
      }
    ) => {
      res.status(201).json(
        await prisma.badmintonPackage.create({
          data: req.body,
        })
      );
    }
  )
);

router.get(
  "/gym",
  auth,
  asyncRoute(
    async (
      _req: any,
      res: {
        json: (
          arg0: {
            id: string;
            title: string;
            price: number;
            duration: number;
            description: string;
            benefits: JsonValue;
            status: string;
          }[]
        ) => void;
      }
    ) => {
      res.json(
        await prisma.gymPackage.findMany({
          orderBy: { title: "asc" },
        })
      );
    }
  )
);

router.post(
  "/gym",
  auth,
  roles("admin", "gym_fo"),
  asyncRoute(
    async (
      req: { body: any; },
      res: {
        status: (arg0: number) => {
          (): any;
          new (): any;
          json: {
            (arg0: {
              id: string;
              title: string;
              price: number;
              description: string;
              status: string;
              duration: number;
              benefits: JsonValue;
            }): void;
            new (): any;
          };
        };
      }
    ) => {
      res.status(201).json(
        await prisma.gymPackage.create({
          data: {
            ...req.body,
            benefits: req.body.benefits || [],
          },
        })
      );
    }
  )
);

router.patch(
  "/badminton/:id",
  auth,
  roles("admin", "badminton_fo"),
  asyncRoute(async (req, res) => {
    res.json(
      await prisma.badmintonPackage.update({
        where: { id: String(req.params.id) },
        data: req.body
      })
    );
  })
);
router.delete(
  "/badminton/:id",
  auth,
  roles("admin"),
  asyncRoute(async (req, res) => {
    await prisma.badmintonPackage.delete({ where: { id: String(req.params.id) } });
    res.status(204).end();
  })
);
router.patch(
  "/gym/:id",
  auth,
  roles("admin", "gym_fo"),
  asyncRoute(async (req, res) => {
    res.json(
      await prisma.gymPackage.update({ where: { id: String(req.params.id) }, data: req.body })
    );
  })
);
router.delete(
  "/gym/:id",
  auth,
  roles("admin"),
  asyncRoute(async (req, res) => {
    await prisma.gymPackage.delete({ where: { id: String(req.params.id) } });
    res.status(204).end();
  })
);

export default router;
