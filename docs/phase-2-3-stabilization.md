# Phases 2 and 3 — Availability and shared rescheduling

## Phase 2 implemented

A single subscription service refreshes active booking consumers every **15 seconds**, plus a 100 ms coalescing window. Hidden tabs pause polling; focus, becoming visible and network reconnection trigger a refresh. Successful booking mutations trigger immediate invalidation. Quote/preview reads, authentication and unrelated mutations do not trigger booking invalidation. There is no full-page reload or optimistic booking/financial write.

Changed modules:

- `src/services/bookingSync.ts`, `src/hooks/useBookingRevision.ts`: shared reference-counted timer, event subscriptions, coalescing and cleanup.
- `src/api.ts`: booking mutation classification and successful-write invalidation.
- `src/pages/CourtBooking.tsx`, `PrivateCourse.tsx`, `Bookings.tsx`, `CoachCalendar.tsx`, `StaffPrivateCourses.tsx`: reactive availability/history/calendar updates. Existing late-response guards are retained; Coach calendar now ignores late responses after date changes.
- `src/pages/Operations.tsx`: targeted desk availability and day-rental refresh, booking queue updates and immediate closure after successful reservations while histories refresh.
- `src/components/court-desk/DeskPrivateCourseDialog.tsx`: refresh eligible slots while retaining a still-available selection.
- Request/proposal components use the shared timer instead of separate polling timers.
- `backend/src/routes/courtDesk.ts`: staff-only day rental read endpoint so the timetable updates rental cards as well as blocked slot state, without periodically refreshing all operations resources.

### Database and API changes

No migration. Existing transactional court/coach locking, commit-time availability checks, retry receipts and PostgreSQL overlap exclusion constraints remain authoritative.

Added `GET /api/staff/court-desk/rentals?date=YYYY-MM-DD`, restricted to Admin/Badminton FO. It returns occupying court rentals for the requested day in the existing desk presentation shape. Invalid dates return 400. Historical booking/payment records are unchanged.

### Synchronization limits

Another user's changes appear after the next visible-tab poll plus request latency. The browser check allows 20 seconds. Offline views cannot commit new server mutations successfully; reconnection refreshes server state. This is polling, not server push. A selected session is always revalidated by the backend at commit. No PostgreSQL migration or production database inspection was performed in these phases.

## Phase 3 implemented

The existing BookingRescheduleRequest lifecycle is retained for rental and private staff requests. Private proposals retain assigned-coach approval; rental price acknowledgment/additional-payment/refund rules are unchanged.

Changed modules:

- `src/components/ReplacementSessionFields.tsx`: common court/date/available-session fields used by both customer rental/private request handling and independent private proposals, with a choose → review → confirm progression. Fields refresh automatically, disable unavailable times, preserve session duration, clear invalid selected times, and show network/empty states.
- `backend/src/services/rescheduleAvailability.ts`: shared destination-slot calculation using existing duration, court, coach, holiday/block and overlap checks. Infrastructure failures remain errors rather than being presented as a fully booked day.
- `backend/src/services/bookingRequests.ts`, `privateRescheduling.ts`: reuse shared availability. Private approval rolls back infrastructure errors rather than converting them into final conflicts. Original sessions and payments remain unchanged while proposals await approval.
- `backend/src/domain/rescheduleReasons.ts`, `src/components/OperationalReasonField.tsx`: central Event/Maintenance values and readable labels.
- `backend/src/routes/rescheduling.ts`: validates new operational reasons on staff request, batch, private invitation and staff move endpoints. Customer proposal reasons, coach review reasons and refund/attendance policies retain their existing semantics.
- `src/components/BookingRequestWorkflow.tsx`, `PrivateRescheduling.tsx`, `court-desk/DeskMoveDialog.tsx`: fixed staff reason choices, shared replacement UI and shared staff invitation dialog. Optional request notes are separate from the reason and persisted in the request's creation audit event.

### Database and API changes

No migration or historical backfill. Historical free-text reason values remain readable. Existing request/proposal tables and audit events remain the source of truth.

- Added `GET /api/rescheduling/private/:bookingId/availability?date=YYYY-MM-DD&courtId=...` for the owning Member. Uses existing reschedule eligibility, including the 24-hour rule for independent proposals. Staff-request exceptions continue through the existing request-specific availability/confirm endpoints.
- Staff `POST /requests`, `/requests/batch`, `/private/:bookingId/invite`, `/moves/quote`, and `/moves/confirm` now require `reason: EVENT | MAINTENANCE` (inside `input` for move confirmation).
- `/requests` and `/requests/batch` accept optional `notes` up to 1,000 characters; notes are stored separately in creation events.
- Existing rental/private approval actions and response contracts remain in place. Mobile or other callers that create staff operational requests must adopt the fixed reason codes; old free-text writes now return 400. Member proposal/decision APIs retain their payloads.

## Verification

- `npm run build`: passed, including frontend TypeScript compilation; existing warning about chunks over 500 kB remains.
- `npm --prefix backend run typecheck` and `npm --prefix backend run build`: passed.
- `npm --prefix backend test`: **251 passed, 3 skipped, 0 failed** (254 tests, 60.7 seconds). Skips are the environment-dependent PostgreSQL checks, not passes.
- Focused rerun of `tests/booking-sync.test.ts` and `tests/rescheduling-api.test.ts`: **3 passed**, including optional notes audit persistence, invalid reasons, IDOR checks, historical reason preservation, shared availability, poll coalescing, hidden tabs, reconnect and subscription cleanup.
- Focused ESLint using the existing Gym lint rules on the six new production modules: passed. There is no general project lint script. Changed existing React components also received source review for stale responses, hook order, accessibility and permission scope.
- `node scripts/test-booking-sync-browser.mjs`: passed. Two independent authenticated sessions; FO-created rental and weekly block appeared on an active Admin timetable within 20 seconds without reloading.
- `node scripts/test-customer-requests-browser.mjs`: passed. Includes failure/retry behavior, contacts and request links, independent batch responses, price-loss acknowledgment, additional payment assistance, refund review, private coach approval, role restrictions and mobile layout.
- `node scripts/test-reviewed-rescheduling-browser.mjs`: passed after the final choose/review/confirm update. Covers atomic multi-rental moves, weekly occurrence/series scope, soft removal, private invitation, customer proposal, coach rejection/approval and unchanged original payment.
- `git diff --check`: passed.

Browser scripts use isolated temporary SQLite databases and the actual server entry point; none target production. **Manually verified:** source/configuration inspection only; no human-operated browser/device verification. **Not yet verified:** real PostgreSQL concurrency, native mobile and full supported browser/device matrix.

## Remaining risks and next phase

Real PostgreSQL multi-connection concurrency, staging migrations, physical camera use, full browser/device coverage and native mobile compatibility are not verified by these local checks. No payment/refund policy or database history was changed. Staff move and weekly-series selection retain their existing preview/commit flow; this work shares the customer replacement selector and existing backend request lifecycle rather than replacing all scheduling screens.

Next: Phase 4 weekly-action scope and confirmation review, followed by durable recipient-scoped grouped requests in Phase 5. Production deployment still requires explicit approval.
