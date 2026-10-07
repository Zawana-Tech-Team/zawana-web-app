# Production readiness audit

**Audit date:** 2026-10-06  
**Verdict:** **NOT READY for a full production launch or real online payments.** The application can proceed to a configured staging deployment after the target environment is provisioned. Production Firebase/PostgreSQL connectivity, role-matrix behavior, storage durability, and payment-provider behavior remain **NOT VERIFIED**.

This audit intentionally avoids a broad rewrite. The active runtime is `backend/src/server.ts`; the separate `backend/src/app.ts` is not used by the package scripts. Existing user changes were preserved.

## Findings

### BLOCKER

- **Production environment has not been proven.** No production host, Firebase project credentials, PostgreSQL connection, domain, or provider sandbox was available to verify. The PostgreSQL Prisma schema validates, but migrations have not been deployed to a real PostgreSQL database. Treat initial deployment as a staging/data-migration exercise first.
- **Real KPay checkout is not verified.** `backend/src/services/kpay.ts` is an adapter contract to a merchant-approved service, not evidence that Zawana's real merchant integration is connected. Without adapter credentials and a successful signed sandbox callback, online payment endpoints must remain unavailable. Do not mark payments paid from frontend input.
- **Persistent media storage is a deployment prerequisite.** Coach/profile/course/menu/product images are written to local disk. Production now requires `UPLOADS_DIR`; deploy only to a host with a durable volume mounted there, or replace the filesystem adapter with durable object storage.

### HIGH

- **No automated business/auth test suite exists.** Role isolation, Firebase disabled/deleted behavior, booking conflicts, payment callback replay, session deduction, and the end-to-end business flows have not been exercised against a disposable database/provider sandbox. CI currently builds and validates Prisma only.
- **Rate limits are process-local.** The existing limiter is suitable for a single process but will not coordinate attempts across multiple backend instances. Use a shared store before horizontally scaling sensitive endpoints.
- **The runtime still has a large mixed-responsibility server.** `backend/src/server.ts` is about 1,500 lines and combines bootstrap, compatibility SQL, route handlers, and business logic. `backend/src/app.ts` and some extracted routers are a second, inactive composition. Do not switch entrypoints until route parity and middleware order are reconciled.
- **PostgreSQL rollout needs a staging migration rehearsal.** SQLite has a longer migration history; PostgreSQL uses its own baseline and follow-up migrations. Schema validation does not prove those migrations apply cleanly to a fresh or existing Supabase database. Back up and rehearse `migrate deploy` before production.
- **Financial/history records have delete cascades in the schema.** The admin API currently archives accounts to preserve related records. Keep hard deletion out of user-management paths and review `onDelete: Cascade` before modifying user relations.

### MEDIUM

- **Frontend bundle is large.** The verified Vite build produced a 977.20 kB minified JS chunk (264.96 kB gzip), above the 500 kB warning threshold. Consider route-level code splitting after mapping shared page/context dependencies.
- **Dependency manifests use floating `latest` ranges.** The checked-in pnpm lockfile makes the current workspace install reproducible, but future installs/upgrades should pin reviewed versions rather than resolve latest unintentionally.
- **Legacy npm lockfiles remain.** pnpm is now the only supported install path and CI uses its frozen lockfile; the npm lockfiles are not kept synchronized.
- **No lint command is configured.** TypeScript strict checks and production builds catch some issues but do not replace linting or accessibility checks.
- **Several package manifests have no deployment target configuration.** Static SPA hosting, API hosting, HTTPS origins, secrets, persistent media, and database migration execution must be configured by the release environment.

### LOW / CLEANUP

- The current health endpoint is a safe liveness response, not a database readiness check. It intentionally reveals no environment or credential data.
- Some old generic route files and docs remain. Check route registration before removing them; `server.ts` is the active route map.
- Local runtime data and the nested pnpm store snapshot were accidentally tracked. They are now ignored/untracked while their local files are preserved.

## Architecture and security review

