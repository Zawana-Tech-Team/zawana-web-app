# Production stabilization — Phase 0

Audit date: 18 November 2026. Scope: repository inspection and local baseline verification. No deployment, database reset, production migration, or application behavior change is part of this phase.

## Architecture and runtime

- Web: React 19, TypeScript, Vite 8 (observed build), Tailwind, React Router, Firebase client SDK. Versions in package manifests often use `latest` or ranges; lockfiles determine installed versions. No query/cache library is declared.
- `src/main.tsx` mounts AuthProvider → AppProvider → OperationsProvider → LanguageProvider. `src/App.tsx` owns lazy routes and role guards; `src/components/RoleLayout.tsx` owns staff navigation. Members use `src/layouts/Layouts.tsx`.
- The actual API entry point is **`backend/src/server.ts`**, configured by dev/start scripts. It mounts router factories and retains substantial inline business logic. `backend/src/app.ts` is a separate app definition and is not the configured runtime. Changes must be traced through the live entry point.
- Express, Zod, Prisma 6, Firebase Admin, and persisted application sessions implement server behavior. `middleware/auth.ts` authenticates bearer sessions and separately checks roles. `services/authSession.ts` and `modules/auth/` handle Firebase identity proofs, session issuance, revocation, and platform role policy. Database password authentication is restricted to local SQLite by `config/env.ts`.
- Two schema/migration histories exist: `backend/prisma/schema.prisma` for SQLite and `backend/prisma/postgresql/schema.prisma` for PostgreSQL. Production CD generates the PostgreSQL client and deploys PostgreSQL migrations. Client generation is shared mutable tooling state; avoid concurrent provider generation.
- The mobile application is not in this repository. Existing mobile session policies are visible, but mobile compatibility requires a separate client review.

## Module inventory and workflow dependencies

| Area | Existing modules | Dependencies and observations |
| --- | --- | --- |
| Navigation | `src/App.tsx`, `components/RoleLayout.tsx`, `pages/Operations.tsx` | Badminton FO navigation already has no Gym entry. Package Check-In & Sales and Active Packages are separate; `/badminton-fo/packages` currently redirects to check-in. Preserve protected legacy links. |
| API client/state | `src/api.ts`, `context/AppContext.tsx`, `context/OperationsContext.tsx`, `hooks/usePaymentRevision.ts` | Custom fetch/state and browser refresh events; notifications poll every 10 seconds when visible. Request components poll every 15 seconds and refresh on focus. This does not establish a consistent availability synchronization interval across views. |
| Rentals/availability | `routes/courtBooking.ts`, `routes/courtDesk.ts`, `routes/bookingQueries.ts`, `services/courtBooking.ts`, `courtAvailability.ts`, `courtPolicy.ts` | Court/day blocks, overrides, occupying booking states, idempotent submission receipts, payment recording. Court writes lock rows before conflict revalidation. PostgreSQL migrations include a GiST overlap exclusion constraint. Verify all alternate writers use compatible locking. |
| Private courses | `pages/PrivateCourse.tsx`, `pages/StaffPrivateCourses.tsx`, `routes/privateCourseFinance.ts`, `services/privateRescheduling.ts`, `privateCourseAvailability.ts`, `privateCourseFinance.ts` | Coach approval, reservation/payment expiration, request revisions, settlement/adjustment history. Preserve 24-hour and finance policies. |
| Request lifecycle | `routes/rescheduling.ts`, `services/bookingRequests.ts`, `privateRescheduling.ts`, `deskMoves.ts`, `components/BookingRequestWorkflow.tsx`, `PrivateRescheduling.tsx`, `CourtChangeDialog.tsx` | Existing customer lifecycle supports rental and private bookings; private proposals retain coach approval. Staff reasons are currently free text. Reuse these state machines rather than replace them. |
| Weekly classes | `services/blockSchedule.ts`, `deskWeekly.ts`, `weeklyRemoval.ts`, `components/court-desk/CourtTimetable.tsx` | CourtBlock recurrence uses dayOfWeek, effective dates, and excludedDates. Weekly removal terminates affected rows and records DeskMoveBatch audit receipts. Rescheduled series ancestry is encoded in notes, creating a parsing dependency. |
| Packages/check-in | Inline `/api/packages/badminton/*` and `/api/badminton/*` routes in `server.ts`; `services/badmintonCategory.ts`, `badmintonAttendance.ts`, `categoryQrPolicy.ts`, `routes/qrCheckIn.ts`, `routes/attendance.ts`, `components/BadmintonCategoryField.tsx` | Stable category IDs and code snapshots exist. Eligible same-category packages are chosen by expiry, creation time, then ID; member locking and unique attendance guards prevent duplicate deductions. Category codes are restricted to Foundation/Social/Pathway. |
| Holidays | `routes/holidays.ts`, `services/blockSchedule.ts`, `components/court-desk/HolidayManagement.tsx` | Preview/revision checking and locked application exist. Removing a holiday suspends conflicting restored classes. Current override is one row per date and lacks category scope. |
| Notifications | `routes/notifications.ts`, `services/notificationLifecycle.ts`, `attendanceNotifications.ts`, `context/AppContext.tsx`, `services/notificationInbox.ts`, `components/NotificationBell.tsx` | Persistence, lifecycle filtering, per-user read state and polling exist. Recipient correctness and deduplication must be tested event by event. No evidence yet that all Admin events are covered. |
| Coach workspace | `pages/Operations.tsx`, `pages/CoachCalendar.tsx`, `components/PrivateRescheduling.tsx` | Existing schedule, booking, finance, training and notification routes; preserve Gym coach access while refining badminton flows. |
| UI primitives | `components/UI.tsx`, `components/Interactions.tsx`, `components/court-desk/CourtActionMenu.tsx`, dialog components/styles | Reuse existing controls. CourtActionMenu already handles scroll/resize/viewport and keyboard events; inspect actual browser placement before replacing it. |

