import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient, Prisma, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { firebaseAdminAuth } from "./firebaseAdmin.js";
import { toSafeAppUser } from "./userSerializer.js";
import { reject } from "../modules/auth/hybrid.policy.js";

export const credentialHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const newCredential = () => randomBytes(32).toString("base64url");
export type IdentityProof = {
  uid: string;
  authTime: number;
  phoneOnly?: boolean;
  secondFactor?: string;
};
type Db = PrismaClient;
export function createSessionService(
  db: Db = prisma,
  getIdentity = (uid: string) => firebaseAdminAuth().getUser(uid),
) {
  async function checkProofs(proofs: IdentityProof[]) {
    let mfaEnrolled = false;
    for (const proof of proofs) {
      const identity = await getIdentity(proof.uid).catch(
        (error: { code?: string }) => {
          if (error?.code === "auth/user-not-found")
            return reject("SESSION_REVOKED", 401, "Sign in again.");
          return reject(
            "AUTH_UNAVAILABLE",
            503,
            "Authentication is temporarily unavailable.",
          );
        },
      );
      const weak =
        !proof.phoneOnly &&
        (await db.authIdentity.findUnique({
          where: { kind_value: { kind: "phone_uid", value: proof.uid } },
        }));
      if (
        !proof.phoneOnly &&
        (weak || identity.providerData.some((p) => p.providerId === "phone"))
      )
        reject(
          "PHONE_AUTHORITY_CONFLICT",
          403,
          "Use an independent password or social identity.",
        );
      if (
        !proof.phoneOnly &&
        (identity.multiFactor?.enrolledFactors.length || 0) > 0
      ) {
        mfaEnrolled = true;
        if (!proof.secondFactor)
          reject(
            "MFA_REQUIRED",
            403,
            "Complete additional verification on the website.",
          );
      }
      if (
        identity.disabled ||
        proof.authTime <
          Math.floor(
            Date.parse(identity.tokensValidAfterTime || "1970-01-01") / 1000,
          )
      )
        reject("SESSION_REVOKED", 401, "Sign in again.");
    }
    return mfaEnrolled;
  }
  async function issue(
    tx: Prisma.TransactionClient | Db,
    user: User,
    method: string,
    proofs: IdentityProof[],
    remember = true,
  ) {
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current?.active || current.deletedAt)
      reject("ACCOUNT_UNAVAILABLE", 403, "This account is unavailable.");
    if (
      !method.startsWith("web_") &&
      method !== "database_password" &&
      current.role !== "member"
    )
      reject(
        "MOBILE_ROLE_UNSUPPORTED",
        403,
        "Use the website for this account.",
      );
    const accessToken = newCredential(),
      refreshToken = newCredential();
    const now = Date.now();
    const session = await tx.authSession.create({
      data: {
        userId: user.id,
        method,
        proofs: JSON.stringify(proofs),
        authenticatedAt: new Date(
          proofs.length
            ? Math.min(...proofs.map((p) => p.authTime * 1000))
            : now,
        ),
        accessHash: credentialHash(accessToken),
        accessExpiresAt: new Date(now + 900_000),
        expiresAt: new Date(now + (remember ? 30 * 86400_000 : 12 * 3600_000)),
        refreshTokens: { create: { tokenHash: credentialHash(refreshToken) } },
      },
    });
    await tx.authSecurityEvent.create({
      data: { userId: user.id, kind: "session_created" },
    });
    return {
      user: toSafeAppUser(current),
      security: { mfaEnrolled: false, mfaRequired: false },
      accessToken,
      token: accessToken,
      refreshToken,
      accessExpiresAt: session.accessExpiresAt.toISOString(),
      sessionExpiresAt: session.expiresAt.toISOString(),
    };
  }
  async function authenticate(token: string) {
    const session = await db.authSession.findUnique({
      where: { accessHash: credentialHash(token) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.accessExpiresAt.getTime() <= Date.now() ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.active ||
      session.user.deletedAt
    )
      reject("SESSION_REVOKED", 401, "Your session expired. Sign in again.");
    if (
      !session.method.startsWith("web_") &&
      session.method !== "database_password" &&
      session.user.role !== "member"
    )
      reject(
        "MOBILE_ROLE_UNSUPPORTED",
        403,
        "Use the website for this account.",
      );
    await checkProofs(JSON.parse(session.proofs));
    return session;
  }
  async function refresh(token: string) {
    const hash = credentialHash(token);
    const old = await db.authRefreshToken.findUnique({
      where: { tokenHash: hash },
      include: { session: { include: { user: true } } },
    });
    if (!old) reject("SESSION_REVOKED", 401, "Sign in again.");
    if (old.consumedAt) {
      await db.authSession.update({
        where: { id: old.sessionId },
        data: { revokedAt: new Date() },
      });
      await db.authSecurityEvent.create({
        data: { userId: old.session.userId, kind: "refresh_reuse" },
      });
      reject("SESSION_REVOKED", 401, "Sign in again.");
    }
    if (
      old.session.revokedAt ||
      old.session.expiresAt.getTime() <= Date.now() ||
      !old.session.user.active ||
      old.session.user.deletedAt
    )
      reject("SESSION_REVOKED", 401, "Sign in again.");
    if (
      !old.session.method.startsWith("web_") &&
      old.session.method !== "database_password" &&
      old.session.user.role !== "member"
    )
      reject(
        "MOBILE_ROLE_UNSUPPORTED",
        403,
        "Use the website for this account.",
      );
    const mfaEnrolled = await checkProofs(JSON.parse(old.session.proofs));
    const accessToken = newCredential(),
      refreshToken = newCredential();
    const rotated = await db.$transaction(async (tx) => {
      const consumed = await tx.authRefreshToken.updateMany({
        where: { id: old.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (!consumed.count) return null;
      const session = await tx.authSession.updateMany({
        where: {
          id: old.sessionId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          accessHash: credentialHash(accessToken),
          accessExpiresAt: new Date(Date.now() + 900_000),
        },
      });
      if (!session.count) reject("SESSION_REVOKED", 401, "Sign in again.");
      await tx.authRefreshToken.create({
        data: {
          sessionId: old.sessionId,
          tokenHash: credentialHash(refreshToken),
        },
      });
      return tx.authSession.findUniqueOrThrow({ where: { id: old.sessionId } });
    });
    if (!rotated) {
      await db.authSession.update({
        where: { id: old.sessionId },
        data: { revokedAt: new Date() },
      });
      reject("SESSION_REVOKED", 401, "Sign in again.");
    }
    return {
      user: toSafeAppUser(old.session.user),
      security: { mfaEnrolled, mfaRequired: false },
      accessToken,
      token: accessToken,
      refreshToken,
      accessExpiresAt: rotated.accessExpiresAt.toISOString(),
      sessionExpiresAt: rotated.expiresAt.toISOString(),
    };
  }
  return { issue, authenticate, refresh, checkProofs };
}
export const sessions = createSessionService();
