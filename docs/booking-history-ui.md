# Member booking history refinement

Updated the existing history screen with date-led booking cards, restrained status colors, visible payment summaries and clearer court/coach hierarchy. Search is always visible; custom dates and status/court/coach filters stay in the existing disclosure. One compact date-control row offers Today, Yesterday, Upcoming and All dates with backend counts. Mobile controls use two columns. The introductory overview and its duplicate date filters have been removed.

The existing expandable cards retain all cancellation, rescheduling, payment, detailed-history, request and refund actions. Native keyboard disclosure remains available, with visible inset focus outlines. Dates include their year. Background refresh retains the current cards and open details; skeletons appear for initial loads and changed queries. Cleanup also invalidates superseded reads.

Files:

- `src/pages/Bookings.tsx`: presentation, visible search, status-label normalization and background-loading behavior.
- `src/components/member-booking/booking-history.css`: scoped responsive styling using the existing brand and controls.
- `scripts/test-booking-history-browser.mjs`: isolated browser checks and screenshots for desktop/tablet/mobile, keyboard disclosure, live refresh, search/empty states and tab navigation.

No API, database, payment or booking-policy changes.

Verification:

- `npm run build`: passed; existing bundle-size warning remains.
- Focused ESLint with the repository's existing React/hooks/TypeScript rules on Bookings.tsx: passed.
- `node scripts/test-booking-history-browser.mjs`: passed after final layout/focus changes. Desktop 1440px, tablet 768px and mobile 390px; no horizontal overflow or page errors.
- `node scripts/test-member-booking-browser.mjs`: passed, including private-course creation, coach approval/manual payment, category filtering, historical records, details and keyboard/modal behavior.
- `git diff --check`: passed.

Visual review used local desktop/mobile screenshots. Full cross-browser and physical-device verification was not performed. No production deployment.

## Minimalist cleanup — November 24, 2026

Booking cards show the date, booking type, court or course, time, coach, booking status, amount and payment state once. Private-course titles are visible in the summary, with the court retained below. Expanding a card adds its reference, relevant payment or rescheduling guidance and the existing actions, without repeating the title, coach, amount or payment badge. Unknown legacy payment-source text is omitted. Payment and cancellation failures appear once in the active dialog.

The result count is kept in pagination rather than repeated above the list. The page's Book a court action is no longer duplicated in the empty state; a private-course empty state retains its distinct booking action. Search and Filters share one row, while advanced filters, category selection, date shortcuts, pagination and notification deep links remain available.

Requests retain one count and apology per group, accurate original booking information and the independent Accept / Refund / Admin Handle actions. The member view omits the repeated group-level awaiting-response count and the empty overview. Refunds use one compact summary for the total and count; each recorded refund shows its method once. Pending coach proposals and their withdrawal action are preserved.

This cleanup changes member presentation only. Existing API, database, payment, refund, cancellation, rescheduling and staff rules remain unchanged.

Verified with `npm run build`, `npm run lint:rescheduling`, `git diff --check`, and the isolated `test-booking-history-browser`, `test-member-booking-browser`, `test-member-activity-browser` and `test-reviewed-rescheduling-browser` journeys. Checks cover date shortcuts, search, category filters, keyboard disclosure, details/cancellation dialogs, rescheduling navigation, coach approval and payment, grouped request actions, refund privacy, refresh recovery and responsive layouts.

## Requests and Refunds follow-through

The same member activity presentation now covers Requests and Refunds. Requests use overview counts, grouped progress, restrained status badges, original/requested schedule comparisons and a keyboard-accessible message disclosure. Pending court requests retain the visible A. Reschedule, B. Let Admin Handle and C. Refund actions; the shared action component also supplies those controls for standalone pending court requests. Coach approvals have matching comparison cards and readable member-facing status labels. Coach decision controls and underlying request states remain unchanged.

Refunds show completed-record counts, a recorded total, payment-method icons, booking references and Yangon-local recorded dates. An explicit empty state and a View requests shortcut distinguish completed refunds from requests still under review. Refresh errors preserve existing records and clear after successful recovery. No internal refund notes are displayed.

Shared presentation is in `src/components/member-booking/HistoryPresentation.tsx`; the existing BookingRequestWorkflow, PrivateRescheduling and RefundWorkflow components retain their services and mutations. No API, database or financial-rule changes.

