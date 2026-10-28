import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import type { DecodedIdToken, UserRecord } from "firebase-admin/auth";
import express from "express";
import { createHybridAuth } from "../src/modules/auth/hybrid.service.js";
import { createAuthRouter } from "../src/routes/auth.js";
import { createAuthMiddleware } from "../src/middleware/auth.js";
import { credentialHash } from "../src/services/authSession.js";
import { releaseDeletedAccountEmail } from '../src/services/deletedAccount.js';
import {
  requirePhone,
  requireFresh,
} from "../src/modules/auth/hybrid.policy.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const schema = execFileSync(
  new URL("../node_modules/.bin/prisma", import.meta.url).pathname,
  [
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    new URL("../prisma/schema.prisma", import.meta.url).pathname,
    "--script",
  ],
  { encoding: "utf8" },
);
function claims(
  uid: string,
  provider = "password",
  email = `${uid}@example.test`,
  phone = "+959421234567",
) {
  return {
    uid,
    sub: uid,
    auth_time: Math.floor(Date.now() / 1000),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    email,
    email_verified: true,
    phone_number: phone,
    firebase: { sign_in_provider: provider, identities: {} },
  } as DecodedIdToken;
}
async function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "zawana-auth-"));
  const file = join(dir, "test.db");
  const sqlite = new DatabaseSync(file);
  sqlite.exec(schema);
  sqlite.close();
  const db = new PrismaClient({ datasources: { db: { url: "file:" + file } } });
  const identities = new Map<string, Mutable<UserRecord>>();
  const proofs = new Map<string, DecodedIdToken>();
  const requests: string[] = [];
  const add = (value: DecodedIdToken, enrolled = false) => {
    proofs.set(value.uid + ":" + value.firebase.sign_in_provider, value);
    if (!identities.has(value.uid))
      identities.set(value.uid, {
        uid: value.uid,
        email: value.email,
        emailVerified: value.email_verified,
        disabled: false,
        tokensValidAfterTime: "1970-01-01T00:00:00Z",
        displayName: value.uid,
        providerData:
          value.firebase.sign_in_provider === "phone"
            ? [{ providerId: "phone" }]
            : enrolled
              ? [{ providerId: "password" }]
              : [],
        multiFactor: { enrolledFactors: [] },
      } as unknown as Mutable<UserRecord>);
    return value.uid + ":" + value.firebase.sign_in_provider;
  };
  const service = createHybridAuth({
    db,
    verify: async (token) => {
      const result = proofs.get(token);
      if (!result)
        throw Object.assign(new Error("Invalid proof"), { statusCode: 401 });
      return result;
    },
    getIdentity: async (uid) => {
      const identity = identities.get(uid);
      if (!identity) throw new Error("Missing identity");
      return identity;
    },
    password: async (email, password) => {
      const result = [...proofs.values()].find(
        (p) => p.email === email && p.firebase.sign_in_provider === "password",
      );
      if (!result || password !== "Password1!")
        throw Object.assign(new Error("Wrong password"), {
          code: "INVALID_CREDENTIALS",
          statusCode: 401,
        });
      return result;
    },
    credentialToken: async (uid) => uid,
    request: async (action, input) => {
      requests.push(action);
      if (action === "signUp") {
        const fresh = claims("new-email-credential", "password", input.email as string);
        fresh.email_verified = false;
        const token = add(fresh, true);
        return { idToken: token, localId: "new-email-credential" };
      }
      if (action === "update") {
        const uid = input.idToken as string;
        const identity = identities.get(uid)!;
        identity.email = input.email as string;
        identity.providerData = [{ providerId: "password" } as any];
        const proof = claims(uid, "password", input.email as string);
        proof.email_verified = identity.emailVerified;
        proofs.set(uid + ":password", proof);
        return { idToken: uid + ":password", localId: uid };
      }
      return {};
    },
  });
  const user = await db.user.create({
    data: {
      id: "existing-user",
      firebaseUid: "account",
      name: "Member",
      email: "account@example.test",
      role: "member",
      emailVerified: true,
    },
  });
  add(claims("account"), true);
  add(claims("phone-alias", "phone", ""));
  await db.authIdentity.createMany({
    data: [
      { userId: user.id, kind: "firebase", value: "phone-alias" },
      { userId: user.id, kind: "phone_uid", value: "phone-alias" },
      { userId: user.id, kind: "phone", value: "+959421234567" },
    ],
  });
  t.after(async () => {
    await db.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });
  return { db, identities, proofs, add, service, user, requests };
}

