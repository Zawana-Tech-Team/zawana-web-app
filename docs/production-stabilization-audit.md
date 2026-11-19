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