Operational dependency map:

```text
Role-protected screen → API client → session/role/object authorization → Zod validation
  → booking/request/recurrence/package service → transaction + locks + database guards
    → durable booking / attendance / request / financial history
    → persisted recipient notifications
  → mutation response + refresh events / polling → calendars, availability, inbox

Holiday / weekly exception → blockOccurs → availability → booking commit validation
Category entitlement → locked package selection → guarded debit + attendance → notification
Private proposal → coach decision → availability recheck → booking + request + audit
```

## Confirmed gaps and regression risks

1. **Batch notifications are not grouped.** `createStaffRequests` invokes a helper that emits one notification per booking. There is no durable request-group relation on BookingRescheduleRequest. Existing batch eligibility can permit different accounts with the same normalized name; grouping must partition by actual recipient ID and never share details by name.
2. **Holiday category targeting is absent.** CourtDateOverride is date-global; CourtBlock has no category relation. Do not infer category from editable class titles. Existing closures and holiday rates must remain independent.
3. **Category extensibility is constrained.** Creation requires one of three unique codes, while check-in validators and snapshot immutability triggers depend on those codes. Additional categories require an additive, coordinated API/schema/client strategy. Category description and safe archive UI also need review.
4. **Active membership listing has scale and contact gaps.** `/api/badminton/enrollments` returns up to 500 raw rows and refreshes each enrollment sequentially. Member accounts are fetched separately without pagination. Replace with a scoped paginated query including authorized contacts, consistent active/expiry filtering, and server search.
5. **Reactive behavior is fragmented.** Mutation refresh events cover a subset of endpoint families and broadly refresh operations state. No shared availability invalidation contract was found. Add targeted synchronization with a documented interval and focus/reconnect recovery.
6. **Operational request reasons remain free text.** Introduce fixed new-write validation while retaining historical text and separate notes. Do not apply staff operational reasons to unrelated customer, coach rejection, refund, or attendance-correction reasons.
7. **Deployment is not gated on CI completion in the checked-in workflow.** CD runs independently on pushes to main, pulls source, migrates, builds in place, then restarts PM2. No backup verification, immutable release, or automatic rollback step appears there. Repository settings and server configuration have not been inspected.
8. **Dual app definitions and startup compatibility DDL increase drift risk.** Route-only tests may miss differences in `server.ts`; selected smoke tests should exercise the actual entry point. Startup includes database preparation and expiry mutations, so it was not launched against configured application data for this audit.
9. **Production readiness is unproven.** Local tests do not establish production schema state, Firebase provider health, actual notification delivery, browser compatibility, accessibility conformance, dependency vulnerability status, backup restorability, or real PostgreSQL concurrency.

## Database change requirements (proposed, not applied)

