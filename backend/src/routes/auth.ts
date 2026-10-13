import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../middleware/auth.js";
import { createRateLimit } from "../middleware/rateLimit.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import {
  completeFirebaseProfile,
  firebaseMfaStatus,
  loginDatabaseAccount,
  registerDatabaseAccount,
  resolveFirebaseSession
} from "../modules/auth/auth.service.js";
import {
  completeProfileSchema,
  databaseLoginSchema,
  databaseRegistrationSchema
} from "../modules/auth/auth.validation.js";
import { toSafeAppUser } from "../services/userSerializer.js";
import type { AuthRequest } from "../types/auth.js";

const router = Router();
const authRateLimit = createRateLimit({ windowMs: 15 * 60_000, maxAttempts: 30 });

router.post(
  "/register",
  authRateLimit,
  asyncRoute(async (req, res) => {
    const input = databaseRegistrationSchema.parse(req.body);
    res.status(201).json(await registerDatabaseAccount(input));
  })
);

router.post(
  "/login",
  authRateLimit,
  asyncRoute(async (req, res) => {
    const input = databaseLoginSchema.parse(req.body);
    res.json(await loginDatabaseAccount(input));
  })
);

router.post(
  "/session",
  authRateLimit,
  asyncRoute(async (req, res) => {
    res.json(await resolveFirebaseSession(req));
  })
);

router.post(
  "/complete-profile",
  authRateLimit,
  asyncRoute(async (req, res) => {
    const input = completeProfileSchema.parse(req.body);
    res.status(201).json(await completeFirebaseProfile(req, input));
  })
);

router.get(
  "/me",
  auth,
  asyncRoute(async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(toSafeAppUser(user));
  })
);

router.get(
  "/mfa/status",
  auth,
  asyncRoute(async (req: AuthRequest, res) => {
    res.json(await firebaseMfaStatus(req.user!.id));
  })
);

export default router;
