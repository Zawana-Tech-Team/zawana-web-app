import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createCourtChangeRouter } from '../src/routes/courtChanges.js';
import { createAuthMiddleware } from '../src/middleware/auth.js';
import { createSessionService } from '../src/services/authSession.js';
import { rescheduleEligibility, scheduleInstant, courtChangeDetail, quoteCourtChange, rescheduleCourt, requestCourtCancellation, reviewCourtCancellation } from '../src/services/courtChanges.js';
import { createCourtBooking } from '../src/services/courtBooking.js';
import { courtAvailability } from '../src/services/courtAvailability.js';
import { today, formatRange, businessNow } from '../src/services/courtPolicy.js';
import { createBadmintonVisit, correctBadmintonVisit } from '../src/services/badmintonAttendance.js';

test('Yangon rescheduling policy includes exactly 24 hours and confirmed status aliases', () => {
  for (const status of ['confirmed', 'CONFIRMED'] as const) {
    const b = { date: '2030-04-02', time: '10:00 AM — 11:00 AM', status };
    const start = scheduleInstant(b.date, b.time).getTime();
    assert.equal(new Date(start).toISOString(), '2030-04-02T03:30:00.000Z');
    for (const [minutes, expected] of [[1500, true], [1440, true], [1439, false]] as const)
      assert.equal(rescheduleEligibility(b, new Date(start - minutes * 60000)).eligible, expected);
  }
  for (const status of ['cancelled', 'CANCELLED', 'completed', 'COMPLETED', 'pending'] as const)
    assert.equal(rescheduleEligibility({ date: '2030-04-02', time: '10:00 AM — 11:00 AM', status }, new Date('2030-01-01')).eligible, false);
});

