# Court API production diagnosis — 21 October 2026

## Findings and confidence

| Finding | Evidence | Conclusion |
| --- | --- | --- |
| Court-block creation contains a PostgreSQL syntax error | Actual INSERT in `src/server.ts` lists `end` without quotes. Executing the exact translated SQL in PostgreSQL produces `42601: syntax error at or near "end"`. Supplied PM2 logs show POST `/api/court-blocks`, Prisma `P2010`, IDs `fd08b80f-6b46-4f38-bb1a-6c2ef8c31929`, `7fc7cd88-5b22-4bbe-b3ff-91bba7f32ef3`, `e297eed5-0012-46c6-93a8-0f33413f352a`. | Confirmed source defect matching the logged request path/method/error family. Logs omit underlying SQLSTATE, so deployment revision/SQLSTATE must be correlated before claiming those individual requests are proven. |
| Reported GET failure is not currently reproduced | Read-only requests to `https://thezawana.com/api/health`, `/api/court-blocks`, and valid date/court filters returned 200. The current GET SQL also succeeds in isolated PostgreSQL. | Do not attribute GET 500 to the INSERT or assume a missing table. Supplied failure logs describe POST. Capture request ID, method and SQLSTATE if GET fails again. |
| Dependency and generated-client replacement fail in production | PM2 logs show EACCES unlinking `.prisma/client/index.js`, pnpm failing to remove `node_modules/cors`, and a failed pre-script install. | Confirmed filesystem permission problem. Does not prove which client is currently loaded; generated artifacts/build consistency must be checked. |
| Production runs a development startup command | PM2 logs repeatedly show `prisma generate --schema prisma/postgresql/schema.prisma && tsx watch src/server.ts`. | Generation/install/watch should not run at application startup. Generate/build once under the deployment user; PM2 should run `dist/src/server.js`. |
| A false PostgreSQL booking conflict is reproducible | The existing exclusion-index parser maps `18:00 — 19:00` to `[360,420)`, but the application maps it to `[1080,1140)`. A morning booking then fails with `23P01`. | Confirmed database parser defect. It explains a particular production 409 only if active legacy bookings use the affected representation. The exact 409 body and booking audit are still required. |
| Schema support exists in source | Both Prisma schemas contain CourtBlock fields, court relation and date/weekday indexes. PostgreSQL initial migration creates them, plus CourtDateOverride, HolidayRate and Booking indexes. | No evidence of a missing migration in source. Production migration state/permissions/schema remain unverified without database access. |

No production booking, block, migration, package or payment was written during diagnosis. No database reset or deletion is part of the repair.

## Request traces

The real dev/start entrypoint is `backend/src/server.ts`; `src/app.ts` and the older modular bookings router are not the configured entrypoint.

GET `/api/court-blocks` → `asyncRoute` → `courtBlocks(date,courtId)` → optional `CourtDateOverride.findUnique` → parameterized raw JOIN against CourtBlock/Court → JSON rows, including `courtName`. Date filters include active dated blocks and matching weekly blocks; an explicit open-date override excludes weekly blocks. This route remains public; changing its authentication is outside this fix.

POST `/api/court-blocks` → application-session authentication → admin/badminton-front-desk role check → Zod/input normalization → existing-block/conflict lookup → raw INSERT → retrieval. The SQL adapter quotes mixed-case identifiers but did not quote the reserved lowercase identifier `end`.

POST `/api/bookings` → application-session authentication → expire private-course reservations → Zod → court role check → `createCourtBooking` → input/date/time/status checks → transaction, optional idempotency receipt, sorted court row locks, fresh bookings/blocks/closure/holiday reads → booking and notification inserts → receipt commit. PostgreSQL additionally enforces the GiST exclusion constraint. Failures roll back all writes. Idempotent retries can recover committed results.

## 409 interpretation

- `BOOKING_CONFLICT` with `conflicts`: application rejected elapsed/invalid slots, maintenance, duplicates, real overlaps, class blocks or closure. Invalid slot availability historically uses 409; this contract is retained.
- `BOOKING_BUSY`: database exclusion/lock/transaction contention. New safe logs distinguish SQLSTATE `23P01` (exclusion), `40001`/`40P01` (contention), and Prisma P2034/P1008. A constraint error alone does not prove a real business overlap because of the old parser mismatch.
- P2002: unique/idempotency constraint. Existing response is retained.
- Cancelled, completed, rejected and expired bookings do not occupy courts. Both uppercase and lowercase confirmed statuses do. Intervals are half-open: end == next start is adjacent and allowed.
- Business time defaults to Asia/Yangon; configure BUSINESS_TIME_ZONE consistently. Date-only weekday calculations now use UTC arithmetic, independent of the host TZ. The parser defect is independent of the host timezone.

