import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createAttendanceRouter } from '../src/routes/attendance.js';
import { createAuthMiddleware } from '../src/middleware/auth.js';
import { createSessionService } from '../src/services/authSession.js';
import { today } from '../src/services/courtPolicy.js';
import { createQrCheckInRouter } from '../src/routes/qrCheckIn.js';
import { createBadmintonVisit } from '../src/services/badmintonAttendance.js';
import { checkInTransaction } from '../src/services/badmintonCategory.js';
import { weeklyClassAtCheckIn } from '../src/services/weeklyAttendance.js';

test('attendance comes from package check-in and weekly classes, with private courses excluded', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-attendance-'));
  const file = join(dir, 'qa.db');
  const sqlite = new DatabaseSync(file);
  const schema = execFileSync(new URL('../node_modules/.bin/prisma', import.meta.url).pathname,
    ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', new URL('../prisma/schema.prisma', import.meta.url).pathname, '--script'], { encoding: 'utf8' });
  // Also execute the actual forward migration, rather than testing only a schema snapshot.
  sqlite.exec(schema
    .replace(/-- CreateTable\nCREATE TABLE "BookingAttendance"[\s\S]*?\n\);/, '')
    .replace(/-- CreateIndex\nCREATE UNIQUE INDEX "BookingAttendance_bookingId_key"[^;]*;/, ''));
  sqlite.exec(readFileSync(new URL('../prisma/migrations/20261023090000_booking_attendance/migration.sql', import.meta.url), 'utf8'));
  sqlite.exec('ALTER TABLE BookingAttendance ADD COLUMN status TEXT NOT NULL DEFAULT \'present\'; ALTER TABLE BookingAttendance ADD COLUMN notes TEXT;');
  sqlite.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  const sessions = createSessionService(db), auth = createAuthMiddleware(sessions);
  const app = express(); app.use(express.json());
  app.use('/attendance', createAttendanceRouter(db, auth));
  app.use('/check-in', createQrCheckInRouter(db, auth));
  app.use((e: any, _req: any, res: any, _next: any) => res.status(e.statusCode || (e.name === 'ZodError' ? 400 : 500)).json({ message: e.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const users = await Promise.all(['admin', 'coach', 'member', 'member', 'badminton_fo', 'store_fo'].map((role, i) => db.user.create({ data: { name: `Person ${i}`, email: `a${i}@attendance.test`, role: role as any } })));
    const [admin, coachUser, member, otherMember, fo, denied] = users;
    await db.coach.create({ data: { name: coachUser.name, userId: coachUser.id, specialty: '', phone: '', email: coachUser.email, status: 'active', department: 'Badminton' } });
    const tokens = new Map(await Promise.all(users.map(async user => [user.id, (await sessions.issue(db, user, 'database_password', [])).accessToken] as const)));
    const request = (user: typeof admin | null, path: string, method = 'GET', body?: unknown) => fetch(base + path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: user ? { Authorization: `Bearer ${tokens.get(user.id)}`, 'Content-Type': 'application/json' } : {} });
    const date = today(), month = `/attendance?month=${date.slice(0, 7)}`;
    const courts = await Promise.all([1, 2].map(number => db.court.create({ data: { name: `Court ${number}`, type: 'Standard', surface: 'Indoor', floor: 'Ground Floor', price: 20000, features: [] } })));
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const blocks = await Promise.all(courts.map(court => db.courtBlock.create({ data: { courtId: court.id, date: '', dayOfWeek: weekday, start: '09:00', end: '10:00', title: 'Social weekly class', categoryCode: 'SOCIAL', type: 'class' } })));
    await db.courtBlock.create({ data: { courtId: courts[0].id, date: '', dayOfWeek: weekday, start: '10:00', end: '11:00', title: 'Foundation weekly class', categoryCode: 'FOUNDATION' } });
    for (const code of ['SOCIAL', 'FOUNDATION']) await db.badmintonPackageCategory.create({ data: { code, name: code } });
    await Promise.all([1, 2].map(id => db.badmintonQrDeskSlot.create({ data: { id } })));
    const enrollment = async (code: string, user = member) => db.badmintonEnrollment.create({ data: { studentId: user.id, userId: user.id, studentName: user.name, phone: '', packageId: `package-${code}`, packageName: `${code} package`, categoryCode: code, sessionsTotal: 10, sessionsRemaining: 10, startDate: date, expiryDate: '2099-01-01' } });
    const social = await enrollment('SOCIAL'), foundation = await enrollment('FOUNDATION');
    const makeBooking = (id: string, extra = {}) => db.booking.create({ data: { id, code: id, userId: member.id, kind: 'private_course', title: 'Private course must stay in bookings', date, time: '10:00 — 11:00', location: 'Court 1', price: 10000, status: 'CONFIRMED', paymentStatus: 'paid', ...extra } });
    const privateBooking = await makeBooking('private-confirmed');
    const privateAttended = await makeBooking('private-historical');
    await db.bookingAttendance.create({ data: { bookingId: privateAttended.id, recordedById: admin.id, status: 'present' } });
    await makeBooking('private-cancelled', { status: 'CANCELLED' });
    const privateBefore = await db.booking.findMany({ orderBy: { id: 'asc' } }), attendanceBefore = await db.bookingAttendance.findMany();

    await t.test('paid private bookings and legacy private attendance never enter records, detail, CSV or mutation paths', async () => {
      assert.equal((await request(null, month)).status, 401);
      assert.equal((await request(denied, month)).status, 403);
      assert.equal((await request(admin, '/attendance?month=2026-13')).status, 400);
      assert.deepEqual((await (await request(admin, month)).json()).records, []);
      for (const id of [privateBooking.id, privateAttended.id]) {
        assert.equal((await request(admin, `/attendance/course/${id}/detail`)).status, 404);
        for (const actor of [admin, coachUser, fo]) for (const operation of ['mark', 'check-in']) {
          assert.equal((await request(actor, `/attendance/courses/${id}/${operation}`, 'POST', { status: 'present' })).status, 410);
        }
      }
      assert.equal((await request(member, `/attendance/courses/${privateBooking.id}/check-in`, 'POST')).status, 403);
      assert.doesNotMatch(await (await request(admin, month + '&export=csv')).text(), /Private course|private-confirmed|private-historical/);
    });
    let visitId: string;
    await t.test('staff package check-in links a multi-court weekly class once and preserves its original snapshot', async () => {
      const visit = await checkInTransaction(db, tx => createBadmintonVisit(tx, social.id, fo.id));
      visitId = visit.checkInId;
      assert.equal(visit.enrollment.sessionsRemaining, 9);
      const rows = (await (await request(member, month)).json()).records;
      assert.equal(rows.length, 1); assert.equal(rows[0].kind, 'package'); assert.equal(rows[0].source, 'STAFF'); assert.equal(rows[0].title, 'Social weekly class');
      assert.deepEqual(rows[0].weeklyClass.blockIds.sort(), blocks.map(block => block.id).sort());
      assert.equal(rows[0].weeklyClass.courts.length, 2); assert.equal(rows[0].sessionsDeducted, 1); assert.equal(rows[0].package.name, 'SOCIAL package');
      await db.courtBlock.updateMany({ where: { id: { in: blocks.map(block => block.id) } }, data: { title: 'Renamed weekly class', effectiveUntil: '2020-01-01' } });
      const history = (await (await request(member, month)).json()).records;
      assert.equal(history[0].title, 'Social weekly class'); assert.equal(history[0].weeklyClass.start, '09:00');
      await assert.rejects(checkInTransaction(db, tx => createBadmintonVisit(tx, social.id, fo.id)), (error: any) => error.code === 'ALREADY_CHECKED_IN');
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: social.id } })).sessionsRemaining, 9);
    });
    await t.test('QR redemption uses the same weekly attendance source, privacy and filters', async () => {
      const issued = await request(fo, '/check-in/qr', 'POST', { categoryCode: 'FOUNDATION', slot: 1 });
      assert.equal(issued.status, 201); const qr = await issued.json();
      assert.equal((await request(member, '/check-in/scan', 'POST', { token: qr.token })).status, 201);
      assert.equal((await request(member, '/check-in/scan', 'POST', { token: qr.token })).status, 409);
      const rows = (await (await request(member, month)).json()).records;
      assert.equal(rows.length, 2); const qrRow = rows.find((row: any) => row.source === 'QR');
      assert.equal(qrRow.title, 'Foundation weekly class'); assert.equal(qrRow.categoryCode, 'FOUNDATION'); assert.equal(qrRow.package.remaining, 9);
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: foundation.id } })).sessionsRemaining, 9);
      assert.deepEqual((await (await request(otherMember, month)).json()).records, []);
      assert.equal((await request(otherMember, `/attendance/package/${visitId}/detail`)).status, 404);
      assert.deepEqual((await (await request(coachUser, month)).json()).records, (await (await request(fo, month)).json()).records);
      const filtered = (await (await request(admin, month + '&categoryCode=SOCIAL&title=Social%20weekly%20class')).json()).records;
      assert.deepEqual(filtered.map((row: any) => row.id), [visitId]);
      assert.equal((await (await request(admin, month + '&q=SOCIAL%20package')).json()).records.length, 1);
      assert.equal((await request(fo, month + '&export=csv')).status, 403);
      const csv = await (await request(admin, month + '&export=csv')).text();
      assert.match(csv, /Social weekly class/); assert.match(csv, /FOUNDATION package/); assert.match(csv, /Check-in time/); assert.doesNotMatch(csv, /Private course/);
      assert.equal((await request(admin, month + '&from=2026-99-01')).status, 400);
      assert.equal((await request(admin, month + '&from=2020-02-01&to=2020-01-01')).status, 400);
    });
    await t.test('admin corrections retain notes, audits, category guards and balanced session adjustments', async () => {
      for (const actor of [member, coachUser, fo]) assert.equal((await request(actor, `/attendance/packages/${visitId}/mark`, 'POST', { status: 'late', reason: 'Not authorized' })).status, 403);
      assert.equal((await request(admin, `/attendance/packages/${visitId}/mark`, 'POST', { status: 'late' })).status, 400);
      assert.equal((await request(admin, `/attendance/packages/${visitId}/mark`, 'POST', { status: 'late', notes: 'Warm-up done', reason: 'Arrival verified' })).status, 200);
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: social.id } })).sessionsRemaining, 9);
      const detailPath = `/attendance/package/${visitId}/detail`;
      const details = await (await request(admin, detailPath)).json();
      assert.equal(details.history.length, 2); assert.equal(details.modifications.length, 1); assert.equal(details.summary.attended, 2); assert.equal(details.summary.sessionsUsed, 2); assert.equal(details.summary.weeklyClassVisits, 2); assert.equal(details.summary.late, 1);
      assert.ok(details.history.every((row: any) => row.kind === 'package'));
      assert.deepEqual((await (await request(coachUser, detailPath)).json()).modifications, []);
      assert.equal((await request(admin, `/attendance/packages/${visitId}/mark`, 'POST', { status: 'absent', reason: 'Scan was recorded in error' })).status, 200);
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: social.id } })).sessionsRemaining, 10);
      assert.equal((await request(admin, `/attendance/packages/${visitId}/mark`, 'POST', { status: 'present', reason: 'Participant verified at class' })).status, 200);
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: social.id } })).sessionsRemaining, 9);
    });
    await t.test('weekly matching respects categories, exclusions, holidays, dated moves and ambiguous sessions', async () => {
      await db.courtBlock.updateMany({ where: { id: { in: blocks.map(block => block.id) } }, data: { title: 'Social weekly class', effectiveUntil: null } });
      const match = (time = '09:05') => db.$transaction(tx => weeklyClassAtCheckIn(tx, 'SOCIAL', date, time));
      assert.equal((await match())?.blockIds.length, 2);
      await db.courtBlock.updateMany({ where: { id: { in: blocks.map(block => block.id) } }, data: { excludedDates: [date] } });
      assert.equal(await match(), null);
      await db.courtBlock.updateMany({ where: { id: { in: blocks.map(block => block.id) } }, data: { excludedDates: [] } });
      await db.courtDateOverride.create({ data: { date, type: 'open', weeklyOnly: true, holidayActive: true, categoryCodes: ['SOCIAL'] } });
      assert.equal(await match(), null);
      await db.courtDateOverride.update({ where: { date }, data: { categoryCodes: ['FOUNDATION'] } });
      assert.ok(await match());
      await db.courtDateOverride.update({ where: { date }, data: { type: 'closed' } });
      assert.equal(await match(), null); await db.courtDateOverride.delete({ where: { date } });
      await db.courtBlock.create({ data: { courtId: courts[0].id, date, start: '15:00', end: '16:00', title: 'Moved Social class', categoryCode: 'SOCIAL' } });
      assert.equal((await match('15:05'))?.title, 'Moved Social class'); assert.equal(await match('12:00'), null);
      await db.courtBlock.create({ data: { courtId: courts[1].id, date, start: '15:00', end: '16:00', title: 'Another Social class', categoryCode: 'SOCIAL' } });
      assert.equal(await match('15:05'), null);
      // Ambiguity does not block a valid package visit or invent a class assignment.
      const otherEnrollment = await enrollment('SOCIAL', otherMember);
      await db.courtBlock.updateMany({ where: { categoryCode: 'SOCIAL' }, data: { start: '00:00', end: '23:59' } });
      const visit = await checkInTransaction(db, tx => createBadmintonVisit(tx, otherEnrollment.id, fo.id));
      assert.equal(JSON.parse(visit.checkIn.packageSnapshot!).weeklyClass, null); assert.equal(visit.enrollment.sessionsRemaining, 9);
      // Legacy records are not matched retrospectively against today's mutable schedule.
      const legacy = await db.badmintonCheckIn.create({ data: { enrollmentId: social.id, date: '2020-01-01', time: '09:05', sessionsUsed: 0 } });
      const legacyRows = (await (await request(admin, '/attendance?month=2020-01')).json()).records;
      assert.equal(legacyRows.find((row: any) => row.id === legacy.id).weeklyClass, null);
    });
    assert.deepEqual(await db.booking.findMany({ orderBy: { id: 'asc' } }), privateBefore);
    assert.deepEqual(await db.bookingAttendance.findMany(), attendanceBefore);
    assert.equal(await db.transaction.count(), 0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await db.$disconnect(); rmSync(dir, { recursive: true, force: true });
  }
});