test('email release preserves deleted identity ownership and permits a separate fresh account', async t => {
  const f = await fixture(t);
  await assert.rejects(releaseDeletedAccountEmail(f.db, f.user.id, f.user.name), { statusCode: 409 });
  await f.service.webSession('account:password');
  await f.db.user.update({ where: { id: f.user.id }, data: { active: false, deletedAt: new Date() } });
  await f.db.notification.create({ data: { userId: f.user.id, title: 'Historical record', body: 'Retained', type: 'info' } });
  await assert.rejects(releaseDeletedAccountEmail(f.db, f.user.id, 'wrong name'), { statusCode: 400 });
  assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: f.user.id } })).email, f.user.email);
  await releaseDeletedAccountEmail(f.db, f.user.id, f.user.name);
  await releaseDeletedAccountEmail(f.db, f.user.id, f.user.name); // Safe to retry.
  const archived = await f.db.user.findUniqueOrThrow({ where: { id: f.user.id } });
  assert.equal(archived.active, false);
  assert.ok(archived.deletedAt);
  assert.equal(archived.firebaseUid, f.user.firebaseUid);
  assert.equal(await f.db.notification.count({ where: { userId: f.user.id } }), 1);
  assert.equal(await f.db.authSession.count({ where: { userId: f.user.id, revokedAt: null } }), 0);
  const fresh = await f.db.user.create({ data: { name: 'Fresh member', email: f.user.email, firebaseUid: 'fresh-google', role: 'member', emailVerified: true } });
  const token = f.add(claims('fresh-google', 'google.com', f.user.email));
  const session = await f.service.webSession(token);
  assert.equal(session.user.id, fresh.id);
  assert.notEqual(session.user.id, f.user.id);
  assert.equal(await f.db.notification.count({ where: { userId: fresh.id } }), 0);
  assert.equal((await f.db.authIdentity.findUniqueOrThrow({ where: { kind_value: { kind: 'email', value: f.user.email } } })).userId, fresh.id);
  await assert.rejects(f.service.webSession('account:password'), { code: 'ACCOUNT_UNAVAILABLE' });
});

test("phone proof requires fresh primary phone authentication and Myanmar E.164", () => {
  assert.throws(() => requirePhone(claims("a", "google.com")), {
    code: "INVALID_PHONE_PROOF",
  });
  const stale = claims("a", "phone");
  stale.auth_time -= 301;
  assert.throws(() => requirePhone(stale), { code: "PROOF_EXPIRED" });
  assert.throws(
    () => requirePhone(claims("a", "phone", "a@example.test", "09421234567")),
    { code: "INVALID_PHONE_PROOF" },
  );
  const future = claims("a");
  future.auth_time += 60;
  assert.throws(() => requireFresh(future), { code: "PROOF_EXPIRED" });
});

test("email, Google, Apple, and explicitly linked phone resolve one preserved User ID", async (t) => {
  const f = await fixture(t);
  const email = await f.service.emailLogin({
    email: f.user.email,
    password: "Password1!",
    remember: true,
  });
  assert.equal("user" in email && email.user.id, f.user.id);
  for (const provider of ["google.com", "apple.com"]) {
    const token = f.add(claims("account", provider));
    const result = await f.service.providerLogin(token, provider);
    assert.equal("user" in result && result.user.id, f.user.id);
  }
  const phoneToken = f.add(claims("phone-alias", "phone", ""));
  const challenge = await f.service.phoneChallenge(phoneToken, "link");
  await f.service.link({
    email: f.user.email,
    password: "Password1!",
    challengeToken: challenge.challengeToken,
  });
  const next = claims("phone-alias", "phone", "");
  next.auth_time += 1;
  const phoneChallenge = await f.service.phoneChallenge(f.add(next), "signin");
  const result = await f.service.phoneLogin({
    challengeToken: phoneChallenge.challengeToken,
    remember: true,
  });
  assert.equal(result.user.id, f.user.id);
  assert.equal(await f.db.user.count(), 1);
  assert.equal(
    (await f.service.session.authenticate(result.accessToken)).method,
    "phone_otp",
  );
});

test("phone token, password alone, and challenge capability cannot access a business API", async (t) => {
  const f = await fixture(t);
  const token = f.add(claims("phone-alias", "phone", ""));
  await assert.rejects(f.service.webSession(token), {
    code: "PASSWORD_REQUIRED",
  });
  const challenge = await f.service.phoneChallenge(token, "signin");
  await assert.rejects(f.service.session.authenticate(token), {
    code: "SESSION_REVOKED",
  });
  await assert.rejects(
    f.service.session.authenticate(challenge.challengeToken),
    { code: "SESSION_REVOKED" },
  );
  await assert.rejects(
    f.service.phoneLogin({
      challengeToken: "not-a-proof",
      remember: true,
    }),
    { code: "CHALLENGE_EXPIRED" },
  );
  assert.equal(await f.db.authSession.count(), 0);
});

