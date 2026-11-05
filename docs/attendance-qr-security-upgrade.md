# Attendance, QR, notifications and package security upgrade

> The QR lifecycle and coach QR restrictions below describe the earlier implementation. They are superseded by [the shared category QR correction](category-attendance-qr.md): two category cards, no member selection, and one redemption per member. The package reauthentication and notification receipt implementation remains current.

## Architecture inspection and implementation plan

The active API is Express `backend/src/server.ts`, using Prisma with SQLite development and a separate PostgreSQL schema/migration tree. `backend/src/app.ts` and its standalone package routes are legacy and are not the active entry point. React/Vite routes already use one Attendance page, AttendanceList and AttendanceDetail across member, coach, Admin and Badminton FO. Backend course scope uses `Coach.userId`; names and phone numbers are never authorization evidence.

The original QR model persisted a hash but represented a reusable, one-category staff desk code, lasted one hour and could not restore the QR payload after reload. Existing `badmintonAttendance.ts` and `badmintonCategory.ts` already supply exact-category entitlement selection, member locks, daily attendance uniqueness, retry handling, snapshots and transactional deductions. Preserve these services and extend issuance/redemption instead of creating another attendance ledger.

Existing Notification, NotificationBell and Notifications page provide the inbox, unread counts, timestamps, actions and history. A broadcast's global read boolean was shared; use recipient receipts rather than duplicating the inbox. Gym already has transactional revisions/audits; extend those transactions. Firebase password verification and provider reauthentication already exist; reuse them, with bcrypt retained only for the existing local database-auth mode.

Implementation sequence: (1) inspect and retain scopes, (2) extend QR persistence and atomic single use, (3) update shared desk/scanner/detail, (4) extend notifications/recipient receipts, (5) bind package reauthentication to mutations and audit transactions, (6) test migrations, HTTP boundaries, concurrency, browser journeys, lint, types and builds.

## Completed behavior and security decisions

- Shared Attendance page and detail continue to serve every attendance role. Coaches see assigned-course students and, after record authorization, those students' active package balances/categories/expiry in the same detail view. Coach history and marking remain restricted to assigned courses.
- There is no package-to-course/class roster relationship in the repository. Paid private-course marking does not consume a package. Coach QR issuance is deliberately unavailable until a real package/class assignment exists; an assigned private course is not evidence of authorization to debit that student's packages. Admin and Badminton FO issue member QR codes through the shared desk, available in a native accessible dialog from Attendance and inline in Package Check-In & Sales.
- [QR lifecycle](QR_CHECK_IN.md): 120-minute validity, 256-bit random tokens, member binding, multi-category scopes, encrypted database redisplay, exact-category selection and one successful redemption. QR/member/day constraints and shared member locks serialize manual check-in, issuance, replacement, revocation and redemption.
- Successful visit notifications include session deduction and balance. Low balances (two or fewer after debit) and exhaustion also notify active badminton staff. Course arrival creates a member notification once. A minute-based idempotent sweep notifies member and authorized badminton staff when an active package expires, retaining enrollment data/balances unchanged. Routine QR outcomes remain contextual status/error messages, avoiding persistent scan-error spam.
- `NotificationRead` stores each recipient's read timestamp. Reading a broadcast never marks it read for another recipient. GET/read independently enforce member/role audience scope. Bell state resets on account/role changes.
- All active badminton/gym catalogue mutations, category configuration and explicit legacy classification require account verification plus their existing role permissions. Package DELETE deactivates badminton catalogue entries instead of removing purchase history; gym retains its existing archive behavior.
- Each five-minute database challenge hashes the actor's exact method, path and canonical JSON payload. Verification is sent only with that mutation. Backend verifies bcrypt in local database mode or checks a newly authenticated Firebase identity against the actor's canonical UID, challenge creation time and supported sign-in provider. Firebase ID-token revocation checks use the existing verifier. Phone-only/anonymous/custom identities are not assumed to have a password.
- Passwordless Google/Apple and other supported OAuth providers use Firebase popup reauthentication. Password accounts use Firebase credential reauthentication, then submit a fresh identity proof. Direct API password verification also uses the existing Firebase password service. Provider proof authentication times are consumed once across challenges; a replayed proof cannot authorize a different package. Very fast repeated reauthentication in the same provider timestamp second must be retried with a new proof.
- Challenge consumption is atomic and precedes the mutation. A failed mutation consumes verification and requires a new confirmation. No passwords or proofs enter browser storage or audit records. The existing database abuse counter limits failed verification to five attempts per account per fixed ten-minute window, across workers/restarts. Successful verification removes its reserved attempt.
- A durable failed-attempt ledger is written before verification. Successful catalogue/category mutations atomically update that ledger with actor, package ID, action, changed field names, safe before/after values, timestamp and IP. Gym also retains its established revisions/audit. Notification creation is inside the successful mutation transaction. If the process stops after verification but before commit, the audit remains unsuccessful and no success is claimed.