- No migration is required for navigation consolidation or a shared polling/invalidation hook.
- Add recipient-scoped request batch persistence and an optional batch relation on existing requests. Preserve independent item state and events; derive aggregate status. Retain ungrouped historical records. Add idempotent submission identity and one notification identity per recipient/batch.
- Add explicit class-category association before category-specific holidays. Preserve legacy global holiday behavior with an explicit scope; backfill only from reviewed mappings. Add holiday category links, names/notes, and indexes after defining read compatibility for old clients.
- Reuse BadmintonPackageCategory IDs and `active`; consider additive description/archive metadata. Preserve immutable enrollment/check-in category snapshots. Expanding codes must update both database histories and all consumers.
- Membership query pagination should first reuse existing user/expiry/category indexes; measure query plans before adding indexes.
- Validate additive migrations on disposable SQLite and PostgreSQL databases, then staging. Take and verify backups before approved production migration; document forward recovery. Never reset or rewrite history.

## Implementation plan and phase gates

| Phase | Smallest safe implementation and required verification |
| --- | --- |
| 1 Navigation | Consolidate FO Packages with contextual check-in/sales/active-member access; retain protected direct routes. Gym removal is already satisfied in current FO navigation. Run navigation and check-in browser tests. |
| 2 Synchronization | Inventory each availability consumer/writer; reuse fetch infrastructure with shared scoped events, visible polling, focus/reconnect refresh and stale-response protection. Document chosen interval. Exercise two independent sessions and PostgreSQL concurrency guards. |
| 3 Rescheduling | Share schedule selection/summary and lifecycle adapters around existing rental/private services. Add fixed operational reason choices with historical compatibility. Preserve coach approval, price acknowledgment and refund handling. |
| 4 Weekly actions | Verify existing removal and excluded-date behavior; expose the requested menu labels and exact confirmation scope. Test selected occurrence, moved series, historical attendance and immediate refresh. |
| 5 Groups | Add recipient-scoped durable batches around existing child requests; one notification, independent actions, derived pending counts, idempotent retries and safe stale actions. Verify ownership across same-name accounts. |
| 6 Categories | Complete authorized metadata/archive management and review category-code expansion without invalidating snapshots. Verify multi-package expiry priority and concurrent category deductions. |
| 7 Holidays | Introduce reviewed class/category associations and scoped holiday preview/apply/edit/remove. Test Yangon boundaries, unrelated categories, entitlement preservation and restoration conflicts. |
| 8 Active members | Add paginated authorized package membership endpoint with contacts and server filters; remove sequential read-side refresh dependency. Test expired/start-date boundaries and object access. |
| 9 Notifications | Build event/recipient/link matrix; repair missing Admin events and deduplication; verify persisted unread state, recipient isolation and group links. |
| 10 Coach | Prioritize today/pending/upcoming using existing screens and shared request controls. Test badminton and Gym coach permissions and mobile layout. |
| 11 Authentication | Map existing error codes to safe messages, check duplicate-submit guards, provider/network/OTP/session expiry and protected loading states. Verify rate limits and server-side object checks. |
| 12 UI refinement | Refine existing primitives, dialogs and menus after behavioral changes stabilize. Test keyboard focus, touch, clipping, zoom and role-specific actions. |
| 13 QA/security | Run complete unit/integration suite, isolated PostgreSQL tests, representative A–H browser flows, access-control checks, dependency audit and supported browser/device matrix. Record actual failures rather than disable tests. |
| 14 Release | Validate staging migrations, environments, provider health, monitoring, backups and rollback; build immutable reviewable release. Production deployment remains subject to explicit approval. |

## Phase 0 report

- **Implemented:** this architecture audit, inventory, dependency map, gap analysis and phased plan.
- **Files changed:** `docs/production-stabilization-audit.md` only; generated build outputs may be ignored by Git.
- **Database changes:** none. No schema generation, deployment, migration or reset was requested by the baseline commands.
- **API changes:** none.
- **UI changes:** none.
- **Tested:** frontend `npm run build` passed (Vite reports a chunk exceeding 500 kB); backend `npm --prefix backend run typecheck` and `npm --prefix backend run build` passed. `npm --prefix backend test` exited successfully: 251 tests, 248 passed, 3 skipped, 0 failed (37.4 seconds). Skipped tests are not verification evidence; real PostgreSQL concurrency and other environment-dependent checks remain required.
- **Manually verified:** repository source/configuration inspection only. No interactive workflow verification yet.
- **Blocked:** production release evidence requires staging/database/browser/mobile/provider infrastructure; this does not block the next local implementation phase.
- **Not yet started:** Phase 1–14 implementation under this brief.
- **Next phase:** Phase 1 navigation and Packages consolidation, preserving existing check-in behavior and role guards.

## Phases 6–8 implementation report — 23 November 2026

### Phase 6: package category management

