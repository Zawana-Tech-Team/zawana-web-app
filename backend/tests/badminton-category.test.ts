import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createQrCheckInRouter } from '../src/routes/qrCheckIn.js';
import { createAttendanceRouter } from '../src/routes/attendance.js';
import { createAuthMiddleware, roles } from '../src/middleware/auth.js';
import { createSessionService } from '../src/services/authSession.js';
import { createBadmintonVisit } from '../src/services/badmintonAttendance.js';
import { checkInTransaction, classifyLegacyPackage, type CategoryCode } from '../src/services/badmintonCategory.js';
import { today } from '../src/services/courtPolicy.js';
import { asyncRoute } from '../src/utils/asyncRoute.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { categoryPreflight } from '../scripts/badminton-category-preflight.js';

const migrationRoot = new URL('../prisma/migrations/', import.meta.url);
function migrateSqlite(file: string, beforeCategory = false) {
  const sqlite = new DatabaseSync(file);
  for (const name of readdirSync(migrationRoot).filter(n => /^\d/.test(n)).sort()) {
    if (beforeCategory && name === '20261028090000_badminton_category_checkin') break;
    sqlite.exec(readFileSync(new URL(`${name}/migration.sql`, migrationRoot), 'utf8'));
  }
  return sqlite;
}
const pgUrl = process.env.BADMINTON_POSTGRES_TEST_URL;
for (const provider of ['sqlite', 'postgresql'] as const) test(`category check-in: ${provider} HTTP, ownership, balances and concurrency`, { skip: provider === 'postgresql' ? !pgUrl : !!process.env.BADMINTON_ONLY_POSTGRES }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-category-'));
  let url = `file:${join(dir, 'qa.db')}`;
  if (provider === 'sqlite') migrateSqlite(join(dir, 'qa.db')).close();
  else {
    const target = new URL(pgUrl!);
    assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
    assert.equal(target.pathname, '/zawana_badminton_test');
    url = pgUrl!;
  }
  const db = new PrismaClient({ datasources: { db: { url } } });
  const sessions = createSessionService(db), auth = createAuthMiddleware(sessions);
  const app = express(); app.use(express.json());
  app.use('/check-in', createQrCheckInRouter(db, auth));
  app.use('/attendance', createAttendanceRouter(db, auth));
  app.post('/manual', auth, roles('admin', 'badminton_fo'), asyncRoute(async (req: any, res: any) => res.status(201).json(await checkInTransaction(db, tx => createBadmintonVisit(tx, req.body.enrollmentId, req.user.id)))));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const tokens = new Map<string, string>();
  const member = async (role: 'member' | 'admin' | 'badminton_fo' | 'coach' | 'gym_fo' | 'clinic_fo' = 'member') => {
    const u = await db.user.create({ data: { name: 'Category QA', email: `${randomUUID()}@category.test`, role } });
    tokens.set(u.id, (await sessions.issue(db, u, 'database_password', [])).accessToken); return u;
  };
  const request = async (u: { id: string }, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => {
    const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tokens.get(u.id)}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  const fo = await member('badminton_fo'), admin = await member('admin');
  const categories = new Map((await db.badmintonPackageCategory.findMany()).filter(c => c.code).map(c => [c.code!, c.id]));
  const enroll = async (u: { id: string; name: string }, categoryCode: CategoryCode, extra: Record<string, any> = {}) => {
    const pkg = await db.badmintonPackage.create({ data: { title: `${categoryCode} QA`, price: 100000, sessions: 10, validity: 30, description: '', categoryId: categories.get(categoryCode) } });
    return db.badmintonEnrollment.create({ data: { userId: u.id, studentId: u.id, studentName: u.name, phone: '', packageId: pkg.id, packageName: pkg.title, categoryCode, startDate: today(), expiryDate: '2098-01-01', sessionsTotal: 10, sessionsRemaining: 10, ...extra } });
  };
  process.env.QR_TOKEN_ENCRYPTION_KEY = 'category-test-encryption-key-thirty-two-plus';
  const issue = async (categoryCode: CategoryCode = 'SOCIAL', slot = 1, regenerate = false, actor = fo) => {
    const r = await request(actor, '/check-in/qr', { categoryCode, slot, regenerate });
    assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data;
  };
  const balance = async (id: string) => (await db.badmintonEnrollment.findUniqueOrThrow({ where: { id } })).sessionsRemaining;
  const run = (name: string, fn: () => Promise<void>) => t.test(name, async () => {
    await db.badmintonQrDeskSlot.updateMany({ data: { qrId: null } });
    await db.badmintonEntryQr.updateMany({ where: { kind: 'CATEGORY', status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
    await fn();
  });
  try {
    await run('category-only generation, two independent slots, exact two hours and persistent restoration', async () => {
      const u = await member();
      assert.equal((await request(u, '/check-in/qr', { categoryCode: 'SOCIAL' })).status, 403);
      assert.equal((await request(fo, '/check-in/qr', { memberId: u.id, authorizedCategories: ['SOCIAL'] })).status, 400);
      assert.equal((await request(fo, '/check-in/qr', { categoryCode: 'SOCIAL', slot: 3 })).status, 400);
      const social = await issue(), stored = await db.badmintonEntryQr.findUniqueOrThrow({ where: { id: social.id } });
      assert.equal(stored.memberId, null); assert.equal(stored.kind, 'CATEGORY'); assert.equal(stored.categoryCode, 'SOCIAL');
      assert.match(social.token, /^[\w-]{43}$/); assert.notEqual(stored.tokenHash, social.token); assert.ok(stored.encryptedToken && !stored.encryptedToken.includes(social.token));
      const pathway = await issue('PATHWAY', 2);
      assert.notEqual(pathway.token, social.token);
      assert.deepEqual(await db.badmintonEntryQr.findUniqueOrThrow({ where: { id: social.id } }), stored);
      for (const qr of [social, pathway]) assert.equal(new Date(qr.expiresAt).getTime() - new Date(qr.createdAt).getTime(), 120 * 60000);
      assert.equal((await issue()).token, social.token);
      await db.$disconnect();
      const restored = await request(fo, '/check-in/qr');
      assert.deepEqual(restored.data.slots.map((row: any) => row.qr.token), [social.token, pathway.token]);
      assert.equal((await request(u, '/check-in/qr')).status, 403);
    });
    await run('multiple members share a category QR; one redemption each and category-isolated deduction', async () => {
      const qr = await issue();
      for (let i = 0; i < 3; i++) {
        const u = await member(), f = await enroll(u, 'FOUNDATION', { sessionsRemaining: 8 }), social = await enroll(u, 'SOCIAL', { sessionsRemaining: 5 });
        const preview = await request(u, '/check-in/preview', { token: qr.token });
        assert.equal(preview.data.categoryCode, 'SOCIAL'); assert.equal(preview.data.enrollment.id, social.id); assert.equal(await balance(social.id), 5);
        assert.equal((await request(u, '/check-in/scan', { token: qr.token, categoryCode: 'FOUNDATION' })).status, 400);
        const done = await request(u, '/check-in/scan', { token: qr.token });
        assert.equal(done.status, 201, JSON.stringify(done.data)); assert.equal(await balance(social.id), 4); assert.equal(await balance(f.id), 8);
        for (const path of ['/check-in/scan', '/check-in/preview']) {
          const duplicate = await request(u, path, { token: qr.token });
          assert.equal(duplicate.data.code, 'QR_ALREADY_REDEEMED'); assert.equal(duplicate.data.message, 'You have already checked in using this QR code.');
        }
        assert.equal(await db.badmintonQrRedemption.count({ where: { qrId: qr.id, memberId: u.id } }), 1);
        assert.equal(await db.notification.count({ where: { userId: u.id, entityId: done.data.checkInId } }), 1);
      }
      const status = await request(fo, `/check-in/qr/${qr.id}`);
      assert.equal(status.data.status, 'ACTIVE'); assert.equal(status.data.checkInCount, 3); assert.equal(status.data.recentCheckIns.length, 3);
      const stored = await db.badmintonEntryQr.findUniqueOrThrow({ where: { id: qr.id } });
      assert.equal(stored.usedAt, null); assert.equal(stored.redeemedBy, null); assert.equal(stored.attendanceId, null);
    });
    await run('simultaneous scans debit once per member and allow concurrent different members', async () => {
      const qr = await issue(), u = await member(), e = await enroll(u, 'SOCIAL');
      const results = await Promise.all(Array.from({ length: 4 }, () => request(u, '/check-in/scan', { token: qr.token })));
      assert.equal(results.filter(r => r.status === 201).length, 1); assert.equal(await balance(e.id), 9);
      assert.ok(results.filter(r => r.status !== 201).every(r => r.data.code === 'QR_ALREADY_REDEEMED'));
      const users = await Promise.all([member(), member()]);
      for (const user of users) await enroll(user, 'SOCIAL');
      const different = await Promise.all(users.map(user => request(user, '/check-in/scan', { token: qr.token })));
      assert.ok(different.every(r => r.status === 201));
      assert.equal(await db.badmintonQrRedemption.count({ where: { qrId: qr.id } }), 3);
      // The database enforces the pair even if a future writer forgets the precheck.
      const otherAttendance = await db.badmintonCheckIn.create({ data: { enrollmentId: e.id, date: '2020-01-01', time: '09:00', sessionsUsed: 0 } });
      await assert.rejects(db.badmintonQrRedemption.create({ data: { qrId: qr.id, memberId: u.id, enrollmentId: e.id, attendanceId: otherAttendance.id } }), (error: any) => error.code === 'P2002');
      await db.badmintonCheckIn.delete({ where: { id: otherAttendance.id } });
    });
    await run('coach and FO share slots and attendance history; gym/unlinked coaches denied', async () => {
      const coach = await member('coach'), gymCoach = await member('coach'), unlinked = await member('coach');
      const profile = await db.coach.create({ data: { userId: coach.id, name: 'Badminton coach', specialty: '', phone: '', email: coach.email, department: 'Badminton' } });
      await db.coach.create({ data: { userId: gymCoach.id, name: 'Gym coach', specialty: '', phone: '', email: gymCoach.email, department: 'Gym' } });
      for (const actor of [gymCoach, unlinked, await member('gym_fo'), await member('clinic_fo')]) assert.equal((await request(actor, '/check-in/qr')).status, 403);
      assert.equal((await request(coach, `/attendance?month=${today().slice(0, 7)}`)).data.permissions.categoryQr, true);
      assert.equal((await request(gymCoach, `/attendance?month=${today().slice(0, 7)}`)).data.permissions.categoryQr, false);
      const qr = await issue('SOCIAL', 1, false, coach), second = await issue('PATHWAY', 2);
      assert.deepEqual((await request(coach, '/check-in/qr')).data.slots.map((row: any) => row.qr.id), [qr.id, second.id]);
      const assigned = await member(), stranger = await member();
      await db.booking.create({ data: { code: randomUUID(), userId: assigned.id, coachId: profile.id, kind: 'private_course', title: 'Assigned', date: today(), time: '10:00 — 11:00', location: 'Court', price: 10, paymentStatus: 'paid', status: 'CONFIRMED' } });
      for (const user of [assigned, stranger]) { await enroll(user, 'SOCIAL'); assert.equal((await request(user, '/check-in/scan', { token: qr.token })).status, 201); }
      const coachView = (await request(coach, `/check-in/qr/${qr.id}`)).data;
      assert.equal(coachView.checkInCount, 2); assert.equal(coachView.recentCheckIns.length, 2);
      const assignedVisit = await db.badmintonQrRedemption.findUniqueOrThrow({ where: { qrId_memberId: { qrId: qr.id, memberId: assigned.id } } });
      assert.ok(coachView.recentCheckIns.some((row: any) => row.id === assignedVisit.attendanceId));
      assert.deepEqual(coachView.recentCheckIns, (await request(fo, `/check-in/qr/${qr.id}`)).data.recentCheckIns);
      assert.equal((await request(fo, `/check-in/qr/${qr.id}`)).data.recentCheckIns.length, 2);
    });
    await run('slot replacement/revocation and concurrent generation never modify the other category', async () => {
      const results = await Promise.all(Array.from({ length: 3 }, () => issue()));
      assert.equal(new Set(results.map(r => r.id)).size, 1);
      const social = results[0], pathway = await issue('PATHWAY', 2);
      assert.equal((await request(fo, '/check-in/qr', { categoryCode: 'SOCIAL', slot: 2, regenerate: true })).data.code, 'QR_CATEGORY_DISPLAYED');
      assert.equal((await request(fo, '/check-in/qr', { categoryCode: 'FOUNDATION', slot: 1 })).data.code, 'QR_SLOT_OCCUPIED');
      const foundation = await issue('FOUNDATION', 1, true);
      assert.equal((await db.badmintonEntryQr.findUniqueOrThrow({ where: { id: social.id } })).status, 'REVOKED');
      assert.equal((await request(fo, `/check-in/qr/${pathway.id}`)).data.token, pathway.token);
      assert.equal((await request(fo, `/check-in/qr/${foundation.id}`, undefined, 'DELETE')).status, 200);
      assert.equal((await request(fo, `/check-in/qr/${pathway.id}`)).data.status, 'ACTIVE');
    });
    await run('expired, revoked, disabled issuer, no package, exhausted and wrong-category states do not debit', async () => {
      const u = await member(), f = await enroll(u, 'FOUNDATION'), qr = await issue();
      assert.equal((await request(u, '/check-in/scan', { token: qr.token })).data.code, 'NO_CATEGORY_PACKAGE'); assert.equal(await balance(f.id), 10);
      const social = await enroll(u, 'SOCIAL', { sessionsRemaining: 0 });
      assert.equal((await request(u, '/check-in/scan', { token: qr.token })).data.code, 'NO_SESSIONS');
      await db.badmintonEnrollment.update({ where: { id: social.id }, data: { sessionsRemaining: 5, expiryDate: '2020-01-01' } });
      assert.equal((await request(u, '/check-in/scan', { token: qr.token })).data.code, 'PACKAGE_EXPIRED');
      await db.badmintonEntryQr.update({ where: { id: qr.id }, data: { expiresAt: new Date(Date.now() - 1) } });
      const expired = await request(u, '/check-in/scan', { token: qr.token }); assert.equal(expired.data.message, 'QR code expired. Please request a new QR code.');
      const next = await issue(); await request(fo, `/check-in/qr/${next.id}`, undefined, 'DELETE');
      assert.equal((await request(u, '/check-in/scan', { token: next.token })).data.code, 'QR_REVOKED');
      const active = await issue(); await db.user.update({ where: { id: fo.id }, data: { active: false } });
      assert.equal((await request(u, '/check-in/scan', { token: active.token })).data.code, 'QR_ISSUER_INACTIVE');
      await db.user.update({ where: { id: fo.id }, data: { active: true } });
      assert.equal(await db.badmintonQrRedemption.count({ where: { memberId: u.id } }), 0); assert.equal(await balance(social.id), 5);
    });
    await run('one slot expires independently while the other remains redeemable', async () => {
      const social = await issue(), pathway = await issue('PATHWAY', 2), u = await member();
      const socialPackage = await enroll(u, 'SOCIAL'), pathwayPackage = await enroll(u, 'PATHWAY');
      await db.badmintonEntryQr.update({ where: { id: social.id }, data: { expiresAt: new Date(Date.now() - 1) } });
      const restored = (await request(fo, '/check-in/qr')).data.slots;
      assert.equal(restored[0].qr.status, 'EXPIRED'); assert.equal(restored[1].qr.status, 'ACTIVE');
      assert.equal(restored[1].qr.token, pathway.token); assert.equal(restored[1].qr.expiresAt, pathway.expiresAt);
      assert.equal((await request(u, '/check-in/scan', { token: social.token })).data.code, 'QR_EXPIRED');
      assert.equal((await request(u, '/check-in/scan', { token: pathway.token })).status, 201);
      assert.equal(await balance(socialPackage.id), 10); assert.equal(await balance(pathwayPackage.id), 9);
    });
    await run('failure after debit rolls back visit, redemption and notifications', async () => {
      const u = await member(), e = await enroll(u, 'SOCIAL'), qr = await issue();
      if (provider === 'sqlite') {
        await db.$executeRawUnsafe(`CREATE TRIGGER qa_reject_redemption BEFORE INSERT ON BadmintonQrRedemption BEGIN SELECT RAISE(ABORT, 'qa rollback'); END`);
        assert.equal((await request(u, '/check-in/scan', { token: qr.token })).status, 500);
        await db.$executeRawUnsafe('DROP TRIGGER qa_reject_redemption');
        assert.equal(await balance(e.id), 10); assert.equal(await db.badmintonCheckIn.count({ where: { qrId: qr.id } }), 0);
        assert.equal(await db.notification.count({ where: { userId: u.id } }), 0);
      }
      assert.equal((await request(u, '/check-in/scan', { token: qr.token })).status, 201);
    });
    await run('separate category eligibility, renewal ordering, and QR/manual daily guard remain unchanged', async () => {
      const u = await member(), early = await enroll(u, 'SOCIAL', { expiryDate: '2097-01-01' }), later = await enroll(u, 'SOCIAL'), foundation = await enroll(u, 'FOUNDATION');
      const social = await issue(), f = await issue('FOUNDATION', 2);
      assert.equal((await request(u, '/check-in/preview', { token: social.token })).data.enrollment.id, early.id);
      const results = await Promise.all([request(u, '/check-in/scan', { token: social.token }), request(fo, '/manual', { enrollmentId: later.id })]);
      assert.equal(results.filter(r => r.status === 201).length, 1); assert.equal(await balance(early.id), 9); assert.equal(await balance(later.id), 10);
      assert.equal((await request(u, '/check-in/scan', { token: f.token })).status, 201); assert.equal(await balance(foundation.id), 9);
      const replacement = await issue('SOCIAL', 1, true);
      assert.equal((await request(u, '/check-in/scan', { token: replacement.token })).data.code, 'ALREADY_CHECKED_IN');
    });
    await run('legacy classification and immutable category snapshots retain balances', async () => {
      const u = await member(), e = await enroll(u, 'SOCIAL');
      await db.badmintonPackage.update({ where: { id: e.packageId }, data: { categoryId: categories.get('FOUNDATION') } });
      const qr = await issue(); assert.equal((await request(u, '/check-in/scan', { token: qr.token })).data.categoryCode, 'SOCIAL');
      const legacy = await db.badmintonEnrollment.create({ data: { studentId: u.id, userId: u.id, studentName: u.name, phone: '', packageId: e.packageId, packageName: 'Legacy', startDate: '2020-01-01', expiryDate: '2099-01-01', sessionsTotal: 20, sessionsRemaining: 6 } });
      assert.equal((await checkInTransaction(db, tx => classifyLegacyPackage(tx, e.packageId, admin.id))).enrollments, 1);
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: legacy.id } })).sessionsRemaining, 6);
    });
  } finally { await new Promise<void>(r => server.close(() => r())); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
});