test("email password failures never consume or gate an independently verified phone sign-in", async (t) => {
  const f = await fixture(t);
  const phone = await f.service.phoneChallenge("phone-alias:phone", "signin");
  assert.equal(phone.next, "session");
  for (let i = 0; i < 5; i++)
    await assert.rejects(f.service.emailLogin({ email: f.user.email, password: "wrong", remember: true }), { code: "INVALID_CREDENTIALS" });
  assert.equal(await f.db.authSession.count(), 0);
  const login = await f.service.phoneLogin({ challengeToken: phone.challengeToken, remember: true });
  assert.equal(login.user.id, f.user.id);
});

test("successful phone authentication consumes proof and prevents replay", async (t) => {
  const f = await fixture(t);
  const token = f.add(claims("phone-alias", "phone", ""));
  const proof = await f.service.phoneChallenge(token, "signin");
  await f.service.phoneLogin({
    challengeToken: proof.challengeToken,
    remember: true,
  });
  await assert.rejects(
    f.service.phoneLogin({
      challengeToken: proof.challengeToken,
      remember: true,
    }),
    { code: "CHALLENGE_CONSUMED" },
  );
  await assert.rejects(f.service.phoneChallenge(token, "signin"), {
    code: "PROOF_REPLAY",
  });
});

test("provider spoofing, inactive users, and staff mobile access are denied", async (t) => {
  const f = await fixture(t);
  const token = f.add(claims("account", "google.com"));
  await assert.rejects(f.service.providerLogin(token, "apple.com"), {
    code: "INVALID_PROVIDER",
  });
  await f.db.user.update({ where: { id: f.user.id }, data: { role: "admin" } });
  await assert.rejects(
    f.service.emailLogin({
      email: f.user.email,
      password: "Password1!",
      remember: true,
    }),
    { code: "MOBILE_ROLE_UNSUPPORTED" },
  );
  const web = await f.service.webSession("account:password");
  assert.equal(web.user.role, "admin");
  await f.db.user.update({ where: { id: f.user.id }, data: { active: false } });
  await assert.rejects(f.service.webSession("account:password"), {
    code: "ACCOUNT_UNAVAILABLE",
  });
  await f.db.user.update({
    where: { id: f.user.id },
    data: { active: true, role: "member" },
  });
  f.proofs.get("account:password")!.email_verified = false;
  const unverified = await f.service.emailLogin({ email: f.user.email, password: "Password1!", remember: true });
  assert("user" in unverified);
  assert.equal(unverified.user.id, f.user.id);
  await assert.rejects(f.service.webSession("account:password"), { code: "EMAIL_VERIFICATION_REQUIRED" });

});

test("matching email does not merge Google or Apple into an existing account", async (t) => {
  const f = await fixture(t);
  const token = f.add(claims("unlinked-google", "google.com", f.user.email));
  await assert.rejects(f.service.providerLogin(token, "google.com"), {
    code: "ACCOUNT_LINK_REQUIRED",
  });
  assert.equal(await f.db.user.count(), 1);
  await f.service.link({
    email: f.user.email,
    password: "Password1!",
    identityToken: token,
  });
  const result = await f.service.providerLogin(token, "google.com");
  assert.equal("user" in result && result.user.id, f.user.id);
});

test("an identity already linked to another User cannot be merged", async (t) => {
  const f = await fixture(t);
  await f.db.user.create({
    data: {
      id: "other",
      firebaseUid: "other-uid",
      name: "Other",
      email: "other@example.test",
    },
  });
  const token = f.add(claims("other-uid", "apple.com", "other@example.test"));
  await assert.rejects(
    f.service.link({
      email: f.user.email,
      password: "Password1!",
      identityToken: token,
    }),
    { code: "IDENTITY_CONFLICT" },
  );
  assert.equal(await f.db.user.count(), 2);
});