- **Frontend:** React 19 + TypeScript + Vite, React Router, page-oriented screens, Auth/Operations contexts, shared `src/api.ts` client. Relative import scan found no unresolved imports. Auth/role guards are UX; server middleware is authoritative.
- **Backend:** Express + Zod + Prisma. Firebase Admin verifies tokens; middleware resolves `firebaseUid` to the active database user and reloads the database role. Custom claims are not the Zawana role source.
- **Database:** SQLite schema/migrations are for local work. PostgreSQL has a separate Prisma schema and migration chain. Production configuration now rejects database auth, non-PostgreSQL URLs, missing direct URL, localhost/non-HTTPS origins, absent Firebase project ID, and missing persistent uploads path.
- **RBAC:** Active handlers use `auth` and `roles(...)` checks, with ownership checks in member/coach/doctor flows. A live 401/403 role matrix was not tested; it is a release gate.
- **Validation/errors:** most active writes validate with Zod. The active error handler returns generic 500 responses, maps common Prisma conflicts, and now omits raw input from validation issues and production error logs. The alternate `app.ts` error middleware is not the active runtime handler.
- **Secrets:** a pattern scan of current tracked text found no Firebase private keys, Firebase web API keys, Supabase service-role keys, database URL credentials, or non-placeholder JWT secrets. Example placeholders were removed where scanners could confuse them with credentials. This is not a complete scan of every remote Git ref or an external secret scanner; rotate any credential known to have been committed elsewhere.
- **Payments:** the callback verifies an HMAC and uses conditional payment-attempt status updates/transactions, but the external KPay adapter and production callback were not available for verification.
- **Images:** uploads validate MIME signatures and size, then write to filesystem. Ensure the production volume is backed up and persisted across restarts/deploys.

## Files changed for safe readiness improvements

- Root/backend package scripts now expose typecheck, build, and Prisma validation commands; backend start points to the actual `dist/src/server.js` output. pnpm is the single supported install path for the two-package workspace.
- Added a GitHub Actions check for frozen-lockfile install, Prisma validation/generation, typecheck, and builds. No automatic deployment is configured.
- Added production fail-fast configuration checks, sanitized production error logging, graceful SIGTERM/SIGINT shutdown, and a stable `UPLOADS_DIR` path shared by source and compiled backend.
- Added this audit and [business workflow guide](BUSINESS_LOGIC.md); updated README and development guide.
- Added ignore rules and removed the pnpm cache snapshot, local SQLite DB, and local uploaded images from Git tracking without deleting local copies. `.env.example` files remain tracked and contain no real credentials.

No Prisma schema or migration changes were made.

## Verification results

| Check | Result |
| --- | --- |
| Frontend TypeScript (`tsc -b`) | PASS |
| Vite production build | PASS, with 977.20 kB minified JS chunk warning |
| Backend TypeScript check and build | PASS after audit edits (`tsc --noEmit`, `tsc -p .`) |
| pnpm workspace install (`--frozen-lockfile`) | PASS |
| SQLite Prisma validate | PASS |
| PostgreSQL Prisma validate | PASS with temporary non-production URL values; no database connection was made |
| Relative frontend import scan | PASS, zero unresolved relative imports |
| `pnpm run build` | PASS; frontend and backend production builds passed |
| PostgreSQL Prisma client generation | PASS (`prisma generate --schema prisma/postgresql/schema.prisma`) |
| Lint/tests | NOT CONFIGURED |
| Production migration/role/payment/media end-to-end | NOT VERIFIED |

## Deployment gate checklist

1. Create a staging Supabase/PostgreSQL database and rehearse the PostgreSQL migration chain from an empty database; back up before upgrading any existing database.
2. Configure Firebase Authentication, Firebase Admin credentials/ADC, authorized domains, and a test admin account.
3. Set `NODE_ENV=production`, `AUTH_MODE=firebase`, PostgreSQL `DATABASE_URL` and `DIRECT_URL`, exact HTTPS `CLIENT_URL`, HTTPS `PUBLIC_API_URL`, Firebase project ID, and persistent `UPLOADS_DIR`.
4. Generate the PostgreSQL Prisma client, build, apply `prisma migrate deploy`, then start `dist/src/server.js` through `npm start` from `backend/`.
5. Verify health, sign-in, disabled-user denial, each role's allowed/denied API access, representative booking/package/gym/store/cafe/clinic workflows, and media persistence after a restart.
6. Configure and sandbox-test the real KPay adapter and signed callback, including bad signatures, amount mismatch, duplicate callback, failed payment, expiration, and refund handling. Keep online payment disabled until this passes.
7. Add automated tests for these critical workflows and a shared rate-limit store before multi-instance scale-out.
