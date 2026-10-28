# Badminton category check-in

## Architecture inspection (before implementation)

The running API is `backend/src/server.ts`; `routes/packages.ts` and `routes/memberships.ts` belong to the older app and are not mounted by the running server. Membership routes handle gym separately. Badminton activation has four paths: staff sale, member immediate activation (checkout currently disabled by the application), staff renewal, and verified payment completion. Each creates an enrollment, but renewal currently retires its predecessor, and the member UI selects a single active enrollment. The membership label on User is descriptive and must never select an entitlement.

`BadmintonPackageCategory` configures catalogue categories but currently has mutable names only. Package category is optional. Enrollment has no category snapshot. Purchase has a proper package FK and optional unique enrollment. Enrollment packageId is a historical string, including legacy IDs without catalogue records, so adding a required catalogue FK would damage existing history. User already has many enrollments. Check-in owns the deduction and package snapshot; administrative corrections write AttendanceModification. QR visits currently have no relation to issuance/check-in and prohibit every second member visit that day. QR and staff must use one shared category attendance guard.

Affected endpoints: active category/package CRUD; staff sale/renewal/check-in; member purchase/dashboard; verified package payment; `/check-in/qr`, `/check-in/preview`, `/check-in/scan`; attendance calendar/detail/CSV. Affected UI: QrDesk, QrCheckIn, Membership, Operations package catalogue/sales/check-in, AttendanceList and AttendanceDetail. Gym, paid private-course attendance, and court rental policies remain separate.

## Legacy data decision

Read-only local preflight found zero category records, 14 uncategorized catalogue packages, and nine unclassified enrollments. Package names are not category evidence. Their categories will remain unresolved until an operator supplies an explicit package-ID/category-code mapping. No existing balance or history may be removed or guessed. Three canonical category configurations are introduced; existing unknown categories remain available for review. An unresolved active enrollment blocks that member's new category check-ins until reviewed, because it might contain earlier attendance in that category.

Only an unambiguous existing category display name exactly matching Foundation, Social, or Pathway (trimmed and case-insensitive) is an explicit legacy alias. Other category names are not mapped. Migration classification uses actual category/package/purchase relationships, never package title text. Legacy category-neutral QR issuances remain in history but cannot authorize category deductions; FO must generate a new categorized QR.

## Final model and invariants

| Entity | Category and ownership contract |
| --- | --- |
| Category | Nullable unique immutable code for legacy compatibility; the three configured codes are FOUNDATION, SOCIAL, PATHWAY. Display name remains editable. Unknown old configurations remain unclassified. |
| Package | Exactly one configured category required on new API creation. Existing null categories remain visible and cannot activate new enrollments. Catalogue category changes affect future activations only. |
| Purchase | Existing package FK and unique optional enrollment retained. Payment state/amount/history remain separate for each purchase. |
| Enrollment | Existing many-to-one User relationship, no uniqueness on member/category. Immutable categoryCode captured inside every activation transaction. Historical packageId string retained because some legacy catalogue IDs no longer exist. |
| Check-in | Deduction ledger: memberId, actual enrollmentId, immutable categoryCode, source (QR/STAFF/LEGACY), actorId, QR issuance FK, sessionsUsed, server createdAt, Yangon date/time, immutable package snapshot. attendanceKey uniquely guards member/category/date for every entry source. |
| Entry QR | Random hashed credential, immutable category, issuer, expiry, revocation and creation timestamp. Legacy creation timestamps remain null because they were never recorded. One issuance has many visits and check-ins. |
| QR visit | Required unique check-in FK; optional issuance FK/category only for legacy compatibility. Every new QR visit writes both. Unique member/category/date replaces the broader old member/date index. |
| AttendanceModification | Existing authorized correction audit stores previous/current values, actor and reason. Explicit legacy classification also records an enrollment audit. |

`BadmintonCheckIn.sessionsUsed` remains the source of deduction history; there is no second balance ledger. An administrative present/late ↔ absent/excused correction adjusts the original verified entitlement once, with an audit reason. The category/day guard remains after restoration, so another QR/manual visit cannot charge that category again; correct the original attendance if the participant arrives later. Historical duplicates are retained, with one canonical attendanceKey and null keys on extra old rows. Queries also inspect historical rows, rather than relying on the nullable guard alone.