Verified during follow-through:

- Frontend build passed, including TypeScript compilation; existing large-chunk warning remains.
- Focused ESLint on the shared history presentation and the three affected workflow components passed.
- `scripts/test-member-activity-browser.mjs` passed: desktop/tablet/mobile requests and refunds, empty states, A/B/C visibility, coach comparison, keyboard message disclosure, private-note exclusion, failed-refresh record retention and recovery.
- `scripts/test-weekly-batch-browser.mjs` passed: independent grouped rescheduling/refund/Admin Handle actions and live counts. Its apology check now opens the message disclosure first.
- `scripts/test-booking-refunds-browser.mjs` passed: original single cash/online/private-course refund workflows, availability, financial history and permissions.
- `scripts/test-reviewed-rescheduling-browser.mjs` passed: private proposals, coach rejection/approval, retained original payment and weekly/rental regressions. The member status assertion now expects the readable Approved label; coach raw-state assertions are unchanged.
- `git diff --check` passed.

Local screenshots were visually inspected. Physical-device and full cross-browser verification remain outstanding; no deployment was performed.

## Final grouped affected-booking notice correction

This supersedes the earlier grouped replacement-selector and A/B/C presentation. Grouped court notices now render **N Requests → Important Booking Notice → original court/date/time/status → Accept / Refund / Admin Handle**. The apology is visible once, adapts to Event/Maintenance, and does not refer to proposed changes. No alternatives, replacement selectors, proposed schedules, Decline, or Review Requests are rendered in the grouped flow. Existing standalone rental/private-course rescheduling remains separate.

Implementation:

- `src/components/member-booking/AffectedBookingGroup.tsx` and `affected-booking-notice.css`: isolated grouped notice presentation, original-only cards, three independent actions, confirmations, loading/error/success feedback and responsive layouts. Staff may open the existing financial refund dialog for a refund-review item.
- `src/components/BookingRequestWorkflow.tsx`: delegates grouped items to the isolated notice component; grouped request links focus the group instead of mounting the generic replacement dialog. Staff batch creation needs only existing booking IDs, reason and optional notes, and previews the affected-notice wording.
- `backend/src/services/bookingRequests.ts`: new audited ACKNOWLEDGED response for grouped court notices only. It sets response ACCEPT, closes that request and notifies staff, while leaving booking/payment fields unchanged. Duplicate acknowledgement returns the existing result; competing responses cannot both win. Grouped Decline and replacement availability/quote/confirmation are rejected. Original court names are captured for new groups and resolved safely for historical originals, rather than falling back to the booking's current court.
- `backend/src/routes/rescheduling.ts`: the existing member response DTO additionally accepts ACKNOWLEDGED. Role and object ownership checks remain enforced.
- `backend/src/domain/requestMessages.ts`, `notificationLifecycle.ts`: dedicated affected-notice text and current pending counts for grouped notifications. Unrelated rescheduling templates remain unchanged. Historical stored proposals/messages are preserved for audit, but the affected workflow never displays or accepts replacement fields.
- `src/utils/requestBatch.ts`: acknowledgement counts as a resolved item.

No schema migration or financial-calculation change. Refund still creates a manual-review request; only authorized completion through the existing refund service writes its financial transaction and releases that court slot. Admin Handle sends the existing staff-assistance notification without modifying the booking.

Verification for this correction:

- Backend suite: **260 passed, 3 skipped, 0 failed** (263 tests). Includes HTTP acknowledgement ownership/roles, original-court preservation through rename, invalid standalone acknowledgement, group replacement rejection, duplicate acknowledgement, and concurrent acknowledgement/refund decisions.
- Frontend build, backend typecheck and backend build: passed; the existing frontend chunk-size warning remains.
- Focused ESLint on all production TypeScript/TSX modules changed for this correction and the related tests: passed.
- `scripts/test-weekly-batch-browser.mjs`: passed. Desktop/tablet/390px/320px layouts, one visible apology/count, no replacement inputs/text, independent Accept/Refund/Admin Handle, unchanged original booking/payment rows, staff refund completion, duplicate completion safety, committed slot release and live member refund status.
- `scripts/test-member-activity-browser.mjs`: passed with the updated notice/actions, refund privacy and error recovery checks.
- `scripts/test-reviewed-rescheduling-browser.mjs`: passed, verifying standalone court/private rescheduling and coach decisions remain functional.
- `scripts/test-booking-refunds-browser.mjs`: passed, verifying the original cash/online/private-course refund rules and financial history.
- `git diff --check`: passed.

