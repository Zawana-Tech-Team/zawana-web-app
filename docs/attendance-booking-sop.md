# Attendance and court changes: architecture audit and implementation plan

## Repository audit

- Frontend: React 19 / TypeScript / Vite, React Router (`src/App.tsx`), authentication in `src/context/AuthContext.tsx`, operations state in `src/context/OperationsContext.tsx`, API client in `src/api.ts`. Shared controls: `src/components/UI.tsx`; role workspaces: `src/components/RoleLayout.tsx`, `src/pages/Operations.tsx`. Attendance already has member/admin/coach/badminton FO routes and `src/pages/Attendance.tsx`. Customer reservations: `src/pages/Bookings.tsx`; FO/admin court queue: `BookingQueue` in Operations.
- Active backend: `backend/src/server.ts`, Express, Zod, Prisma. `backend/src/app.ts` and some standalone route files are legacy and are not the production entry point. Extend the active server and existing router factories.
- Authentication: Firebase identities plus revocable database sessions (`middleware/auth.ts`, `modules/auth/hybrid.service.ts`, `services/authSession.ts`). Role checks use account IDs. Coach assignment uses `Coach.userId`, never matching names/contact details.
- Database: SQLite development schema (`backend/prisma/schema.prisma`) and PostgreSQL production schema (`backend/prisma/postgresql/schema.prisma`), with separate migration trees. No migration should be deployed by this task. Note: `npm run dev` runs migrations in predev; validation must avoid it.
- Attendance: `BookingAttendance` has unique `bookingId`, recorder and timestamp. `BadmintonCheckIn` references a specific `BadmintonEnrollment`; enrollment has package name, validity, total and remaining visits. `GET /api/attendance?month=YYYY-MM`, `POST /api/attendance/courses/:id/check-in` are implemented in `routes/attendance.ts`. FO package check-in (`POST /api/badminton/check-ins`) and member QR (`routes/qrCheckIn.ts`) already debit transactionally. Gym has separate, richer `GymSessionAttendance`, `GymSessionDebit`, `GymAuditLog`, `GymEnrollment` services; reuse their locking pattern, not their department-specific tables.
- Course bookings are independently priced and paid. There is **no existing relationship from private-course bookings to badminton package enrollment**, nor a package class roster/scheduled session model. Do not guess this relationship or deduct a package for an independently purchased course.
- Courts: `Booking` is one dated one-hour segment; `BookingSubmission` groups segments for retry recovery, not a second reservation entity. `Court`, `CourtBlock`, `CourtDateOverride`, `HolidayRate` drive availability. `services/courtBooking.ts` handles atomic multi-court/multi-day creation, sorted court locks, prices and notifications. `services/courtAvailability.ts` serves availability. Both booking status cases exist. Integrity migrations enforce conflicts in both databases.
- Existing APIs: `GET/POST /api/bookings`, `PATCH /api/bookings/:id`, `PATCH /api/bookings/:id/status`, `DELETE /api/bookings/:id`; `GET /api/court-booking/availability`, `/month`, `/bookings/:id`, `/submissions/:key`. Generic staff edit currently bypasses a reschedule policy and lacks change history. Cancellation preserves rows, but paid customer cancellations are blocked and require staff. No approved automatic refund policy exists.
- Notifications already support member and department audiences (`Notification`). Gym audit is department-specific; no general booking-change or attendance-correction ledger exists.

## Existing versus intended workflow

| Area | Existing | Incremental change |
|---|---|---|
| Course attendance | Present check-in only | Present/absent/late/excused, notes, admin reasoned corrections and history |
| Package attendance | Actual visits with transactional debit | Package/profile detail and history; preserve current visit consumption semantics |
| Attendance visibility | Own member / assigned coach / badminton staff | Preserve scopes for detail, filters and export; never expose clinic data |
| Course/package association | Independent purchases | Display actual association only; standalone course is explicitly identified |
| Court change | Generic staff edit only | Dedicated quote/commit API; confirmed customers allowed at >=24 hours; availability and price rechecked transactionally |
| Multi-slot reservation | Independent rows grouped by submission | Explicitly change one identified segment; leave other dates/courts alone |
| Paid cancellation | Customer blocked; contact staff | Persistent cancellation request with approval/rejection and history; payment stays unchanged |
| Refund | No approved automatic policy | Manual financial review; automatic refunds disabled |

