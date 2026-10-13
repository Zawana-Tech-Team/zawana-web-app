import type { PrismaClient, Prisma, User } from "@prisma/client";
import type { DecodedIdToken, UserRecord } from "firebase-admin/auth";
import { prisma } from "../../lib/prisma.js";
import {
  firebaseAdminAuth,
  verifyFirebaseIdToken,
} from "../../services/firebaseAdmin.js";
import {
  firebaseAuthRequest,
  verifyFirebasePassword,
} from "../../services/firebasePassword.js";
import {
  credentialHash,
  newCredential,
  createSessionService,
  type IdentityProof,
} from "../../services/authSession.js";
import {
  requireFresh,
  requirePhone,
  requireProvider,
  requireWebProof,
  requireMember,
  reject,
} from "./hybrid.policy.js";

type Tx = Prisma.TransactionClient | PrismaClient;
export function createHybridAuth(
  options: {
    db?: PrismaClient;
    verify?: (token: string) => Promise<DecodedIdToken>;
    password?: (email: string, password: string) => Promise<DecodedIdToken>;
    getIdentity?: (uid: string) => Promise<UserRecord>;
    request?: typeof firebaseAuthRequest;
    credentialToken?: (uid: string) => Promise<string>;
  } = {},
) {
  const db = options.db || prisma;
  const verify = options.verify || verifyFirebaseIdToken;
  const password = options.password || verifyFirebasePassword;
  const getIdentity =
    options.getIdentity || ((uid: string) => firebaseAdminAuth().getUser(uid));
  const request = options.request || firebaseAuthRequest;
  const session = createSessionService(db, getIdentity);
  const proof = (claims: DecodedIdToken): IdentityProof => ({
    uid: claims.uid,
    authTime: claims.auth_time,
    phoneOnly: claims.firebase?.sign_in_provider === "phone",
    secondFactor: claims.firebase?.sign_in_second_factor,
  });
  async function resolve(uid: string, tx: Tx = db) {
    const identity = await tx.authIdentity.findUnique({
      where: { kind_value: { kind: "firebase", value: uid } },
      include: { user: true },
    });
    return (
      identity?.user || tx.user.findUnique({ where: { firebaseUid: uid } })
    );
  }
  async function emailOwner(email: string, tx: Tx = db) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "User" WHERE LOWER("email") = ${email.toLowerCase()} LIMIT 1`;
    return rows[0] || null;
  }
  async function phoneOwner(phone: string, tx: Tx = db) {
    const identity = await tx.authIdentity.findUnique({
      where: { kind_value: { kind: "phone", value: phone } },
    });
    if (identity) return { userId: identity.userId };
    // Legacy contact numbers count as existing accounts, but never authorize or merge identities.
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User"
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("phone", ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
      IN (${phone}, ${'0' + phone.slice(3)}, ${phone.slice(1)}) LIMIT 1`;
    return rows[0] ? { userId: rows[0].id } : null;
  }
  async function accountAvailability(input: { email?: string; phone?: string }) {
    const [emailAccount, phoneAccount] = await Promise.all([
      input.email ? emailOwner(input.email) : null,
      input.phone ? phoneOwner(input.phone) : null,
    ]);
    return {
      ...(input.email ? { emailExists: Boolean(emailAccount) } : {}),
      ...(input.phone ? { phoneExists: Boolean(phoneAccount) } : {}),
    };
  }
  async function bind(tx: Tx, userId: string, kind: string, value: string) {
    const existing = await tx.authIdentity.findUnique({
      where: { kind_value: { kind, value } },
    });
    if (existing && existing.userId !== userId)
      reject(
        "IDENTITY_CONFLICT",
        409,
        "This identity belongs to another account.",
      );
    if (!existing)
      await tx.authIdentity.create({ data: { userId, kind, value } });
  }
  async function bindClaims(tx: Tx, user: User, claims: DecodedIdToken) {
    const existing = await resolve(claims.uid, tx);
    if (existing && existing.id !== user.id)
      reject(
        "IDENTITY_CONFLICT",
        409,
        "This identity belongs to another account.",
      );
    await bind(tx, user.id, "firebase", claims.uid);
    if (claims.firebase.sign_in_provider === "google.com")
      await bind(tx, user.id, "google", claims.uid);
    if (claims.firebase.sign_in_provider === "apple.com")
      await bind(tx, user.id, "apple", claims.uid);
    if (claims.email && claims.email_verified)
      await bind(tx, user.id, "email", claims.email.toLowerCase());
    if (claims.firebase.sign_in_provider === "phone" && claims.phone_number)
      await bind(tx, user.id, "phone", claims.phone_number);
  }
  async function limited(scope: string, subject: string, max = 5) {
    const window = 900_000,
      bucket = Math.floor(Date.now() / window);
    const key = credentialHash(`${scope}:${subject}:${bucket}`);
    const row = await db.authAbuseCounter.upsert({
      where: { key },
      create: { key, count: 1, expiresAt: new Date((bucket + 1) * window) },
      update: { count: { increment: 1 } },
    });
    if (row.count > max)
      reject(
        "RATE_LIMITED",
        429,
        "Too many attempts. Wait before trying again.",
      );
  }
  async function assertStrongIdentity(uid: string) {
    const weak = await db.authIdentity.findUnique({
      where: { kind_value: { kind: "phone_uid", value: uid } },
    });
    const phoneHistory = await db.authChallenge.findFirst({
      where: { firebaseUid: uid },
      select: { id: true },
    });
    if (weak || phoneHistory)
      reject(
        "PHONE_AUTHORITY_CONFLICT",
        403,
        "Use an independent password or social identity.",
      );
  }
  async function assertMethodAllowed(user: User, claims: DecodedIdToken) {
    const method = claims.firebase.sign_in_provider;
    if (claims.uid === user.firebaseUid) return;
    if (method === "password")
      reject(
        "INVALID_CREDENTIALS",
        401,
        "Use your canonical account email and password.",
      );
    const kind =
      method === "google.com"
        ? "google"
        : method === "apple.com"
          ? "apple"
          : "";
    const allowed =
      kind &&
      (await db.authIdentity.findUnique({
        where: { kind_value: { kind, value: claims.uid } },
      }));
    if (!allowed || allowed.userId !== user.id)
      reject(
        "ACCOUNT_LINK_REQUIRED",
        409,
        "Explicitly link this sign-in method using your existing account password.",
      );
  }
  async function completeSession(
    user: User,
    claims: DecodedIdToken,
    method: string,
    remember = true,
    mobile = true,
  ) {
    await assertMethodAllowed(user, claims);
    await assertStrongIdentity(claims.uid);
    if (mobile) requireMember(user);
    else if (!user.active || user.deletedAt)
      reject("ACCOUNT_UNAVAILABLE", 403, "This account is unavailable.");
    const identity = await getIdentity(claims.uid);
    const canonical =
      user.firebaseUid && user.firebaseUid !== claims.uid
        ? await getIdentity(user.firebaseUid)
        : identity;
    const enrolled = (canonical.multiFactor?.enrolledFactors.length || 0) > 0;
    if (
      enrolled &&
      (claims.uid !== user.firebaseUid ||
        !claims.firebase.sign_in_second_factor)
    )
      reject(
        "MFA_REQUIRED",
        403,
        "Complete additional verification on the website.",
      );
    const proofs = [
      proof(claims),
      ...(user.firebaseUid && user.firebaseUid !== claims.uid
        ? [{ uid: user.firebaseUid, authTime: claims.auth_time }]
        : []),
    ];
    await session.checkProofs(proofs);
    const result = await db.$transaction(async (tx) => {
      await bindClaims(tx, user, claims);
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return session.issue(tx, user, method, proofs, remember);
    });
    result.security.mfaEnrolled = enrolled;
    return result;
  }
  async function onboarding(claims: DecodedIdToken) {
    requireFresh(claims);
    const identity = await getIdentity(claims.uid);
    if (identity.email && (await emailOwner(identity.email)))
      reject(
        "ACCOUNT_LINK_REQUIRED",
        409,
        "Sign in to your existing account and explicitly link this identity.",
      );
    const token = newCredential();
    const existing = await db.pendingRegistration.findFirst({
      where: { OR: [{ firebaseUid: claims.uid }, { phoneUid: claims.uid }] },
    });
    if (existing?.completedUserId)
      reject("ACCOUNT_LINK_REQUIRED", 409, "Sign in to your existing account.");
    const data = {
      tokenHash: credentialHash(token),
      expiresAt: new Date(Date.now() + 900_000),
    };
    const registration = existing
      ? await db.pendingRegistration.update({
          where: { id: existing.id },
          data,
        })
      : await db.pendingRegistration.create({
          data: {
            ...data,
            firebaseUid: claims.uid,
            email: identity.email || "",
            name: identity.displayName || "",
          },
        });
    return {
      status: "onboarding",
      registrationToken: token,
      expiresAt: registration.expiresAt.toISOString(),
      profile: {
        name: registration.name,
        email: registration.email,
        phone: registration.phone || "",
      },
      next: "profile",
    };
  }
  async function pending(token: string) {
    const row = await db.pendingRegistration.findUnique({
      where: { tokenHash: credentialHash(token) },
    });
    if (!row || row.expiresAt.getTime() <= Date.now() || row.completedUserId)
      reject("REGISTRATION_EXPIRED", 401, "Restart account verification.");
    return row;
  }
  async function challenge(token: string, tx: Tx = db) {
    const row = await tx.authChallenge.findUnique({
      where: { tokenHash: credentialHash(token) },
    });
    if (!row || row.expiresAt.getTime() <= Date.now())
      reject("CHALLENGE_EXPIRED", 401, "Request a new phone code.");
    if (row.consumedAt)
      reject("CHALLENGE_CONSUMED", 401, "Request a new phone code.");
    if (row.attempts >= 5)
      reject("RATE_LIMITED", 429, "Request a new phone code after waiting.");
    return row;
  }
  async function consume(tx: Tx, id: string) {
    const result = await tx.authChallenge.updateMany({
      where: { id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (result.count !== 1)
      reject("CHALLENGE_CONSUMED", 401, "Request a new phone code.");
  }
  async function emailLogin(input: {
    email: string;
    password: string;
    remember: boolean;
  }) {
    await limited("password", input.email);
    const claims = await password(input.email, input.password);
    if (claims.firebase.sign_in_provider !== "password")
      reject(
        "INVALID_CREDENTIALS",
        401,
        "The sign-in details could not be accepted.",
      );
    const user = await resolve(claims.uid);
    if (!user) return onboarding(claims);
    requireWebProof(claims, false);
    return completeSession(user, claims, "email_password", input.remember);
  }
  async function providerLogin(
    token: string,
    provider: string,
    remember = true,
  ) {
    const claims = await verify(token);
    requireProvider(claims, provider);
    const user = await resolve(claims.uid);
    if (!user) return onboarding(claims);
    requireWebProof(claims, false);
    return completeSession(
      user,
      claims,
      provider === "apple.com" ? "apple" : "google",
      remember,
    );
  }
  async function phoneChallenge(token: string, intent: string) {
    const claims = await verify(token);
    const phone = requirePhone(claims);
    await limited("phone", phone, 10);
    const proofKey = credentialHash(`${claims.uid}:${claims.auth_time}`);
    if (await db.authChallenge.findUnique({ where: { proofKey } }))
      reject("PROOF_REPLAY", 401, "Request a new phone code.");
    const owner = await phoneOwner(phone);
    const user = await resolve(claims.uid);
    const requiresLink = Boolean(owner && owner.userId !== user?.id);
    if (user) {
      await db.$transaction((tx) => bind(tx, user.id, "phone_uid", claims.uid));
      requireMember(user);
    }
    const challengeToken = newCredential();
    const row = await db.authChallenge.create({
      data: {
        tokenHash: credentialHash(challengeToken),
        proofKey,
        firebaseUid: claims.uid,
        phone,
        authTime: claims.auth_time,
        intent,
        expiresAt: new Date(
          Math.min(Date.now() + 300_000, claims.auth_time * 1000 + 300_000),
        ),
      },
    });
    return {
      challengeToken,
      expiresAt: row.expiresAt.toISOString(),
      next: requiresLink
        ? "link-account"
        : user
          ? "password"
          : intent === "link"
            ? "link-account"
            : "registration",
      phone,
    };
  }
  async function phonePassword(input: {
    challengeToken: string;
    password: string;
    remember: boolean;
  }) {
    const row = await challenge(input.challengeToken);
    const attempted = await db.authChallenge.updateMany({
      where: { id: row.id, consumedAt: null, attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });
    if (!attempted.count) reject("RATE_LIMITED", 429, "Too many attempts.");
    const user = await resolve(row.firebaseUid);
    if (!user || !user.firebaseUid)
      reject(
        "ACCOUNT_LINK_REQUIRED",
        409,
        "Sign in to your existing account and link your phone.",
      );
    requireMember(user);
    await limited("password", user.id);
    const claims = await password(user.email, input.password);
    const authority = await getIdentity(claims.uid);
    if (authority.providerData.some((p) => p.providerId === "phone"))
      reject(
        "PHONE_AUTHORITY_CONFLICT",
        409,
        "Contact ZAWANA to separate the phone and password identities.",
      );
    if (claims.uid !== user.firebaseUid)
      reject(
        "INVALID_CREDENTIALS",
        401,
        "The sign-in details could not be accepted.",
      );
    const proofs = [
      { uid: row.firebaseUid, authTime: row.authTime, phoneOnly: true },
      proof(claims),
    ];
    await session.checkProofs(proofs);
    return db.$transaction(async (tx) => {
      await consume(tx, row.id);
      await bind(tx, user.id, "firebase", row.firebaseUid);
      await bind(tx, user.id, "phone", row.phone);
      await bind(tx, user.id, "phone_uid", row.firebaseUid);
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return session.issue(
        tx,
        user,
        "phone_otp_password",
        proofs,
        input.remember,
      );
    });
  }
  async function register(input: {
    challengeToken: string;
    registrationToken?: string;
    name: string;
    email: string;
    password: string;
  }) {
    const phone = await challenge(input.challengeToken);
    await session.checkProofs([
      { uid: phone.firebaseUid, authTime: phone.authTime, phoneOnly: true },
    ]);
    const existingPhoneUser = await resolve(phone.firebaseUid);
    if (existingPhoneUser || await phoneOwner(phone.phone))
      reject("ACCOUNT_LINK_REQUIRED", 409, "Sign in to your existing account.");
    let row = input.registrationToken
      ? await pending(input.registrationToken)
      : null;
    if (!row) {
      // Reserve the canonical UID before external credential changes. Retry obtains a rotated capability through onboarding.
      const claims = {
        uid: phone.firebaseUid,
        auth_time: phone.authTime,
      } as DecodedIdToken;
      const state = await onboarding(claims);
      row = await pending(state.registrationToken);
      input.registrationToken = state.registrationToken;
    }
    const authority = await getIdentity(row.firebaseUid);
    if (await resolve(row.firebaseUid))
      reject("ACCOUNT_LINK_REQUIRED", 409, "Sign in to your existing account.");
    const email = input.email.toLowerCase();
    const internalEmail = await emailOwner(email);
    const emailIdentity = await db.authIdentity.findUnique({
      where: { kind_value: { kind: "email", value: email } },
    });
    if (internalEmail || emailIdentity)
      reject(
        "ACCOUNT_LINK_REQUIRED",
        409,
        "Sign in to your existing account and explicitly link this identity.",
      );
    if (authority.email && authority.email.toLowerCase() !== email)
      reject("IDENTITY_CONFLICT", 409, "Use the verified identity email.");
    const hasPassword = authority.providerData.some(
      (p) => p.providerId === "password",
    );
    const phoneAuthority =
      authority.providerData.some((p) => p.providerId === "phone") ||
      (authority.uid === phone.firebaseUid && !hasPassword);
    if (hasPassword && phoneAuthority)
      reject(
        "PHONE_AUTHORITY_CONFLICT",
        409,
        "Contact ZAWANA to separate the phone proof from the password credential before enrolling.",
      );
    let targetUid = row.firebaseUid;
    if (hasPassword) {
      const claims = await password(email, input.password);
      if (claims.uid !== row.firebaseUid)
        reject("IDENTITY_CONFLICT", 409, "Sign in to your existing account.");
    } else {
      if (row.credentialsStarted) {
        if (row.email !== email || row.phoneUid !== phone.firebaseUid)
          reject(
            "IDENTITY_CONFLICT",
            409,
            "Resume the original verified registration.",
          );
        // An external write may have succeeded before a transport failure. Resume only with password ownership; never rewrite it.
        const recovered = await password(email, input.password);
        targetUid = recovered.uid;
        if (
          (!phoneAuthority && targetUid !== row.firebaseUid) ||
          targetUid === phone.firebaseUid ||
          (await resolve(targetUid))
        )
          reject(
            "IDENTITY_CONFLICT",
            409,
            "Explicit account linking is required.",
          );
      } else {
        const lock = await db.pendingRegistration.updateMany({
          where: { id: row.id, credentialsStarted: false },
          data: {
            credentialsStarted: true,
            name: input.name,
            email,
            phone: phone.phone,
            phoneUid: phone.firebaseUid,
          },
        });
        if (!lock.count)
          reject(
            "REGISTRATION_IN_PROGRESS",
            409,
            "Retry with the password you already chose.",
          );
        if (phoneAuthority) {
          const created = await request("signUp", {
            email,
            password: input.password,
            returnSecureToken: true,
          });
          const claims = await verify(String(created.idToken));
          targetUid = claims.uid;
          if (targetUid === phone.firebaseUid || (await resolve(targetUid)))
            reject(
              "IDENTITY_CONFLICT",
              409,
              "Use an independent account credential.",
            );
        } else {
          await request("update", {
            idToken: await registrationIdentityToken(row.firebaseUid),
            email,
            password: input.password,
            returnSecureToken: true,
          });
        }
      }
    }
    await db.$transaction(async (tx) => {
      await tx.pendingRegistration.update({
        where: { id: row!.id },
        data: {
          firebaseUid: targetUid,
          name: input.name,
          email,
          phone: phone.phone,
          phoneUid: phone.firebaseUid,
          credentialsStarted: true,
          credentialsReady: true,
        },
      });
    });
    return {
      status: "onboarding",
      registrationToken: input.registrationToken,
      next: "complete",
      profile: { name: input.name, email, phone: phone.phone },
    };
  }
  async function registrationIdentityToken(uid: string) {
    if (options.credentialToken) return options.credentialToken(uid);
    // Admin custom tokens are exchanged only inside the server; never returned to a client.
    const customToken = await firebaseAdminAuth().createCustomToken(uid);
    const result = await request("signInWithCustomToken", {
      token: customToken,
      returnSecureToken: true,
    });
    return result.idToken as string;
  }
  async function resendRegistration(token: string) {
    const row = await pending(token);
    await limited("verification", row.firebaseUid, 3);
    const identity = await getIdentity(row.firebaseUid);
    if (!identity.emailVerified)
      await request("sendOobCode", {
        requestType: "VERIFY_EMAIL",
        idToken: await registrationIdentityToken(row.firebaseUid),
      });
    return { sent: true };
  }
  async function registrationStatus(token: string) {
    const row = await pending(token);
    const identity = await getIdentity(row.firebaseUid);
    return {
      emailVerified: identity.emailVerified,
      credentialsReady: row.credentialsReady,
      phone: row.phone,
      email: row.email,
    };
  }
  async function completeRegistration(input: {
    registrationToken: string;
    challengeToken: string;
    password: string;
    remember: boolean;
  }) {
    const row = await pending(input.registrationToken);
    const phone = await challenge(input.challengeToken);
    if (
      !row.credentialsReady ||
      phone.firebaseUid !== row.phoneUid ||
      phone.phone !== row.phone ||
      !row.name ||
      !row.email
    )
      reject(
        "INCOMPLETE_ENROLLMENT",
        428,
        "Complete your profile and verify the same phone.",
      );
    await limited("password", row.firebaseUid);
    const claims = await password(row.email, input.password);
    requireWebProof(claims, false);
    if (claims.uid !== row.firebaseUid)
      reject(
        "IDENTITY_CONFLICT",
        409,
        "This credential belongs to another account.",
      );
    const proofs = [
      proof(claims),
      { uid: phone.firebaseUid, authTime: phone.authTime, phoneOnly: true },
    ];
    await session.checkProofs(proofs);
    return db.$transaction(async (tx) => {
      await consume(tx, phone.id);
      const reserved = await tx.pendingRegistration.updateMany({
        where: {
          id: row.id,
          completedUserId: null,
          expiresAt: { gt: new Date() },
        },
        data: { expiresAt: new Date() },
      });
      if (!reserved.count)
        reject("REGISTRATION_EXPIRED", 401, "Sign in to your account.");
      if (
        (await resolve(row.firebaseUid, tx)) ||
        (await emailOwner(row.email, tx)) ||
        (await phoneOwner(phone.phone, tx))
      )
        reject(
          "ACCOUNT_LINK_REQUIRED",
          409,
          "Sign in to your existing account.",
        );
      const user = await tx.user.create({
        data: {
          firebaseUid: row.firebaseUid,
          name: row.name,
          email: row.email,
          emailVerified: Boolean(claims.email_verified),
          phone: row.phone,
          passwordHash: null,
          role: "member",
          lastLoginAt: new Date(),
        },
      });
      await bindClaims(tx, user, claims);
      await bind(tx, user.id, "firebase", phone.firebaseUid);
      await bind(tx, user.id, "phone", phone.phone);
      await bind(tx, user.id, "phone_uid", phone.firebaseUid);
      await tx.pendingRegistration.update({
        where: { id: row.id },
        data: { completedUserId: user.id },
      });
      return session.issue(tx, user, "registration", proofs, input.remember);
    });
  }
  async function link(input: {
    email: string;
    password: string;
    identityToken?: string;
    challengeToken?: string;
  }) {
    await limited("link", input.email);
    const accountClaims = await password(input.email, input.password);
    requireWebProof(accountClaims, false);
    requireFresh(accountClaims);
    const user = await resolve(accountClaims.uid);
    if (!user)
      reject(
        "ACCOUNT_LINK_REQUIRED",
        409,
        "Complete your existing account on the website first.",
      );
    await assertMethodAllowed(user, accountClaims);
    await assertStrongIdentity(accountClaims.uid);
    const phone = input.challengeToken
      ? await challenge(input.challengeToken)
      : null;
    const newClaims = input.identityToken
      ? await verify(input.identityToken)
      : null;
    if (!phone && !newClaims)
      reject("INVALID_INPUT", 400, "Verify the identity you want to link.");
    if (newClaims) {
      requireFresh(newClaims);
      requireProvider(newClaims, newClaims.firebase.sign_in_provider);
      await assertStrongIdentity(newClaims.uid);
    }
    const newUid = phone?.firebaseUid || newClaims!.uid;
    const owner = await resolve(newUid);
    if (owner && owner.id !== user.id)
      reject(
        "IDENTITY_CONFLICT",
        409,
        "This identity belongs to another account.",
      );
    if (phone) requireMember(user);
    await session.checkProofs([
      proof(accountClaims),
      phone
        ? { uid: phone.firebaseUid, authTime: phone.authTime, phoneOnly: true }
        : proof(newClaims!),
    ]);
    await db.$transaction(async (tx) => {
      await bindClaims(tx, user, accountClaims);
      if (phone) {
        await consume(tx, phone.id);
        await bind(tx, user.id, "firebase", phone.firebaseUid);
        await bind(tx, user.id, "phone", phone.phone);
        await bind(tx, user.id, "phone_uid", phone.firebaseUid);
        await tx.user.update({
          where: { id: user.id },
          data: { phone: phone.phone },
        });
      }
      if (newClaims) await bindClaims(tx, user, newClaims);
      await tx.authSecurityEvent.create({
        data: { userId: user.id, kind: "identity_linked" },
      });
      await tx.notification.create({
        data: {
          userId: user.id,
          title: "Sign-in method linked",
          body: "A verified sign-in method was linked to your account. Contact ZAWANA if this was not you.",
          type: "security",
        },
      });
    });
    return { linked: true };
  }
  async function webSession(token: string) {
    const claims = await verify(token);
    requireWebProof(claims);
    const user = await resolve(claims.uid);
    if (!user) reject("PROFILE_REQUIRED", 428, "Complete your member profile.");
    return completeSession(
      user,
      claims,
      "web_" + claims.firebase.sign_in_provider,
      true,
      false,
    );
  }
  async function recovery(email: string) {
    await limited("recovery", email, 3);
    // Uniform acknowledgement; provider responses and existence are never disclosed.
    try {
      const identity = await firebaseAdminAuth().getUserByEmail(email);
      if (identity.emailVerified || identity.providerData.some(p => p.providerId === "password"))
        await request("sendOobCode", { requestType: "PASSWORD_RESET", email });
    } catch {
      /* Security event contains no credentials or email. */
    }
    await db.authSecurityEvent.create({ data: { kind: "recovery_requested" } });
    return {
      message:
        "If this account can be recovered, check its verified email for a reset link.",
    };
  }
  return {
    resolve,
    emailOwner,
    accountAvailability,
    bindClaims,
    limited,
    emailLogin,
    providerLogin,
    phoneChallenge,
    phonePassword,
    register,
    resendRegistration,
    registrationStatus,
    completeRegistration,
    link,
    webSession,
    recovery,
    session,
  };
}
export const hybrid = createHybridAuth();