Screenshots were inspected locally. The skipped PostgreSQL checks still require their isolated PostgreSQL environment; full physical-device/cross-browser release verification remains outstanding. No production deployment or configured-database mutation was performed for this correction.

### Accept correction: self-rescheduling

Accept now opens the existing replacement selector for the selected booking. Court Rentals retain price review, payment validation and explicit confirmation. Private Courses submit a replacement proposal to the assigned coach; the original session stays booked until approval. Group cards still show original booking information with a single group notice; replacement fields appear only after Accept. Refund and Admin Handle remain separate. New acknowledgement-only responses are rejected; historical acknowledged records remain intact.

### Unified member rescheduling

All active member entry points now render `SharedRescheduleFlow`: the Court Rental route, the Private Course dialog, standalone staff requests, notification links through the request inbox, and grouped Accept. Request actions retain Accept / Refund / Admin Handle; there is no fourth primary action. The original group cards and apology remain unchanged.

The flow loads an owned rescheduling session, shows original court/date/time/coach, selects a duration-preserving replacement, automatically requests a server quote, reviews the change with `PriceDifferenceSummary`, and confirms. Returning to selection preserves date/court/time. Background booking revisions recheck quotes; stale responses and duplicate submissions are guarded. Replacement fields appear only after the member opens rescheduling.

`startMemberReschedule` creates or reuses the existing request lifecycle. Self-initiated requests cannot grant staff timing exceptions: the 24-hour cutoff is checked at start, availability, quote, and confirmation, including Private Course proposals. Staff-generated requests retain their established exceptions. Unsubmitted member drafts stay out of the request inbox. Abandoned sessions expire without moving the booking or charging anything. No schema migration is required.

`rentalDestinationPrice` is the common court-rate calculation for availability, member quotes, and staff adjustments (duration, peak hours, holiday overrides). Financial differences use attributable paid receipts, including discounts and previous recorded surcharges. Unknown original payments require staff reconciliation. Private Course prices, coach assignment and entitlements stay unchanged.

Higher prices create `AWAITING_ADDITIONAL_PAYMENT` and retain the original booking. Authorized staff use Arrange & confirm replacement to verify and record only the surcharge atomically with the move. Member confirmations never attest payment success. Zero differences commit without payment; lower prices require explicit acknowledgement of the existing non-refundable policy. Private Courses remain proposals until assigned-coach approval. Original transaction history is preserved. Active checkout, changed prices, stale originals, expired requests and destination conflicts are revalidated server-side. Grouped staff requests now expose the existing payment-assistance completion action.

Verification: `backend/tests/unified-rescheduling.test.ts` covers surcharge verification/retry, zero/lower prices, cutoff bypass prevention, rate policy, stale quotes, active checkout, abandoned sessions and simultaneous destination claims. `rescheduling-api.test.ts` covers owned session endpoints and request scope. `scripts/test-unified-rescheduling-browser.mjs` checks the real UI/API/database for all price scenarios, back navigation, failure/retry and mobile layout. Existing grouped, reviewed Private Course/coach, and attendance browser regressions exercise the shared entry points. All browser fixtures use isolated temporary SQLite databases. PostgreSQL integration tests require their separately configured test database. No production deployment is performed.

Validation on this revision: `npm run lint:rescheduling`, frontend `npm run build`, and backend `npm run build` pass. Backend tests: 268 passed, 3 PostgreSQL integration tests skipped without the configured test database. The unified pricing, grouped-request/refund, and reviewed Private Course/coach browser suites pass. The broader attendance browser suite passes its member/Admin/FO rescheduling and booking-history portions, then fails at the unrelated QR generation counter assertion (`scripts/test-attendance-browser.mjs`, QR slot 1 expecting “0 check-ins”). This broader failure remains recorded; no attendance production logic was changed.

### Self-rescheduling uses the normal booking pages