## Minimal implementation plan

1. Extend BookingAttendance with status/notes and a correction ledger. Extend existing attendance response with safe profile, schedule and package fields. Add scoped participant history; calculate percentage only from completed scheduled course sessions, excluding future/cancelled sessions. Unscheduled package visits do not imply absences.
2. Add BookingChangeHistory and BookingCancellationRequest related to existing Booking. Use UTC DateTime for event timestamps and Yangon date/time interpretation for existing local schedule fields. Preserve existing booking representation.
3. Add court detail/quote/reschedule/cancellation request/review APIs to the court router. Lock existing booking and old/new courts; reuse creation availability/pricing rules. Block unresolved price adjustments and in-flight payment attempts. Keep original paid amount and payment status untouched. Use optimistic expected schedule/history revision to reject stale confirmations.
4. Route legacy court schedule edits through the dedicated workflow; restrict unrelated FO access. Retain existing unpaid cancellation behavior, recording history.
5. Extend existing attendance/calendar pages with filters, responsive list, details and recording controls. Reuse one court-change dialog for customer and FO/admin, including booking timeline and cancellation review.
6. Exercise isolated databases, authorization, exact policy boundaries, rollback, concurrency, package check-in regression and builds; validate both Prisma schemas without deploying.

## Role matrix

| Action | Admin | Coach | Badminton FO | Member |
|---|---|---|---|---|
| Attendance/history | All badminton | Assigned courses only | Badminton | Own |
| Initial course marking | Yes | Assigned courses | Yes | No |
| Correct existing attendance | Required reason | No | No | No |
| Filtered attendance export/audit | Yes | No | No | No |
| Court reschedule >=24h | Yes | No | Yes | Own confirmed |
| Inside-window exception | Explicitly configured admin approval | No | No bypass | No bypass |
| Cancellation request | Yes | No | Yes | Own |
| Cancellation review | Yes | No | Yes | No |
| Automatic refund | Disabled | No | No | No |

## Policy decisions / deployment

- Confirm which classes, enrollments and packages should be linked before building package-funded course rosters; there is no data from which to infer these associations.
- Preserve package consumption as one recorded visit per day. Absent/late consumption for future scheduled package training requires business configuration and a real session/enrollment link.
- Inside-window reschedule exceptions default off; only admins can approve when explicitly enabled. Require reason and persist approver and original details.
- Different-price moves require manual payment adjustment until a reviewed collection/credit workflow exists. No automatic refunds or assumed credits.
- Apply reviewed migrations to development/staging first, back up production and assess pre-existing data. Run PostgreSQL concurrency tests against an isolated database before rollout.

## Implemented interfaces and APIs

Attendance now extends the original role routes rather than introducing another attendance application:

- `GET /api/attendance?month=YYYY-MM`: includes profile/member ID, contact, actual class/coach association, enrollment/package utilization and validity. Optional `q`, `title`, `coachId`, `packageId`, `from`, `to`, `status`; custom ranges may span months. Admin `export=csv` exports exactly those filters.
- `GET /api/attendance/:kind/:id/detail`: `kind=course|package`; independently authorizes the record, then scopes the participant history. Coaches see only their assigned course history. Returns completed-schedule summaries and admin-only modification history.
- `POST /api/attendance/courses/:id/mark`: records present/absent/late/excused and notes. Existing records require admin and a reason. Standalone course attendance never debits a package.
- `POST /api/attendance/packages/:id/mark`: admin correction with reason; adjusts the original enrollment balance by the change in consumed sessions, in the same transaction as the status and audit entry. Repeated status edits do not debit or restore again. Legacy records lacking a verifiable snapshot cannot change balances automatically.
- Existing course check-in, FO package check-in and member QR routes remain. FO and QR package writers now share `services/badmintonAttendance.ts`, enrollment locks and a unique daily guard for new writes. The established renewal implementation creates a new enrollment, retaining the original package reference; new check-ins additionally snapshot entitlement details.
- Existing calendar plus responsive list/filter controls are in `src/pages/Attendance.tsx`; `src/components/AttendanceDetail.tsx` supplies profile/training/package/history/summary/correction views. Percentage counts present + late divided by all completed paid scheduled course sessions, including unmarked completed sessions; cancelled and future sessions and unscheduled package visits are excluded. An unmarked record remains pending rather than implying absence.

Court operations use the existing Booking rows:

