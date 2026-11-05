# Shared category attendance QR correction

## Architecture and decisions

The active API is `backend/src/server.ts`, which mounts `routes/qrCheckIn.ts` and `routes/attendance.ts`. Coach, Badminton FO, Admin and member attendance already share `Attendance.tsx`, AttendanceList and AttendanceDetail. The prior revision persisted a member ID/category set and marked a token globally USED. That contract was incorrect for a shared category arrival code.

The correction retains `BadmintonEntryQr`, secure random tokens, encrypted redisplay, the scanner, existing attendance/check-in models, `badmintonAttendance.ts` and `badmintonCategory.ts`. Package reauthentication, package audit logging, notification receipts, court bookings and payment workflows remain in place.

A shared `BadmintonQrDeskSlot` table contains exactly two seeded rows, IDs 1 and 2. Each points to its independently managed QR. All authorized badminton staff see the same two cards. This avoids tying restoration to a browser session or a member. Reusing a valid slot never extends expiry; changing a live slot requires explicit replacement. Another active slot cannot have the same category.

`BadmintonQrRedemption` records QR, authenticated member, exact deducted enrollment, attendance and redemption timestamp. It has `@@unique([qrId, memberId])` and unique `attendanceId`, with foreign keys and a member/time index. The existing `BadmintonQrVisit` category/day ledger is retained and written in the same transaction. It can contain historical repeated QR/member pairs across different dates; adding a new uniqueness constraint to that historical table would risk breaking migrations or deleting history. The new redemption ledger enforces the corrected contract without rewriting that history.

Legacy `memberId`, global `usedAt`, redemption actor/attendance and category-set fields on BadmintonEntryQr remain for historical evidence. New category codes have `kind=CATEGORY`, one immutable `categoryCode`, and no member binding or global USED transition. Existing active member-contract QR codes are revoked by the forward migration; already USED and historical attendance records are preserved.

## Atomic behavior

- Generation locks desk rows in ascending slot order. It validates the category and the other active slot, reuses the requested valid slot or explicitly revokes only its predecessor, creates a random-token record expiring exactly 7,200,000 ms after creation, and updates that slot pointer in one transaction.
- Revocation locks its slot before the referenced QR. A stale request never revokes a replacement QR.
- Redemption locks the authenticated member and QR, checks token kind/status/time/issuer and existing QR/member redemption, then selects the exact matching-category entitlement. The existing attendance service locks and debits that entitlement and preserves its snapshot and daily uniqueness guard.
- Before commit, QR validity is checked again, then the unique QR/member redemption and existing QR/day visit are inserted. Attendance, debit, both ledger records and attendance notifications commit together. Any failure rolls back all of them.
- The shared QR stays ACTIVE after redemption. Concurrent duplicate scans cannot create duplicate attendance or debit. Other members can use the same QR until it expires or is revoked.
- The existing category/day guard remains in addition to per-QR uniqueness. Regenerating Social does not permit a second Social deduction that day. Foundation and Social remain independent categories.

## Authorization and UI

`services/categoryQrPolicy.ts` is the shared authority for attendance's `permissions.categoryQr` capability, QR management and scan-time issuer validation. Admin/Badminton FO are allowed. Coaches require an active linked coach profile in Badminton. Other roles, inactive/unlinked coaches and Gym coaches are denied. The backend independently enforces this capability for QR management. The Attendance page no longer renders a QR desk.

The desk uses two QrCard instances with independent category selection, loading/error feedback, countdown, image, count, replacement/revocation and history. The shared GET restores both cards on mount and polls every five seconds/on focus. Cards restore automatically when the QR desk loads, persist after expiry/revocation and remain visible when the other slot changes. Mobile stacks the same cards. The scanner previews the server-owned category and does not offer a category override.

Counts aggregate redemptions without exposing member details. Coach/FO/Admin named history shows the same latest 20 arrivals for the QR, matching their shared attendance view. Paid private-course attendance remains separate from package debit. A shared category QR does not assert a course-to-package association.

Member confirmation shows category, deducted package and remaining sessions. The existing attendance notification service records deduction and balance, alerts authorized badminton staff for low/exhausted balances, and supplies package expiry notices. Live QR counts/history provide routine staff arrival feedback. Duplicate/expired/revoked errors stay contextual and do not spam persistent notifications.

## API contracts

Paths are relative to `/api`.

