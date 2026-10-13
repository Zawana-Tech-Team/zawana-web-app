import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth } from "../middleware/auth.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import {
  completeFirebaseProfile,
  firebaseMfaStatus,
  loginDatabaseAccount,
  registerDatabaseAccount,
} from "../modules/auth/auth.service.js";
import {
  completeProfileSchema,
  databaseLoginSchema,
  databaseRegistrationSchema,
} from "../modules/auth/auth.validation.js";
import { hybrid } from "../modules/auth/hybrid.service.js";
import { reject, requireRecentSession } from "../modules/auth/hybrid.policy.js";
import { sessions } from "../services/authSession.js";
import { firebaseAdminAuth } from "../services/firebaseAdmin.js";
import { env } from "../config/env.js";
import { toSafeAppUser } from "../services/userSerializer.js";
import type { AuthRequest } from "../types/auth.js";

export function createAuthRouter(
  service = hybrid,
  sessionService = sessions,
  database = prisma,
) {
  const hybrid = service;
  const sessions = sessionService;
  const prisma = database;
  const router = Router();
  const email = z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase());
  const password = z.string().min(1).max(128);
  const capability = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
  const remember = z.boolean().default(true);
  const bearer = (req: Request) => {
    const value = req.headers.authorization;
    if (!value?.startsWith("Bearer "))
      return reject("PROOF_REQUIRED", 401, "Authentication proof required.");
    return value.slice(7);
  };
  function originCheck(req: Request) {
    if (req.headers.origin && !env.clientUrls.includes(req.headers.origin))
      reject("FORBIDDEN_ORIGIN", 403, "This origin is not allowed.");
  }
  function refreshCookie(req: Request) {
    const value = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("zawana_refresh="))
      ?.slice("zawana_refresh=".length);
    return value || "";
  }
  function send(req: Request, res: Response, result: any, status = 200) {
    res.setHeader("Cache-Control", "no-store");
    if (
      req.headers.origin &&
      result.refreshToken &&
      !req.path.startsWith("/mobile/") &&
      !req.body?.refreshToken
    ) {
      originCheck(req);
      res.cookie("zawana_refresh", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/auth",
        expires: new Date(result.sessionExpiresAt),
      });
      const { refreshToken: _refresh, ...safe } = result;
      res.status(status).json(safe);
    } else res.status(status).json(result);
  }
  router.use(
    asyncRoute(async (req, res, next) => {
      originCheck(req);
      res.setHeader("Cache-Control", "no-store");
      await hybrid.limited(
        "ip:" + req.path,
        req.ip || req.socket.remoteAddress || "unknown",
        req.path === "/refresh" ? 240 : 30,
      );
      next();
    }),
  );
  router.post(
    "/register",
    asyncRoute(async (req, res) =>
      send(
        req,
        res,
        await registerDatabaseAccount(
          databaseRegistrationSchema.parse(req.body),
        ),
        201,
      ),
    ),
  );
  router.post(
    "/login",
    asyncRoute(async (req, res) =>
      send(
        req,
        res,
        await loginDatabaseAccount(databaseLoginSchema.parse(req.body)),
      ),
    ),
  );
  router.post(
    "/session",
    asyncRoute(async (req, res) =>
      send(req, res, await hybrid.webSession(bearer(req))),
    ),
  );
  router.post(
    "/complete-profile",
    asyncRoute(async (req, res) =>
      send(
        req,
        res,
        await completeFirebaseProfile(
          req,
          completeProfileSchema.parse(req.body),
        ),
        201,
      ),
    ),
  );
  router.post(
    "/mobile/account-check",
    asyncRoute(async (req, res) => {
      const input = z.object({
        email: email.optional(),
        phone: z.string().regex(/^\+959\d{6,10}$/).optional(),
      }).strict().refine(value => Boolean(value.email || value.phone), "Enter an email or phone number.").parse(req.body);
      res.json(await hybrid.accountAvailability(input));
    }),
  );
  router.post(
    "/mobile/email-login",
    asyncRoute(async (req, res) =>
      send(
        req,
        res,
        await hybrid.emailLogin(
          z.object({ email, password, remember }).strict().parse(req.body),
        ),
      ),
    ),
  );
  router.post(
    "/mobile/provider-session",
    asyncRoute(async (req, res) => {
      const input = z
        .object({ provider: z.enum(["google.com", "apple.com"]), remember })
        .strict()
        .parse(req.body);
      send(
        req,
        res,
        await hybrid.providerLogin(bearer(req), input.provider, input.remember),
      );
    }),
  );
  router.post(
    "/mobile/challenge",
    asyncRoute(async (req, res) => {
      const input = z
        .object({
          intent: z.enum(["signin", "signup", "link"]).default("signin"),
        })
        .strict()
        .parse(req.body);
      res.json(await hybrid.phoneChallenge(bearer(req), input.intent));
    }),
  );
  router.post(
    "/mobile/password",
    asyncRoute(async (req, res) =>
      send(
        req,
        res,
        await hybrid.phonePassword(
          z
            .object({ challengeToken: capability, password, remember })
            .strict()
            .parse(req.body),
        ),
      ),
    ),
  );
  router.post(
    "/mobile/register",
    asyncRoute(async (req, res) => {
      const input = z
        .object({
          challengeToken: capability,
          registrationToken: capability.optional(),
          name: z.string().trim().min(2).max(100),
          email,
          password: password
            .min(8)
            .refine(
              (s) =>
                /[A-Za-z]/.test(s) && /\d/.test(s) && /[^A-Za-z0-9\s]/.test(s),
              "Choose letters, numbers, and a special character.",
            ),
        })
        .strict()
        .parse(req.body);
      res.json(await hybrid.register(input));
    }),
  );
  router.post(
    "/mobile/register/resend",
    asyncRoute(async (req, res) => {
      const input = z
        .object({ registrationToken: capability })
        .strict()
        .parse(req.body);
      res.json(await hybrid.resendRegistration(input.registrationToken));
    }),
  );
  router.post(
    "/mobile/register/status",
    asyncRoute(async (req, res) => {
      const input = z
        .object({ registrationToken: capability })
        .strict()
        .parse(req.body);
      res.json(await hybrid.registrationStatus(input.registrationToken));
    }),
  );
  router.post(
    "/mobile/register/complete",
    asyncRoute(async (req, res) =>
      send(
        req,
        res,
        await hybrid.completeRegistration(
          z
            .object({
              registrationToken: capability,
              challengeToken: capability,
              password,
              remember,
            })
            .strict()
            .parse(req.body),
        ),
        201,
      ),
    ),
  );
  router.post(
    "/identities/link",
    asyncRoute(async (req, res) => {
      const input = z
        .object({
          email,
          password,
          identityToken: z.string().max(10000).optional(),
          challengeToken: capability.optional(),
        })
        .strict()
        .refine(
          (s) => Boolean(s.identityToken) !== Boolean(s.challengeToken),
          "Verify one identity at a time.",
        )
        .parse(req.body);
      res.json(await hybrid.link(input));
    }),
  );
  router.get(
    "/me",
    auth,
    asyncRoute(async (req: AuthRequest, res) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user!.id },
      });
      res.json(toSafeAppUser(user));
    }),
  );
  router.get(
    "/mfa/status",
    auth,
    asyncRoute(async (req: AuthRequest, res) =>
      res.json(await firebaseMfaStatus(req.user!.id)),
    ),
  );
  router.post(
    "/refresh",
    asyncRoute(async (req, res) => {
      const input = z
        .object({ refreshToken: capability.optional() })
        .strict()
        .parse(req.body || {});
      const token = input.refreshToken || refreshCookie(req);
      if (!token) reject("SESSION_REVOKED", 401, "Sign in again.");
      // Cookie requests require an allowed browser origin; native requests explicitly supply a token.
      if (!input.refreshToken && !req.headers.origin)
        reject("FORBIDDEN_ORIGIN", 403, "Browser origin required.");
      send(req, res, await sessions.refresh(token));
    }),
  );
  router.post(
    "/logout",
    asyncRoute(async (req: AuthRequest, res) => {
      const token = refreshCookie(req) || req.body?.refreshToken;
      if (typeof token === "string") {
        const row = await prisma.authRefreshToken.findUnique({
          where: {
            tokenHash: (
              await import("../services/authSession.js")
            ).credentialHash(token),
          },
        });
        if (row)
          await prisma.authSession.update({
            where: { id: row.sessionId },
            data: { revokedAt: new Date() },
          });
      } else if (req.headers.authorization?.startsWith("Bearer ")) {
        const hash = (
          await import("../services/authSession.js")
        ).credentialHash(bearer(req));
        await prisma.authSession.updateMany({
          where: { accessHash: hash },
          data: { revokedAt: new Date() },
        });
      }
      res.clearCookie("zawana_refresh", { path: "/api/auth" });
      res.json({ signedOut: true });
    }),
  );
  router.post(
    "/logout-all",
    auth,
    asyncRoute(async (req: AuthRequest, res) => {
      requireRecentSession(req.authSession);
      await prisma.authSession.updateMany({
        where: { userId: req.user!.id },
        data: { revokedAt: new Date() },
      });
      if (!env.databaseAuthEnabled) {
        const identities = await prisma.authIdentity.findMany({
          where: { userId: req.user!.id, kind: "firebase" },
        });
        for (const identity of identities)
          await firebaseAdminAuth().revokeRefreshTokens(identity.value);
      }
      res.clearCookie("zawana_refresh", { path: "/api/auth" });
      res.json({ signedOut: true });
    }),
  );
  router.post(
    "/password-recovery",
    asyncRoute(async (req, res) => {
      const input = z.object({ email }).strict().parse(req.body);
      res.json(await hybrid.recovery(input.email));
    }),
  );
  return router;
}
export default createAuthRouter();
