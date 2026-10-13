import bcrypt from "bcryptjs";
import type { Request } from "express";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { firebaseAdminAuth, verifyFirebaseIdToken } from "../../services/firebaseAdmin.js";
import { sessions } from "../../services/authSession.js";
import { hybrid } from "./hybrid.service.js";
import { requireWebProof } from "./hybrid.policy.js";
import { normalizePhone } from "./auth.validation.js";

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

export async function registerDatabaseAccount(input: {
  name: string;
  email: string;
  phone: string;
  password: string
}) {
  if (!env.databaseAuthEnabled)
    throw new AuthServiceError(
      "Create accounts with Firebase Authentication, then complete the Zawana profile.",
      410
    );
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing)
    throw new AuthServiceError(
      "An account with this email already exists. Sign in or ask an administrator for help.",
      409
    );
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: normalizePhone(input.phone),
      passwordHash: await bcrypt.hash(input.password, 12),
      role: "member",
      emailVerified: true
    }
  });
  return sessions.issue(prisma, user, 'database_password', []);
}

export async function loginDatabaseAccount(input: { username: string; password: string }) {
  if (!env.databaseAuthEnabled)
    throw new AuthServiceError("Sign in with Firebase Authentication.", 410);
  const username = input.username.trim().toLowerCase();
  let user;
  if (username.includes("@")) user = await prisma.user.findUnique({ where: { email: username } });
  else {
    const matches = await prisma.user.findMany({
      where: { email: { startsWith: `${username}@` } },
      take: 2
    });
    if (matches.length > 1)
      throw new AuthServiceError(
        "This username is ambiguous. Sign in with the complete database email.",
        409
      );
    user = matches[0];
  }
  if (!user || !user.active || !user.passwordHash || !await bcrypt.compare(input.password, user.passwordHash))
    throw new AuthServiceError("Username or password is incorrect.", 401);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });
  return sessions.issue(prisma, updated, 'database_password', []);
}

function bearerToken(req: Request) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer "))
    throw new AuthServiceError("Authentication required.", 401);
  return authorization.slice(7);
}

export async function resolveFirebaseSession(req: Request) {
  return hybrid.webSession(bearerToken(req));
}

export async function completeFirebaseProfile(
  req: Request,
  input: { name: string; phone: string }
) {
  const claims = await verifyFirebaseIdToken(bearerToken(req));
  requireWebProof(claims);
  if (!claims.email || !claims.email_verified)
    throw new AuthServiceError("Verify your email before completing your profile.", 403);
  const pending = await prisma.pendingRegistration.findUnique({ where: { firebaseUid: claims.uid } });
  if (pending && !pending.completedUserId) throw Object.assign(new Error("Complete mobile account enrollment first."), { statusCode: 428, code: "INCOMPLETE_ENROLLMENT" });
  const phone = normalizePhone(input.phone);
  let user = await prisma.user.findUnique({ where: { firebaseUid: claims.uid } });
  if (!user) {
    const legacy = await hybrid.emailOwner(claims.email);
    if (legacy) {
      throw new AuthServiceError(
        "This account requires explicit identity linking. Sign in with the existing method or contact an administrator.",
        409
      );
    } else {
      user = await prisma.user.create({
        data: {
          name: input.name,
          email: claims.email.toLowerCase(),
          phone,
          avatar: claims.picture || null,
          firebaseUid: claims.uid,
          emailVerified: true,
          passwordHash: null,
          role: "member",
          lastLoginAt: new Date()
        }
      });
    }
  }
  if (!user.active)
    throw new AuthServiceError("This account is inactive. Contact an administrator.", 403);
  return hybrid.webSession(bearerToken(req));
}

export async function firebaseMfaStatus(userId: string) {
  if (env.databaseAuthEnabled) return { enrolled: [], required: false };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firebaseUid: true }
  });
  if (!user?.firebaseUid) return { enrolled: [], required: false };
  const identity = await firebaseAdminAuth().getUser(user.firebaseUid);
  return {
    enrolled: (identity.multiFactor?.enrolledFactors || []).map(f => ({
      uid: f.uid,
      displayName: f.displayName,
      factorId: f.factorId
    })),
    required: false
  };
}
