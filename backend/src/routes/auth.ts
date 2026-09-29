import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { auth, tokenFor } from "../middleware/auth.js";
import type { AuthRequest } from "../types/auth.js";
import { $Enums } from "@prisma/client";

const router = Router();

router.post(
  "/register",
  asyncRoute(async (req: { body: unknown; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { message?: string; user?: { id: string; name: string; email: string; role: $Enums.Role; membership: string | null; }; token?: string; }): void; new(): any; }; }; }) => {
    const body = z
      .object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        phone: z.string().optional(),
      })
      .parse(req.body);

    const email = body.email.toLowerCase();

    const exists = await prisma.user.findUnique({
      where: { email },
    });

    if (exists) {
      return res
        .status(409)
        .json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(
      body.password,
      12
    );

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email,
        passwordHash,
        phone: body.phone,
        role: "member",
      },
    });

    const safe = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      membership: user.membership,
    };

    res.status(201).json({
      user: safe,
      token: tokenFor({
        id: user.id,
        role: user.role,
        email: user.email,
        name: user.name,
      }),
    });
  })
);

router.post(
  "/login",
  asyncRoute(async (req: { body: unknown; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { message: string; }): any; new(): any; }; }; json: (arg0: { user: { id: string; name: string; email: string; role: $Enums.Role; membership: string | null; avatar: string | null; }; token: string; }) => void; }) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string(),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: {
        email: body.email.toLowerCase(),
      },
    });

    if (
      !user ||
      !(await bcrypt.compare(
        body.password,
        user.passwordHash
      ))
    ) {
      return res
        .status(401)
        .json({ message: "Invalid email or password" });
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        membership: user.membership,
        avatar: user.avatar,
      },
      token: tokenFor({
        id: user.id,
        role: user.role,
        email: user.email,
        name: user.name,
      }),
    });
  })
);

router.get(
  "/me",
  auth,
  asyncRoute(async (req: AuthRequest, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { message: string; }): any; new(): any; }; }; json: (arg0: { id: string; name: string; email: string; role: $Enums.Role; membership: string | null; avatar: string | null; }) => void; }) => {
    const u = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!u) {
      return res
        .status(404)
        .json({ message: "User not found" });
    }

    res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      membership: u.membership,
      avatar: u.avatar,
    });
  })
);

export default router;