test('forward SQLite migration preserves all classified, duplicate and ambiguous history and balances', { skip: !!process.env.BADMINTON_ONLY_POSTGRES }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-category-migration-')), file = join(dir, 'qa.db');
  const sqlite = migrateSqlite(file, true);
  try {
    sqlite.exec(`INSERT INTO BadmintonPackageCategory(id,name,active) VALUES('social-cat','Social',1),('ambiguous','Weekend club',1);
      INSERT INTO BadmintonPackage(id,title,price,sessions,validity,description,categoryId) VALUES('social','Arbitrary title',100,10,30,'','social-cat'),('unknown','Social sounding title',100,10,30,'','ambiguous');
      INSERT INTO BadmintonEnrollment(id,studentId,studentName,phone,packageId,packageName,sessionsTotal,sessionsRemaining,startDate,expiryDate) VALUES('e','walkin','Legacy','','social','Old title',10,4,'2020-01-01','2099-01-01'),('u','walkin-2','Unknown','','unknown','Foundation looking name',10,3,'2020-01-01','2099-01-01');
      INSERT INTO BadmintonCheckIn(id,enrollmentId,date,time,sessionsUsed) VALUES('c1','e','2020-01-01','09:00',1),('c2','e','2020-01-01','10:00',1),('c3','u','2020-01-01','09:00',1);
      INSERT INTO BadmintonQrVisit(id,userId,date,checkInId) VALUES('v','walkin','2020-01-01','c1');
      INSERT INTO BadmintonEntryQr(id,createdById,tokenHash,expiresAt) VALUES('old-qr','legacy-issuer','hash',9999999999999);`);
    const before = sqlite.prepare('SELECT id,sessionsTotal,sessionsRemaining FROM BadmintonEnrollment ORDER BY id').all();
    sqlite.exec(readFileSync(new URL('20261028090000_badminton_category_checkin/migration.sql', migrationRoot), 'utf8'));
    assert.deepEqual(sqlite.prepare('SELECT id,sessionsTotal,sessionsRemaining FROM BadmintonEnrollment ORDER BY id').all(), before);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM BadmintonCheckIn').get()!.n, 3); assert.equal(sqlite.prepare('SELECT count(*) n FROM BadmintonQrVisit').get()!.n, 1);
    assert.equal(sqlite.prepare("SELECT categoryCode FROM BadmintonEnrollment WHERE id='e'").get()!.categoryCode, 'SOCIAL'); assert.equal(sqlite.prepare("SELECT categoryCode FROM BadmintonEnrollment WHERE id='u'").get()!.categoryCode, null);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM BadmintonCheckIn WHERE attendanceKey IS NOT NULL').get()!.n, 1);
    assert.equal(sqlite.prepare("SELECT categoryCode FROM BadmintonEntryQr WHERE id='old-qr'").get()!.categoryCode, null);
    assert.throws(() => sqlite.exec("UPDATE BadmintonEnrollment SET categoryCode='FOUNDATION' WHERE id='e'"), /immutable/);
    assert.throws(() => sqlite.exec("INSERT INTO BadmintonPackageCategory(id,name,code) VALUES('bad','bad','BAD')"), /Invalid badminton category/);
    sqlite.exec(readFileSync(new URL('20261104090000_single_use_member_qr_package_security/migration.sql', migrationRoot), 'utf8'));
    assert.deepEqual(sqlite.prepare('SELECT id,sessionsTotal,sessionsRemaining FROM BadmintonEnrollment ORDER BY id').all(), before);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM BadmintonCheckIn').get()!.n, 3);
    assert.equal(sqlite.prepare("SELECT status FROM BadmintonEntryQr WHERE id='old-qr'").get()!.status, 'REVOKED');
    sqlite.exec(`INSERT INTO "User"(id,name,email,role) VALUES('qr-member','QR member','qr-member@migration.test','member');
      INSERT INTO "BadmintonEntryQr"(id,"memberId","createdById","tokenHash","expiresAt",status) VALUES('member-active','qr-member','qr-staff','active-hash',9999999999999,'ACTIVE'),('member-used','qr-member','qr-staff','used-hash',9999999999999,'USED');
      UPDATE "BadmintonQrVisit" SET "qrId"='old-qr' WHERE id='v';
      INSERT INTO "BadmintonQrVisit"(id,"userId",date,"checkInId","qrId","categoryCode") VALUES('second-old-visit','walkin','2020-01-02','c2','old-qr','SOCIAL');`);
    const historical = sqlite.prepare('SELECT * FROM BadmintonCheckIn ORDER BY id').all();
    sqlite.exec(readFileSync(new URL('20261104110000_shared_category_qr/migration.sql', migrationRoot), 'utf8'));
    assert.deepEqual(sqlite.prepare('SELECT * FROM BadmintonCheckIn ORDER BY id').all(), historical);
    assert.deepEqual(sqlite.prepare('SELECT id,sessionsTotal,sessionsRemaining FROM BadmintonEnrollment ORDER BY id').all(), before);
    assert.equal(sqlite.prepare("SELECT status FROM BadmintonEntryQr WHERE id='member-active'").get()!.status, 'REVOKED');
    assert.equal(sqlite.prepare("SELECT status FROM BadmintonEntryQr WHERE id='member-used'").get()!.status, 'USED');
    assert.equal(sqlite.prepare('SELECT count(*) n FROM BadmintonQrVisit').get()!.n, 2);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM BadmintonQrRedemption').get()!.n, 0);
    assert.deepEqual(sqlite.prepare('SELECT id FROM BadmintonQrDeskSlot ORDER BY id').all().map(row => row.id), [1, 2]);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
    sqlite.close();
    const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
    try { const report = await categoryPreflight(db); assert.equal(report.unresolvedActiveEnrollments.length, 1); assert.equal(report.historicalDuplicateGroups.length, 1); assert.equal(report.counts.checkIns, 3); } finally { await db.$disconnect(); }
  } finally { try { sqlite.close(); } catch {} rmSync(dir, { recursive: true, force: true }); }
});


