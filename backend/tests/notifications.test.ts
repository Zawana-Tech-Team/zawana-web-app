import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createNotificationRouter } from '../src/routes/notifications.js';
import { createSessionService } from '../src/services/authSession.js';
import { createAuthMiddleware } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

test('notifications automatically archive viewed, expired and completed items', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-notifications-')), file = join(dir, 'test.db');
  const sqlite = new DatabaseSync(file), root = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(root).filter(n => /^\d/.test(n)).sort()) sqlite.exec(readFileSync(new URL(`${name}/migration.sql`, root), 'utf8'));
  sqlite.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  const [admin, otherAdmin, member] = await Promise.all(['admin', 'admin', 'member'].map((role, i) => db.user.create({ data: { name: `Inbox ${i}`, email: `inbox${i}@test.local`, role: role as 'admin' | 'member' } })));
  const sessions = createSessionService(db), tokens = new Map(await Promise.all([admin, otherAdmin, member].map(async u => [u.id, (await sessions.issue(db, u, 'database_password', [])).accessToken] as const)));
  const app = express(); app.use(express.json()); app.use('/notifications', createNotificationRouter(db, createAuthMiddleware(sessions))); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (u: { id: string }, path = '/notifications', body?: unknown) => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tokens.get(u.id)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const notice = (title: string, extra = {}) => db.notification.create({ data: { title, body: title, userId: admin.id, ...extra } });
  try {
    await t.test('viewed items disappear persistently for only their recipient', async () => {
      const shared = await notice('Shared view', { userId: null, audience: 'admin', read: true }), unread = await notice('Not viewed');
      assert.equal((await request(admin, '/notifications/read', { ids: [shared.id] })).status, 200);
      assert.equal((await request(admin, '/notifications/read', { ids: [shared.id] })).status, 200);
      await db.$disconnect();
      const mine = (await request(admin)).data;
      assert.equal(mine.some((n: any) => n.id === shared.id), false); assert.equal(mine.some((n: any) => n.id === unread.id), true);
      assert.equal((await request(otherAdmin)).data.some((n: any) => n.id === shared.id), true);
      assert.equal(await db.notificationRead.count({ where: { notificationId: shared.id } }), 1);
      assert.ok(await db.notification.findUnique({ where: { id: shared.id } }));
    });
    await t.test('batch read rejects unauthorized IDs atomically', async () => {
      const own = await notice('Own unread'), privateItem = await notice('Private member', { userId: member.id });
      assert.equal((await request(admin, '/notifications/read', { ids: [own.id, privateItem.id] })).status, 404);
      assert.equal(await db.notificationRead.count({ where: { notificationId: own.id } }), 0);
      assert.equal((await request(member)).data.some((n: any) => n.id === own.id), false);
    });
    await t.test('general updates expire after seven days and stay in history', async () => {
      const old = await notice('Old update', { createdAt: new Date(Date.now() - 8 * 86400000) }), fresh = await notice('Fresh update');
      const inbox = (await request(admin)).data;
      assert.equal(inbox.some((n: any) => n.id === old.id), false); assert.equal(inbox.some((n: any) => n.id === fresh.id), true);
      const history = (await request(admin, '/notifications?history=1')).data;
      assert.equal(history.find((n: any) => n.id === old.id).activeInInbox, false);
    });
    await t.test('expired reservation and resolved request/payment stages archive without being opened', async () => {
      const booking = await db.booking.create({ data: { code: 'INBOX-BOOKING', userId: member.id, kind: 'private_course', title: 'Private course', date: '2099-01-01', time: '10:00 — 11:00', location: 'Court', price: 100, status: 'PENDING_COACH_CONFIRMATION', reservationExpiresAt: new Date(Date.now() + 60000) } });
      const requestNotice = await notice('New private course request', { entityType: 'booking', entityId: booking.id });
      assert.equal((await request(admin)).data.some((n: any) => n.id === requestNotice.id), true);
      await db.booking.update({ where: { id: booking.id }, data: { status: 'AWAITING_PAYMENT', paymentExpiresAt: new Date(Date.now() + 60000) } });
      const payment = await notice('Coach confirmed your private course', { entityType: 'booking', entityId: booking.id });
      assert.equal((await request(admin)).data.some((n: any) => n.id === requestNotice.id), false);
      assert.equal((await request(admin)).data.some((n: any) => n.id === payment.id), true);
      await db.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED', paymentStatus: 'paid' } });
      assert.equal((await request(admin)).data.some((n: any) => n.id === payment.id), false);
      const expired = await notice('Reservation reminder', { entityType: 'booking', entityId: booking.id });
      await db.booking.update({ where: { id: booking.id }, data: { status: 'AWAITING_PAYMENT', paymentExpiresAt: new Date(0) } });
      assert.equal((await request(admin)).data.some((n: any) => n.id === expired.id), false);
      const done = await notice('Booking task', { entityType: 'booking', entityId: booking.id });
      await db.booking.update({ where: { id: booking.id }, data: { status: 'completed' } });
      assert.equal((await request(admin)).data.some((n: any) => n.id === done.id), false);
      assert.equal((await db.notification.findUniqueOrThrow({ where: { id: done.id } })).activeInInbox, false);
    });
    await t.test('QR expiry and revocation remove stale QR notices', async () => {
      const qr = await db.badmintonEntryQr.create({ data: { tokenHash: 'notification-test-hash', createdById: admin.id, kind: 'CATEGORY', categoryCode: 'SOCIAL', expiresAt: new Date(Date.now() + 60000) } });
      const qrNotice = await notice('QR expiring', { entityType: 'badminton-qr', entityId: qr.id });
      assert.equal((await request(admin)).data.some((n: any) => n.id === qrNotice.id), true);
      await db.badmintonEntryQr.update({ where: { id: qr.id }, data: { status: 'REVOKED', revokedAt: new Date() } });
      assert.equal((await request(admin)).data.some((n: any) => n.id === qrNotice.id), false);
    });
  } finally { await new Promise<void>(r => server.close(() => r())); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
});
