import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createBadmintonVisit } from '../src/services/badmintonAttendance.js';
import { PrismaClient } from '@prisma/client';
import { today } from '../src/services/courtPolicy.js';
// @ts-ignore Standalone recovery command is also exercised directly as a module.
import { recoverAttendanceMigration } from '../scripts/recover-attendance-migration.mjs';

const migrationName = '20261027120000_attendance_court_changes';
const migration = readFileSync(new URL(`../prisma/migrations/${migrationName}/migration.sql`, import.meta.url), 'utf8');
const schema = execFileSync(new URL('../node_modules/.bin/prisma', import.meta.url).pathname,
  ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', new URL('../prisma/schema.prisma', import.meta.url).pathname, '--script'], { encoding: 'utf8' });
function previousDatabase(file: string) {
  const db = new DatabaseSync(file); db.exec(schema);
  db.exec(`DROP TABLE BookingChangeHistory; DROP TABLE BookingCancellationRequest; DROP TABLE AttendanceModification;
    ALTER TABLE BookingAttendance DROP COLUMN status; ALTER TABLE BookingAttendance DROP COLUMN notes;
    ALTER TABLE BadmintonCheckIn DROP COLUMN status; ALTER TABLE BadmintonCheckIn DROP COLUMN packageSnapshot;
    DROP INDEX BadmintonCheckIn_dailyKey_key; ALTER TABLE BadmintonCheckIn DROP COLUMN dailyKey;`);
  db.exec(`INSERT INTO BadmintonEnrollment(id,studentId,studentName,phone,packageId,packageName,sessionsTotal,sessionsRemaining,startDate,expiryDate)
    VALUES ('legacy-package','member','Historical participant','','original','Original package',20,7,'2020-01-01','2099-01-01')`);
  const insert = db.prepare('INSERT INTO BadmintonCheckIn(id,enrollmentId,date,time,sessionsUsed,note) VALUES (?,?,?,?,?,?)');
  for (const [id, date] of [['a',today()],['b',today()],['c','2020-01-02'],['d','2020-01-02']]) insert.run(id,'legacy-package',date,'09:00',1,`Historical visit ${id}`);
  return db;
}
function historicalData(db: DatabaseSync) {
  return { visits: db.prepare('SELECT id,enrollmentId,date,time,sessionsUsed,note FROM BadmintonCheckIn ORDER BY id').all(), balances: db.prepare('SELECT id,sessionsRemaining FROM BadmintonEnrollment ORDER BY id').all() };
}
test('fresh migration preserves repeated historical visits and guards new daily writes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-migration-duplicates-')), file = join(dir, 'test.db');
  let db: PrismaClient | undefined;
  try {
    const sqlite = previousDatabase(file), before = historicalData(sqlite);
    sqlite.exec(migration);
    assert.deepEqual(historicalData(sqlite), before);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM BadmintonCheckIn WHERE dailyKey IS NOT NULL').get()!.n, 2);
    assert.throws(() => sqlite.prepare('INSERT INTO BadmintonCheckIn(id,enrollmentId,date,time,dailyKey) VALUES (?,?,?,?,?)').run('duplicate','legacy-package',today(),'10:00',`legacy-package:${today()}`), /UNIQUE constraint failed/);
    sqlite.close();
    db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
    await assert.rejects(db.$transaction(tx => createBadmintonVisit(tx, 'legacy-package', null)), (e: any) => e.code === 'CATEGORY_REVIEW_REQUIRED');
    assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({ where: { id: 'legacy-package' } })).sessionsRemaining, 7);
    assert.equal(await db.badmintonCheckIn.count(), 4);
  } finally { await db?.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
});
test('forward recovery repairs the P3018 partial schema, backs up and resolves Prisma without deleting history', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-migration-recovery-')), file = join(dir, 'test.db');
  try {
    const sqlite = previousDatabase(file), before = historicalData(sqlite);
    const originalMigration = migration.slice(0, migration.indexOf('-- Seed one technical guard')) + 'CREATE UNIQUE INDEX BadmintonCheckIn_enrollmentId_date_key ON BadmintonCheckIn(enrollmentId,date);';
    assert.throws(() => sqlite.exec(originalMigration), /UNIQUE constraint failed/);
    sqlite.exec(`CREATE TABLE _prisma_migrations (
      id TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, finished_at DATETIME, migration_name TEXT NOT NULL,
      logs TEXT, rolled_back_at DATETIME, started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, applied_steps_count INTEGER NOT NULL DEFAULT 0
    );`);
    sqlite.prepare('INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,logs) VALUES (?,?,?,?,?)').run('failed-migration', '0'.repeat(64), migrationName, Date.now(), 'UNIQUE constraint failed');
    sqlite.close();
    const result = await recoverAttendanceMigration(file);
    assert.ok(existsSync(result.backupPath));
    const recovered = new DatabaseSync(file);
    assert.deepEqual(historicalData(recovered), before);
    assert.equal(recovered.prepare('SELECT COUNT(*) AS n FROM BadmintonCheckIn WHERE dailyKey IS NOT NULL').get()!.n, 2);
    assert.equal(recovered.prepare('SELECT COUNT(*) AS n FROM _prisma_migrations WHERE migration_name=? AND finished_at IS NULL AND rolled_back_at IS NULL').get(migrationName)!.n, 0);
    assert.equal(recovered.prepare('SELECT COUNT(*) AS n FROM _prisma_migrations WHERE migration_name=? AND finished_at IS NOT NULL').get(migrationName)!.n, 1);
    recovered.close();
    const backup = new DatabaseSync(result.backupPath, { readOnly: true }); assert.deepEqual(historicalData(backup), before); backup.close();
    await assert.rejects(recoverAttendanceMigration(file), /No unresolved attendance migration/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