## Changes

- `backend/src/server.ts`: explicitly quote every INSERT identifier; validate court-block dates; log safe failure diagnostics with operation and request ID for both 409 and 500; include all occupying statuses in weekly-block checks; use business-date/UTC arithmetic.
- `backend/src/utils/apiDiagnostics.ts`: allowlisted error metadata, SQLSTATE/category/status; no raw messages, stack, SQL, values, request bodies, headers, credentials, emails, phones or customer IDs.
- `backend/src/services/courtBooking.ts`: host-independent weekday calculation.
- `backend/prisma/postgresql/migrations/20261021120000_court_time_parser/migration.sql`: forward-only time-parser repair and exclusion-index rebuild. Same table/columns/status predicate, no booking updates/deletes. Short lock timeout; transaction aborts on malformed/overlapping legacy data and preserves the previous functions/constraint.
- `backend/scripts/audit-court-bookings.ts`: read-only count summary by default; `--details` exposes booking codes only when explicitly requested for restricted operator review.
- `backend/scripts/verify-court-postgres.mjs`: complete migration-history execution in an isolated PostgreSQL engine; real SQL retrieval/INSERT checks, mixed formats, adjacent/cancelled/overlapping bookings, and non-destructive migration failure.
- `backend/tests/api-diagnostics.test.ts`, expanded `court-booking.test.ts`: logging privacy and real HTTP route regressions.
- `backend/tests/court-postgres.integration.test.ts`, `.github/workflows/ci.yml`: dedicated real PostgreSQL service and HTTP/concurrent-transaction regressions. The writable fixture is restricted to a loopback database named `zawana_court_test`.
- `backend/package.json`: explicit `build:postgres`, `court:audit`, and `test:court:postgres` commands.

Successful response shapes and booking conflict validation remain intact. New error response headers add X-Request-Id without removing existing fields. Invalid court-block dates now return 400 rather than reaching a database query.

## Local versus production

Local SQLite can tolerate unquoted `end` and has compatibility table creation during startup. PostgreSQL skips those SQLite DDL helpers and requires its migration history. Generating a client does not apply migrations. Default `predev`/`prisma:generate` target SQLite; PostgreSQL needs its explicit schema for both generation and migration. A SQLite client generated after a PostgreSQL one can overwrite the same output directory.

The mobile `.env` currently points to HTTPS `thezawana.com`; the web/backend local setup points to localhost/SQLite. These are different environments. Nginx is the reverse proxy; PM2/Node and database logs diagnose Prisma failures. Firebase auth is required outside local SQLite; production AUTH_MODE=database is rejected. Do not print .env or run commands that place database URLs/tokens into logs.

## Validation commands

From `backend/`, with a local SQLite client for the regular suite:

```sh
pnpm run typecheck
pnpm exec tsx --test tests/api-diagnostics.test.ts tests/court-policy.test.ts tests/court-booking.test.ts tests/private-course.test.ts
pnpm test
pnpm run build
```

In-memory PostgreSQL verification, without modifying application dependencies:

```sh
npm install --prefix /tmp/zawana-pg-qa --no-audit --no-fund @electric-sql/pglite
PGLITE_ROOT=/tmp/zawana-pg-qa/node_modules/@electric-sql/pglite node scripts/verify-court-postgres.mjs
```

Real PostgreSQL regression testing is configured in CI. For a disposable loopback database named `zawana_court_test`, provide DATABASE_URL, DIRECT_URL and COURT_POSTGRES_TEST_URL through the environment, then:

```sh
pnpm run prisma:migrate:postgres
pnpm run prisma:generate:postgres
pnpm run test:court:postgres
```

Do not point the test suite at production. The existing full suite uses SQLite and should run before switching the generated client to PostgreSQL, or in a separate workspace.

### Completed validation