test("social onboarding requires profile, phone and password, without an email verification step", async (t) => {
  const f = await fixture(t);
  const socialToken = f.add(
    claims("new-apple", "apple.com", "relay@privaterelay.appleid.com"),
  );
  const onboarding = await f.service.providerLogin(socialToken, "apple.com");
  assert("registrationToken" in onboarding);
  assert.equal(await f.db.user.count(), 1);
  assert.equal(await f.db.authSession.count(), 0);
  const phoneToken = f.add(claims("new-phone", "phone", "", "+959421234568"));
  const proof = await f.service.phoneChallenge(phoneToken, "signup");
  await assert.rejects(
    f.service.completeRegistration({
      registrationToken: onboarding.registrationToken,
      challengeToken: proof.challengeToken,
      password: "Password1!",
      remember: true,
    }),
    { code: "INCOMPLETE_ENROLLMENT" },
  );
  const registration = await f.service.register({
    registrationToken: onboarding.registrationToken,
    challengeToken: proof.challengeToken,
    name: "New Member",
    email: "relay@privaterelay.appleid.com",
    password: "Password1!",
  });
  f.proofs.get("new-apple:password")!.email_verified = false;
  assert.equal(registration.next, "complete");
  const result = await f.service.completeRegistration({
    registrationToken: registration.registrationToken!,
    challengeToken: proof.challengeToken,
    password: "Password1!",
    remember: true,
  });
  assert.equal(result.user.email, "relay@privaterelay.appleid.com");
  assert.equal((await f.db.user.findUniqueOrThrow({ where: { id: result.user.id } })).emailVerified, false);
  assert.equal(await f.db.user.count(), 2);
  assert.equal(
    (await f.db.user.findUniqueOrThrow({ where: { id: result.user.id } }))
      .passwordHash,
    null,
  );
  assert.equal((await f.service.resolve("new-phone"))?.id, result.user.id);
  assert.equal((await f.service.resolve("new-apple"))?.id, result.user.id);
});

test("refresh rotation revokes replayed families and keeps credentials hashed", async (t) => {
  const f = await fixture(t);
  const login = await f.service.emailLogin({
    email: f.user.email,
    password: "Password1!",
    remember: false,
  });
  assert("accessToken" in login);
  const row = await f.db.authSession.findFirstOrThrow();
  assert.equal(row.accessHash, credentialHash(login.accessToken));
  assert.notEqual(row.accessHash, login.accessToken);
  assert(row.expiresAt.getTime() - Date.now() <= 12 * 3600_000);
  const rotated = await f.service.session.refresh(login.refreshToken);
  await assert.rejects(f.service.session.authenticate(login.accessToken), {
    code: "SESSION_REVOKED",
  });
  await f.service.session.authenticate(rotated.accessToken);
  await assert.rejects(f.service.session.refresh(login.refreshToken), {
    code: "SESSION_REVOKED",
  });
  await assert.rejects(f.service.session.authenticate(rotated.accessToken), {
    code: "SESSION_REVOKED",
  });
});

test("Firebase revocation, expiry, and account disablement invalidate existing sessions", async (t) => {
  const f = await fixture(t);
  const login = await f.service.webSession("account:password");
  const identity = f.identities.get("account")!;
  identity.tokensValidAfterTime = new Date(Date.now() + 60_000).toISOString();
  await assert.rejects(f.service.session.authenticate(login.accessToken), {
    code: "SESSION_REVOKED",
  });
  identity.tokensValidAfterTime = "1970-01-01T00:00:00Z";
  identity.disabled = true;
  await assert.rejects(f.service.session.refresh(login.refreshToken), {
    code: "SESSION_REVOKED",
  });
  identity.disabled = false;
  await f.db.authSession.updateMany({ data: { accessExpiresAt: new Date(0) } });
  await assert.rejects(f.service.session.authenticate(login.accessToken), {
    code: "SESSION_REVOKED",
  });
});

test("HTTP session exchange, protected API, origin checks, and logout enforce the complete boundary", async (t) => {
  const f = await fixture(t);
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(f.service, f.service.session, f.db));
  app.get(
    "/api/protected",
    createAuthMiddleware(f.service.session),
    (req, res) => res.json({ ok: true }),
  );
  app.use((err: any, _req: any, res: any, _next: any) =>
    res
      .status(err.statusCode || 500)
      .json({ code: err.code, message: err.message }),
  );
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const phone = f.add(claims("phone-alias", "phone", ""));
  const check = await fetch(base + "/api/auth/mobile/account-check", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ACCOUNT@EXAMPLE.TEST", phone: "+959421234567" }),
  });
  assert.equal(check.status, 200);
  assert.equal(check.headers.get("cache-control"), "no-store");
  assert.deepEqual(await check.json(), { emailExists: true, phoneExists: true });
  assert.equal(await f.db.authSession.count(), 0);
  let response = await fetch(base + "/api/auth/session", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + phone,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(response.status, 403);
  response = await fetch(base + "/api/auth/mobile/email-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: f.user.email,
      password: "Password1!",
      remember: true,
    }),
  });
  assert.equal(response.status, 200);
  const login = (await response.json()) as any;
  response = await fetch(base + "/api/protected", {
    headers: { Authorization: "Bearer " + login.accessToken },
  });
  assert.equal(response.status, 200);
  response = await fetch(base + "/api/auth/refresh", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken: login.refreshToken }),
  });
  assert.equal(response.status, 403);
  response = await fetch(base + "/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: login.refreshToken }),
  });
  assert.equal(response.status, 200);
  response = await fetch(base + "/api/protected", {
    headers: { Authorization: "Bearer " + login.accessToken },
  });
  assert.equal(response.status, 401);
});