New registered-member check-ins lock the member before package selection. QR mutations lock issuer then issuance; revocation/generation/scan use the same ordering. Staff-provided enrollment IDs identify the member/category only: the server selects the eligible matching enrollment by expiryDate, createdAt, then id ascending. Conditional decrements require a positive balance, active status, started date and unexpired date. Unique constraints, deduction, check-in, QR visit and audit commit together. Serialization/contention failures retry up to twice; unique conflicts return safe duplicate rejection. No cross-category fallback exists.

Legacy walk-ins use their existing stable studentId for daily identity. Separate walk-in IDs are not merged by name or phone. Link the correct member account before expecting distinct historical walk-in identities to share a member allowance.

## API contracts

All paths below are relative to `/api`. Responses are `Cache-Control: no-store` for attendance and QR endpoints.

| Endpoint | Authorization | Request / result |
| --- | --- | --- |
| `GET /packages/badminton/categories` | Authenticated | Configured categories with immutable code and editable display name. |
| `POST /packages/badminton/categories` | Admin | `{name, code}`; one of the three codes, unique. Migration already provides canonical configurations. |
| `PATCH /packages/badminton/categories/:id` | Admin | `{name?, active?}` only. Attempts to change a code are rejected. |
| `POST/PATCH /packages/badminton[/:id]` | Admin, badminton FO | Catalogue data; new creation requires valid categoryId. Patching category does not reclassify existing enrollments. |
| `POST /packages/badminton/:id/classify-legacy` | Admin | `{reviewed:true}` after catalogue assignment. Sets only null enrollment/category snapshots with consistent purchase links and matching original package snapshots. Returns `{enrollments,checkIns,categoryCode}`. No balance changes. |
| `POST /badminton/enrollments` | Admin, badminton FO | Existing member/walk-in sale contract, new separate enrollment with category snapshot. |
| `POST /badminton/enrollments/:id/renew` | Admin, badminton FO | Existing payment/package fields; adds a new enrollment and purchase, preserving the previous enrollment/status/balance/dates. |
| `POST /member/badminton-packages/:id/purchase` | Member | Existing immediate activation contract; another purchase adds another enrollment. |
| `POST /check-in/qr` | Admin, badminton FO | Strict `{categoryCode:"SOCIAL"}` → 201 `{id,token,categoryCode,createdAt,expiresAt}`. One-hour expiry. Revokes all previous unrevoked QR issuances from that issuer, including other categories. |
| `DELETE /check-in/qr/:id` | Original issuer or admin | Revokes the specified issuance; unauthorized staff get 404. |
| `POST /check-in/preview` | Member | Strict `{token}` → category, eligible enrollment `{id,packageName,sessionsRemaining,expiryDate}`, `sessionsDeducted:1`, `expectedRemaining`. Read-only advisory result. |
| `POST /check-in/scan` | Member | Strict `{token}` only. Server independently reloads eligibility and QR category and commits deduction. |
| `POST /badminton/check-ins` | Admin, badminton FO | `{enrollmentId,note?}` → same category selection/deduction contract as QR. Supplied enrollment ID is not the final deduction target. |
| `GET /member/dashboard` | Member | Adds `enrollments` array; retains legacy `enrollment` for existing dashboard compatibility. Individual package cards use the array; recent check-ins cover all owned packages. |
| `GET /attendance`, detail, CSV | Existing member/FO/admin/coach scope | Package rows include `categoryCode`, `source`, `sessionsDeducted` and exact package. Optional categoryCode filter. CSV includes category/source/deduction. Coach private-course scope stays separate. |

Committed scan/staff success retains the existing checkIn/enrollment/warning fields for compatibility and adds:

```json
{
  "success": true,
  "categoryCode": "SOCIAL",
  "enrollment": {
    "id": "actual-selected-enrollment-id",
    "packageName": "Social 10 Sessions",
    "sessionsRemaining": 7
  },
  "sessionsDeducted": 1,
  "checkInId": "persisted-check-in-id"
}
```

Expected rejections return 409 with `{code,message}` and no deduction: QR_INVALID, QR_EXPIRED, QR_REVOKED, QR_ISSUER_INACTIVE, QR_CATEGORY_REQUIRED (old neutral code), CATEGORY_UNAVAILABLE, CATEGORY_REVIEW_REQUIRED, NO_CATEGORY_PACKAGE, PACKAGE_EXPIRED, NO_SESSIONS, ALREADY_CHECKED_IN, CHECK_IN_CONFLICT. Invalid/tampered payloads return 400; unauthorized roles return 403; inaccessible attendance returns 404. Final confirmation never accepts memberId, categoryCode, or enrollmentId from the member client.

