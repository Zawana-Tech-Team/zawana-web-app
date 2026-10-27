import { DatabaseSync, backup } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const migrationName = '20261027120000_attendance_court_changes';
const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function recoverAttendanceMigration(databaseFile, { resolveMigration = true } = {}) {
  const db = new DatabaseSync(databaseFile);
  let backupPath;
  try {
    db.exec('PRAGMA busy_timeout=10000');
    const failed = db.prepare('SELECT id FROM _prisma_migrations WHERE migration_name=? AND finished_at IS NULL AND rolled_back_at IS NULL').all(migrationName);
    if (failed.length === 0) throw new Error('No unresolved attendance migration was found. No changes made.');
    // The failed unique-index step came last. Do not mark a different partial schema applied.
    const columns = table => new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map(row => row.name));
    for (const [table, required] of [
      ['BookingAttendance', ['status', 'notes']],
      ['BadmintonCheckIn', ['status', 'packageSnapshot']],
      ['AttendanceModification', ['id', 'bookingId', 'actorId', 'reason', 'previous', 'current', 'createdAt']],
      ['BookingChangeHistory', ['id', 'bookingId', 'action', 'previous', 'current', 'requestedById', 'approvedById', 'reason', 'policyException', 'createdAt']],
      ['BookingCancellationRequest', ['id', 'bookingId', 'requestedById', 'reason', 'status', 'refundStatus', 'reviewedById', 'reviewReason', 'reviewedAt', 'createdAt']],
    ]) {
      const present = columns(table);
      if (required.some(name => !present.has(name))) throw new Error(`Unexpected partial schema in ${table}. No changes made.`);
    }
    const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(row => row.name));
    for (const name of ['AttendanceModification_bookingId_createdAt_idx', 'BookingChangeHistory_bookingId_createdAt_idx', 'BookingCancellationRequest_bookingId_createdAt_idx', 'BadmintonCheckIn_enrollmentId_date_idx']) {
      if (!indexes.has(name)) throw new Error(`Missing expected index ${name}. No changes made.`);
    }
    if (indexes.has('BadmintonCheckIn_enrollmentId_date_key')) throw new Error('Unexpected existing enrollment/date unique index. Review this database separately.');
    backupPath = `${databaseFile}.attendance-recovery-${Date.now()}.bak`;
    await backup(db, backupPath);
    db.exec('BEGIN IMMEDIATE');
    try {
      const before = db.prepare('SELECT id, enrollmentId, date, time, sessionsUsed, staffId, note, createdAt, status, packageSnapshot FROM BadmintonCheckIn ORDER BY id').all();
      const balances = db.prepare('SELECT id,sessionsRemaining FROM BadmintonEnrollment ORDER BY id').all();
      if (!columns('BadmintonCheckIn').has('dailyKey')) db.exec('ALTER TABLE "BadmintonCheckIn" ADD COLUMN "dailyKey" TEXT');
      db.exec(`UPDATE "BadmintonCheckIn" SET "dailyKey"="enrollmentId" || ':' || "date"
        WHERE "dailyKey" IS NULL AND "id" IN (SELECT MIN("id") FROM "BadmintonCheckIn" GROUP BY "enrollmentId","date")`);
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS "BadmintonCheckIn_dailyKey_key" ON "BadmintonCheckIn"("dailyKey")');
      const after = db.prepare('SELECT id, enrollmentId, date, time, sessionsUsed, staffId, note, createdAt, status, packageSnapshot FROM BadmintonCheckIn ORDER BY id').all();
      const balancesAfter = db.prepare('SELECT id,sessionsRemaining FROM BadmintonEnrollment ORDER BY id').all();
      if (JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(balances) !== JSON.stringify(balancesAfter)) throw new Error('History or balances changed unexpectedly.');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  } finally { db.close(); }
  if (resolveMigration) {
    // Follow Prisma's forward recovery: finish SQL first, then reconcile its migration history.
    const result = spawnSync(resolve(backendRoot, 'node_modules/.bin/prisma'), ['migrate', 'resolve', '--applied', migrationName], {
      cwd: backendRoot, env: { ...process.env, DATABASE_URL: `file:${resolve(databaseFile)}` }, encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(`Schema repaired and backed up at ${backupPath}, but Prisma resolution failed: ${result.stderr || result.stdout}`);
  }
  return { databaseFile, backupPath, historyPreserved: true, balancesPreserved: true };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) throw new Error('This recovery is for the local SQLite database only.');
  const databaseFile = resolve(backendRoot, 'prisma', url.slice(5));
  console.log(await recoverAttendanceMigration(databaseFile));
}