test("new phone registration keeps OTP and password in separate Firebase identities for one User", async (t) => {
  const f = await fixture(t);
  const token = f.add(claims("phone-only", "phone", "", "+959421234569"));
  const proof = await f.service.phoneChallenge(token, "signup");
  const registered = await f.service.register({
    challengeToken: proof.challengeToken,
    name: "New Phone Member",
    email: "new-phone@example.test",
    password: "Password1!",
  });
  const row = await f.db.pendingRegistration.findFirstOrThrow({
    where: { phoneUid: "phone-only" },
  });
  assert.equal(registered.next, "complete");
  assert.equal(f.requests.includes("sendOobCode"), false);
  assert.equal(row.firebaseUid, "new-email-credential");
  assert.notEqual(row.firebaseUid, row.phoneUid);
  const full = await f.service.completeRegistration({
    registrationToken: registered.registrationToken!,
    challengeToken: proof.challengeToken,
    password: "Password1!",
    remember: true,
  });
  assert.equal((await f.service.resolve("phone-only"))?.id, full.user.id);
  assert.equal(
    (await f.service.resolve("new-email-credential"))?.id,
    full.user.id,
  );
  assert.equal(
    f.identities
      .get("phone-only")
      ?.providerData.some((p) => p.providerId === "password"),
    false,
  );
});

