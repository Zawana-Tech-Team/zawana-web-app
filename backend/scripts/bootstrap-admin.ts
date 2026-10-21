import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { firebaseAdminAuth } from "../src/services/firebaseAdmin.js";

const db = new PrismaClient();
const uid = process.argv[2];
const email = process.argv[3]?.trim().toLowerCase();

try {
  if (!uid || !email || !email.includes("@")) {
    throw new Error("Usage: npm run admin:bootstrap -- <firebase-uid> <email>");
  }
  // Verify the existing Firebase account without changing its credentials.
  const identity = await firebaseAdminAuth().getUser(uid);
  if (identity.disabled || identity.email?.toLowerCase() !== email) {
    throw new Error("Firebase account is disabled or its email does not match.");
  }
  const passwordHash = process.env.ADMIN_PASSWORD
    ? await bcrypt.hash(process.env.ADMIN_PASSWORD, 12)
    : undefined;

  const user = await db.$transaction(async (tx) => {
    const matches = await tx.user.findMany({
      where: { OR: [{ firebaseUid: uid }, { email: { equals: email } }] },
    });
    const existing = matches[0];
    if (matches.length > 1 || (existing?.firebaseUid && existing.firebaseUid !== uid)) {
      throw new Error("Conflicting user records exist; no changes were made.");
    }
    if (existing && (existing.email.toLowerCase() !== email || !existing.active || existing.deletedAt)) {
      throw new Error("Existing user has a different email or is inactive/deleted; no changes were made.");
    }
    const keys = [{ kind: "firebase", value: uid }, { kind: "email", value: email }];
    const identities = await tx.authIdentity.findMany({ where: { OR: keys } });
    if (identities.some((row) => row.userId !== existing?.id)) {
      throw new Error("An identity belongs to another user; no changes were made.");
    }
    const data = {
      firebaseUid: uid,
      email,
      emailVerified: identity.emailVerified,
      role: "admin" as const,
      ...(passwordHash ? { passwordHash } : {}),
    };
    const admin = existing
      ? await tx.user.update({ where: { id: existing.id }, data })
      : await tx.user.create({ data: { ...data, name: identity.displayName || "Admin" } });
    for (const key of keys) {
      // Only verified email addresses become verified email identities.
      if (key.kind === "email" && !identity.emailVerified) continue;
      await tx.authIdentity.upsert({
        where: { kind_value: key },
        create: { ...key, userId: admin.id },
        update: {},
      });
    }
    return { id: admin.id, email: admin.email, firebaseUid: admin.firebaseUid, role: admin.role };
  });
  console.log("Admin database account ready:", user);
  if (!identity.emailVerified) console.log("Firebase email is unverified; web sign-in requires email verification.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Admin bootstrap failed.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