- Full backend suite: 101 passed, zero failures, one PostgreSQL suite skipped in the SQLite workspace (102 tests total).
- Separate native PostgreSQL 18.4 workspace: all four test results passed, including three HTTP scenarios covering block creation/retrieval, legacy time formats/adjacency/cancellation, and simultaneous requests committing exactly one reservation. A separate generated client kept the local SQLite client unchanged.
- PGlite PostgreSQL verification: complete migration history, parser/index repair, rollback on invalid or genuinely overlapping legacy data, and actual raw CourtBlock SQL all passed.
- Backend TypeScript checking and build passed. Mobile Expo lint and TypeScript checking passed. Git whitespace checks passed.
- PostgreSQL 16 is configured for CI; that hosted CI job has not been executed during this local session. Production migration state, filesystem ownership and existing booking data still require the deployment preflight below.

## Safe production procedure

1. Inspect the actual PM2 process name, user, working directory, interpreter and startup script (`pm2 list`, `pm2 describe <api-name>`). Inspect ownership with `stat` on the release, backend/node_modules and generated Prisma directory. Do not publish PM2 environment dumps: they can contain secrets.
2. Prefer a clean release directory owned by the deployment user. Install with the frozen lockfile as that user, not root. If reusing the old directory, have an administrator correct ownership only for the application dependency/build directories after checking symlinks and any shared pnpm store. Do not recursively chown `/var/www`, database files or uploads; do not use chmod 777. Disabling dependency verification hides the permission failure rather than repairing it. Keep Prisma/Client on the reviewed 6.19.3 lockfile; the prerelease upgrade notice is unrelated.
3. Back up PostgreSQL and verify restore on a staging clone. Configure protected production environment values: PostgreSQL DATABASE_URL for runtime, DIRECT_URL for migrations, NODE_ENV=production, AUTH_MODE=firebase, Firebase Admin credentials/project, CLIENT_URL HTTPS origins, PUBLIC_API_URL HTTPS, and BUSINESS_TIME_ZONE=Asia/Yangon. Use the actual PostgreSQL role permissions and TLS settings for your provider. The migration role needs DDL/function/constraint ownership and btree_gist installation permission for the historical integrity migration.
4. Inspect migration state without changing it:

```sh
pnpm exec prisma migrate status --schema prisma/postgresql/schema.prisma
pnpm run prisma:generate:postgres
pnpm run court:audit
```

Audit runs SELECTs only and returns counts by default. Stop if malformedCount or conflictingPairCount is nonzero. Review affected bookings with authorized staff; never silently cancel or discard them. Check required tables/columns/indexes and the Booking_no_overlap constraint in PostgreSQL catalogs. If migration metadata and deployed schema diverge, reconcile them on a clone first; never blindly mark migrations applied.
5. Stage and test the clean release and all pending PostgreSQL migrations against the restored clone. For a production hotfix, quote/log changes can be deployed separately from the parser repair if the data preflight has not passed. Do not deploy unrelated pending migrations without review. Under a maintenance window/write hold, run:

```sh
pnpm exec prisma migrate deploy --schema prisma/postgresql/schema.prisma
pnpm run build:postgres
```

The new migration takes an exclusive lock while rebuilding the exclusion constraint. It waits at most 5 seconds for its lock and has a 120-second statement timeout; plan larger tables separately. Failure leaves booking data and the previous constraint intact. Inspect migration status before retrying. Only mark a failed migration rolled back after confirming its SQL transaction rolled back; do not use reset, db push, force-reset, or unreviewed migrate resolve.
6. Change the existing PM2 definition to `script: dist/src/server.js`, `cwd: /var/www/zawana-app/backend` (or the new release path), with Node and the intended service account. Remove package installation, Prisma generation and tsx watch from the process command. Reload that reviewed definition with `pm2 startOrReload <ecosystem-file> --update-env`; preserve the actual process name and avoid starting a second listener. Save PM2 state only after health checks pass. Keep the running release untouched while installing/building the next one.
7. Verify `/api/health`, filtered GET `/api/court-blocks`, and a staff-approved creation/update on staging. Test genuine overlap=409, adjacency=201, cancellation/rebooking, and simultaneous requests against the disposable CI/staging fixture. Do not manufacture test reservations in production. For the next real user request, correlate X-Request-Id with JSON `api_request_failed` logs and inspect `operation`, `code`, `sqlState` and `category`. A 42601 should disappear after the INSERT fix; unresolved GET 500 needs its own trace.
8. Application rollback can reuse the previous reviewed build; do not roll back the corrected parser/index or delete bookings. Keep backups and migration records. No production deployment was performed by this task.