Implemented Admin-only create, rename, description, archive and reactivate through `backend/src/routes/packageManagement.ts` and `src/components/BadmintonCategoryField.tsx`. Existing package reauthentication and mutation auditing remain in front of these endpoints. Category IDs and codes remain immutable. Name checks normalize case/spacing and serialize across administrators through a singleton database lock. Delete means archive; no category or linked history is hard-deleted. Initial Foundation/Social/Pathway records stay intact. Additional stable uppercase codes work with package activation, QR issuance and attendance; category snapshots remain immutable in both database histories. Existing archived-category entitlements still support authorized attendance. Selection priority remains expiryDate, createdAt, then ID, with no cross-category fallback.

API: GET/POST `/api/packages/badminton/categories`, PATCH/DELETE `/api/packages/badminton/categories/:id`. POST/PATCH/DELETE retain existing account-verification requirements.

### Phase 7: category-based holidays

Implemented explicit nullable `CourtBlock.categoryCode` assignments, optional holiday `categoryCodes`, holiday name/internal notes, individual dates or ranges, affected-session preview, edit and removal confirmation. Unclassified legacy classes remain unclassified; category-specific holidays do not guess from names. No category selection preserves the existing all-class behavior. The same recurrence rule now drives backend availability and frontend calendars. Active matching category check-ins are rejected on the holiday with no deduction; other categories are unchanged. Members with eligible affected category memberships receive notices. Mutations record an actor and before/after audit.

Class assignment is available during new weekly creation and in Holiday Management. Assigning an existing class revalidates future conflicts under court locking. Scope edits and removal retain conflicting restored sessions as suspended; no bookings are recreated, moved or cancelled. Past holiday schedules are read-only. Paid package balances, validity, receipts and attendance remain unchanged.

API: existing `/api/holidays/preview` and POST `/api/holidays` accept `dates`, optional `categoryCodes` (null = all), `name`, `notes`, with the returned revision required to save. GET `/api/holidays/classes`, PATCH `/api/holidays/classes/:id/category`, GET `/api/holidays/:date/removal-preview`, DELETE `/api/holidays/:date`. Admin and FO only. Legacy date-only requests remain supported.

### Phase 8: active package member details

Implemented contextual Active Members on package cards through `src/components/PackageMembers.tsx`. GET `/api/packages/badminton/:id/members` supports page/pageSize (maximum 100), name/phone/email search, optional categoryCode and active/expired/all filters. Active means started, unexpired, active status and a positive session balance. Contacts use the existing account, with batched legacy studentId resolution and enrollment phone fallback; missing contacts show “Not provided”. Details show the purchased package name, category, activation/expiration dates, balance and status. Queries use server pagination and batched relations; no per-member query loop. Unauthorized roles cannot retrieve contacts.

### Database changes and release boundary

Both schema histories include additive `20261123120000_package_category_management`: category description, class category code, holiday category scope, category mutation lock and query indexes. Existing category-validation guards now allow registered additional codes while retaining immutable snapshots; PostgreSQL uses restrictive category-code foreign keys. No historical data or balances are rewritten. These migrations have only been applied to disposable test databases. Before deployment, validate the PostgreSQL migration on staging with a verified backup. Forward recovery is preferred: archive categories or remove holiday scope through the safe restoration workflow rather than dropping new columns or resetting data. Production deployment is not authorized.

### Additional member dashboard correction

`src/pages/Dashboard.tsx` now uses one schedule view, graphical per-package balances, one pending-request notice and three working quick actions. Marketing cover, repeated next-court/private cards, repeated schedule/history sections and duplicate notification controls are removed from this dashboard. Check-in stays within Packages. Dashboard uses Yangon dates and shared booking revision polling; errors retain last known data and offer retry. The dashboard endpoint adds compatible `requestCount`/`requestLink` fields. Existing response fields remain available for other clients.

### Verification and next phase

Commands: `npm run lint:packages`, `npm run build`, backend build/test, Prisma SQLite/PostgreSQL schema validation, `node scripts/test-package-management-browser.mjs`, and `node scripts/test-holidays-browser.mjs`. The browser suites use isolated temporary SQLite databases and real APIs; they verify account reauthentication, category creation, contact search, scoped preview, confirmed restoration, unchanged balances, dashboard links and 1440/768/390/320px layouts. PostgreSQL concurrency/staging deployment and the broader supported-browser matrix remain unverified.

Next recommended master phase: Phase 9 notification event/recipient/link audit, followed by Coach workflow prioritization.

