import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, chmodSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

if (
  process.env.NODE_ENV === "production" ||
  !process.env.DATABASE_URL?.startsWith("file:")
)
  throw new Error(
    "This helper is restricted to local SQLite. Review normal migrations for production.",
  );
const path = resolve(
  new URL("../prisma/", import.meta.url).pathname,
  process.env.DATABASE_URL.slice(5),
);
const migration = "20261013120000_hybrid_auth";
const sql = readFileSync(
  new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url),
  "utf8",
);
const db = new DatabaseSync(path);
if (db.prepare("SELECT name FROM sqlite_master WHERE name='AuthSession'").get())
  throw new Error("Hybrid migration is already present.");
if (db.prepare("PRAGMA foreign_key_check").all().length)
  throw new Error("Resolve existing foreign-key violations before migration.");
if (!process.argv.includes("--apply")) {
  console.log(
    `Read-only review: ${db.prepare("SELECT id FROM User").all().length} existing users; run with --apply only after rehearsal and backup.`,
  );
} else {
  const backupDirectory = resolve(homedir(), ".codex/backups/zawana-hybrid");
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const backup = resolve(backupDirectory, "dev.db.hybrid-backup-" + Date.now());
  db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string }[];
    const snapshots = tables
      .filter((t) => t.name !== "_prisma_migrations")
      .map((t) => ({
        table: t.name,
        rows: db
          .prepare(
            'SELECT * FROM "' +
              t.name.replaceAll('"', '""') +
              '" ORDER BY rowid',
          )
          .all(),
      }));
    // Use SQLite backup semantics so WAL contents are included; the write lock prevents concurrent mutations.
    execFileSync("python3", [
      "-c",
      'import sqlite3,sys; s=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close(); s.close()',
      path,
      backup,
    ]);
    chmodSync(backup, 0o600);
    db.exec(sql);
    for (const entry of snapshots) {
      const after = db
        .prepare(
          'SELECT * FROM "' +
            entry.table.replaceAll('"', '""') +
            '" ORDER BY rowid',
        )
        .all();
      // User table reconstruction can alter rowid ordering; compare by primary ID.
      const ordered = (rows: unknown[]) =>
        [...rows]
          .sort((a: any, b: any) =>
            String(a.id || "").localeCompare(String(b.id || "")),
          )
          .map((row: any) =>
            Object.fromEntries(
              Object.keys(row)
                .sort()
                .map((key) => [key, row[key]]),
            ),
          );
      if (
        JSON.stringify(ordered(entry.rows)) !== JSON.stringify(ordered(after))
      )
        throw new Error("Existing table data changed: " + entry.table);
    }
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("Foreign-key verification failed.");
    db.prepare(
      "INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES (?,?,?,?,?,?)",
    ).run(
      migration,
      createHash("sha256").update(sql).digest("hex"),
      new Date().toISOString(),
      migration,
      new Date().toISOString(),
      1,
    );
    db.exec("COMMIT; PRAGMA foreign_keys=ON");
    console.log(
      `Applied the reviewed local migration; all existing table data is unchanged. Backup: ${backup}`,
    );
  } catch (error) {
    db.exec("ROLLBACK; PRAGMA foreign_keys=ON");
    throw error;
  }
}
db.close();