test("concurrent registration completion creates one User and one authorized session", async (t) => {
  const f = await fixture(t);
  const token = f.add(
    claims("new-social", "google.com", "new-social@example.test"),
  );
  const start = await f.service.providerLogin(token, "google.com");
  assert("registrationToken" in start);
  const phone = await f.service.phoneChallenge(
    f.add(claims("fresh-phone", "phone", "", "+959421234570")),
    "signup",
  );
  const registration = await f.service.register({
    registrationToken: start.registrationToken,
    challengeToken: phone.challengeToken,
    name: "New",
    email: "new-social@example.test",
    password: "Password1!",
  });
  const input = {
    registrationToken: registration.registrationToken!,
    challengeToken: phone.challengeToken,
    password: "Password1!",
    remember: true,
  };
  const results = await Promise.allSettled([
    f.service.completeRegistration(input),
    f.service.completeRegistration(input),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await f.db.user.count(), 2);
  assert.equal(await f.db.authSession.count(), 1);
});

test("phone OTP sign-in does not require a separate canonical password identity", async (t) => {
  const f = await fixture(t);
  const identity = f.identities.get("account")!;
  identity.providerData.push({ providerId: "phone" } as any);
  const phone = await f.service.phoneChallenge(
    f.add(claims("phone-alias", "phone", "")),
    "signin",
  );
  const login = await f.service.phoneLogin({
    challengeToken: phone.challengeToken,
    remember: true,
  });
  assert.equal(login.user.id, f.user.id);
  const session = await f.service.session.authenticate(login.accessToken);
  assert.equal(session.method, "phone_otp");
  assert.equal(JSON.parse(session.proofs)[1].accountOnly, true);
});

test("adding a password or social provider to a phone alias cannot bypass the canonical password", async (t) => {
  const f = await fixture(t);
  const phone = f.add(claims("phone-alias", "phone", ""));
  const challenge = await f.service.phoneChallenge(phone, "link");
  await f.service.link({
    email: f.user.email,
    password: "Password1!",
    challengeToken: challenge.challengeToken,
  });
  f.add(claims("phone-alias", "password", "attacker@example.test"));
  await assert.rejects(
    f.service.emailLogin({
      email: "attacker@example.test",
      password: "Password1!",
      remember: true,
    }),
    { code: "INVALID_CREDENTIALS" },
  );
  const social = f.add(
    claims("phone-alias", "google.com", "attacker@example.test"),
  );
  await assert.rejects(f.service.providerLogin(social, "google.com"), {
    code: "ACCOUNT_LINK_REQUIRED",
  });
  f.identities.get("phone-alias")!.providerData = [];
  await assert.rejects(
    f.service.link({
      email: "attacker@example.test",
      password: "Password1!",
      identityToken: social,
    }),
    { code: "INVALID_CREDENTIALS" },
  );
  await assert.rejects(
    f.service.link({
      email: f.user.email,
      password: "Password1!",
      identityToken: social,
    }),
    { code: "PHONE_AUTHORITY_CONFLICT" },
  );
  assert.equal(await f.db.authSession.count(), 0);
});

test("password reset revokes sessions established through a separately linked Google identity", async (t) => {
  const f = await fixture(t);
  const social = f.add(
    claims("social-alias", "google.com", "other-google@example.test"),
  );
  await f.service.link({
    email: f.user.email,
    password: "Password1!",
    identityToken: social,
  });
  const login = await f.service.providerLogin(social, "google.com");
  assert("accessToken" in login);
  f.identities.get("account")!.tokensValidAfterTime = new Date(
    Date.now() + 60_000,
  ).toISOString();
  await assert.rejects(f.service.session.authenticate(login.accessToken), {
    code: "SESSION_REVOKED",
  });
  await assert.rejects(f.service.providerLogin(social, "google.com"), {
    code: "SESSION_REVOKED",
  });
});

test("canonical MFA cannot be bypassed using a separately linked social identity", async (t) => {
  const f = await fixture(t);
  const social = f.add(
    claims("social-alias", "apple.com", "relay@privaterelay.appleid.com"),
  );
  await f.service.link({
    email: f.user.email,
    password: "Password1!",
    identityToken: social,
  });
  f.identities
    .get("account")!
    .multiFactor!.enrolledFactors.push({ uid: "factor" } as any);
  await assert.rejects(f.service.providerLogin(social, "apple.com"), {
    code: "MFA_REQUIRED",
  });
});

test("a member mobile session cannot inherit staff API privileges after a role change", async (t) => {
  const f = await fixture(t);
  const login = await f.service.emailLogin({
    email: f.user.email,
    password: "Password1!",
    remember: true,
  });
  assert("accessToken" in login);
  await f.db.user.update({ where: { id: f.user.id }, data: { role: "admin" } });
  await assert.rejects(f.service.session.authenticate(login.accessToken), {
    code: "MOBILE_ROLE_UNSUPPORTED",
  });
  const web = await f.service.webSession("account:password");
  assert.equal(
    (await f.service.session.authenticate(web.accessToken)).user.role,
    "admin",
  );
});

test("new MFA enrollment invalidates sessions missing a second-factor proof", async (t) => {
  const f = await fixture(t);
  const login = await f.service.emailLogin({
    email: f.user.email,
    password: "Password1!",
    remember: true,
  });
  assert("accessToken" in login);
  f.identities
    .get("account")!
    .multiFactor!.enrolledFactors.push({ uid: "factor" } as any);
  await assert.rejects(f.service.session.authenticate(login.accessToken), {
    code: "MFA_REQUIRED",
  });
  await assert.rejects(f.service.session.refresh(login.refreshToken), {
    code: "MFA_REQUIRED",
  });
  const verified = claims("account");
  verified.firebase.sign_in_second_factor = "phone";
  const token = f.add(verified, true);
  const web = await f.service.webSession(token);
  assert.equal(web.security.mfaEnrolled, true);
  assert.equal(
    (await f.service.session.refresh(web.refreshToken)).security.mfaEnrolled,
    true,
  );
});


test("account checks detect registered emails, linked phones and legacy formatted phones without authorizing them", async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.service.accountAvailability({ email: "ACCOUNT@EXAMPLE.TEST", phone: "+959421234567" }), { emailExists: true, phoneExists: true });
  assert.deepEqual(await f.service.accountAvailability({ email: "new@example.test", phone: "+959421234568" }), { emailExists: false, phoneExists: false });
  await f.db.user.update({ where: { id: f.user.id }, data: { phone: "09 421 234 568" } });
  assert.deepEqual(await f.service.accountAvailability({ phone: "+959421234568" }), { phoneExists: true });
  const phone = await f.service.phoneChallenge(f.add(claims("unlinked-phone", "phone", "", "+959421234568")), "signup");
  assert.equal(phone.next, "link-account");
  await assert.rejects(f.service.register({ challengeToken: phone.challengeToken, name: "Duplicate", email: "new@example.test", password: "Password1!" }), { code: "ACCOUNT_LINK_REQUIRED" });
  assert.equal(await f.db.user.count(), 1);
  assert.equal(await f.db.authSession.count(), 0);
});

test("phone OTP sign-in works independently of email verification or password availability", async t => {
  const f = await fixture(t);
  f.identities.get("account")!.emailVerified = false;
  f.proofs.delete("account:password");
  const phone = await f.service.phoneChallenge("phone-alias:phone", "signin");
  assert.equal(phone.next, "session");
  const session = await f.service.phoneLogin({ challengeToken: phone.challengeToken, remember: true });
  assert.equal(session.user.id, f.user.id);
});

