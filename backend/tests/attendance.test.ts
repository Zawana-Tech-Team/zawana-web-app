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

test('attendance calendar scopes roles and persists idempotent course check-ins', async () => {
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
  const app = express(); app.use(express.json());
  const sessions = createSessionService(db);
  app.use('/attendance', createAttendanceRouter(db, createAuthMiddleware(sessions)));
  app.use((e: any, _req: any, res: any, _next: any) => res.status(e.statusCode || (e.name === 'ZodError' ? 400 : 500)).json({ message: e.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/attendance`;
  try {
    const users = await Promise.all(['admin', 'coach', 'coach', 'member', 'member', 'badminton_fo', 'store_fo'].map((role, i) => db.user.create({ data: { name: `Person ${i}`, email: `a${i}@attendance.test`, role: role as any } })));
    const [admin, coachUser, otherCoach, member, otherMember, fo, denied] = users;
    const coach = await db.coach.create({ data: { name: coachUser.name, userId: coachUser.id, specialty: '', phone: '', email: coachUser.email, status: 'active' } });
    const tokens = new Map(await Promise.all(users.map(async user => [user.id, (await sessions.issue(db, user, 'database_password', [])).accessToken] as const)));
    const request = (user: typeof admin | null, path: string, method = 'GET', body?: unknown) => fetch(url + path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: user ? { Authorization: `Bearer ${tokens.get(user.id)}`, 'Content-Type': 'application/json' } : {} });
    const make = (id: string, userId: string, extra = {}) => db.booking.create({ data: { id, code: id, userId, coachId: coach.id, kind: 'private_course', title: 'Footwork', date: today(), time: '10:00 — 11:00', location: 'Court 1', price: 10000, status: 'CONFIRMED', paymentStatus: 'paid', ...extra } });
    await make('assigned', member.id); await make('other-member', otherMember.id, { coachId: null });
    await make('unpaid', member.id, { paymentStatus: 'pending' });
    await make('cancelled', member.id, { status: 'CANCELLED' });
    await make('past', member.id, { date: '2020-01-01' });
    const pkg = await db.badmintonEnrollment.create({ data: { studentId: member.id, userId: member.id, studentName: member.name, phone: '', packageId: 'legacy', packageName: 'Ten visits', sessionsTotal: 10, sessionsRemaining: 9, startDate: today(), expiryDate: '2099-01-01' } });
    await db.badmintonCheckIn.create({ data: { enrollmentId: pkg.id, date: today(), time: '09:05', staffId: fo.id } });
    const month = `?month=${today().slice(0, 7)}`;
    assert.equal((await request(null, month)).status, 401);
    assert.equal((await request(denied, month)).status, 403);
    assert.equal((await request(admin, '?month=2026-13')).status, 400);
    assert.equal((await (await request(coachUser, month)).json()).records.length, 1);
    assert.equal((await (await request(otherCoach, month)).json()).records.length, 0);
    assert.equal((await (await request(member, month)).json()).records.length, 2);
    assert.equal((await (await request(fo, month)).json()).records.length, 3);
    assert.equal((await request(member, '/courses/assigned/check-in', 'POST')).status, 403);
    assert.equal((await request(otherCoach, '/courses/assigned/check-in', 'POST')).status, 404);
    for (const id of ['unpaid', 'cancelled', 'past']) assert.equal((await request(admin, `/courses/${id}/check-in`, 'POST')).status, 409);
    const first = await (await request(coachUser, '/courses/assigned/check-in', 'POST')).json();
    const retry = await (await request(admin, '/courses/assigned/check-in', 'POST')).json();
    assert.deepEqual(retry, first);
    assert.equal(await db.bookingAttendance.count(), 1);
    assert.equal((await db.bookingAttendance.findUniqueOrThrow({ where: { bookingId: 'assigned' } })).recordedById, coachUser.id);
    const record = (await (await request(member, month)).json()).records.find((r: any) => r.id === 'assigned');
    assert.equal(record.status, 'present'); assert.equal(record.recordedBy, coachUser.name); assert.ok(record.checkedInAt);

    // New APIs preserve the same assignment boundary for profile, history, and corrections.
    assert.equal((await request(otherCoach, '/course/assigned/detail')).status, 404);
    assert.equal((await request(coachUser, `/package/${(await db.badmintonCheckIn.findFirstOrThrow()).id}/detail`)).status, 404);
    assert.equal((await request(fo, '/courses/assigned/mark', 'POST', { status: 'late', reason: 'Correction by FO' })).status, 403);
    assert.equal((await request(admin, '/courses/assigned/mark', 'POST', { status: 'late' })).status, 400);
    assert.equal((await request(admin, '/courses/assigned/mark', 'POST', { status: 'late', notes: 'Footwork improved', reason: 'Arrival time corrected' })).status, 200);
    assert.equal(await db.bookingAttendance.count({ where: { bookingId: 'assigned' } }), 1);
    assert.equal(await db.attendanceModification.count({ where: { bookingId: 'assigned' } }), 1);
    const assignedDetail = await (await request(coachUser, '/course/assigned/detail')).json();
    assert.equal(assignedDetail.history.some((r: any) => r.kind === 'package'), false);
    assert.deepEqual(assignedDetail.modifications, []);
    assert.equal((await request(fo, month + '&export=csv')).status, 403);
    const exported = await request(admin, month + '&status=late&export=csv');
    assert.equal(exported.status, 200); assert.match(await exported.text(), /late/);
    assert.equal((await request(admin, month + '&from=2026-99-01')).status, 400);
    const summaryMember = await db.user.create({ data: { name: 'Summary member', email: 'summary@attendance.test', role: 'member' } });
    for (const [id, status] of [['summary-present', 'present'], ['summary-absent', 'absent'], ['summary-late', 'late']] as const) {
      await make(id, summaryMember.id, { date: '2020-01-02' });
      assert.equal((await request(admin, `/courses/${id}/mark`, 'POST', { status })).status, 200);
    }
    await make('summary-cancelled', summaryMember.id, { date: '2020-01-03', status: 'CANCELLED' });
    await db.bookingAttendance.create({ data: { bookingId: 'summary-cancelled', recordedById: admin.id } });
    await make('summary-future', summaryMember.id, { date: '2099-01-01' });
    const summary = (await (await request(admin, '/course/summary-present/detail')).json()).summary;
    const rangeResult = await (await request(admin, month + '&from=2020-01-01&to=2020-01-31')).json();
    assert.ok(rangeResult.records.some((r: any) => r.id === 'summary-present'));
    assert.ok(rangeResult.records.every((r: any) => r.date.startsWith('2020-01')));
    assert.equal((await request(admin, month + '&from=2020-02-01&to=2020-01-01')).status, 400);
    assert.equal(summary.completedScheduled, 3); assert.equal(summary.attended, 2); assert.equal(summary.missed, 1); assert.equal(summary.late, 1); assert.equal(summary.percentage, 67);
    const retries = await Promise.all([request(fo, '/courses/other-member/check-in', 'POST'), request(admin, '/courses/other-member/check-in', 'POST')]);
    assert.equal(retries.filter(r => r.status === 200).length, 2);
    assert.equal(await db.bookingAttendance.count({ where: { bookingId: 'other-member' } }), 1);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await db.$disconnect(); rmSync(dir, { recursive: true, force: true });
  }
});
