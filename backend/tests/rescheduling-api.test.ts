import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createReschedulingRouter } from '../src/routes/rescheduling.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { today } from '../src/services/courtPolicy.js';
import { addDateKeyDays } from '../src/utils/dateKeys.js';

test('shared replacement availability and operational reason API preserve ownership and history', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rescheduling-api-')), file = join(dir, 'db');
  const sql = new DatabaseSync(file), root = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(root).filter(name => /^\d/.test(name)).sort()) sql.exec(readFileSync(new URL(`${name}/migration.sql`, root), 'utf8'));
  sql.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  let server: ReturnType<express.Express['listen']> | undefined;
  try {
    const member = await db.user.create({ data: { name: 'Member', email: 'member@replacement.test', role: 'member' } });
    const other = await db.user.create({ data: { name: 'Other', email: 'other@replacement.test', role: 'member' } });
    const staff = await db.user.create({ data: { name: 'FO', email: 'fo@replacement.test', role: 'badminton_fo' } });
    const coachUser = await db.user.create({ data: { name: 'Coach', email: 'coach@replacement.test', role: 'coach' } });
    const coach = await db.coach.create({ data: { name: 'Coach', userId: coachUser.id, department: 'Badminton', specialty: 'Badminton', email: coachUser.email, phone: '' } });
    const court = await db.court.create({ data: { name: 'Court', type: 'Standard', surface: '', price: 20000, features: [] } });
    const date = addDateKeyDays(today(), 4);
    const make = (kind: 'court' | 'private_course', code: string, time: string) => db.booking.create({ data: { kind, code, userId: member.id, coachId: kind === 'private_course' ? coach.id : null, courtId: court.id, title: code, location: 'Arena', date, time, status: 'CONFIRMED', paymentStatus: 'paid', price: 20000 } });
    const rental = await make('court', 'RENTAL', '8:00 AM — 9:00 AM');
    const course = await make('private_course', 'PRIVATE', '9:00 AM — 10:00 AM');
    await make('court', 'OCCUPIED', '10:00 AM — 11:00 AM');
    const actors = { member, other, staff };
    const app = express(); app.use(express.json());
    app.use('/rescheduling', createReschedulingRouter(db, (req, _res, next) => { req.user = actors[(req.headers['x-actor'] || 'member') as keyof typeof actors]; next(); }));
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const request = (path: string, actor = 'member', body?: unknown) => fetch(`http://127.0.0.1:${address.port}/rescheduling${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-actor': actor }, ...(body ? { body: JSON.stringify(body) } : {}) });
    for (const reason of ['', 'Other', 'event']) assert.equal((await request('/requests', 'staff', { bookingId: rental.id, reason })).status, 400);
    const sent = await request('/requests', 'staff', { bookingId: rental.id, reason: 'MAINTENANCE', notes: 'Court inspection' }); assert.equal(sent.status, 201); const row = await sent.json();
    assert.equal(row.reason, 'MAINTENANCE'); const createdEvent = await db.rescheduleRequestEvent.findFirstOrThrow({ where: { requestId: row.id } }); assert.equal((createdEvent.detail as { notes: string }).notes, 'Court inspection'); assert.deepEqual(await db.booking.findUnique({ where: { id: rental.id } }), rental);
    for (const path of [`/requests/${row.id}/availability`, `/private/${course.id}/availability`]) {
      const response = await request(`${path}?date=${date}&courtId=${court.id}`); assert.equal(response.status, 200);
      const { slots } = await response.json(); assert.equal(slots.find((slot: { time: string }) => slot.time === '10:00 AM — 11:00 AM').available, false);
      assert.equal(slots.find((slot: { time: string }) => slot.time === '11:00 AM — 12:00 PM').available, true);
      assert.ok([403, 404].includes((await request(`${path}?date=${date}&courtId=${court.id}`, 'other')).status));
      assert.equal((await request(`${path}?date=invalid&courtId=${court.id}`)).status, 400);
    }
    await db.bookingRescheduleRequest.update({ where: { id: row.id }, data: { reason: 'Historical custom reason' } });
    const history = await (await request('/requests')).json(); assert.equal(history[0].reason, 'Historical custom reason');
    assert.deepEqual(await db.booking.findUnique({ where: { id: course.id } }), course);
  } finally { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
});