test('court changes and attendance corrections persist atomically in an isolated migrated database', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-sop-')), file = join(dir, 'test.db');
  const sqlite = new DatabaseSync(file);
  const schema = execFileSync(new URL('../node_modules/.bin/prisma', import.meta.url).pathname,
    ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', new URL('../prisma/schema.prisma', import.meta.url).pathname, '--script'], { encoding: 'utf8' });
  sqlite.exec(schema);
  // Exercise the forward migration against the previous table shapes, preserving existing data.
  sqlite.exec(`DROP TABLE BookingChangeHistory; DROP TABLE BookingCancellationRequest; DROP TABLE AttendanceModification;
    ALTER TABLE BookingAttendance DROP COLUMN status; ALTER TABLE BookingAttendance DROP COLUMN notes;
    ALTER TABLE BadmintonCheckIn DROP COLUMN status; ALTER TABLE BadmintonCheckIn DROP COLUMN packageSnapshot;
    DROP INDEX BadmintonCheckIn_dailyKey_key; ALTER TABLE BadmintonCheckIn DROP COLUMN dailyKey;`);
  sqlite.exec(readFileSync(new URL('../prisma/migrations/20261027120000_attendance_court_changes/migration.sql', import.meta.url), 'utf8'));
  const integrity = readFileSync(new URL('../prisma/migrations/20261014190000_court_booking_integrity/migration.sql', import.meta.url), 'utf8');
  sqlite.exec(integrity.slice(integrity.indexOf('-- These guards'))); sqlite.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  const app = express(); app.use(express.json()); const sessions = createSessionService(db);
  app.use('/changes', createCourtChangeRouter(db, createAuthMiddleware(sessions)));
  app.use((e: any, _req: any, res: any, _next: any) => res.status(e.statusCode || (e.name === 'ZodError' ? 400 : 500)).json({ message: e.message, code: e.code }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/changes`;
  try {
    const users = await Promise.all(['member', 'member', 'admin', 'badminton_fo', 'coach', 'clinic_fo'].map((role, i) => db.user.create({ data: { name: `SOP ${i}`, email: `sop${i}@test.invalid`, role: role as any } })));
    const [member, other, admin, fo, coach, clinic] = users;
    const tokens = new Map(await Promise.all(users.map(async u => [u.id, (await sessions.issue(db, u, 'database_password', [])).accessToken] as const)));
    const request = async (user: typeof member, path: string, body?: unknown) => {
      const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tokens.get(user.id)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, value: await r.json() };
    };
    const courts = await Promise.all(['2F Court', '6F Court'].map(name => db.court.create({ data: { name, price: 20000, type: 'Standard', surface: 'Indoor', features: [] } })));
    const date = new Date(`${today()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 4); const day = date.toISOString().slice(0, 10);
    const next = new Date(date); next.setUTCDate(next.getUTCDate() + 1); const nextDay = next.toISOString().slice(0, 10);
    const slot = (hour: number, courtId = courts[0].id, date = day) => ({ courtId, date, time: formatRange(hour * 60, (hour + 1) * 60) });
    const result = await createCourtBooking(db, member, { bookings: [slot(8), slot(9, courts[1].id, nextDay)] });
    const [booking, sibling] = result.bookings;
    await db.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'paid' } });
    await t.test('ownership, department restriction, quote and confirmed paid reschedule', async () => {
      for (const denied of [other, coach, clinic]) assert.ok([403, 404].includes((await request(denied, `/${booking.id}/changes`)).status));
      const detail = await request(member, `/${booking.id}/changes`); assert.equal(detail.status, 200); assert.equal(detail.value.eligibility.eligible, true);
      const quote = await request(member, `/${booking.id}/reschedule/quote`, slot(10, courts[1].id)); assert.equal(quote.status, 200); assert.equal(quote.value.difference, 0);
      const moved = await request(member, `/${booking.id}/reschedule`, { ...slot(10, courts[1].id), revision: quote.value.revision, reason: 'Customer changed plans' });
      assert.equal(moved.status, 200, JSON.stringify(moved.value)); assert.equal(moved.value.paymentStatus, 'paid'); assert.equal(moved.value.code, booking.code);
      assert.deepEqual(await db.booking.findUniqueOrThrow({ where: { id: sibling.id } }), sibling, 'Multi-court/multi-day sibling is untouched');
      const calendar = await courtAvailability(db, day); assert.equal(calendar.slots.find(s => s.courtId === courts[0].id && s.startMinute === 480)!.available, true);
      assert.equal(await db.bookingChangeHistory.count({ where: { bookingId: booking.id } }), 1);
      assert.equal((await request(member, `/${booking.id}/reschedule`, { ...slot(11), revision: quote.value.revision, reason: 'Stale confirmation' })).value.code, 'CONCURRENT_BOOKING_MODIFICATION');
    });
    await t.test('unavailable destinations, holidays, blocks, maintenance and price adjustments preserve the original', async () => {
      const original = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      const assertFailure = async (target: ReturnType<typeof slot>, code: string) => {
        const detail = await courtChangeDetail(db, booking.id, member);
        await assert.rejects(rescheduleCourt(db, booking.id, member, target, detail.revision, 'Try alternative slot'), (e: any) => e.code === code);
        assert.deepEqual(await db.booking.findUniqueOrThrow({ where: { id: booking.id } }), original);
        assert.equal(await db.bookingChangeHistory.count({ where: { bookingId: booking.id } }), 1);
      };
      await createCourtBooking(db, other, { bookings: [slot(11)] }); await assertFailure(slot(11), 'COURT_UNAVAILABLE');
      await db.courtBlock.create({ data: { courtId: courts[0].id, date: day, start: '12:00', end: '13:00', title: 'Class' } }); await assertFailure(slot(12), 'COURT_UNAVAILABLE');
      await db.courtDateOverride.create({ data: { date: day, type: 'closed' } }); await assertFailure(slot(13), 'COURT_UNAVAILABLE');
      await db.courtDateOverride.delete({ where: { date: day } });
      await db.court.update({ where: { id: courts[0].id }, data: { status: 'maintenance' } }); await assertFailure(slot(13), 'COURT_UNAVAILABLE');
      await db.court.update({ where: { id: courts[0].id }, data: { status: 'available' } });
      await db.holidayRate.create({ data: { date: day, title: 'Holiday', price: 30000 } });
      assert.equal((await quoteCourtChange(db, booking.id, member, slot(13))).difference, 10000); await assertFailure(slot(13), 'PAYMENT_ADJUSTMENT_REQUIRED');
      await db.holidayRate.delete({ where: { date: day } });
    });
    await t.test('active payment checkout blocks reschedule and cancellation without changing the reservation', async () => {
      const before = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      const payment = await db.paymentAttempt.create({ data: { reference: 'ACTIVE-SOP-CHECKOUT', userId: member.id, resourceType: 'court_booking', resourceId: booking.id, amount: before.price, status: 'PENDING', expiresAt: new Date(Date.now() + 600000) } });
      try {
        const detail = await courtChangeDetail(db, booking.id, member);
        await assert.rejects(rescheduleCourt(db, booking.id, member, slot(13), detail.revision, 'Move during checkout'), (e: any) => e.code === 'PAYMENT_ADJUSTMENT_REQUIRED');
        await assert.rejects(requestCourtCancellation(db, booking.id, member, 'Cancel during checkout'), (e: any) => e.code === 'PAYMENT_ADJUSTMENT_REQUIRED');
        assert.deepEqual(await db.booking.findUniqueOrThrow({ where: { id: booking.id } }), before);
      } finally { await db.paymentAttempt.delete({ where: { id: payment.id } }); }
    });
    await t.test('concurrent changes and booking creation reserve one destination', async () => {
      const fresh = await createCourtBooking(db, other, { bookings: [slot(7)] });
      const a = await courtChangeDetail(db, booking.id, member), b = await courtChangeDetail(db, fresh.booking.id, other);
      const outcomes = await Promise.allSettled([
        rescheduleCourt(db, booking.id, member, slot(14), a.revision, 'First contender'),
        rescheduleCourt(db, fresh.booking.id, other, slot(14), b.revision, 'Second contender'),
        createCourtBooking(db, member, { bookings: [slot(14)] }),
      ]);
      assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(await db.booking.count({ where: { date: day, courtId: courts[0].id, time: slot(14).time, status: { in: ['confirmed', 'CONFIRMED'] } } }), 1);
    });
    await t.test('inside-window manager exception is disabled by default and FO cannot impersonate approver', async () => {
      const now = businessNow();
      const soon = now.hour < 19 ? { date: today(), hour: Math.max(6, now.hour + 1) } : { date: today(new Date(Date.now() + 86400000)), hour: 6 };
      const near = await db.booking.create({ data: { ...slot(soon.hour, courts[1].id, soon.date), code: 'NEAR', title: 'Near start', kind: 'court', userId: member.id, location: 'Arena', price: 20000, status: 'CONFIRMED' } });
      const detail = await courtChangeDetail(db, near.id, member);
      assert.equal(detail.eligibility.eligible, false);
      const old = process.env.COURT_MANAGER_EXCEPTIONS_ENABLED; delete process.env.COURT_MANAGER_EXCEPTIONS_ENABLED;
      try {
        await assert.rejects(quoteCourtChange(db, near.id, admin, slot(6), 'Manager approval'), (e: any) => e.code === 'POLICY_WINDOW_EXPIRED');
        process.env.COURT_MANAGER_EXCEPTIONS_ENABLED = 'true';
        for (const actor of [member, fo]) await assert.rejects(quoteCourtChange(db, near.id, actor, slot(6), 'Admin approved'), (e: any) => e.code === 'POLICY_WINDOW_EXPIRED');
        await rescheduleCourt(db, near.id, admin, slot(6), detail.revision, 'Manager move', 'Facility disruption approved by manager');
        const history = await db.bookingChangeHistory.findFirstOrThrow({ where: { bookingId: near.id } });
        assert.equal(history.policyException, true); assert.equal(history.approvedById, admin.id); assert.match(history.previous, /Near|courtId/);
      } finally { if (old === undefined) delete process.env.COURT_MANAGER_EXCEPTIONS_ENABLED; else process.env.COURT_MANAGER_EXCEPTIONS_ENABLED = old; }
    });
    await t.test('cancellation request, rejection, approval, repeat review and payment separation', async () => {
      const paid = await db.booking.create({ data: { ...slot(8, courts[0].id, nextDay), code: 'CANCEL-PAID', title: 'Paid', kind: 'court', userId: member.id, location: 'Arena', price: 20000, status: 'CONFIRMED', paymentStatus: 'paid' } });
      const first = await requestCourtCancellation(db, paid.id, member, 'Cannot attend');
      assert.equal(first.status, 'requested'); assert.equal((await db.booking.findUniqueOrThrow({ where: { id: paid.id } })).status, 'CONFIRMED');
      assert.equal((await requestCourtCancellation(db, paid.id, member, 'Retry request')).id, first.id);
      await assert.rejects(reviewCourtCancellation(db, paid.id, first.id, member, true, 'Self approval'), (e: any) => e.statusCode === 403);
      await reviewCourtCancellation(db, paid.id, first.id, fo, false, 'Please confirm with customer');
      await assert.rejects(reviewCourtCancellation(db, paid.id, first.id, admin, true, 'Second review'), (e: any) => e.code === 'INVALID_CANCELLATION_TRANSITION');
      const second = await requestCourtCancellation(db, paid.id, member, 'Confirmed cancellation request');
      await reviewCourtCancellation(db, paid.id, second.id, admin, true, 'Customer confirmed cancellation');
      const changed = await db.booking.findUniqueOrThrow({ where: { id: paid.id } }); assert.equal(changed.status, 'cancelled'); assert.equal(changed.paymentStatus, 'paid');
      assert.equal(await db.transaction.count(), 0); assert.equal((await db.bookingCancellationRequest.findUniqueOrThrow({ where: { id: second.id } })).refundStatus, 'manual_review');
      await assert.rejects(quoteCourtChange(db, paid.id, member, slot(8)), (e: any) => e.code === 'BOOKING_NOT_ELIGIBLE');
      const unpaid = await requestCourtCancellation(db, sibling.id, member, 'Cancel other segment'); assert.equal(unpaid.status, 'completed'); assert.equal(unpaid.refundStatus, 'not_applicable');
    });
    await t.test('package debit, concurrent final session, correction restoration and expiry history', async () => {
      const pkg = await db.badmintonEnrollment.create({ data: { studentId: member.id, userId: member.id, studentName: member.name, phone: '', categoryCode: 'FOUNDATION', packageId: 'test-original-package', packageName: 'Original visits', startDate: today(), expiryDate: nextDay, sessionsTotal: 1, sessionsRemaining: 1 } });
      const results = await Promise.allSettled([db.$transaction(tx => createBadmintonVisit(tx, pkg.id, fo.id)), db.$transaction(tx => createBadmintonVisit(tx, pkg.id, admin.id))]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(await db.badmintonCheckIn.count({ where: { enrollmentId: pkg.id } }), 1);
      const visit = await db.badmintonCheckIn.findFirstOrThrow({ where: { enrollmentId: pkg.id } }); assert.equal(visit.enrollmentId, pkg.id); assert.match(visit.packageSnapshot!, /Original visits/);
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsRemaining, 0);
      await db.$transaction(tx => correctBadmintonVisit(tx, visit.id, admin.id, 'excused', 'Entered wrong participant'));
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsRemaining, 1);
      await db.$transaction(tx => correctBadmintonVisit(tx, visit.id, admin.id, 'excused', 'Retain excused status'));
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsRemaining, 1);
      await db.$transaction(tx => correctBadmintonVisit(tx, visit.id, admin.id, 'late', 'Participant arrived late'));
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsRemaining, 0);
      await db.badmintonEnrollment.update({ where: { id: pkg.id }, data: { expiryDate: '2020-01-01' } });
      await assert.rejects(db.$transaction(tx => createBadmintonVisit(tx, pkg.id, fo.id)), (e: any) => e.code === 'ALREADY_CHECKED_IN');
      assert.equal(await db.badmintonCheckIn.count({ where: { enrollmentId: pkg.id } }), 1);
      await db.$transaction(tx => correctBadmintonVisit(tx, visit.id, admin.id, 'absent', 'Restore mistaken visit after expiry'));
      assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsRemaining, 1);
      await db.badmintonEnrollment.update({ where: { id: pkg.id }, data: { renewalCount: 1, expiryDate: nextDay } });
      await assert.rejects(db.$transaction(tx => correctBadmintonVisit(tx, visit.id, admin.id, 'present', 'Earlier cycle cannot debit renewal')), (e: any) => e.code === 'HISTORICAL_PACKAGE_REVIEW_REQUIRED');
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
});
