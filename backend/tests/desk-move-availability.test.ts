import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { deskMoveAvailability } from '../src/services/deskMoveAvailability.js';
import { createReschedulingRouter } from '../src/routes/rescheduling.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { today } from '../src/services/courtPolicy.js';
import { addDateKeyDays } from '../src/utils/dateKeys.js';

test('staff rental replacement availability preserves duration and calendar rules without writes', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'rental-slots-')), file = join(dir, 'qa.db');
  const sqlite = new DatabaseSync(file), root = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(root).filter(name => /^\d/.test(name)).sort()) sqlite.exec(readFileSync(new URL(`${name}/migration.sql`, root), 'utf8'));
  sqlite.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  let server: Server | undefined;
  try {
    const admin = await db.user.create({ data: { name: 'Admin', email: 'admin@slots.test', role: 'admin' } });
    const fo = await db.user.create({ data: { name: 'FO', email: 'fo@slots.test', role: 'badminton_fo' } });
    const member = await db.user.create({ data: { name: 'Member', email: 'member@slots.test', role: 'member' } });
    const courts = await Promise.all(['Court 1', 'Court 5'].map(name => db.court.create({ data: { name, type: 'Standard', surface: 'Indoor', price: 20000, features: [] } })));
    const date = addDateKeyDays(today(), 7);
    const make = (courtId: string, time: string, status: 'confirmed' | 'pending' = 'confirmed') => db.booking.create({ data: { code: randomUUID(), userId: member.id, kind: 'court', courtId, title: 'Court rental', date, time, location: 'Arena', price: 40000, status, paymentStatus: 'paid' } });
    const original = await make(courts[0].id, '9:00 AM — 11:00 AM');
    const selected = await make(courts[0].id, '11:00 AM — 12:00 PM');
    await make(courts[1].id, '8:00 AM — 9:00 AM', 'pending');
    await make(courts[1].id, '12:00 PM — 1:00 PM');
    const weekly = await db.courtBlock.create({ data: { courtId: courts[1].id, date: '', dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay(), type: 'class', title: 'Weekly class', start: '14:00', end: '15:00', excludedDates: [] } });
    await db.courtBlock.create({ data: { courtId: courts[1].id, date, type: 'maintenance', title: 'Maintenance', start: '17:00', end: '18:00' } });
    const input = { bookingIds: [original.id, selected.id], targets: [{ bookingId: original.id, courtId: courts[1].id, date }] };
    const times = async (payload = input) => (await deskMoveAvailability(db, admin, payload)).rows[0].slots.map(slot => slot.time);
    const beforeBookings = await db.booking.findMany({ orderBy: { id: 'asc' } }), beforeBlocks = await db.courtBlock.findMany({ orderBy: { id: 'asc' } });
    await t.test('only whole duration fits are offered; pending rentals, classes and maintenance block every overlapping range', async () => {
      const result = await times();
      assert.deepEqual(result, ['6:00 AM — 8:00 AM', '9:00 AM — 11:00 AM', '10:00 AM — 12:00 PM', '3:00 PM — 5:00 PM', '6:00 PM — 8:00 PM', '7:00 PM — 9:00 PM']);
      assert.equal((await deskMoveAvailability(db, fo, input)).rows[0].durationMinutes, 120);
      const oneHour = await deskMoveAvailability(db, admin, { ...input, targets: [{ ...input.targets[0], bookingId: selected.id }] });
      assert.equal(oneHour.rows[0].durationMinutes, 60);
      assert.ok(oneHour.rows[0].slots.some(slot => slot.time === '8:00 PM — 9:00 PM'));
    });
    await t.test('only selected originals are ignored so batch swaps remain possible', async () => {
      const target = { bookingId: original.id, courtId: courts[0].id, date };
      assert.ok((await times({ ...input, targets: [target] })).includes('10:00 AM — 12:00 PM'));
      assert.ok(!(await times({ bookingIds: [original.id], targets: [target] })).includes('10:00 AM — 12:00 PM'));
    });
    await t.test('closures, unavailable courts and past times are omitted', async () => {
      await db.court.update({ where: { id: courts[1].id }, data: { status: 'maintenance' } });
      assert.deepEqual(await times(), []);
      await db.court.update({ where: { id: courts[1].id }, data: { status: 'available' } });
      await db.courtDateOverride.create({ data: { date, type: 'closed', title: 'Closed' } });
      assert.deepEqual(await times(), []);
      await db.courtDateOverride.delete({ where: { date } });
      const result = await deskMoveAvailability(db, admin, input, new Date(`${date}T08:30:00+06:30`));
      assert.ok(!result.rows[0].slots.some(slot => slot.time === '6:00 AM — 8:00 AM'));
      assert.ok(result.rows[0].slots.some(slot => slot.time === '9:00 AM — 11:00 AM'));
    });
    await t.test('weekly exclusions and holiday suspension rules match the normal court calendar', async () => {
      await db.courtBlock.update({ where: { id: weekly.id }, data: { excludedDates: [date] } });
      assert.ok((await times()).includes('2:00 PM — 4:00 PM'));
      await db.courtBlock.update({ where: { id: weekly.id }, data: { excludedDates: [] } });
      await db.courtDateOverride.create({ data: { date, type: 'open', weeklyOnly: true, suspendedBlockIds: [weekly.id] } });
      assert.ok((await times()).includes('2:00 PM — 4:00 PM'));
      assert.ok(!(await times()).includes('4:00 PM — 6:00 PM'));
      await db.courtDateOverride.delete({ where: { date } });
    });
    await t.test('calendar failures remain errors, and invalid selections are rejected', async () => {
      const offline = new Proxy(db, { get(target, key, receiver) { if (key === 'courtBlock') return { findMany: async () => { throw new Error('Calendar storage offline'); } }; return Reflect.get(target, key, receiver); } });
      await assert.rejects(deskMoveAvailability(offline, admin, input), /Calendar storage offline/);
      await assert.rejects(deskMoveAvailability(db, member, input), /Only badminton desk/);
      await assert.rejects(times({ ...input, bookingIds: [original.id, original.id] }), /Select each rental once/);
      await assert.rejects(times({ ...input, bookingIds: [selected.id] }), /Select each rental once/);
      await assert.rejects(times({ ...input, targets: [{ ...input.targets[0], date: '2026-02-30' }] }), /valid date/);
      await assert.rejects(times({ ...input, targets: [{ ...input.targets[0], courtId: 'missing' }] }), /destination court no longer exists/);
      await db.booking.update({ where: { id: original.id }, data: { paymentStatus: 'refunded' } });
      await assert.rejects(times(), /Only future confirmed/);
      await db.booking.update({ where: { id: original.id }, data: { paymentStatus: 'paid' } });
    });
    await t.test('HTTP endpoint authorizes staff, validates input and keeps responses uncached', async () => {
      const app = express(); app.use(express.json());
      app.use('/rescheduling', createReschedulingRouter(db, (req, _res, next) => { req.user = req.headers['x-actor'] === 'admin' ? admin : member; next(); }));
      app.use(errorHandler); server = app.listen(0, '127.0.0.1');
      await new Promise<void>(resolve => server!.once('listening', resolve));
      const address = server.address(); assert.ok(address && typeof address !== 'string');
      const request = (actor: string, payload: unknown) => fetch(`http://127.0.0.1:${address.port}/rescheduling/moves/availability`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-actor': actor }, body: JSON.stringify(payload) });
      assert.equal((await request('member', input)).status, 403);
      assert.equal((await request('admin', { ...input, ignoreEverything: true })).status, 400);
      const result = await request('admin', input); assert.equal(result.status, 200); assert.equal(result.headers.get('Cache-Control'), 'no-store');
      assert.ok((await result.json()).rows[0].slots.every((slot: { time: string }) => typeof slot.time === 'string'));
    });
    assert.deepEqual(await db.booking.findMany({ orderBy: { id: 'asc' } }), beforeBookings);
    assert.deepEqual(await db.courtBlock.findMany({ orderBy: { id: 'asc' } }), beforeBlocks);
    assert.equal(await db.transaction.count(), 0); assert.equal(await db.bookingChangeHistory.count(), 0);
  } finally { await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
});