test("phone OTP signs in the enrolled member without a password and consumes the proof once", async t => {
  const f = await fixture(t);
  // Password verification cannot succeed; OTP sign-in must work independently.
  f.proofs.delete("account:password");
  const challenge = await f.service.phoneChallenge("phone-alias:phone", "signin");
  const input = { challengeToken: challenge.challengeToken, remember: false };
  const login = await f.service.phoneLogin(input);
  assert.equal(login.user.id, f.user.id);
  const session = await f.service.session.authenticate(login.accessToken);
  assert.equal(session.method, "phone_otp");
  assert.deepEqual(JSON.parse(session.proofs).map((p: any) => p.uid), ["phone-alias", "account"]);
  assert.ok(Date.parse(login.sessionExpiresAt) - Date.now() <= 12 * 3600_000);
  assert.equal((await f.service.session.refresh(login.refreshToken)).user.id, f.user.id);
  await assert.rejects(f.service.phoneLogin(input), { code: "CHALLENGE_CONSUMED" });
  await assert.rejects(f.service.phoneChallenge("phone-alias:phone", "signin"), { code: "PROOF_REPLAY" });
  assert.equal(await f.db.authSession.count(), 1);
});

test("phone OTP sessions retain canonical revocation, MFA, and mobile role restrictions", async t => {
  for (const scenario of ["canonical-revocation", "canonical-mfa", "phone-disabled", "phone-mfa", "staff", "inactive"] as const) {
    await t.test(scenario, async t => {
      const f = await fixture(t);
      const challenge = await f.service.phoneChallenge("phone-alias:phone", "signin");
      const input = { challengeToken: challenge.challengeToken, remember: true };
      const login = await f.service.phoneLogin(input);
      let code: string;
      if (scenario === "canonical-revocation") {
        f.identities.get("account")!.tokensValidAfterTime = new Date(Date.now() + 60_000).toISOString();
        code = "SESSION_REVOKED";
      } else if (scenario === "canonical-mfa" || scenario === "phone-mfa") {
        f.identities.get(scenario === "canonical-mfa" ? "account" : "phone-alias")!.multiFactor!.enrolledFactors.push({ uid: "factor" } as any);
        code = "MFA_REQUIRED";
      } else if (scenario === "phone-disabled") {
        f.identities.get("phone-alias")!.disabled = true;
        code = "SESSION_REVOKED";
      } else {
        await f.db.user.update({ where: { id: f.user.id }, data: scenario === "staff" ? { role: "admin" } : { active: false } });
        code = scenario === "staff" ? "MOBILE_ROLE_UNSUPPORTED" : "SESSION_REVOKED";
      }
      await assert.rejects(f.service.session.authenticate(login.accessToken), { code });
      await assert.rejects(f.service.session.refresh(login.refreshToken), { code });
      const fresh = claims("phone-alias", "phone", "");
      fresh.auth_time += 1;
      const token = f.add(fresh);
      if (scenario === "staff" || scenario === "inactive") {
        await assert.rejects(f.service.phoneChallenge(token, "signin"), { code: scenario === "staff" ? code : "ACCOUNT_UNAVAILABLE" });
      } else {
        const next = await f.service.phoneChallenge(token, "signin");
        await assert.rejects(f.service.phoneLogin({ ...input, challengeToken: next.challengeToken }), { code });
      }
      assert.equal(await f.db.authSession.count(), 1);
    });
  }
});

test("phone session exchange rejects expired, unlinked, mismatched, and non-signin challenges", async t => {
  for (const scenario of ["expired", "unlinked", "mismatched", "signup", "link"] as const) {
    await t.test(scenario, async t => {
      const f = await fixture(t);
      const challenge = await f.service.phoneChallenge("phone-alias:phone", scenario === "signup" || scenario === "link" ? scenario : "signin");
      let code = "PHONE_ACCOUNT_CONFLICT";
      if (scenario === "expired") {
        await f.db.authChallenge.updateMany({ data: { expiresAt: new Date(0) } });
        code = "CHALLENGE_EXPIRED";
      } else if (scenario === "unlinked") {
        await f.db.authIdentity.deleteMany({ where: { OR: [{ kind: "firebase", value: "phone-alias" }, { kind: "phone", value: "+959421234567" }] } });
        code = "ACCOUNT_NOT_FOUND";
      } else if (scenario === "mismatched") {
        const other = await f.db.user.create({ data: { name: "Other", email: "other@example.test" } });
        await f.db.authIdentity.updateMany({ where: { kind: "phone", value: "+959421234567" }, data: { userId: other.id } });
      } else {
        code = "INVALID_PHONE_PROOF";
      }
      await assert.rejects(f.service.phoneLogin({ challengeToken: challenge.challengeToken, remember: true }), { code });
      assert.equal(await f.db.authSession.count(), 0);
    });
  }
});