| Endpoint | Contract |
|---|---|
| `GET /check-in/qr` | Authorized badminton staff; `{slots:[{slot:1,qr:...},{slot:2,qr:...}]}`. No member filter. |
| `POST /check-in/qr` | `{categoryCode:"SOCIAL",slot:1,regenerate?:false}`. Slot defaults to 1 for category-only callers. Member IDs and category arrays are rejected. Returns slot, token when active, category, status, timestamps, server time, count and scoped recent history. |
| `GET /check-in/qr/:id` | Authorized badminton staff; independent QR status/count/history and active token for redisplay. Legacy member-contract QR IDs are unavailable through this endpoint. |
| `DELETE /check-in/qr/:id` | Authorized badminton staff; revoke only this slot's active QR. |
| `POST /check-in/preview` | Member `{token}`; exact QR category, selected package, current/expected balance and one-session charge. |
| `POST /check-in/scan` | Member `{token}`; atomic check-in/debit/redemption. Client category, member and enrollment overrides are rejected. |
| `GET /attendance?month=YYYY-MM` | Adds `permissions.categoryQr` alongside existing scoped records. |

`QR_ALREADY_REDEEMED`: “You have already checked in using this QR code.”

`QR_EXPIRED`: “QR code expired. Please request a new QR code.”

`QR_SLOT_OCCUPIED` requires explicit replacement; `QR_CATEGORY_DISPLAYED` prevents the same active category in both slots. Existing package eligibility/category/day errors retain their established meaning.

## Forward migrations and rollout

New migration: `20261104110000_shared_category_qr`, in both SQLite and PostgreSQL trees. It runs in a transaction, adds `kind`, retires active tokens using the previous contract, creates/initializes the two desk slots and adds the redemption ledger/constraints. It does not reset databases, delete historical visits, change package balances, rewrite existing migration files or reinterpret old redemptions.

Back up and rehearse the complete provider-specific migration chain on staging. Drain old QR API writers, apply the correct provider migration, regenerate its Prisma client, build/restart the API and release matching UI/API consumers together. Keep the stable QR encryption key available across replicas/restarts. Old member-based API callers must be upgraded. No working/production database migration or deployment was performed during this task; migration tests use disposable databases.

## Changed files in this correction

- Both Prisma schemas and both new `20261104110000_shared_category_qr/migration.sql` files.
- `backend/src/routes/qrCheckIn.ts`, `attendance.ts`, new `backend/src/services/categoryQrPolicy.ts`.
- `src/components/QrDesk.tsx`, new `src/components/qr-desk.css`, `src/pages/Attendance.tsx`, `QrCheckIn.tsx`.
- `backend/tests/badminton-category.test.ts`, `private-course.test.ts`, `attendance-browser-fixture.ts`, `scripts/test-attendance-browser.mjs`, `eslint.attendance.config.mjs`.
- Current QR documentation and links in the attendance/category SOPs. Other pre-existing workspace changes are preserved.

## Verification

| Check | Result |
|---|---|
| Full backend suite | **166 tests: 163 passed, 0 failed, 3 PostgreSQL-only skips.** Includes multi-member QR scans, database pair uniqueness, concurrent duplicate scans, exact-category debit, rollback, independent slot expiration/replacement/revocation, coach authorization/history privacy and existing payment/package/booking regressions. |
| Browser journey | **Pass**, four roles at 1440/768/390px. Coach and FO display the same two cards directly on Attendance; reload restores both automatically. A real API process restart preserves token IDs/values and original expiry. Two members redeem Social, its live count updates to 2 and history updates while the QR stays active; duplicate scan rejects, and a separate Foundation visit debits Foundation independently. |
| Migration preservation | **Pass**, SQLite. Historical attendance, repeated legacy QR/member visits and session balances survive; active member-contract codes become REVOKED, existing USED history remains USED, and both slots plus foreign keys are verified. |
| Lint | **Pass**: `lint:attendance`, `lint:gym`, `lint:cinematic`. |
| Type checks and production builds | **Pass**: frontend build, backend typecheck/build and PostgreSQL-client backend build. SQLite client restored afterward. Existing frontend chunk-size warning remains non-blocking. |
| Prisma schema validation | **Pass**, both providers. PostgreSQL validation/build used placeholder local URLs without connecting to production. |
| Whitespace check | **Pass**, `git diff --check`. |

Screenshots of the two-column coach desk, stacked mobile FO cards and live count/history were visually reviewed. The browser fixture keeps the established test-only reset of the profile-read IP counter between synthetic roles; credential/replay rate limits remain intact. No production authentication controls were changed.

 PostgreSQL runtime contention requires the existing isolated `BADMINTON_POSTGRES_TEST_URL` suite/CI job; provider-client builds and schema validation alone do not establish runtime behavior. Camera upload decoding is covered in browser tests; physical-device camera permission testing remains a release check.
