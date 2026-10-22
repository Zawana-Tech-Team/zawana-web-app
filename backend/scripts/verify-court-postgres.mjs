/** In-memory PostgreSQL semantics and migration validation. Never connects to production.
 * npm install --prefix /tmp/zawana-pg-qa --no-audit --no-fund @electric-sql/pglite
 * PGLITE_ROOT=/tmp/zawana-pg-qa/node_modules/@electric-sql/pglite node scripts/verify-court-postgres.mjs
 * Multi-connection coverage lives in tests/court-postgres.integration.test.ts.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const root = process.env.PGLITE_ROOT;
if (!root)
  throw new Error(
    "Set PGLITE_ROOT to an isolated installation of @electric-sql/pglite.",
  );
const { PGlite } = await import(
  pathToFileURL(resolve(root, "dist/index.js")).href
);
const { btree_gist } = await import(
  pathToFileURL(resolve(root, "dist/contrib/btree_gist.js")).href
);
const pg = new PGlite({ extensions: { btree_gist } });
const migrationRoot = new URL(
  "../prisma/postgresql/migrations/",
  import.meta.url,
);
const repairName = "20261021120000_court_time_parser";
try {
  for (const name of readdirSync(migrationRoot)
    .filter((n) => /^\d/.test(n))
    .sort()) {
    if (name === repairName) continue;
    await pg.exec(
      readFileSync(new URL(`${name}/migration.sql`, migrationRoot), "utf8"),
    );
  }
  await pg.exec(
    `INSERT INTO "User" (id,name,email,role) VALUES ('qa-user','QA','pg-qa@example.test','member'); INSERT INTO "Court" (id,name,type,surface,price,features) VALUES ('qa-court','QA Court','Standard','Indoor',20000,'[]');`,
  );
  const insert = (id, time, status = "CONFIRMED") =>
    pg.query(
      `INSERT INTO "Booking" (id,code,"userId",kind,title,date,time,location,price,"courtId",status) VALUES ($1,$1,'qa-user','court','QA','2026-10-23',$2,'QA',20000,'qa-court',$3)`,
      [id, time, status],
    );
  const repair = readFileSync(
    new URL(`${repairName}/migration.sql`, migrationRoot),
    "utf8",
  );
  await insert("legacy-evening", "18:00 — 19:00");
  await assert.rejects(
    insert("false-morning", "6:00 AM — 7:00 AM"),
    (e) => e.code === "23P01",
  );
  // Old parser permits a real duplicate in another representation. The repair must stop.
  await insert("legacy-duplicate", "6:00 PM — 7:00 PM");
  await assert.rejects(pg.exec(repair), (e) => e.code === "23P01");
  await pg.exec("ROLLBACK");
  assert.equal(
    (await pg.query(`SELECT count(*)::int n FROM "Booking"`)).rows[0].n,
    2,
  );
  assert.equal(
    (await pg.query(`SELECT public.zawana_booking_minutes('18:00') n`)).rows[0]
      .n,
    360,
  );
  await pg.exec(`DELETE FROM "Booking" WHERE id='legacy-duplicate'`); // fixture-only
  await insert("legacy-empty", "8:00 AM — 8:00 AM");
  await assert.rejects(pg.exec(repair), (e) => e.code === "22007");
  await pg.exec("ROLLBACK");
  assert.equal(
    (
      await pg.query(
        `SELECT count(*)::int n FROM "Booking" WHERE id='legacy-empty'`,
      )
    ).rows[0].n,
    1,
  );
  await pg.exec(`DELETE FROM "Booking" WHERE id='legacy-empty'`); // fixture-only
  await pg.exec(repair);
  for (const [time, minute] of [
    ["00:00", 0],
    ["12:00", 720],
    ["18:00", 1080],
    ["12:00 AM", 0],
    ["12:00 PM", 720],
  ])
    assert.equal(
      (await pg.query(`SELECT public.zawana_booking_minutes($1) n`, [time]))
        .rows[0].n,
      minute,
    );
  await insert("morning", "6:00 AM — 7:00 AM");
  await insert("adjacent", "19:00 — 20:00");
  for (const time of [
    "6:00 PM — 7:00 PM",
    "18:30 — 19:30",
    "6:00 PM to 7:00 PM",
  ])
    await assert.rejects(
      insert("conflict-" + Math.random(), time),
      (e) => e.code === "23P01",
    );
  await insert("cancelled", "18:00 — 19:00", "cancelled");
  await assert.rejects(
    pg.exec(`UPDATE "Booking" SET status='CONFIRMED' WHERE id='cancelled'`),
    (e) => e.code === "23P01",
  );
  await pg.exec(
    `UPDATE "Booking" SET status='cancelled' WHERE id='legacy-evening'`,
  );
  await insert("replacement", "6:00 PM — 7:00 PM");
  for (const time of ["18:60 — 19:00", "24:00 — 25:00", "6:00 AM — 6:00 AM"])
    await assert.rejects(
      insert("invalid-" + Math.random(), time),
      (e) => e.code === "22007",
    );

  // Exercise the actual INSERT text and adapter from the deployed server source.
  const source = readFileSync(
    new URL("../src/server.ts", import.meta.url),
    "utf8",
  );
  const adapter = source
    .slice(
      source.indexOf("const portableSql ="),
      source.indexOf("const rawQuery ="),
    )
    .replace("(sql: string)", "(sql)");
  const portableSql = new Function(
    "sqliteDatabase",
    adapter + "return portableSql;",
  )(false);
  const insertBlock = source.match(/`(INSERT INTO "CourtBlock"[^`]+)`/)[1];
  await pg.query(portableSql(insertBlock), [
    "qa-block",
    "qa-court",
    "",
    "18:00",
    "19:00",
    "Class",
    "class",
    null,
    5,
    true,
  ]);
  const list = portableSql(
    `SELECT cb.*, c.name as courtName FROM "CourtBlock" cb JOIN "Court" c ON c.id = cb.courtId WHERE (cb.date=? AND cb.active=1 OR (cb.dayOfWeek=? AND cb.active=1)) AND cb.courtId=? ORDER BY cb.start ASC`,
  );
  const blocks = await pg.query(list, ["2026-10-23", 5, "qa-court"]);
  assert.equal(blocks.rows.length, 1);
  assert.equal(blocks.rows[0].courtName, "QA Court");
  assert.equal(blocks.rows[0].end, "19:00");
  await pg.exec(
    `INSERT INTO "BookingSubmission" ("userId",key,"payloadHash","bookingIds") VALUES ('qa-user','key','hash','["replacement"]')`,
  );
  await assert.rejects(
    pg.exec(
      `INSERT INTO "BookingSubmission" ("userId",key,"payloadHash","bookingIds") VALUES ('qa-user','key','hash','[]')`,
    ),
    (e) => e.code === "23505",
  );
  console.log(
    "PASS: complete PostgreSQL migration history, non-destructive repair rollback, index rebuild, mixed time formats, overlaps, adjacent slots, cancelled bookings, raw court-block INSERT/retrieval and receipt uniqueness.",
  );
  console.log(
    "NOT VERIFIED HERE: multi-connection concurrency and production permissions/data; use the dedicated PostgreSQL integration suite and deployment preflight.",
  );
} finally {
  await pg.close();
}