- `GET /api/court-booking/bookings/:id/changes`: reservation, customer, policy deadline, revision, history and cancellation requests.
- `POST /api/court-booking/bookings/:id/reschedule/quote`: `{date,time,courtId,exceptionReason?}`; calculates current destination price and returns difference/revision.
- `POST /api/court-booking/bookings/:id/reschedule`: adds `{revision,reason}`; atomically locks courts and booking, checks policy, current slot availability, active checkouts, price and revision, updates one segment and emits history/notifications.
- `POST /api/court-booking/bookings/:id/cancellation-requests`: `{reason}`; unpaid active reservations cancel immediately under the existing rule. Paid requests retain the court until review.
- `POST /api/court-booking/bookings/:id/cancellation-requests/:requestId/review`: badminton staff `{approve,reason}`; approved cancellation completes atomically and retains review evidence; rejected requests keep the booking. Financial status remains manual review. The system does not assert a refund is pending or completed without an actual financial workflow.
- Rescheduling uses the full-page `src/pages/CourtReschedule.tsx` flow, reusing `CourtBooking.tsx` for the same rental calendar, preferred times, floor-grouped courts and hourly session buttons. `CourtBookingSteps.tsx` supplies dates/times → courts/sessions → review. Rescheduling permits one replacement date/session; the rental flow retains multiple dates/sessions. Review shows original/proposed reservations, live quote, price difference, reason, and any configured admin exception; confirmation appears only after the backend update succeeds. Mobile has a persistent review action after selecting a replacement.
- Role-guarded rescheduling routes: member `/bookings/:id/reschedule`, badminton FO `/badminton-fo/bookings/:id/reschedule`, admin `/admin/court-rentals/:id/reschedule`. My Bookings and the FO/admin queue link directly to the page. Selection is retained when returning from review. Different-price moves remain blocked until the existing business/payment workflow is approved.
- `src/components/CourtChangeDialog.tsx` remains the shared details, history, cancellation request and cancellation review dialog. Its change-time action navigates to the full-page flow; it no longer contains a rescheduling form.
- Generic court schedule/price/status edits cannot bypass these workflows. Badminton FO booking lists are restricted to court and private-course records even when filters request another department.

## Migration and release procedure

Review `20261027120000_attendance_court_changes` in both migration trees. It adds status/notes to BookingAttendance, package snapshot/status to BadmintonCheckIn, and the three history/request tables. It adds nullable `dailyKey` with a unique index. One existing visit per enrollment/day receives the guard; other historical visits retain a null guard. All visits, timestamps, notes, consumed sessions and enrollment balances are preserved. New writes supply the same deterministic daily guard and check for any existing visit under the enrollment lock.

This optional read-only query reports repeated historical visits; the revised migration supports them without data cleanup:

```sql
SELECT "enrollmentId", "date", COUNT(*)
FROM "BadmintonCheckIn"
GROUP BY "enrollmentId", "date"
HAVING COUNT(*) > 1;
```

Back up, apply migrations in staging, generate the client for the chosen provider, build and test, then deploy compatible backend/frontend together. Do not delete historical visits or guess balance corrections to make a migration pass.

### Recovering the initial SQLite P3018 failure

The initial unreleased migration attempted an enrollment/date unique index. Existing repeated visits can cause SQLite error 2067 after the earlier columns and tables have already been created. Simply rerunning migration deploy or marking it rolled back does not undo these partial steps.

After updating to the revised migration and application code, run:

```sh
npm --prefix backend run attendance:migrate:recover
npm --prefix backend run prisma:generate
```

The recovery command reads the local SQLite URL from `backend/.env`, verifies this specific failed migration and its partial schema, creates a consistent `.db.attendance-recovery-<timestamp>.bak` backup, adds/seeds the daily guard in a transaction, verifies all attendance records and enrollment balances are unchanged, then uses `prisma migrate resolve --applied` to reconcile the completed schema. It refuses unrelated or already-resolved states. It does not reset the database, remove visits, or change session balances. The revised migration can run normally on a database where the migration has not yet been attempted. A successfully applied older migration on a different deployment needs its own forward migration; this command only handles the observed failed SQLite state.

