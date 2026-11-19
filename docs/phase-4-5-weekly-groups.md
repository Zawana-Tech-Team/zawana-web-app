# Phases 4 and 5 — Weekly actions and grouped requests

## Phase 4 implemented

Admin and Badminton FO weekly actions now contain **Reschedule**, **Remove Today**, and **Remove Weekly**. The confirmation lists the selected dates/times and explains occurrence-only versus recurring removal. For a future selected date, Remove Today applies to that selected occurrence, not the current calendar date.

Remove Today uses CourtBlock.excludedDates and leaves the recurrence boundaries intact. Past dates are rejected. Remove Weekly retains the existing audited series termination, including today and linked future rescheduled classes. Neither operation deletes attendance, entitlements, bookings or transactions. Existing court locks, transaction boundaries, retry receipts and reactive refresh are retained.

Files:

- `backend/src/services/weeklyRemoval.ts`: occurrence-only operation with role checks, date validation, deterministic court locks, revalidation and DeskMoveBatch audit/retry receipt.
- `backend/src/routes/rescheduling.ts`: staff-only `POST /api/rescheduling/weekly/remove-occurrences`, accepting `{occurrences: [{id, date}], requestKey}`.
- `src/components/court-desk/RemoveWeeklyClassDialog.tsx`, `src/pages/Operations.tsx`: scope-specific confirmations and three-action menu, using the existing shared dialog.

Database changes: none for occurrence removal. It reuses existing recurrence exceptions and audit storage.

## Phase 5 implemented

New staff batch submissions create durable BookingRequestBatch parents per actual recipient account and link only newly created request items. Matching customer names never combine different accounts' data. Existing active requests remain in their original lifecycle and are skipped without duplicate notification delivery.

Each recipient receives one grouped notification per new group. It links to the Member Requests view. Group cards show count, staff context, timestamp, reason, original/proposed schedules, item status and individual review actions. Admin/FO see the same progress and retain payment-assistance actions. Aggregate status and pending count are derived from child states; they are not a second persisted state machine. Notification summaries calculate the current pending count when read.

Members can choose a replacement using the existing review/confirm flow, decline a grouped item while retaining the original booking/payment, or request Admin handling. Existing refund-review controls remain available. Declining does not cancel or refund a booking. Repeated staff-assistance responses are idempotent. Stale responses are rejected and cannot resolve sibling items.

The web client sends a stable batch requestKey. Its payload hash and result are stored atomically using existing DeskMoveBatch receipts. Replaying the same submission after individual responses does not create new requests or notifications. Reusing a key with a different payload returns a conflict. Legacy callers without a key still deduplicate active requests; they should adopt requestKey for durable submission replay after resolution.

Files:

- Both Prisma schemas and `20261119090000_booking_request_batches/migration.sql` in each provider's migration history: additive parent and nullable request relation/index.
- `backend/src/services/bookingRequests.ts`: recipient partitioning, notification grouping, receipts, decline lifecycle, idempotent assistance response, batch metadata in authorized request reads.
- `backend/src/routes/rescheduling.ts`: optional UUID requestKey on batch submissions and DECLINED member response.
- `backend/src/services/notificationLifecycle.ts`: live pending counts for grouped notification summaries.
- `src/components/BookingRequestWorkflow.tsx`, `src/utils/requestBatch.ts`: grouped presentation and derived state, independent child dialogs, decline confirmation, persistent client submission key.
- `src/pages/Bookings.tsx`: `?batch=...` links open Requests.
- `backend/tests/weekly-batch.test.ts`, `scripts/test-weekly-batch-browser.mjs`: new scope/group tests. Existing request and weekly browser/regression expectations were updated for grouped delivery and the third action.

## Database/API compatibility and rollout

The migration adds BookingRequestBatch, nullable BookingRescheduleRequest.batchId, a restrictive parent foreign key and indexes. Historical request rows keep null batchId and continue to render individually. No reason values, requests, read receipts, attendance, payments or other history are backfilled or removed.

Apply the appropriate provider migration before running the updated API. SQLite migrations were exercised on disposable databases through automated tests/browser fixtures. SQLite and PostgreSQL Prisma schemas validate. **Local follow-up (19 November 2026):** after a reported server error, the pending migration was applied to the configured local SQLite database after creating and integrity-checking a backup. Prisma batch/request reads and the running API health endpoint passed afterward. Booking, request, notification, transaction and attendance rows matched the backup on all pre-existing columns. Production and PostgreSQL databases were not migrated. Real PostgreSQL migration execution and concurrency validation still require an isolated PostgreSQL/staging environment.

New response fields: authorized request-list rows include nullable batchId and batch metadata. Existing child response endpoints remain the source of truth. Batch submission additionally accepts optional requestKey. Member response accepts DECLINED; it closes only that request while leaving its booking and payment unchanged. All endpoints retain existing role and ownership checks.

Before an approved production rollout, verify a backup, apply the additive migration in staging, generate the PostgreSQL client and run the PostgreSQL checks. Prefer forward recovery: preserve parent rows and child links. Do not drop populated batch tables or reset the database to roll back application code. Historical rows remain valid with the expanded schema; a prior application can continue reading its existing fields, but it will not present new groups.

## Verification

- `npm run build`: passed. Existing Vite chunk-size warning remains.
- `npm --prefix backend run typecheck` and `npm --prefix backend run build`: passed.
- `npm --prefix backend test`: **254 passed, 3 skipped, 0 failed** (257 tests). PostgreSQL environment-dependent checks remain skipped.
- Final focused `tsx --test tests/weekly-batch.test.ts`: **4 passed**, including the subsequently added populated-legacy migration preservation test, occurrence scope/authorization/retry checks, mixed accept/decline/Admin Handling, idempotent assistance and submission replay, notification counts and unchanged finances.
- `node scripts/test-weekly-batch-browser.mjs`: passed after final group-link focus changes. Tests occurrence-only removal, next-week survival, mobile grouped notification navigation, item decline/Admin Handle, pending counts, submission replay and page errors.
- `node scripts/test-reviewed-rescheduling-browser.mjs`: passed, including the three-action weekly menu, recurring termination, failure/cancel behavior, private proposals and coach decisions.
- `node scripts/test-weekly-today-browser.mjs`: passed. Covers an already-started Yangon class, linked recurrence termination, released availability, subsequent paid rental and history preservation across responsive layouts.
- `node scripts/test-customer-requests-browser.mjs`: passed with grouped-notification expectations, including recipient separation, partial batch creation, retry safety, payment assistance/refund review and private approval regression coverage.
- `npm run lint:attendance`: passed. Focused ESLint using the existing rules on requestBatch, removal dialog and new integration tests: passed. Existing changed React components received source review for hooks, conditional rendering, accessible controls and request ownership; no general project lint script exists.
- SQLite and PostgreSQL `prisma validate`: passed. Prisma client regenerated locally for SQLite. Migration execution used disposable SQLite databases only.
- `git diff --check`: passed.

**Manually verified:** source/configuration review only. Physical devices, real PostgreSQL execution/concurrency and full supported-browser matrix remain unverified. All browser fixtures and integration writes use disposable local databases. No production deployment or production migration was performed.

## Remaining risks and next phase

No manual physical-device or full Safari/Firefox/Edge verification. PostgreSQL execution/concurrency and staging backup/restore remain unverified locally. Class removal never automatically adjusts paid entitlements or refunds; those stay in the established authorized financial workflows.

Next: Phase 6 category management, including safe archival and reviewing extensibility beyond the existing three category codes.