test("HTTP phone OTP exchange authorizes the protected API without a password; email still requires one", async t => {
  const f = await fixture(t);
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(f.service, f.service.session, f.db));
  app.get("/api/protected", createAuthMiddleware(f.service.session), (_req, res) => res.json({ ok: true }));
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (path: string, body: unknown, token?: string) => fetch(base + "/api/auth" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(body),
  });
  assert.equal((await post("/mobile/email-login", { email: f.user.email })).status, 400);
  assert.equal((await post("/mobile/email-login", { email: f.user.email, password: "wrong" })).status, 401);
  const proof = await post("/mobile/challenge", { intent: "signin" }, "phone-alias:phone");
  assert.equal(proof.status, 200);
  const { challengeToken, next } = await proof.json() as { challengeToken: string; next: string };
  assert.equal(next, "session");
  assert.equal((await post("/mobile/password", { challengeToken, password: "anything" })).status, 404);
  assert.equal((await post("/mobile/phone-login", {})).status, 400);
  assert.equal((await post("/mobile/phone-login", { challengeToken, password: "unneeded" })).status, 400);
  const response = await post("/mobile/phone-login", { challengeToken });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const login = await response.json() as { accessToken: string; user: { id: string } };
  assert.equal(login.user.id, f.user.id);
  const protectedResponse = await fetch(base + "/api/protected", { headers: { Authorization: "Bearer " + login.accessToken } });
  assert.equal(protectedResponse.status, 200);
  assert.equal((await post("/mobile/phone-login", { challengeToken })).status, 401);
});

test("a unique registered contact number signs in through OTP without a prior identity-linking or password step", async t => {
  const f = await fixture(t);
  await f.db.user.update({ where: { id: f.user.id }, data: { phone: "09 421 234 568" } });
  const token = f.add(claims("legacy-contact-phone", "phone", "", "+959421234568"));
  const challenge = await f.service.phoneChallenge(token, "signin");
  assert.equal(challenge.next, "session");
  assert.equal(await f.service.resolve("legacy-contact-phone"), null);
  assert.equal(await f.db.authSession.count(), 0);
  const login = await f.service.phoneLogin({ challengeToken: challenge.challengeToken, remember: true });
  assert.equal(login.user.id, f.user.id);
  assert.equal((await f.service.resolve("legacy-contact-phone"))?.id, f.user.id);
  assert.equal((await f.db.authIdentity.findUnique({ where: { kind_value: { kind: "phone", value: "+959421234568" } } }))?.userId, f.user.id);
  assert.equal((await f.service.session.authenticate(login.accessToken)).method, "phone_otp");
  assert.equal(await f.db.user.count(), 1);
  // Enrolling the phone preserves the independent email/password method.
  const email = await f.service.emailLogin({ email: f.user.email, password: "Password1!", remember: true });
  assert("user" in email);
  assert.equal(email.user.id, f.user.id);
});

test("OTP sign-in refuses ambiguous phone records and UID conflicts without creating accounts or merging users", async t => {
  for (const scenario of ["duplicate-contact", "different-uid-owner", "unknown-number"] as const) {
    await t.test(scenario, async t => {
      const f = await fixture(t);
      let uid = "unlinked-phone";
      if (scenario !== "unknown-number") {
        await f.db.user.update({ where: { id: f.user.id }, data: { phone: "09 421 234 568" } });
        const other = await f.db.user.create({ data: { name: "Other", email: "other@example.test", phone: scenario === "duplicate-contact" ? "+95 (9) 421-234-568" : null } });
        if (scenario === "different-uid-owner") {
          uid = "other-phone";
          await f.db.authIdentity.create({ data: { userId: other.id, kind: "firebase", value: uid } });
        }
      }
      const count = await f.db.user.count();
      const token = f.add(claims(uid, "phone", "", "+959421234568"));
      await assert.rejects(f.service.phoneChallenge(token, "signin"), { code: scenario === "unknown-number" ? "ACCOUNT_NOT_FOUND" : "PHONE_ACCOUNT_CONFLICT" });
      assert.equal(await f.db.authSession.count(), 0);
      assert.equal(await f.db.authChallenge.count(), 0);
      assert.equal(await f.db.user.count(), count);
    });
  }
});

test("concurrent OTP session exchanges consume one proof and issue one session", async t => {
  const f = await fixture(t);
  const proof = await f.service.phoneChallenge("phone-alias:phone", "signin");
  const input = { challengeToken: proof.challengeToken, remember: true };
  const results = await Promise.allSettled([f.service.phoneLogin(input), f.service.phoneLogin(input)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(await f.db.authSession.count(), 1);
});