This supersedes the generic replacement-selector dialog described above. Member rescheduling now reuses the actual `CourtBooking` and `PrivateCourse` pages, coordinated by `SharedRescheduleFlow`. Grouped Accept, standalone requests, booking history and private-course Change Date / Time route to `/bookings/:id/reschedule`; the booking type determines the picker.

Court Rentals use the normal date calendar and court/time cards, preserving the original duration, including multi-hour rentals. Private Courses use their normal date and court/time cards with the original course and assigned coach fixed. Returning from review preserves the selection. Private replacements remain proposals until coach approval; rental replacements retain server quotes, price-difference review, surcharge verification and lower-price acknowledgement. Normal booking creation and staff rescheduling remain separate.

The owned `/rescheduling/requests/:id/calendar` endpoint returns the normal monthly calendar shape while excluding only that request's original booking. It rechecks member timing eligibility, includes other bookings and coach conflicts, and omits internal block notes and override reasons. Quote and confirmation continue to enforce authoritative availability, payment and concurrency checks. No schema migration is required.

Verification for this revision:

- Frontend and backend builds, scoped `lint:rescheduling`, script syntax checks and `git diff --check` passed. The existing frontend bundle-size warning remains.
- Backend suite: **274 passed, 3 PostgreSQL integration tests skipped, 0 failed**. Added calendar ownership, role, cutoff, original-booking exclusion and internal-note privacy checks.
- `test-unified-rescheduling-browser.mjs` passed: higher/equal/lower prices, multi-hour duration preservation, back navigation, failed confirmation/retry and mobile review.
- `test-weekly-batch-browser.mjs` passed: grouped Accept opens the normal rental picker; refund and Admin Handle remain independently actionable.
- `test-reviewed-rescheduling-browser.mjs` passed: normal private picker, retained selection, coach rejection/approval, preserved payment and staff regressions. Private selection screenshots cover 1440, 768, 390 and 320px.
- `test-member-booking-browser.mjs` passed for normal booking creation and existing member activity. The broader attendance suite was not rerun; its previously recorded unrelated QR assertion remains outstanding.

Browser fixtures use isolated temporary databases. No production deployment was performed.

### Member payment of a rescheduling difference

Higher-priced member replacements now offer **Pay [difference] MMK & Reschedule**, without a staff payment step. This uses the app's existing simulated-payment model; the review and success screens explicitly state that no external charge is made. The server recomputes the difference from the current quote, records only that additional amount, and moves the booking in one transaction. Ownership, eligibility, availability and stale-quote checks run before recording payment. A unique receipt per request and completed-request replay prevent duplicate posting. Original receipts remain unchanged, and the new receipt is included in subsequent rescheduling balances and authorized refund reconciliation. Unknown original payments still require reconciliation; private courses retain coach approval and unchanged pricing.

Lower-priced replacements prominently show the exact amount the member will lose, state that it will not be refunded or credited, and require an amount-specific acknowledgement before continuing. No refund is created.

Verification: frontend/backend builds and scoped lint passed. Backend suite: **275 passed, 3 PostgreSQL checks skipped**. Additional HTTP checks passed for explicit payment confirmation, client-amount rejection, ownership, roles and duplicate submission. The pricing browser suite passed for +5,000 / zero / −5,000 MMK, failed confirmation/retry, retained original receipts, immediate member completion and mobile layout. Mobile screenshots were inspected. No production deployment or live gateway integration was performed.

### Requests show only outstanding member decisions

The member Requests tab now filters to `PENDING_CUSTOMER` before grouping. Each staff batch keeps its own notice and remaining-request count; standalone notices use a one-request group. Refund requests, Admin Handle responses, submitted proposals and completed/closed requests leave this inbox immediately. Empty groups disappear, and the empty state reads “You’re all caught up.” Success feedback lives outside each group so it survives removal of the last card. Historical request records and the staff management view remain intact.

Pending coach proposals appear with booking history, where members can track or withdraw them; resolved proposals no longer clutter the member approval section. A rejected/withdrawn proposal that requires a new customer decision can reappear through the existing request state rules.