## Before and after

Previously, scanning chose the earliest package across all categories and one QR visit blocked every later visit that day; the member page showed one active enrollment and renewal retired its predecessor.

Now FO explicitly chooses a configured category, generates the QR and sees its label/countdown. Members scan/upload, receive an authenticated category/package/balance preview, then confirm. The final transaction selects and charges one matching package. Foundation and Social can each be used that day. A second Social visit through either entry path is rejected. Exhausted/expired Social packages are skipped when another eligible Social package exists. Another purchase or renewal preserves existing entitlement balances. Member and FO views show packages separately, their category/dates/status and deduction history. Attendance lists, detail, and CSV show the category/package actually used.

## Assigning your legacy categories

You chose to edit the existing categories yourself. No guessed package-title mappings were performed. The local schema migration was applied during the recovery documented below; category assignments remain for your review.

After backup and migration, open **Admin → Badminton packages → Edit** on each catalogue package. Select its category. Saving the catalogue alone classifies future activations. If the same category also applies to the package's unclassified historical enrollments, select **I reviewed this package’s legacy records** and save. This explicitly classifies those enrollments and their matching historical visits, seeds shared daily guards, and preserves all session balances. It does not overwrite already classified enrollments. Do not check that box if a package ID was reused for different historic categories; resolve those records individually with an audited operator-reviewed forward data migration.

Run the read-only preflight before and after review:

```sh
cd backend
npm run badminton:category:preflight --silent > /secure/path/category-preflight.json
npm run badminton:category:preflight --silent -- --require-ready
```

The report includes package IDs/titles and proposed category codes, unresolved active enrollments, ambiguous historical visits, malformed snapshots, purchase relationship conflicts, orphan QR visits, same-category/day duplicate groups, row counts and per-enrollment balances. It works against the schema before or after migration. Treat the report as internal operational data. `--require-ready` exits nonzero for unresolved active enrollments, malformed snapshots, conflicting purchases or orphan visits. Old neutral QR issuances cannot be classified retrospectively: generate new QR codes.

## Forward migrations and production rollout

New migration in BOTH chains: `20261028090000_badminton_category_checkin`. Existing production migration files were not rewritten for this feature. Keep the earlier attendance migration/recovery changes from the preceding task with this branch; deploy that prerequisite before the category migration.

1. Take a consistent backup and prove it restores into a separate database. PostgreSQL: `pg_dump "$DIRECT_URL" --format=custom --file=/secure/path/pre-category.dump`. SQLite: stop writers or use SQLite's online backup (`sqlite3 backend/prisma/dev.db ".backup '/secure/path/pre-category.db'"`); do not copy only a live database file with pending WAL writes.
2. Run preflight against the intended provider/client, review every unknown/conflict, and save counts/balances for comparison. If an old purchase link, malformed snapshot, orphan QR visit or reused package category is uncertain, retain it and resolve the decision explicitly. No deletion/reset/deduplication is required.
3. Rehearse the migration and explicit category review on a restored production clone. Confirm every historical ID/relationship and balance survives. New migrations use explicit transactions; SQLite rebuilds check-in/QR tables with FK checks disabled only during the copy. PostgreSQL adds legacy-compatible NOT VALID FKs so an existing orphan cannot erase or prevent access to history; the preflight must identify and resolve orphans before validating those FKs.
4. Pause package/QR/check-in writers and drain old API instances for the release. Run **only the deployment provider's** migration chain:

   ```sh
   # PostgreSQL deployment
   cd backend
   npm run prisma:migrate:postgres
   npm run prisma:generate:postgres
   npm run build
   ```

   SQLite development uses `cd backend && npx prisma migrate deploy && npm run prisma:generate && npm run build`. The existing `npm run dev` predev also deploys pending SQLite migrations. Never run migrate reset or db push on production.
