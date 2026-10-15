/** Isolated PostgreSQL SQL validation (PGlite), not production or multi-connection concurrency.
 * npm install --prefix /tmp/zawana-pg-qa --no-audit --no-fund @electric-sql/pglite
 * PGLITE_ROOT=/tmp/zawana-pg-qa/node_modules/@electric-sql/pglite node scripts/verify-court-postgres.mjs
 * No app dependency, schema or production database is changed by this script.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
try {
  const schema = execFileSync(
    new URL("../node_modules/.bin/prisma", import.meta.url).pathname,
    [
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      new URL("../prisma/postgresql/schema.prisma", import.meta.url).pathname,
      "--script",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://localhost:5432/qa",
        DIRECT_URL: "postgresql://localhost:5432/qa",
      },
    },
  );
  await pg.exec(
    schema.replace(/CREATE TABLE "BookingSubmission" \([\s\S]*?\);/, ""),
  );
  await pg.exec(
    readFileSync(
      new URL(
        "../prisma/postgresql/migrations/20261014190000_court_booking_integrity/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    `INSERT INTO "User" (id,name,email,"role") VALUES ('qa-user','QA','pg-qa@example.test','member'); INSERT INTO "Court" (id,name,type,surface,price,features) VALUES ('qa-court','QA Court','Standard','Indoor',20000,'[]');`,
  );
  const insert = async (id, time, status = "CONFIRMED") =>
    pg.query(
      `INSERT INTO "Booking" (id,code,"userId",kind,title,date,time,location,price,"courtId",status) VALUES ($1,$1,'qa-user','court','QA','2026-10-16',$2,'QA',20000,'qa-court',$3)`,
      [id, time, status],
    );
  await insert("original", "8:00 AM — 9:00 AM");
  for (const [id, time] of [
    ["alias", "08:00 AM - 09:00 AM"],
    ["overlap", "8:30 AM — 9:30 AM"],
    ["to-alias", "8:00 AM to 9:00 AM"],
  ])
    await assert.rejects(insert(id, time), (e) => e.code === "23P01");
  await insert("adjacent", "9:00 AM — 10:00 AM");
  await insert("cancelled", "8:00 AM — 9:00 AM", "cancelled");
  await assert.rejects(
    pg.query(`UPDATE "Booking" SET status='CONFIRMED' WHERE id='cancelled'`),
    (e) => e.code === "23P01",
  );
  await pg.query(`UPDATE "Booking" SET status='cancelled' WHERE id='original'`);
  await insert("replacement", "8:00 AM — 9:00 AM");
  assert.equal(
    (
      await pg.query(
        `SELECT count(*)::int n FROM "Booking" WHERE status='CONFIRMED'`,
      )
    ).rows[0].n,
    2,
  );
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
    "PASS: actual PostgreSQL schema and complete migration executed in PGlite; aliases, overlaps, adjacent slots, cancellation, reactivation and receipt uniqueness verified.",
  );
  console.log(
    "NOT VERIFIED: multi-connection PostgreSQL concurrency and production migration permissions/data.",
  );
} catch (error) {
  console.error({ code: error.code, message: error.message });
  process.exitCode = 1;
} finally {
  await pg.close();
}
