import { notifyExpiredBadmintonPackages } from '../src/services/attendanceNotifications.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createPackageSecurity, recordPackageMutation } from '../src/services/packageSecurity.js';
import { createNotificationRouter } from '../src/routes/notifications.js';
import { createAuthMiddleware } from '../src/middleware/auth.js';
import { createSessionService } from '../src/services/authSession.js';
import { asyncRoute } from '../src/utils/asyncRoute.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { env } from '../src/config/env.js';

test('package reauthentication and notification recipient security', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-package-security-')), file = join(dir, 'qa.db');
  const sqlite = new DatabaseSync(file), root = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(root).filter(n => /^\d/.test(n)).sort()) sqlite.exec(readFileSync(new URL(`${name}/migration.sql`, root), 'utf8'));
  sqlite.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  const sessions = createSessionService(db), authenticate = createAuthMiddleware(sessions);
  const passwordHash = await bcrypt.hash('correct-password', 4);
  const user = (role: 'admin' | 'badminton_fo' | 'member', extra = {}) => db.user.create({ data: { role, email: `${randomUUID()}@security.test`, name: role, passwordHash, ...extra } });
  const admin = await user('admin'), fo = await user('badminton_fo'), member = await user('member');
  const tokens = new Map(await Promise.all([admin, fo, member].map(async u => [u.id, (await sessions.issue(db, u, 'database_password', [])).accessToken] as const)));
  let providerClaims: any = null;
  const security = createPackageSecurity(db, authenticate, { password: async () => { throw new Error('invalid'); }, token: async () => providerClaims });
  const app = express(); app.use(express.json()); app.use('/package-security', security.router); app.use(security.protect);
  app.post('/packages/badminton', asyncRoute(async (req, res) => {
    res.status(201).json(await db.$transaction(async tx => {
      const row = await tx.badmintonPackage.create({ data: { title: req.body.title, price: req.body.price, sessions: 5, validity: 30, description: '' } });
      if (req.body.fail) throw Object.assign(new Error('Mutation failed'), { statusCode: 409 });
      await recordPackageMutation(tx, (req as any).user.id, 'badminton', null, row, res.locals.packageAuditId);
      return row;
    }));
  }));
  app.use('/notifications', createNotificationRouter(db, authenticate)); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (u: { id: string }, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', proof?: unknown) => {
    const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tokens.get(u.id)}`, 'Content-Type': 'application/json', ...(proof ? { 'X-Package-Verification': JSON.stringify(proof) } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  const payload = { title: 'Secured package', price: 10000 };
  const challenge = async (u = admin, body: unknown = payload, path = '/packages/badminton') => (await request(u, '/package-security/challenge', { method: 'POST', path, body })).data.id;
  const originalMode = env.databaseAuthEnabled;
  env.databaseAuthEnabled = true;
  try {
    await t.test('backend enforcement, correct password, atomic audit and relevant recipient notifications', async () => {
      assert.equal((await request(admin, '/packages/badminton', payload)).status, 403);
      assert.equal((await request(admin, '/packages/BADMINTON/', payload)).status, 403);
      const id = await challenge();
      const result = await request(admin, '/packages/badminton', payload, 'POST', { challengeId: id, password: 'correct-password' });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      const audits = await db.packageSecurityAudit.findMany({ where: { packageId: result.data.id } });
      assert.equal(audits.length, 1); assert.equal(audits[0].success, true); assert.equal(JSON.parse(audits[0].changes).after.price, 10000);
      assert.equal(audits[0].changes.includes('correct-password'), false);
      const notices = await db.notification.findMany({ where: { entityId: result.data.id } });
      assert.deepEqual(notices.map(n => n.userId).sort(), [admin.id, fo.id].sort());
    });
    await t.test('incorrect password, role denial, changed payload, unrelated path and replay rejection', async () => {
      const id = await challenge();
      assert.equal((await request(admin, '/packages/badminton', payload, 'POST', { challengeId: id, password: 'wrong' })).data.code, 'REAUTH_FAILED');
      assert.equal((await request(member, '/package-security/challenge', { method: 'POST', path: '/packages/badminton', body: payload })).status, 403);
      assert.equal((await request(member, '/packages/badminton', payload, 'POST', { challengeId: id, password: 'correct-password' })).status, 403);
      assert.equal((await request(admin, '/packages/badminton', { ...payload, price: 1 }, 'POST', { challengeId: id, password: 'correct-password' })).data.code, 'REAUTH_REQUIRED');
      const unrelated = await challenge(admin, payload, '/gym/packages');
      assert.equal((await request(admin, '/packages/badminton', payload, 'POST', { challengeId: unrelated, password: 'correct-password' })).data.code, 'REAUTH_REQUIRED');
      const proof = { challengeId: id, password: 'correct-password' };
      assert.equal((await request(admin, '/packages/badminton', payload, 'POST', proof)).status, 201);
      assert.equal((await request(admin, '/packages/badminton', payload, 'POST', proof)).data.code, 'REAUTH_REQUIRED');
    });
    await t.test('expired challenge and failed mutation retain failed audit with no catalogue or notification write', async () => {
      const expired = await challenge();
      await db.packageSecurityChallenge.update({ where: { id: expired }, data: { expiresAt: new Date(0) } });
      assert.equal((await request(admin, '/packages/badminton', payload, 'POST', { challengeId: expired, password: 'correct-password' })).data.code, 'REAUTH_REQUIRED');
      const body = { ...payload, fail: true }, id = await challenge(fo, body);
      const counts = await Promise.all([db.badmintonPackage.count(), db.notification.count()]);
      assert.equal((await request(fo, '/packages/badminton', body, 'POST', { challengeId: id, password: 'correct-password' })).status, 409);
      assert.deepEqual(await Promise.all([db.badmintonPackage.count(), db.notification.count()]), counts);
      assert.equal((await db.packageSecurityChallenge.findUniqueOrThrow({ where: { id } })).consumedAt !== null, true);
      assert.ok(await db.packageSecurityAudit.count({ where: { actorId: fo.id, success: false } }));
    });
    await t.test('passwordless proof requires same identity, fresh auth and cannot authorize another mutation', async () => {
      await db.user.update({ where: { id: fo.id }, data: { firebaseUid: 'federated-fo', passwordHash: null } });
      env.databaseAuthEnabled = false;
      const id = await challenge(fo);
      providerClaims = { uid: 'someone-else', auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'google.com' } };
      assert.equal((await request(fo, '/packages/badminton', payload, 'POST', { challengeId: id, identityToken: 'verified-by-provider' })).data.code, 'REAUTH_FAILED');
      providerClaims.uid = 'federated-fo'; providerClaims.auth_time -= 600;
      assert.equal((await request(fo, '/packages/badminton', payload, 'POST', { challengeId: id, identityToken: 'verified-by-provider' })).data.code, 'REAUTH_FAILED');
      providerClaims.auth_time = Math.floor(Date.now() / 1000);
      await db.authAbuseCounter.deleteMany({ where: { key: { startsWith: `package-reauth:${fo.id}:` } } });
      assert.equal((await request(fo, '/packages/badminton', payload, 'POST', { challengeId: id, identityToken: 'verified-by-provider' })).status, 201);
      const second = await challenge(fo, { ...payload, price: 20000 });
      assert.equal((await request(fo, '/packages/badminton', { ...payload, price: 20000 }, 'POST', { challengeId: second, identityToken: 'verified-by-provider' })).data.code, 'REAUTH_REQUIRED');
      env.databaseAuthEnabled = true;
    });
    await t.test('persistent attempt limiting and concurrent one-time consumption', async () => {
      await db.authAbuseCounter.deleteMany({ where: { key: { startsWith: `package-reauth:${admin.id}:` } } });
      const id = await challenge(), proof = { challengeId: id, password: 'correct-password' };
      const results = await Promise.all([request(admin, '/packages/badminton', payload, 'POST', proof), request(admin, '/packages/badminton', payload, 'POST', proof)]);
      assert.equal(results.filter(r => r.status === 201).length, 1);
      for (let i = 0; i < 5; i++) await request(admin, '/packages/badminton', payload, 'POST', { challengeId: await challenge(), password: 'wrong' });
      assert.equal((await request(admin, '/packages/badminton', payload, 'POST', { challengeId: await challenge(), password: 'correct-password' })).status, 429);
    });
    await t.test('package expiry sweep is idempotent and recipients remain scoped', async () => {
      const pkg = await db.badmintonPackage.findFirstOrThrow();
      const enrollment = await db.badmintonEnrollment.create({ data: { userId: member.id, studentId: member.id, studentName: member.name, phone: '', packageId: pkg.id, packageName: pkg.title, categoryCode: 'SOCIAL', sessionsTotal: 5, sessionsRemaining: 3, startDate: '2020-01-01', expiryDate: '2020-02-01' } });
      await notifyExpiredBadmintonPackages(db); await notifyExpiredBadmintonPackages(db);
      const notices = await db.notification.findMany({ where: { entityId: enrollment.id } });
      assert.equal(notices.length, 3);
      assert.deepEqual(notices.map(n => n.userId).sort(), [admin.id, fo.id, member.id].sort());
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).sessionsRemaining, 3);
    });
    await t.test('broadcast read receipts are per recipient, persistent and inaccessible to unrelated users', async () => {
      const broadcast = await db.notification.create({ data: { audience: 'admin', title: 'Admin update', body: 'Restricted' } });
      const privateNotice = await db.notification.create({ data: { userId: fo.id, title: 'FO only', body: 'Private' } });
      const another = await user('admin'); tokens.set(another.id, (await sessions.issue(db, another, 'database_password', [])).accessToken);
      assert.equal((await request(member, `/notifications/${broadcast.id}/read`, {}, 'PATCH')).status, 404);
      assert.equal((await request(admin, `/notifications/${privateNotice.id}/read`, {}, 'PATCH')).status, 404);
      assert.equal((await request(admin, '/notifications')).data.some((n: any) => n.id === privateNotice.id), false);
      assert.equal((await request(admin, `/notifications/${broadcast.id}/read`, {}, 'PATCH')).status, 200);
      await db.$disconnect();
      assert.equal((await request(admin, '/notifications?history=1')).data.find((n: any) => n.id === broadcast.id).read, true);
      assert.equal((await request(another, '/notifications')).data.find((n: any) => n.id === broadcast.id).read, false);
      assert.equal(await db.notificationRead.count({ where: { notificationId: broadcast.id } }), 1);
    });
  } finally { env.databaseAuthEnabled = originalMode; await new Promise<void>(r => server.close(() => r())); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
});
