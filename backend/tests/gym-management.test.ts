import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID, createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import { createSessionService } from '../src/services/authSession.js';
import { seedGymCatalog } from '../src/services/gymPackages.js';
import { today } from '../src/services/gymPolicy.js';
import { addDateKeyDays } from '../src/utils/dateKeys.js';

const prismaBin = new URL('../node_modules/.bin/prisma', import.meta.url).pathname;
const root = new URL('..', import.meta.url);
const migrationRoot = new URL('../prisma/migrations/', import.meta.url);
const gymMigration = '20261015120000_gym_management';

test('additive gym migration preserves existing membership, attendance, package prices and sessions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-gym-upgrade-')), file = join(dir, 'test.db');
  const sqlite = new DatabaseSync(file);
  try {
    for (const name of readdirSync(migrationRoot).filter(n => n !== gymMigration && /^\d/.test(n)).sort())
      sqlite.exec(readFileSync(new URL(`${name}/migration.sql`, migrationRoot), 'utf8'));
    sqlite.exec(`INSERT INTO "User" (id,name,email,role) VALUES ('qa','QA','qa@upgrade.test','member');
      INSERT INTO "Coach" (id,name,email,specialty,phone,department) VALUES ('coach','Coach','coach@upgrade.test','Gym','','Gym');
      INSERT INTO "GymPackage" (id,title,price,duration,sessions,description,benefits,status) VALUES ('old-pkg','Admin custom price',123456,90,12,'Keep me','[]','active');
      INSERT INTO "Membership" (id,customerId,userId,customer,phone,packageId,package,startDate,expiryDate,status,sessionsTotal,sessionsRemaining) VALUES ('old-m','qa','qa','QA','','old-pkg','Original','2026-01-01','2027-01-01','active',12,9);
      INSERT INTO "GymCheckIn" (id,membershipId,date,time) VALUES ('visit','old-m','2026-01-01','08:00');
      INSERT INTO "PrivateTrainingSession" (id,memberId,coachId,date,startTime,endTime,createdById,updatedAt) VALUES ('old-session','qa','coach','2026-10-20','10:00','11:00','qa',CURRENT_TIMESTAMP);`);
    sqlite.exec(readFileSync(new URL(`${gymMigration}/migration.sql`, migrationRoot), 'utf8'));
    assert.equal((sqlite.prepare('SELECT price FROM "GymPackage" WHERE id=?').get('old-pkg') as any).price, 123456);
    const membership = sqlite.prepare('SELECT * FROM "Membership" WHERE id=?').get('old-m') as any;
    assert.equal(membership.sessionsRemaining, 9); assert.equal(membership.accessMode, 'sessions');
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM "GymCheckIn"').get() as any).n, 1);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM "PrivateTrainingSession"').get() as any).n, 1);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { sqlite.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('real gym HTTP lifecycle, payment verification, shared deduction and authorization', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-gym-http-')), file = join(dir, 'test.db');
  writeFileSync(file, '');
  execFileSync(prismaBin, ['migrate', 'deploy'], { cwd: root, env: { ...process.env, DATABASE_URL: `file:${file}` }, stdio: 'pipe' });
  const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  const adapter = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ providerReference: `provider-${input.reference}`, checkoutUrl: `https://checkout.example.test/${input.reference}` }));
  });
  await new Promise<void>(resolve => adapter.listen(0, '127.0.0.1', resolve));
  const adapterPort = (adapter.address() as { port: number }).port;
  await seedGymCatalog(db);
  assert.equal(await db.gymPackage.count(), 19);
  await db.gymPackage.update({ where: { id: 'gym-initial-pt-5' }, data: { price: 161000 } });
  await seedGymCatalog(db);
  assert.equal((await db.gymPackage.findUniqueOrThrow({ where: { id: 'gym-initial-pt-5' } })).price, 161000);
  const admin = await db.user.create({ data: { name: 'Gym Admin', email: 'admin@gym.test', role: 'admin' } });
  const desk = await db.user.create({ data: { name: 'Gym Desk', email: 'desk@gym.test', role: 'gym_fo' } });
  const coachUser = await db.user.create({ data: { name: 'Gym Coach', email: 'coach@gym.test', role: 'coach' } });
  const otherCoach = await db.user.create({ data: { name: 'Other Coach', email: 'othercoach@gym.test', role: 'coach' } });
  const coach = await db.coach.create({ data: { name: coachUser.name, email: coachUser.email, userId: coachUser.id, department: 'Gym', specialty: 'Gym', phone: '' } });
  await db.coach.create({ data: { name: otherCoach.name, email: otherCoach.email, userId: otherCoach.id, department: 'Gym', specialty: 'Gym', phone: '' } });
  const members = [];
  for (let i = 0; i < 8; i++) members.push(await db.user.create({ data: { name: `Gym Member ${i}`, email: `member${i}@gym.test`, role: 'member' } }));
  const sessions = createSessionService(db), tokens: Record<string, string> = {};
  for (const user of [admin, desk, coachUser, otherCoach, ...members]) tokens[user.id] = (await sessions.issue(db, user, 'database_password', [])).accessToken;
  const port = 19500 + Math.floor(Math.random() * 500), origin = `http://127.0.0.1:${port}`;
  const secret = 'gym-test-webhook-signature-secret';
  const child = spawn(new URL('../node_modules/.bin/tsx', import.meta.url).pathname, ['src/server.ts'], {
    cwd: root, env: { ...process.env, DATABASE_URL: `file:${file}`, AUTH_MODE: 'database', JWT_SECRET: 'gym-test-session-key-longer-than-32-characters', NODE_ENV: 'test', PORT: String(port), GYM_ALLOW_CASH_PAYMENTS: 'true', KPAY_CHECKOUT_ADAPTER_URL: `http://127.0.0.1:${adapterPort}`, KPAY_ADAPTER_API_KEY: 'test-adapter-key', KPAY_WEBHOOK_SECRET: secret, KPAY_CALLBACK_URL: `${origin}/api/payments/kpay/webhook` }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = ''; child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
  t.after(async () => { child.kill(); adapter.close(); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    if (await fetch(`${origin}/api/health`).then(r => r.ok).catch(() => false)) break;
    await new Promise(r => setTimeout(r, 100)); if (i === 99) throw new Error(logs);
  }
  const request = async (path: string, method = 'GET', body?: unknown, userId = desk.id) => {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { Authorization: `Bearer ${tokens[userId] || ''}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, value: await response.json().catch(() => null) };
  };
  const nextDate = addDateKeyDays(today(), 1);
  const pkgBody = { title: 'QA Group', kind: 'GROUP_PT', price: 650000, rate: 130000, sessions: 5, minMembers: 5, maxMembers: 10, validityDays: 90, status: 'active' };
  let pkg: any, enrollment: any, attempt: any, scheduled: any;
  const enroll = (packageId: string, memberIds: string[], extras = {}) => request('/gym/enrollments', 'POST', { packageId, packageVersion: 1, memberIds, coachId: coach.id, startDate: today(), requestKey: randomUUID(), ...extras });
  const cash = (id: string) => request(`/gym/enrollments/${id}/payment`, 'POST', { method: 'Cash', cashReceived: true });
  const webhook = async (body: unknown, signature = true) => {
    const raw = JSON.stringify(body), response = await fetch(`${origin}/api/payments/kpay/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-kpay-signature': signature ? createHmac('sha256', secret).update(raw).digest('hex') : 'bad' }, body: raw });
    return { status: response.status, value: await response.json() };
  };
  await t.test('only Admin edits packages; version conflicts and revisions are retained', async () => {
    assert.equal((await request('/gym/packages', 'POST', pkgBody)).status, 403);
    assert.equal((await request('/gym/packages', 'GET', undefined, 'anonymous')).status, 401);
    const created = await request('/gym/packages', 'POST', pkgBody, admin.id); assert.equal(created.status, 201, JSON.stringify(created)); pkg = created.value;
    assert.equal((await request(`/gym/packages/${pkg.id}`, 'PATCH', { price: 640000, version: 99 }, admin.id)).status, 409);
    assert.equal((await request('/gym/audit')).status, 403);
    assert.equal((await request('/gym/enrollments', 'GET', undefined, coachUser.id)).status, 403);
    const history = await request(`/gym/packages/${pkg.id}/history`, 'GET', undefined, admin.id);
    assert.equal(history.value.revisions.length, 1);
  });
  await t.test('member registration is scoped to member profiles and prevents duplicate email/phone', async () => {
    const b = { name: 'Desk Registered', email: 'new@gym.test', phone: '+959123456', role: 'admin', emailVerified: true };
    const created = await request('/gym/members', 'POST', b); assert.equal(created.status, 201);
    const user = await db.user.findUniqueOrThrow({ where: { id: created.value.id } });
    assert.equal(user.role, 'member'); assert.equal(user.emailVerified, false); assert.equal(user.passwordHash, null);
    assert.equal((await request('/gym/members', 'POST', b)).status, 409);
    assert.equal((await request('/gym/members', 'POST', { ...b, email: 'new2@gym.test' }, members[0].id)).status, 403);
  });
  await t.test('participant counts, stale prices, duplicate enrollments, and retry keys', async () => {
    assert.equal((await enroll('gym-initial-pt-1', members.slice(0, 2).map(m => m.id))).status, 400);
    assert.equal((await enroll('gym-initial-couple_pt-1', [members[0].id])).status, 400);
    assert.equal((await enroll(pkg.id, members.slice(0, 4).map(m => m.id))).status, 400);
    assert.equal((await enroll(pkg.id, [members[0].id, members[0].id, ...members.slice(1, 4).map(m => m.id)])).status, 400);
    assert.equal((await enroll(pkg.id, members.slice(0, 5).map(m => m.id), { packageVersion: 99 })).status, 409);
    const body = { packageId: pkg.id, packageVersion: 1, memberIds: members.slice(0, 5).map(m => m.id), coachId: coach.id, startDate: today(), requestKey: randomUUID(), paymentStatus: 'paid' };
    const created = await request('/gym/enrollments', 'POST', body); assert.equal(created.status, 201, JSON.stringify(created)); enrollment = created.value;
    assert.equal(enrollment.status, 'PENDING_PAYMENT'); assert.equal(enrollment.transactionId, null);
    assert.equal((await request('/gym/enrollments', 'POST', body)).value.id, enrollment.id);
    assert.equal((await request('/gym/enrollments', 'POST', { ...body, startDate: nextDate })).status, 409);
    assert.equal((await enroll(pkg.id, members.slice(0, 5).map(m => m.id))).status, 409);
  });
  await t.test('future-only package edits preserve purchased price and validity snapshots', async () => {
    const edited = await request(`/gym/packages/${pkg.id}`, 'PATCH', { price: 700000, sessions: 10, version: 1 }, admin.id); assert.equal(edited.status, 200, JSON.stringify(edited));
    const row = await db.gymEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    assert.equal(row.totalPrice, 650000); assert.equal(row.sessionsTotal, 5); assert.equal((row.snapshot as any).price, 650000);
    assert.equal((await request(`/gym/packages/${pkg.id}/history`, 'GET', undefined, admin.id)).value.revisions.length, 2);
    await assert.rejects(db.gymEnrollment.update({ where: { id: row.id }, data: { totalPrice: 1 } }));
  });
  await t.test('unpaid access denied; real checkout is deduplicated; only signed matching KPay callback activates', async () => {
    assert.deepEqual((await request('/gym/policy')).value.paymentMethods, ['KPay', 'Cash']);
    const pending = await request('/gym/enrollments?category=training');
    assert.ok(pending.value.data.some((row: any) => row.id === enrollment.id));
    assert.equal((await request('/gym/enrollments?forScheduling=true')).value.data.length, 0);
    assert.equal((await request(`/gym/enrollments/${enrollment.id}/payment`, 'POST', { method: 'Cash' })).status, 400);
    assert.equal((await request('/gym/private-training', 'POST', { enrollmentId: enrollment.id, coachId: coach.id, date: nextDate, startTime: '10:00', requestKey: randomUUID() })).status, 409);
    const checkout = await request(`/gym/enrollments/${enrollment.id}/payment`, 'POST', { method: 'KPay' }); assert.equal(checkout.status, 200, JSON.stringify(checkout)); attempt = checkout.value.attempt;
    assert.equal((await request(`/gym/enrollments/${enrollment.id}/payment`, 'POST', { method: 'KPay' })).value.attempt.id, attempt.id);
    assert.equal((await cash(enrollment.id)).status, 409);
    const body = { reference: attempt.reference, providerReference: attempt.providerReference, amount: attempt.amount, status: 'PAID' };
    assert.equal((await webhook(body, false)).status, 401);
    assert.equal((await webhook({ ...body, amount: 1 })).status, 409);
    assert.equal((await webhook({ ...body, providerReference: 'wrong' })).status, 409);
    assert.equal((await webhook(body)).status, 200);
    assert.equal((await webhook(body)).status, 200);
    const row = await db.gymEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    assert.equal(row.status, 'ACTIVE'); assert.ok(row.paidAt);
    assert.ok((await request('/gym/enrollments?forScheduling=true')).value.data.some((e: any) => e.id === row.id));
    assert.equal(await db.transaction.count({ where: { gymEnrollment: { is: { id: enrollment.id } } } }), 1);
    assert.equal((await request(`/gym/enrollments/${enrollment.id}/receipt`, 'GET', undefined, members[1].id)).status, 200);
    assert.equal((await request(`/gym/enrollments/${enrollment.id}/receipt`, 'GET', undefined, members[7].id)).status, 404);
    const payments = await request('/transactions?q=QA%20Group', 'GET', undefined, members[1].id); assert.equal(payments.value.length, 1);
  });
  await t.test('coach availability, transactional conflict checks, retry recovery and rescheduling', async () => {
    const body = { enrollmentId: enrollment.id, coachId: coach.id, date: nextDate, startTime: '10:00', requestKey: randomUUID() };
    const created = await request('/gym/private-training', 'POST', body); assert.equal(created.status, 201, JSON.stringify(created)); scheduled = created.value;
    assert.equal(scheduled.attendance.length, 5);
    assert.equal((await request('/gym/private-training', 'POST', body)).value.id, scheduled.id);
    assert.equal((await request('/gym/private-training', 'POST', { ...body, requestKey: randomUUID() })).status, 409);
    const availability = await request(`/gym/coach-availability?coachId=${coach.id}&date=${nextDate}&durationMinutes=60&enrollmentId=${enrollment.id}`);
    assert.equal(availability.value.slots.find((s: any) => s.time === '10:00').available, false);
    const changed = await request(`/gym/private-training/${scheduled.id}`, 'PATCH', { ...body, startTime: '12:00' }); assert.equal(changed.status, 200, JSON.stringify(changed));
    assert.equal((await request(`/gym/private-training/${scheduled.id}/status`, 'PATCH', { status: 'COMPLETED', presentMemberIds: [members[0].id] })).status, 409);
    assert.equal((await request(`/gym/private-training/${scheduled.id}/status`, 'PATCH', { status: 'CANCELLED' }, otherCoach.id)).status, 403);
    assert.equal((await request('/gym/private-training?scope=upcoming', 'GET', undefined, members[3].id)).value.length, 1);
    assert.equal((await request('/gym/private-training?scope=upcoming', 'GET', undefined, members[7].id)).value.length, 0);
    assert.equal((await request(`/gym/private-training/${scheduled.id}/status`, 'PATCH', { status: 'CANCELLED' })).status, 200);
    assert.equal((await db.gymEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).sessionsRemaining, 5);
  });
  await t.test('concurrent group completion deducts once regardless of participant count', async () => {
    // A valid past session fixture represents attendance being finalized after its end.
    const past = addDateKeyDays(today(), -1);
    const historical = await db.gymEnrollment.create({ data: {
      code: `HIST-${randomUUID()}`, packageId: pkg.id, packageVersion: 1, snapshot: enrollment.snapshot,
      kind: 'GROUP_PT', totalPrice: 650000, sessionsTotal: 1, sessionsRemaining: 1,
      status: 'ACTIVE', paidAt: new Date(), startDate: past, expiryDate: nextDate,
      createdById: desk.id, requestKey: randomUUID(), payloadHash: 'fixture',
      members: { create: members.slice(0, 5).map(m => ({ userId: m.id })) },
    } });
    const pastSession = await db.privateTrainingSession.create({ data: {
      memberId: members[0].id, coachId: coach.id, enrollmentId: historical.id, date: past,
      startTime: '10:00', endTime: '11:00', createdById: desk.id,
      attendance: { create: members.slice(0, 5).map(m => ({ userId: m.id })) },
    } });
    assert.equal((await request(`/gym/private-training/${pastSession.id}/status`, 'PATCH', { status: 'COMPLETED', presentMemberIds: [] })).status, 409);
    assert.equal((await request(`/gym/private-training/${pastSession.id}/status`, 'PATCH', { status: 'COMPLETED', presentMemberIds: [members[7].id] })).status, 400);
    const completed = await Promise.all([1, 2].map(() => request(`/gym/private-training/${pastSession.id}/status`, 'PATCH', { status: 'COMPLETED', presentMemberIds: members.slice(0, 5).map(m => m.id) }, coachUser.id)));
    assert.deepEqual(completed.map(r => r.status), [200, 200]);
    assert.equal((await db.gymEnrollment.findUniqueOrThrow({ where: { id: historical.id } })).sessionsRemaining, 0);
    assert.equal(await db.gymSessionDebit.count({ where: { enrollmentId: historical.id } }), 1);
    await assert.rejects(db.gymEnrollment.update({ where: { id: historical.id }, data: { sessionsRemaining: -1 } }));
  });
  await t.test('paid membership activation, unlimited check-in, duplicate protection and renewal', async () => {
    const enrolled = await enroll('gym-initial-membership-1', [members[5].id]); assert.equal(enrolled.status, 201, JSON.stringify(enrolled));
    const paid = await cash(enrolled.value.id); assert.equal(paid.status, 200, JSON.stringify(paid));
    const training = await request('/gym/enrollments?forScheduling=true&limit=1');
    assert.ok(training.value.data.every((e: any) => ['PT', 'COUPLE_PT', 'GROUP_PT'].includes(e.kind)));
    assert.ok(training.value.data.some((e: any) => e.id === enrollment.id));
    const trainingHistory = await request('/gym/enrollments?category=training');
    assert.ok(!trainingHistory.value.data.some((e: any) => e.id === enrolled.value.id));
    const membershipId = paid.value.enrollment.membership.id;
    assert.equal(paid.value.enrollment.membership.accessMode, 'unlimited');
    const checks = await Promise.all([1, 2].map(() => request('/memberships/check-in', 'POST', { membershipId })));
    assert.deepEqual(checks.map(r => r.status), [201, 201]); assert.equal(await db.gymCheckIn.count({ where: { membershipId } }), 1);
    assert.equal((await db.membership.findUniqueOrThrow({ where: { id: membershipId } })).sessionsRemaining, 0);
    const renewalStart = addDateKeyDays(enrolled.value.expiryDate, 1);
    const renewal = await enroll('gym-initial-membership-1', [members[5].id], { renewalOfId: enrolled.value.id, startDate: renewalStart }); assert.equal(renewal.status, 201, JSON.stringify(renewal));
    const paidRenewal = await cash(renewal.value.id); assert.equal(paidRenewal.status, 200);
    assert.equal((await request('/memberships/check-in', 'POST', { membershipId: paidRenewal.value.enrollment.membership.id })).status, 409);
    assert.equal((await request(`/gym/enrollments/${renewal.value.id}/cancel`, 'POST', { reason: 'Renewal date correction' }, admin.id)).status, 200);
    const replacement = await enroll('gym-initial-membership-1', [members[5].id], { renewalOfId: enrolled.value.id, startDate: renewalStart });
    assert.equal(replacement.status, 201, JSON.stringify(replacement));
  });
  await t.test('failed KPay callbacks never activate; fresh checkout can recover', async () => {
    const row = await enroll('gym-initial-pt-1', [members[7].id]); assert.equal(row.status, 201);
    const first = await request(`/gym/enrollments/${row.value.id}/payment`, 'POST', { method: 'KPay' }); assert.equal(first.status, 200);
    const a = first.value.attempt;
    const body = { reference: a.reference, providerReference: a.providerReference, amount: a.amount, status: 'FAILED' };
    assert.equal((await webhook(body)).status, 200);
    assert.equal((await db.gymEnrollment.findUniqueOrThrow({ where: { id: row.value.id } })).status, 'PENDING_PAYMENT');
    assert.equal((await request(`/gym/enrollments/${row.value.id}/receipt`)).status, 404);
    assert.equal((await webhook({ ...body, status: 'PAID' })).status, 409);
    const second = await request(`/gym/enrollments/${row.value.id}/payment`, 'POST', { method: 'KPay' }); assert.equal(second.status, 200);
    assert.notEqual(second.value.attempt.id, a.id);
    const b = second.value.attempt;
    assert.equal((await webhook({ reference: b.reference, providerReference: b.providerReference, amount: b.amount, status: 'PAID' })).status, 200);
  });
  await t.test('scheduled sessions cannot exceed the shared balance; cancellation releases capacity', async () => {
    const ids = [];
    for (let hour = 6; hour < 11; hour++) {
      const row = await request('/gym/private-training', 'POST', { enrollmentId: enrollment.id, coachId: coach.id, date: nextDate, startTime: `${String(hour).padStart(2, '0')}:00`, requestKey: randomUUID() });
      assert.equal(row.status, 201, JSON.stringify(row)); ids.push(row.value.id);
    }
    const body = { enrollmentId: enrollment.id, coachId: coach.id, date: nextDate, startTime: '12:00', requestKey: randomUUID() };
    assert.equal((await request('/gym/private-training', 'POST', body)).status, 409);
    assert.equal((await request(`/gym/private-training/${ids[0]}/status`, 'PATCH', { status: 'CANCELLED' })).status, 200);
    assert.equal((await request('/gym/private-training', 'POST', body)).status, 201);
    assert.equal((await db.gymEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).sessionsRemaining, 5);
  });
  await t.test('Admin-configured walk-in is one paid visit; expiry, archive and audit guards', async () => {
    const created = await request('/gym/packages', 'POST', { title: 'Walk in', kind: 'WALK_IN', price: 15000, rate: 15000, status: 'active' }, admin.id); assert.equal(created.status, 201);
    const row = await enroll(created.value.id, [members[6].id]); assert.equal(row.status, 201);
    const paid = await cash(row.value.id); assert.equal(paid.status, 200);
    const membershipId = paid.value.enrollment.membership.id;
    assert.equal((await request('/memberships/check-in', 'POST', { membershipId })).status, 201);
    assert.equal((await db.gymEnrollment.findUniqueOrThrow({ where: { id: row.value.id } })).sessionsRemaining, 0);
    assert.equal((await request(`/gym/enrollments/${row.value.id}/cancel`, 'POST', { reason: 'Requested by member' })).status, 403);
    assert.equal((await request(`/gym/enrollments/${row.value.id}/cancel`, 'POST', { reason: 'Requested by member' }, admin.id)).status, 200);
    assert.equal((await request('/memberships/check-in', 'POST', { membershipId })).status, 409);
    const archived = await request(`/gym/packages/${created.value.id}`, 'PATCH', { version: 1, status: 'archived' }, admin.id); assert.equal(archived.status, 200);
    assert.ok(!(await request('/gym/packages')).value.some((p: any) => p.id === created.value.id));
    assert.equal((await enroll(created.value.id, [members[7].id])).status, 409);
    const audit = await request('/gym/audit', 'GET', undefined, admin.id); assert.ok(audit.value.data.length > 0);
    await assert.rejects(db.gymAuditLog.delete({ where: { id: audit.value.data[0].id } }));
    assert.equal((await request(`/gym/packages/${created.value.id}`, 'PATCH', { version: 2, status: 'active' }, admin.id)).status, 200);
  });
});
