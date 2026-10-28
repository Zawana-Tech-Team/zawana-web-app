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
import { createBadmintonVisit, correctBadmintonVisit } from '../src/services/badmintonAttendance.js';
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
  const member = async (role: 'member' | 'admin' | 'badminton_fo' = 'member') => {
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
  const issue = async (categoryCode: CategoryCode = 'SOCIAL') => { const r = await request(fo, '/check-in/qr', { categoryCode }); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data; };
  const balance = async (id: string) => (await db.badmintonEnrollment.findUniqueOrThrow({ where: { id } })).sessionsRemaining;
  try {
    await t.test('category-required issuance, roles, secure token, display rename and one-hour expiry', async () => {
      assert.equal((await request(fo, '/check-in/qr', {})).status, 400);
      assert.equal((await request(fo, '/check-in/qr', { categoryCode: 'OTHER' })).status, 400);
      assert.equal((await request(await member(), '/check-in/qr', { categoryCode: 'SOCIAL' })).status, 403);
      const qr = await issue(); assert.match(qr.token, /^[\w-]{43}$/);
      const stored = await db.badmintonEntryQr.findUniqueOrThrow({ where: { id: qr.id } });
      assert.notEqual(stored.tokenHash, qr.token); assert.equal(stored.categoryCode, 'SOCIAL'); assert.ok(stored.createdAt);
      assert.ok(new Date(qr.expiresAt).getTime() - Date.now() > 3590000);
      await db.badmintonPackageCategory.update({ where: { code: 'SOCIAL' }, data: { name: `Social club ${randomUUID()}` } });
      assert.equal((await issue()).categoryCode, 'SOCIAL');
    });
    await t.test('Social ignores earlier-expiring Foundation; preview does not deduct; same-day categories allowed', async () => {
      const u = await member(), f = await enroll(u, 'FOUNDATION', { expiryDate: '2097-01-01' }), s = await enroll(u, 'SOCIAL');
      const qr = await issue(); const preview = await request(u, '/check-in/preview', { token: qr.token });
      assert.equal(preview.status, 200); assert.equal(preview.data.categoryCode, 'SOCIAL'); assert.equal(preview.data.enrollment.id, s.id); assert.equal(preview.data.expectedRemaining, 9); assert.equal(await balance(s.id), 10);
      const done = await request(u, '/check-in/scan', { token: qr.token }); assert.equal(done.status, 201, JSON.stringify(done.data));
      assert.equal(done.data.sessionsDeducted, 1); assert.equal(done.data.enrollment.id, s.id); assert.equal(await balance(s.id), 9); assert.equal(await balance(f.id), 10);
      const visit = await db.badmintonQrVisit.findUniqueOrThrow({ where: { checkInId: done.data.checkInId }, include: { qr: true, checkIn: true } });
      assert.equal(visit.qrId, qr.id); assert.equal(visit.checkIn.source, 'QR'); assert.equal(visit.checkIn.actorId, u.id); assert.equal(visit.checkIn.categoryCode, 'SOCIAL'); assert.equal(visit.checkIn.date, today());
      assert.equal((await request(u, '/check-in/scan', { token: qr.token })).data.code, 'ALREADY_CHECKED_IN');
      const foundation = await issue('FOUNDATION'); assert.equal((await request(u, '/check-in/scan', { token: foundation.token })).status, 201); assert.equal(await balance(f.id), 9);
      const history = await request(u, `/attendance?month=${today().slice(0, 7)}`); assert.equal(history.data.records.filter((r: any) => r.kind === 'package').length, 2);
      assert.equal((await request(u, `/attendance?month=${today().slice(0, 7)}&categoryCode=SOCIAL`)).data.records.length, 1);
    });
    await t.test('no matching category never falls back, missing Pathway and expired/exhausted errors preserve balances', async () => {
      const u = await member(), f = await enroll(u, 'FOUNDATION'); const social = await issue();
      assert.equal((await request(u, '/check-in/scan', { token: social.token })).data.code, 'NO_CATEGORY_PACKAGE'); assert.equal(await balance(f.id), 10);
      const pathway = await issue('PATHWAY'); assert.equal((await request(u, '/check-in/scan', { token: pathway.token })).data.code, 'NO_CATEGORY_PACKAGE');
      const expired = await enroll(u, 'PATHWAY', { expiryDate: '2020-01-01' }); assert.equal((await request(u, '/check-in/scan', { token: pathway.token })).data.code, 'PACKAGE_EXPIRED'); assert.equal(await balance(expired.id), 10);
      await db.badmintonEnrollment.update({ where: { id: expired.id }, data: { expiryDate: '2099-01-01', sessionsRemaining: 0 } });
      assert.equal((await request(u, '/check-in/scan', { token: pathway.token })).data.code, 'NO_SESSIONS');
    });
    await t.test('earliest eligible expiry, deterministic tie break and exhausted fallback', async () => {
      const u = await member(); const later = await enroll(u, 'SOCIAL', { expiryDate: '2099-01-01' });
      await enroll(u, 'SOCIAL', { sessionsRemaining: 0, expiryDate: '2096-01-01' });
      await enroll(u, 'SOCIAL', { startDate: '2095-01-01', expiryDate: '2097-01-01' });
      const first = await enroll(u, 'SOCIAL', { sessionsRemaining: 1, expiryDate: '2097-01-01', createdAt: new Date('2020-01-01') });
      const tied = await enroll(u, 'SOCIAL', { expiryDate: '2097-01-01', createdAt: new Date('2021-01-01') });
      const qr = await issue(); const result = await request(u, '/check-in/scan', { token: qr.token }); assert.equal(result.data.enrollment.id, first.id); assert.equal(await balance(first.id), 0); assert.equal(await balance(tied.id), 10); assert.equal(await balance(later.id), 10);
      // Represent tomorrow's request without changing the service's Myanmar clock: retain attendance as historical.
      await db.badmintonCheckIn.update({ where: { id: result.data.checkInId }, data: { date: '2020-01-01', attendanceKey: `${u.id}:SOCIAL:2020-01-01`, dailyKey: `${first.id}:2020-01-01` } });
      await db.badmintonQrVisit.updateMany({ where: { checkInId: result.data.checkInId }, data: { date: '2020-01-01' } });
      assert.equal((await request(u, '/check-in/scan', { token: qr.token })).data.enrollment.id, tied.id);
    });
    await t.test('staff ID is a selection hint; cross-source duplicates and QR/manual race cannot double-charge', async () => {
      const u = await member(), first = await enroll(u, 'SOCIAL', { expiryDate: '2097-01-01' }), later = await enroll(u, 'SOCIAL'); const qr = await issue();
      const results = await Promise.all([request(fo, '/manual', { enrollmentId: later.id }), request(u, '/check-in/scan', { token: qr.token }), request(u, '/check-in/scan', { token: qr.token })]);
      assert.equal(results.filter(r => r.status === 201).length, 1, JSON.stringify(results)); assert.equal(await balance(first.id), 9); assert.equal(await balance(later.id), 10);
      assert.equal(await db.badmintonCheckIn.count({ where: { memberId: u.id, categoryCode: 'SOCIAL', date: today() } }), 1);
      assert.equal((await request(fo, '/manual', { enrollmentId: later.id })).data.code, 'ALREADY_CHECKED_IN');
    });
    await t.test('concurrent final-session scans commit exactly one ledger and visit', async () => {
      const u = await member(), e = await enroll(u, 'SOCIAL', { sessionsRemaining: 1 }), qr = await issue();
      const results = await Promise.all(Array.from({ length: 6 }, () => request(u, '/check-in/scan', { token: qr.token })));
      assert.equal(results.filter(r => r.status === 201).length, 1, JSON.stringify(results)); assert.equal(await balance(e.id), 0);
      assert.equal(await db.badmintonQrVisit.count({ where: { userId: u.id } }), 1);
    });
    await t.test('preview is revalidated; changed balance chooses another matching package at commit', async () => {
      const u = await member(), first = await enroll(u, 'SOCIAL', { expiryDate: '2097-01-01' }), later = await enroll(u, 'SOCIAL'), qr = await issue();
      assert.equal((await request(u, '/check-in/preview', { token: qr.token })).data.enrollment.id, first.id);
      await db.badmintonEnrollment.update({ where: { id: first.id }, data: { sessionsRemaining: 0 } });
      assert.equal((await request(u, '/check-in/scan', { token: qr.token })).data.enrollment.id, later.id);
    });
    await t.test('expired, rotated, revoked, category-neutral and unauthorized-issuer codes fail without writes', async () => {
      const u = await member(), e = await enroll(u, 'SOCIAL'); let qr = await issue();
      await db.badmintonEntryQr.update({ where: { id: qr.id }, data: { expiresAt: new Date(0) } }); assert.equal((await request(u, '/check-in/scan', { token: qr.token })).data.code, 'QR_EXPIRED');
      qr = await issue(); await issue('FOUNDATION'); assert.equal((await request(u, '/check-in/scan', { token: qr.token })).data.code, 'QR_REVOKED');
      qr = await issue(); assert.equal((await request(u, `/check-in/qr/${qr.id}`, undefined, 'DELETE')).status, 403);
      const otherFo = await member('badminton_fo'); assert.equal((await request(otherFo, `/check-in/qr/${qr.id}`, undefined, 'DELETE')).status, 404);
      await request(fo, `/check-in/qr/${qr.id}`, undefined, 'DELETE'); assert.equal((await request(u, '/check-in/preview', { token: qr.token })).data.code, 'QR_REVOKED');
      const { newCredential, credentialHash } = await import('../src/services/authSession.js');
      const neutralToken = newCredential();
      await db.badmintonEntryQr.create({ data: { tokenHash: credentialHash(neutralToken), createdById: fo.id, expiresAt: new Date(Date.now() + 60000) } });
      assert.equal((await request(u, '/check-in/scan', { token: neutralToken })).data.code, 'QR_CATEGORY_REQUIRED');
      qr = await issue(); await db.user.update({ where: { id: fo.id }, data: { active: false } }); assert.equal((await request(u, '/check-in/scan', { token: qr.token })).data.code, 'QR_ISSUER_INACTIVE'); await db.user.update({ where: { id: fo.id }, data: { active: true } });
      assert.equal(await balance(e.id), 10); assert.equal(await db.badmintonCheckIn.count({ where: { enrollmentId: e.id } }), 0);
    });
    await t.test('token-only input rejects category/enrollment tampering and cross-member access', async () => {
      const owner = await member(), stranger = await member(), e = await enroll(owner, 'SOCIAL'), qr = await issue();
      for (const path of ['/check-in/preview', '/check-in/scan']) {
        for (const extra of [{ categoryCode: 'FOUNDATION' }, { enrollmentId: e.id }, { userId: owner.id }]) assert.equal((await request(stranger, path, { token: qr.token, ...extra })).status, 400);
        assert.equal((await request(stranger, path, { token: qr.token })).data.code, 'NO_CATEGORY_PACKAGE');
      }
      assert.equal((await request(stranger, '/manual', { enrollmentId: e.id })).status, 403); assert.equal(await balance(e.id), 10);
      const done = await request(owner, '/check-in/scan', { token: qr.token }); assert.equal((await request(stranger, `/attendance/package/${done.data.checkInId}/detail`)).status, 404);
    });
    await t.test('catalogue changes do not reclassify an enrollment; admin resolution preserves balances/history', async () => {
      const u = await member(), e = await enroll(u, 'SOCIAL');
      await db.badmintonPackage.update({ where: { id: e.packageId }, data: { categoryId: categories.get('FOUNDATION') } });
      const qr = await issue(); assert.equal((await request(u, '/check-in/scan', { token: qr.token })).data.categoryCode, 'SOCIAL');
      const legacy = await db.badmintonEnrollment.create({ data: { studentId: u.id, userId: u.id, studentName: u.name, phone: '', packageId: e.packageId, packageName: 'Unclassified historic', startDate: '2020-01-01', expiryDate: '2099-01-01', sessionsTotal: 20, sessionsRemaining: 6 } });
      const visit = await db.badmintonCheckIn.create({ data: { enrollmentId: legacy.id, date: '2020-01-02', time: '09:00', sessionsUsed: 1 } });
      assert.equal((await request(u, '/check-in/scan', { token: qr.token })).data.code, 'CATEGORY_REVIEW_REQUIRED');
      const classified = await checkInTransaction(db, tx => classifyLegacyPackage(tx, e.packageId)); assert.equal(classified.enrollments, 1); assert.equal(await balance(legacy.id), 6);
      assert.equal((await db.badmintonCheckIn.findUniqueOrThrow({ where: { id: visit.id } })).categoryCode, 'FOUNDATION');
      const done = await request(fo, '/manual', { enrollmentId: legacy.id }); assert.equal(done.status, 201);
      await checkInTransaction(db, tx => correctBadmintonVisit(tx, done.data.checkInId, admin.id, 'excused', 'Wrong arrival recorded'));
      assert.equal(await balance(legacy.id), 6);
      assert.equal((await request(fo, '/manual', { enrollmentId: legacy.id })).data.code, 'ALREADY_CHECKED_IN');
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
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
    const beforeSql = names.filter(n => n !== latest).map(n => readFileSync(new URL(`${n}/migration.sql`, root), 'utf8')).join('\n');
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
    execute(readFileSync(new URL(`${latest}/migration.sql`, root), 'utf8'));
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