test('forward PostgreSQL chain preserves legacy balances, duplicate visits and unclassified records', { skip: !pgUrl || !process.env.BADMINTON_ONLY_POSTGRES }, async () => {
  const target = new URL(pgUrl!);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
  assert.equal(target.pathname, '/zawana_badminton_test');
  const databaseName = `zawana_badminton_migration_${randomUUID().replaceAll('-', '')}`;
  const rootDb = new PrismaClient({ datasources: { db: { url: pgUrl } } });
  const dir = mkdtempSync(join(tmpdir(), 'zawana-pg-category-migration-'));
  target.pathname = `/${databaseName}`;
  target.searchParams.delete('schema');
  let db: PrismaClient | undefined;
  try {
    await rootDb.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    const root = new URL('../prisma/postgresql/migrations/', import.meta.url);
    const names = readdirSync(root).filter(n => /^\d/.test(n)).sort();
    const latest = '20261028090000_badminton_category_checkin';
    const beforeSql = names.filter(n => n < latest).map(n => readFileSync(new URL(`${n}/migration.sql`, root), 'utf8')).join('\n');
    const script = join(dir, 'migration.sql');
    const execute = (sql: string) => {
      writeFileSync(script, sql);
      execFileSync(new URL('../node_modules/.bin/prisma', import.meta.url).pathname, ['db', 'execute', '--url', target.toString(), '--file', script], { stdio: 'pipe' });
    };
    execute(beforeSql + `
      INSERT INTO "BadmintonPackageCategory"(id,name,active) VALUES('social-cat','Social',true),('unknown','Weekend club',true);
      INSERT INTO "BadmintonPackage"(id,title,price,sessions,validity,description,"categoryId") VALUES('social','Arbitrary title',100,10,30,'','social-cat'),('unknown','Social sounding title',100,10,30,'','unknown');
      INSERT INTO "BadmintonEnrollment"(id,"studentId","studentName",phone,"packageId","packageName","sessionsTotal","sessionsRemaining","startDate","expiryDate") VALUES('e','walkin','Legacy','','social','Old title',10,4,'2020-01-01','2099-01-01'),('u','walkin-2','Unknown','','unknown','Foundation looking name',10,3,'2020-01-01','2099-01-01');
      INSERT INTO "BadmintonCheckIn"(id,"enrollmentId",date,time,"sessionsUsed") VALUES('c1','e','2020-01-01','09:00',1),('c2','e','2020-01-01','10:00',1),('c3','u','2020-01-01','09:00',1);
      INSERT INTO "BadmintonQrVisit"(id,"userId",date,"checkInId") VALUES('v','walkin','2020-01-01','c1');
      INSERT INTO "BadmintonEntryQr"(id,"createdById","tokenHash","expiresAt") VALUES('old-qr','old-issuer','hash',CURRENT_TIMESTAMP);
    `);
    db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
    const before = await categoryPreflight(db);
    for (const name of names.filter(n => n >= latest)) execute(readFileSync(new URL(`${name}/migration.sql`, root), 'utf8'));
    await db.$disconnect();
    db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
    const after = await categoryPreflight(db);
    assert.deepEqual(after.balances, before.balances);
    assert.deepEqual({ ...after.counts, categories: 0 }, { ...before.counts, categories: 0 });
    assert.equal(after.unresolvedActiveEnrollments.length, 1);
    assert.equal(after.historicalDuplicateGroups.length, 1);
    assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: 'e' } })).categoryCode, 'SOCIAL');
    assert.equal(await db.badmintonCheckIn.count({ where: { attendanceKey: { not: null } } }), 1);
    assert.equal((await db.badmintonEntryQr.findUniqueOrThrow({ where: { id: 'old-qr' } })).createdAt, null);
    await assert.rejects(db.badmintonEnrollment.update({ where: { id: 'e' }, data: { categoryCode: 'FOUNDATION' } }));
  } finally { await db?.$disconnect(); await rootDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`); await rootDb.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
});