This follows [Prisma's forward recovery procedure](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing#option-2-manually-complete-migration-and-resolve-as-applied): complete the missing SQL steps first, then resolve the migration as applied.

Configuration in `backend/.env.example`:

- `COURT_MANAGER_EXCEPTIONS_ENABLED=false`: only an explicitly enabled admin exception may bypass the customer deadline for a still-future confirmed reservation. FO cannot grant itself approval. The admin making the approved move is recorded as approver with reason and UTC timestamp; no speculative manager role is introduced.
- `BADMINTON_CONSUMING_ATTENDANCE_STATUSES=present,late`: preserves actual-visit charging, with configurable correction consumption. Review any change adding absence/excuse charging. Independently purchased courses remain separate.
- Automatic refunds remain disabled. Different-price moves report `PAYMENT_ADJUSTMENT_REQUIRED`; no unapproved collection, credit or price overwrite occurs.

## Remaining business decisions

Scheduled package-funded class rosters require a real class/session/enrollment association and approved consumption rules. Existing package attendance represents visits, not a scheduled class roster. The implementation deliberately does not guess which package funds a private-course booking. Confirm these associations before extending this workflow to scheduled package training or consolidating the separate gym subsystem.

A different-price payment collection/credit workflow and automated refund policy require approval and integration with the existing verified payment flow. Inside-window manager exceptions require the configuration decision above. PostgreSQL runtime concurrency verification requires an isolated PostgreSQL test database; schema validation and provider-client builds alone do not establish runtime concurrency behavior.

## QA results

- `npm --prefix backend test`: **120 tests: 119 passed, 0 failed, 1 skipped**. The skip is the existing PostgreSQL integration test without `COURT_POSTGRES_TEST_URL`. Regressions include verified payments/private courses, memberships/gym, booking creation and authentication.
- `backend/tests/court-changes.test.ts`: exact 25h/24h/23h59m policy boundaries; confirmed/terminal status aliases; real authenticated ownership/department restrictions; migrated SQLite schema; paid confirmed move; multi-court/multi-day sibling preservation; stale revision; unavailable/maintenance/holiday/block rollback; different-price protection; active payment checkout protection; concurrent move/create competition; configured admin exceptions; cancellation request/rejection/approval/repeated review; unchanged financial records; package final-session concurrency, idempotent restoration, expiry and original-package safeguards.
- `backend/tests/attendance.test.ts`: actual course/package association, assigned coach isolation for detail and marking, duplicate course check-in, notes and reasoned admin correction, filtered admin export, cross-month date ranges and percentage denominator excluding future/cancelled sessions.
- `node scripts/test-attendance-browser.mjs`: four attendance roles at 1440/768/390px, persisted correction with audit reason, customer quote/confirm/history, paid cancellation request and FO review, one-hour QR issue/rotation/upload decoding and duplicate protection; no captured browser exceptions or React key warnings. Native-dialog body contrast is asserted. Screenshots were visually reviewed; a surface-token text contrast issue was corrected.
- Frontend production build, backend build, PostgreSQL-client backend build and both Prisma schema validations pass. PostgreSQL syntax validation used placeholder local connection values without connecting. The development SQLite client was regenerated after the provider build.
- `git diff --check` passes. The initial implementation did not apply migrations to the working database or production. The subsequent P3018 recovery completes the user-attempted local SQLite migration after backup; automated recovery tests use disposable databases.

## P3018 recovery verification

The local SQLite database was backed up and recovered using the command above. Prisma reports **Database schema is up to date** with zero unresolved attendance migrations. All **22 historical visits** remain, including both repeated enrollment/day groups; **14 daily guards** were seeded. Attendance fields and enrollment session balances were compared before and after the transaction and are unchanged.

`backend/tests/attendance-migration-recovery.test.ts` verifies both a fresh migration containing duplicate historical visits and recovery from the exact partially applied unique-index failure, including backup contents, Prisma migration resolution, rejection of repeated recovery and prevention of another check-in without changing the session balance. Backend regression results: **119 passed, 0 failed, 1 PostgreSQL integration test skipped**. Backend typecheck and both schema validations pass.

## Full-page rescheduling verification

The browser journey exercises the same rental date/time and floor/court controls with no rescheduling dialog. It verifies one replacement session at a time, different-price quote blocking with original booking preservation, editing a selection from review, same-price confirmation, persisted change history and the subsequent cancellation/review flow. Member, badminton FO and admin routes are exercised. The existing multi-date/multi-court rental browser regression still passes. The focused court-change API suite passes all nine tests.
