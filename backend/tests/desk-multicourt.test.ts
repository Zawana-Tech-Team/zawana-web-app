import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { reserveDeskWeekly } from '../src/services/deskWeekly.js';
import { createCourtBooking } from '../src/services/courtBooking.js';
import { today } from '../src/services/courtPolicy.js';
import { deskRescheduleEligibility } from '../../src/utils/deskRescheduleEligibility.js';

test('future desk eligibility exempts both staff roles and excludes exactly 24 hours for members', () => {
  const start = new Date('2030-01-10T09:00:00+06:30');
  const boundary = new Date(start.getTime() - 24 * 3600000);
  assert.equal(deskRescheduleEligibility('member', '2030-01-10', '9:00 AM — 10:00 AM', boundary).eligible, false);
  assert.equal(deskRescheduleEligibility('member', '2030-01-10', '9:00 AM — 10:00 AM', new Date(+boundary + 1)).eligible, false);
  for (const role of ['admin', 'badminton_fo'] as const) assert.equal(deskRescheduleEligibility(role, '2030-01-10', '9:00 AM — 10:00 AM', start).eligible, true);
  assert.equal(deskRescheduleEligibility('coach', '2030-01-10', '9:00 AM — 10:00 AM', boundary).eligible, false);
});

test('weekly batches commit together, replay safely, reject future conflicts and serialize with rentals', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'desk-batch-')), file = join(dir, 'qa.db');
  const sqlite = new DatabaseSync(file), root = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(root).filter(name => /^\d/.test(name)).sort()) sqlite.exec(readFileSync(new URL(`${name}/migration.sql`, root), 'utf8'));
  sqlite.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  try {
    const actor = await db.user.create({ data: { name: 'Desk QA', email: 'desk@qa.test', role: 'admin' } });
    const courts = await Promise.all(['A', 'B', 'C'].map(name => db.court.create({ data: { name, type: 'Standard', surface: '', price: 20000, features: [] } })));
    const d = new Date(`${today()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 2); const date = d.toISOString().slice(0, 10);
    const input = { courtIds: courts.slice(0, 2).map(c => c.id), date, time: '8:00 AM — 9:00 AM', title: 'Batch class', requestKey: randomUUID() };
    const created = await reserveDeskWeekly(db, actor.id, input);
    assert.equal(created.length, 2);
    assert.deepEqual((await reserveDeskWeekly(db, actor.id, input)).map(r => r.id).sort(), created.map(r => r.id).sort());
    await assert.rejects(reserveDeskWeekly(db, actor.id, { ...input, title: 'Changed' }), /retry key/);
    await assert.rejects(reserveDeskWeekly(db, actor.id, { ...input, courtIds: [courts[1].id, courts[2].id], requestKey: randomUUID() }), /conflicting/);
    assert.equal(await db.courtBlock.count({ where: { courtId: courts[2].id } }), 0);
    const later = new Date(d); later.setUTCDate(later.getUTCDate() + 21);
    await createCourtBooking(db, actor, { courtId: courts[2].id, date: later.toISOString().slice(0, 10), time: '10:00 AM — 11:00 AM' }, randomUUID());
    await assert.rejects(reserveDeskWeekly(db, actor.id, { ...input, courtIds: [courts[0].id, courts[2].id], time: '10:00 AM — 11:00 AM', requestKey: randomUUID() }), /conflicting/);
    assert.equal(await db.courtBlock.count({ where: { start: '10:00' } }), 0);
    const race = await Promise.allSettled([
      reserveDeskWeekly(db, actor.id, { ...input, time: '12:00 PM — 1:00 PM', requestKey: randomUUID() }),
      createCourtBooking(db, actor, { courtId: courts[0].id, date, time: '12:00 PM — 1:00 PM' }, randomUUID()),
    ]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
    const rental = await db.booking.count({ where: { date, time: '12:00 PM — 1:00 PM' } });
    const weekly = await db.courtBlock.count({ where: { start: '12:00' } });
    assert.ok((rental === 1 && weekly === 0) || (rental === 0 && weekly === 2));
  } finally { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
});