Final local verification: 273 backend tests passed, 3 PostgreSQL integration tests skipped; package lint and frontend/backend builds passed. Both Prisma schemas validate. Both package/dashboard and holiday browser journeys passed in Chrome; the dashboard was inspected at 320, 390, 768 and 1440 px. One initial full run hit the existing package reauthentication timestamp assertions; unchanged security tests passed on subsequent full runs. Live PostgreSQL migrations, production environments and non-Chrome device testing remain pending.

## Phases 6–8 continuation and completion

This follow-up closes gaps found during acceptance review rather than introducing another package or holiday system.

- **Phase 6:** Category metadata saves now refresh package cards through the existing Operations refresh. Archived categories are excluded from the member sales catalog and FO activation choices, while existing paid memberships and historical records remain available. The same account reauthentication and audit remain required for category mutations.
- **Phase 7:** Holiday edits now carry optional `sourceDates` in preview/save. Moving a holiday previews both suspension on replacement dates and restoration on previous dates. Both changes commit together under the existing court locks and revision check. Conflicting old-date classes remain suspended; bookings and payments are untouched. Moving onto another configured holiday is rejected for explicit review. Removal previews now return a revision; the UI submits it and stale removal is rejected. Old clients omitting the optional removal revision remain compatible, with conflicts always revalidated before commit. Existing archived-category classes remain eligible for holiday management. Users whose holiday coverage changes or is removed receive scoped notices; unchanged repeated settings do not produce duplicate application notices.
- **Phase 8:** The member dialog now has a category filter, accurate scheduled/expired/exhausted statuses, and recovery when the current page disappears as records change. Admin package cards and the FO Packages page share the same paginated member dialog. FO gets a compact package directory, including archived-category memberships, without changing the activation form. Opening FO activation no longer downloads the entire enrollment list. Contacts remain available only to Admin/FO.

**Files:** `backend/src/routes/holidays.ts` implements edit/removal validation, restoration and recipient notices; `backend/src/routes/packageManagement.ts` handles validated pagination and derived status; `backend/src/server.ts` restricts the member sales catalog. `HolidayManagement.tsx` adds edit context and restoration preview; `PackageMembers.tsx` adds the category filter and FO directory; `BadmintonCategoryField.tsx` and `Operations.tsx` reconcile category changes and exclude archived-category sales. Unit/API and browser regression tests cover the new paths.

**Database:** No additional schema migration is needed for this continuation. After the reported availability failure, the existing package-category migration was applied to the local development SQLite database following an integrity-checked backup; booking, transaction, enrollment, attendance, category, court-block and override row counts were preserved. Production databases were not changed. PostgreSQL staging migration/concurrency validation is still pending.

**API compatibility:** Holiday preview/save accept optional `sourceDates`; removal-preview returns `revision`; DELETE accepts optional `{ revision }`. Member endpoints retain the same paginated shape and validated category/status filters. No new payment or refund policy is introduced.

**Continuation verification:** `npm --prefix backend test` passed 274 tests with 3 PostgreSQL integration skips and no failures. `npm run lint:packages`, frontend build and backend build passed. The package-management browser journey passed account verification, immediate category-name refresh, category/member filtering, safe holiday date movement and removal, archived-category sales exclusion, retained balances, and FO member lookup on mobile. The legacy holiday browser regression also passed. A read-only check against the running local database returned availability for 8 courts and 120 slots. Production was not deployed.

The existing second-boundary flake in `backend/tests/package-security.test.ts` was corrected by aligning only the replay-test challenge's fixture timestamp with the provider authentication second; identity, stale-token and one-time-proof assertions remain strict. The test now restores its authentication-mode fixture in `finally`, preventing a failed assertion from contaminating the following test. No production authentication checks were relaxed.

## Phases 9–13 implementation — 24 November 2026

Implemented notification event deduplication, Admin/FO delivery and exact request/booking links; a task-focused Coach dashboard and direct booking decisions; safe login/OTP/session error presentation and duplicate-submit guards; viewport-aware notification/select controls and nested-dialog keyboard handling; and repeatable automated regression checks with a Chromium CI job. Existing financial, package/category, rescheduling and role rules remain intact.

See [the phase 9–13 implementation and verification report](stabilization-phases-9-13.md) for the event matrix, commands, actual checks and limitations. Local backend verification passed 279 tests with 3 PostgreSQL integration skips. Remaining dependency advisories, PostgreSQL execution, supported-browser/physical-device checks and live provider verification are recorded as release limits. No production deployment or schema migration was performed. Phase 14 remains separate.