5. Deploy/restart the API built with the correct provider client, then the frontend. Restart connection pools after schema changes to discard cached prepared statements. Build frontend with `npm run build` at repository root.
6. Complete explicit legacy category review, run preflight again, and compare saved row counts, enrollment/purchase IDs and balances. Unresolved active entitlements block their member's category check-in; unclassified attendance today blocks a further deduction as well. Unknown historical rows stay visible with “Category needs review.”
7. On PostgreSQL, resolve reported old FK conflicts and run `ALTER TABLE "BadmintonQrVisit" VALIDATE CONSTRAINT "BadmintonQrVisit_checkInId_fkey";` (and validate the new QR issuance FKs). SQLite: verify `PRAGMA foreign_key_check;` on the restored/released database. Do not delete orphan history to pass validation.
8. Generate fresh category QRs. Smoke-test a member with both Foundation and Social, where Foundation expires earlier: Social should lose one session, Foundation should keep its balance. Verify the committed check-in/QR visit, category/day duplicate rejection across manual and QR, history, and authorized correction.
9. Reopen writers. Monitor category-review/conflict errors, negative-balance checks and paired check-in/visit audit counts. The preflight is read-only; no production migration or deployment was performed during implementation.

Recovery: if the new migration fails, inspect its transactional outcome and Prisma migration record against the backup/clone before using migrate resolve. Do not mark a partial migration applied or rerun arbitrary old DDL. Correct the specific migration failure using a reviewed forward repair. If restore is needed, stop writers first. Restore the verified backup only when no post-backup writes need preserving; otherwise reconcile the later writes before recovery. Rolling back only the API to category-neutral deduction is unsafe after category check-ins start, so keep check-in disabled until the matching API/schema are restored or fixed forward.

## Changed files for this feature

- Both Prisma schemas and both new category migration files.
- `backend/src/services/badmintonCategory.ts`: category validation, eligibility/ownership, shared daily policy, transaction conflict handling, explicit legacy classification.
- `backend/src/services/badmintonAttendance.ts`: common atomic deduction and enriched check-in snapshot; existing correction audit preserved.
- `backend/src/routes/qrCheckIn.ts`: category issuance, preview, token-only final scan and safe rotation/revocation locking.
- `backend/src/server.ts`: active category/package CRUD, all four activation paths, renewal preservation, staff check-in and member multi-package data.
- `backend/src/routes/attendance.ts`: category/source/deduction history, filter/CSV and robust legacy snapshot display.
- `backend/scripts/badminton-category-preflight.ts`, `backend/package.json`: read-only migration report command.
- `src/components/BadmintonCategoryField.tsx`, `QrDesk.tsx`, member-premium.css: configured category controls/names and QR label/preview styling.
- `src/pages/QrCheckIn.tsx`, `Membership.tsx`, `Operations.tsx`: confirmation, individual entitlements, category editing/review, staff history/actual selected-package response.
- Attendance page/list/detail and `src/types/index.ts`: category information and filtering.
- New `backend/tests/badminton-category.test.ts`; private-course payment/activation regressions, attendance/browser fixtures and browser script updated for the new contracts. PostgreSQL court test cleanup handles the existing court audit FKs.
- This document, QR_CHECK_IN.md and ATTENDANCE.md.

## Verification results

Verified locally against isolated databases, including a temporary loopback-only PostgreSQL 16.14 instance. Temporary PostgreSQL tooling was installed outside the repository and is not an application dependency.

| Check | Result |
| --- | --- |
| Prisma SQLite + PostgreSQL validation | Both pass. |
| Backend typecheck and PostgreSQL build | Pass. SQLite client restored after PostgreSQL tests. |
| Full SQLite backend suite | 136 tests: 133 pass, 3 provider-specific skips; no failures. Includes gym, court, private course, auth, payment and attendance. |
| Category HTTP suite on real PostgreSQL | 12 pass, 2 SQLite-only skips; no failures. Includes six simultaneous final-session scans, mixed QR/manual race, earliest eligible category package, category isolation, separate categories/day, immutable snapshots, token tampering, issuer revocation, preview revalidation, ownership, legacy classification, and full forward migration/history preservation. |
| PostgreSQL court regression | 4 pass, no failures, including multi-connection reservation concurrency. |
| Full forward migration chains | SQLite and PostgreSQL applied successfully on fresh isolated databases. Seeded legacy/duplicate/unclassified histories retain every row and balance after the new migration. |
| Frontend production build | Pass; existing large-chunk warning remains. |
| Attendance browser | Earlier complete run passed category preview/committed balance, FO issuance/revocation, multiple owned packages, and four-role attendance/rescheduling at desktop/tablet/mobile sizes. Final rerun with the added admin-review UI scenario is blocked before page load by macOS WindowServer/AppKit initialization; admin category review is separately verified through the real HTTP integration test. |
| Court rental browser | Previously passed during the preceding rescheduling work. This feature’s final rerun is blocked at the same local Chrome startup boundary; SQLite backend court regressions and the real PostgreSQL court concurrency suite pass. |