Reauthentication follows the official [Firebase credential/provider API](https://firebase.google.com/docs/reference/js/auth) and [Identity Platform reauthentication guidance](https://docs.cloud.google.com/identity-platform/docs/web/reauth). No provider configuration was changed or deployed.

## Migration and rollout

New forward migration in both provider trees:

`20261104090000_single_use_member_qr_package_security`

It extends BadmintonEntryQr, adds member/redeemer/redemption foreign keys and indexes, PackageSecurityChallenge, PackageSecurityAudit, NotificationRead and a notification deduplication key. Existing reusable desk codes become REVOKED. Existing attendance, enrollments, purchases, package allocations and balances are retained. No reset, cleanup or production migration was run.

Before release, back up and rehearse the correct provider migration on a restored staging database. Configure a stable private QR encryption key on every replica. Drain older API writers, apply the provider's migration chain, regenerate that provider's Prisma client, build/restart API and release matching frontend/mobile consumers together. This changes the QR issuance contract; old clients must be upgraded. The standard development `predev` deploys migrations, so verification uses disposable databases and starts `tsx src/server.ts` directly.

PostgreSQL runtime concurrency must be tested with the repository's isolated `BADMINTON_POSTGRES_TEST_URL` suite/CI job before production rollout. Schema validation and provider-client compilation alone do not establish PostgreSQL runtime behavior. Live Firebase/Apple/Google popup and MFA behavior must be exercised with configured staging identities; automated tests verify the proof boundary using injected verified claims.

## API changes

All paths below are relative to `/api`.

| Endpoint | Behavior |
|---|---|
| `GET /check-in/members` | Admin/Badminton FO eligible registered-member entitlements and category balances. |
| `GET /check-in/qr?memberId=...` | Restore latest ACTIVE member QR, materializing elapsed expiry. |
| `GET /check-in/qr/:id` | Staff status, server time and token only when ACTIVE. |
| `POST /check-in/qr` | `{memberId,authorizedCategories:["FOUNDATION","SOCIAL"],regenerate?:boolean}`; reuse exact scope by default. |
| `DELETE /check-in/qr/:id` | Staff revoke ACTIVE code; USED remains terminal. |
| `POST /check-in/preview` | `{token,categoryCode?}`; multi-category responses require selection; selected response retains exact package/debit preview. |
| `POST /check-in/scan` | `{token,categoryCode?}`; member-only atomic single redemption and category-specific debit. |
| `GET /attendance/:kind/:id/detail` | Adds scoped active package summaries alongside existing history. |
| `POST /package-security/challenge` | Authorized staff `{method,path,body}`; returns five-minute challenge ID. |
| `GET /package-security/audit` | Admin-only latest 100 package verification/mutation records. |
| Existing package/category mutations | Require `X-Package-Verification` JSON: `{challengeId,password}` or `{challengeId,identityToken}`. Mutation path must exactly match challenge path, without `/api`. |
| `GET /notifications[?history=1]` | Recipient-specific read state and read timestamp. |
| `PATCH /notifications/:id/read` | Authorized per-recipient persistent read receipt. |

## Modified files

- Schema/migrations: `backend/prisma/schema.prisma`, `backend/prisma/postgresql/schema.prisma`, both new `20261104090000_single_use_member_qr_package_security/migration.sql` files.
- Backend: `backend/src/routes/qrCheckIn.ts`, `attendance.ts`, `notifications.ts`, `gymManagement.ts`; `backend/src/services/badmintonAttendance.ts`, `gymPackages.ts`, new `packageSecurity.ts`, new `attendanceNotifications.ts`; active route integration in `backend/src/server.ts`; `backend/.env.example`.
- UI: `src/components/QrDesk.tsx`, `AttendanceDetail.tsx`, `NotificationBell.tsx`, new `PackageReauthentication.tsx`; `src/pages/Attendance.tsx`, `attendance.css`, `QrCheckIn.tsx`, `Operations.tsx`; `src/api.ts`, `src/App.tsx`, new `src/services/packageReauthentication.ts`.
- QA: `backend/tests/badminton-category.test.ts`, new `package-security.test.ts`, `gym-management.test.ts`, `private-course.test.ts`, `attendance-browser-fixture.ts`; `scripts/test-attendance-browser.mjs`, new `eslint.attendance.config.mjs`; `package.json` adds `lint:attendance`.
- Documentation: this report, `docs/QR_CHECK_IN.md`, links/contract updates in attendance/category SOPs.

Pre-existing uncommitted authentication, court-change and finance changes were preserved. Only the integration additions in the already-modified server belong to this upgrade.

## Verification

Final checks used isolated databases and the repository’s existing build/test commands.

| Check | Result |
|---|---|
| Full backend suite (`npm --prefix backend test`) | 164 tests: **161 passed, 0 failed, 3 skipped**. Skips are the PostgreSQL runtime suites without isolated database URLs. Includes atomic QR rollback, issuance/redemption concurrency, wrong-category prevention, terminal states, package mutation reauthentication/replay/rollback and notification authorization/idempotence. |
| Attendance browser journey (`node scripts/test-attendance-browser.mjs`) | Four roles at 1440/768/390px; shared detail and assigned-student package display, course correction/persistence, password-confirmed package edit and legacy review, QR dialog, refresh and real API-process restart restoration (same token and expiry), explicit multi-category upload decoding, single redemption and persisted attendance. No captured browser exceptions or React key warnings. |
| Focused lint (`npm run lint:attendance`) and existing gym lint | Pass. |
| Backend typecheck/build | Pass. |
| PostgreSQL-client backend build | Pass; SQLite client regenerated afterward. |
| Frontend production build | Pass, with the existing non-blocking warning about chunks above 500 kB. |
| Both Prisma schema validations | Pass. PostgreSQL validation/build used placeholder local connection values and did not connect to production. |
| Forward SQLite migration and legacy data tests | Pass; preserve duplicate/unclassified history and exact enrollment balances, revoke legacy desk codes, and pass foreign-key checks. |
| `git diff --check` | Pass. |

Browser screenshots were visually inspected for the password confirmation, mobile QR desk, scanner preview, attendance dialog and assigned coach's package details. The synthetic multi-role navigation exceeds the unchanged production `/auth/me` IP budget; the fixture clears only that profile-read counter in its disposable database between roles. Credential and package-proof rate/replay counters remain enforced. An intermediate browser run timed out in the existing court-reschedule review step; the final full rerun passed without changing the court workflow. Production handling of profile-read throttling remains outside this upgrade.

No production database migration or deployment was performed. Remaining release work: configure/back up the stable QR key, rehearse the migrations, upgrade old QR API consumers, run the real PostgreSQL contention suites, and test live configured Firebase password/provider/MFA reauthentication plus physical camera permissions. A scheduled package-funded class model and coach-to-package assignment remain a business/schema decision; the implementation does not infer or debit that relationship.