Frontend build and scoped lint passed. The grouped browser regression checks counts shrinking from 3 to 2 to 1, removal of the final group, independent actions, retained staff history and completed refunds in the Refunds tab. The member activity regression checks multiple separate batches plus a standalone request, unchanged other groups after an action, persistence after reload, responsive layouts and refresh recovery. The reviewed rescheduling browser regression passed for private proposals, coach rejection/retry/approval, payment preservation and staff operations. Browser fixtures use isolated databases; no schema or financial-rule changes are required for this inbox correction.

### Visual booking states and automatic session completion

Member history, Admin/Badminton FO history, staff private-course cards and coach bookings share an accessible status badge with text and icons: green Confirmed, blue Completed, red Cancelled/Coach declined, amber pending/awaiting coach/payment, and grey Expired. Member cards also use a subtle status edge. Booking status remains separate from payment status.

Confirmed Court Rentals and Private Courses automatically become `COMPLETED` after their scheduled end, using the configured business timezone (Yangon by default). `completeElapsedBookings` runs on server startup, in the existing minute sweep and before booking reads through the reservation lifecycle hook. It uses a conditional schedule/status update and writes a `SYSTEM_AUTO_COMPLETED` history record in the same transaction. Repeated sweeps cannot duplicate the transition. Financial records, attendance and schedules are preserved. Pending/unapproved, cancelled, expired, refunded and malformed-time bookings are excluded. Recurring weekly classes and unrelated PT/clinic bookings retain their own lifecycles.

Manual Complete buttons have been removed from badminton booking management and assigned private sessions. Legacy completion endpoints return the automatic result for elapsed sessions and reject attempts to complete future/ongoing sessions early.

Verification: frontend/backend builds and scoped lint passed. Backend suite: **276 passed, 3 PostgreSQL checks skipped**. Added end-boundary/timezone, idempotency, excluded-state, preserved-payment and attendance checks. The booking-history browser suite passed for automatic court/private completion via real API reads, early-completion rejection, unchanged receipts, Admin/FO completion visibility, removed Complete controls, responsive cards, keyboard disclosure and refresh behavior. Mobile screenshots were inspected. No schema migration or production deployment was performed.

### Member attendance is personal check-in history

Members now see a read-only month-by-month visit list, one check-in count and refresh/retry controls. The staff calendar, People present and Scheduled metrics, participant search, status/management filters, participant detail dialogs and check-in/correction/export actions are absent from the member screen. Only recorded present/late check-ins are shown; pending bookings do not appear as past visits. Each entry shows program/package, category or coach, original visit date and recorded time in Yangon. Package records use their stored check-in time, preserving imported historical times.

Staff attendance continues to use the existing operational page. The member history uses the existing server-owned attendance scope, with stale-response guards and retained records on a failed refresh. No attendance or balance writes are performed. Frontend build, scoped lint and the dedicated isolated browser journey passed: 1440/768/390/320px, month/empty-state navigation, refresh failure/retry, member isolation, unchanged balances/records and retained staff controls. The browser journey is included in the verification runner and Chromium CI job. The broader attendance script's member expectations have been updated; its previously documented unrelated QR counter failure has not been reclassified as passing.

### Court Rental review popup

The member Review booking dialog now uses a flat date-led layout with bold Court (floor) headings, readable session times and item prices, one prominent total and a single Confirm booking action. Repeated nested containers and introductory payment copy are removed. Selection editing, remove-session controls, loading/error handling, payment simulation disclosure and existing booking validation remain available. Courts are grouped by their stable IDs rather than names. Styling is scoped to this member rental dialog.

Frontend build and `scripts/test-court-browser.mjs` passed: explicit floor labels, 1440/768/390/320px dialog bounds, keyboard Escape/focus restoration, multi-date selection and real booking/payment persistence. Mobile screenshots were inspected. No backend change or deployment.

### Member calendar restored

Member attendance now shows a monthly calendar with marked check-in dates and a selected-day visit panel. Previous/next month and month selection remain available; arrow keys and Home/End navigate dates. Only the member's recorded check-ins appear, with no People present metric, scheduled-booking analytics or staff management controls. Month and daily empty states remain distinct.

Frontend build, scoped stabilization lint and the isolated member attendance browser journey passed, including keyboard date selection, 1440/768/390/320px layouts, refresh recovery, member isolation and unchanged records/balances. Mobile screenshots were inspected. This supersedes the previous list-only presentation; staff attendance remains unchanged. No deployment.