Known local verification limit: finish the added admin-review browser scenario and rerun the court browser script when a working GUI session is available. The captured process sample shows headless Chromium waiting in `NSApplication → SLSMainConnection → mach_msg`, before the app is opened. Reproduce with `node scripts/test-attendance-browser.mjs` and `node scripts/test-court-browser.mjs`; optional ATTENDANCE_BROWSER_EXECUTABLE_PATH / COURT_BROWSER_EXECUTABLE_PATH select an available test browser.

Production-dependent items: finish your category mappings and audit any reused catalogue IDs; test backup/restore and pool restart against the actual production clone; validate legacy FKs after review; check physical phone-camera permissions/HTTPS. The package checkout switch remains as configured by the application: the existing immediate member activation path still bypasses checkout when payments are temporarily disabled, while the verified KPay completion path independently snapshots category and has signed-callback/retry tests. QR proves possession of a live token, not physical location. QR locking serializes scans under an issuer/issuance to coordinate revocation; monitor peak arrival throughput and bounded conflict responses before optimizing that locking strategy.


### Reproduce PostgreSQL category checks

Use an isolated local database named `zawana_badminton_test`. The migration-preservation test creates and drops a uniquely named sibling test database, so the local QA role needs CREATEDB. Do not point these tests at production. Set DATABASE_URL and DIRECT_URL to that database, apply the PostgreSQL chain, and generate its client before testing:

```sh
cd backend
npm run prisma:migrate:postgres
npm run prisma:generate:postgres
BADMINTON_ONLY_POSTGRES=1 BADMINTON_POSTGRES_TEST_URL="$DATABASE_URL" node_modules/.bin/tsx --test tests/badminton-category.test.ts
npm run prisma:generate  # Restore SQLite client before local SQLite tests/dev.
```


## Local missing-column recovery — 2026-10-27

An Internal server error report followed the category release while the development API was already running against the old SQLite schema. Read-only reproduction returned Prisma P2022 for `BadmintonPackageCategory.code` and `BadmintonCheckIn.memberId`; migrate status confirmed the category migration was pending.

A consistent online backup was created as `backend/prisma/dev.db.category-recovery-2026-10-27T16-19-44-398Z.bak` (git-ignored). The migration was first deployed to an isolated copy and every existing row/field was compared. After that rehearsal passed, the pending forward migration was deployed to the local development database and the SQLite Prisma client regenerated. All 1,839 pre-existing rows/fields were preserved, foreign-key/integrity checks passed, and Prisma reports the schema is current. Category, enrollment, attendance and QR-history queries now succeed; the running API health endpoint returns 200.

No package-category assignments were guessed: the nine existing enrollments remain unclassified for your explicit category review. This recovery did not apply any production migration or deployment. Refresh the application after the local schema update.

## CI verification before commit — 2026-10-27

The repository CI workflow now has three jobs: the existing main verification job, PostgreSQL court tests, and a new PostgreSQL badminton job. The new job applies the PostgreSQL migration chain and runs category deduction, QR/manual concurrency, and historical migration-preservation tests against a disposable PostgreSQL 16 database.

Local reproduction used CI's Node 22 and pnpm 10.30.3: both frozen lockfile checks passed; the frontend production build and PostgreSQL backend typecheck/build passed; both Prisma schemas validated; the full backend suite passed with 133 tests and three provider-specific skips; the separate PostgreSQL badminton run passed 12 tests with two SQLite-only skips; and the PostgreSQL court run passed all four tests. Workflow YAML and `git diff --check` passed. The existing frontend bundle-size warning remains non-blocking. The SQLite development client was restored after PostgreSQL verification.

These are local CI-equivalent results. GitHub Actions will verify the committed revision when it is pushed. No deployment was performed. The previously recorded macOS browser-startup limitation is outside the configured CI/build jobs.

The local category preflight at this check found all 14 catalogue packages categorized and no unresolved active enrollments; two unclassified historical check-ins and one historical duplicate group remain preserved for review. No production database was inspected or changed.
