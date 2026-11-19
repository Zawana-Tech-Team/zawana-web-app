# Multi-court refunds and grouped request UX

## Implemented

### Multiple selected bookings

Admin/Badminton FO can select up to 30 court rentals and choose **Refund Selected**. Different owners can be selected for refund, with each booking retaining its own receipt, amount, validation, transaction and audit trail. Existing same-customer requirements remain enforced for rescheduling and grouped request actions. Single-booking Refund still opens the original dialog.

The new dialog lists eligibility, original payment methods, owner, court/date/time, editable refund amount and the selected total. No refund checkbox is selected automatically. Ineligible bookings are marked and cannot be selected. Cash requires employee name and notes; Online Payment additionally requires a separate actual returned-payment reference for each booking. The confirmation states that funds must already have been returned: this records the existing manual refund workflow and does not transfer money.

Each selected item runs through the existing completeRefund service in its own transaction. One failure does not roll back another committed refund or produce a false all-success result. Success/failure is shown per booking and as a summary. Successfully recorded items become unavailable for resubmission. Per-booking payload/retry keys are retained for network retries; existing unique refund and online-reference guards protect concurrent submissions. Court availability updates only after successful booking/refund commit.

Original refund calculations, partial-refund policy, source receipts, authorization and ledger semantics are unchanged. Partial refunds still close the whole booking and cannot be refunded again, with that consequence shown in the dialog. Existing policy requires distinct online refund references; a combined transfer reference cannot be reused across bookings.

### Direct grouped request actions

Every pending grouped court-rental item now shows **Accept**, **Decline**, and **Admin Handle**. No Review request step precedes them. Actions apply only to that item. Decline/Admin Handle open their consequence confirmations directly. Accept opens the existing replacement-selection/review flow; staff invitations do not contain a proposed destination, so acceptance cannot silently choose a date, court or time. Existing pricing acknowledgments, additional-payment assistance and approval rules remain intact.

Statuses and pending counts update through the existing request refresh. Resolved items show their result. Staff details/payment assistance and existing refund-review paths remain available. Mobile actions wrap without hiding controls, and existing dialog focus/keyboard handling is reused.

### Formal messages

A central English template catalogue supplies the requested Event and Maintenance apologies. Selecting a reason updates a live preview before sending. Original/proposed details remain in the existing booking summaries; notifications for individual requests include the known original court/date/time. Unavailable proposed details are never invented.

New request creation events persist the reason, separate notes and message snapshot. Group notifications persist one shared explanation, and group details use the creation-event snapshot once above their children. Read-time notification summaries retain that explanation and add the live pending count. Historical free-text reasons are preserved. The catalogue is centralized for future localization; this change supplies English only. Messages render as text, without HTML interpretation.

## Files and API contracts

- `backend/src/services/bookingRefunds.ts`: bounded batch preview and per-item completion using existing refund services.
- `backend/src/routes/rescheduling.ts`: staff-only batch endpoints.
- `src/components/BulkRefundDialog.tsx`, `src/pages/Operations.tsx`: selection, eligibility, confirmation, per-booking results and cross-owner refund selection; retain restrictions on other actions.
- `src/components/BookingRequestWorkflow.tsx`: direct item actions, formal preview, group explanation and snapshot display.
- `backend/src/domain/requestMessages.ts`: central templates and optional schedule formatting used by both frontend/backend.
- `backend/src/services/bookingRequests.ts`, `notificationLifecycle.ts`: message snapshots, notification content and pending-count preservation.
- `src/pages/Notifications.tsx`: preserve paragraph line breaks in Member notification messages.
- `backend/tests/booking-refunds.test.ts`, `request-messages.test.ts`: bulk eligibility/partial failure/retry/authorization/reference tests and template tests.
- `scripts/test-bulk-refund-browser.mjs`, `test-weekly-batch-browser.mjs`, `test-booking-refunds-browser.mjs`: new/updated browser flows. The single-refund fixture now uses the existing fixed operational reason contract.

New endpoints:

- `POST /api/rescheduling/refunds/preview` accepts `{bookingIds: string[]}` and returns a row per booking containing detail/eligibility or a not-found error. Requires Admin/Badminton FO; maximum 30 unique IDs.
- `POST /api/rescheduling/refunds/complete-batch` accepts `{items: [{bookingId, input}]}` where input is the existing full refund DTO (including revision, requestKey, confirmed, amount, method, employeeName, notes, reference). It returns `{results, completedCount, failedCount}`. A 200 response means processing finished; callers must inspect each item's status. It does not mean every refund succeeded.

No database schema, migration, provider, payment-calculation or deployment change was needed. Formal messages use existing request audit JSON and notification persistence.

## Verification

- `npm --prefix backend test`: **258 passed, 3 skipped, 0 failed** (261 tests). Includes bulk partial eligibility/failure, replay/authorization, unique online references, existing refund concurrency and central message templates.
- `npm --prefix backend run typecheck`: passed.
- `npm --prefix backend run build`: passed.
- `npm run build`: passed, including frontend TypeScript compilation; existing bundle-size warning remains.
- Focused ESLint with existing rules for the new bulk refund component, message catalogue and template tests: passed.
- `npm run lint:attendance`: passed. No general project lint script exists; affected existing React components also received a source review for hooks, focus/keyboard behavior, safe text rendering and permissions.
- `node scripts/test-bulk-refund-browser.mjs`: passed. Mixed owners, four selected bookings including one unpaid/ineligible, explicit selection of three eligible bookings, separate original/negative ledger records, 60,000 MMK total, responsive modal at desktop/tablet/mobile, immediate availability release, Event→Maintenance preview switch, saved reason/message snapshot and matching original-court notification.
- `node scripts/test-weekly-batch-browser.mjs`: passed. Mobile grouped link, one shared apology, no intermediate Review request, independent Accept/Decline/Admin Handle, price review/confirmation, live pending/resolved counts and duplicate-submission safety.
- `node scripts/test-booking-refunds-browser.mjs`: passed. Existing single cash/online/private-course refunds, required fields, failed processing, original receipts/net revenue, returned slot reuse, member history privacy and role checks.
- `git diff --check`: passed.

**Manually verified:** source and flow review only; no human-operated physical-device verification. All automated integration/browser writes use isolated temporary databases, not the configured application database.

## Remaining limits

PostgreSQL tests remain environment-dependent; real PostgreSQL concurrency was not verified locally. Browser verification used headless Chrome on desktop/tablet/mobile viewports, not every browser or physical device. No real payment-provider transfer was performed. The existing production bundle-size warning remains. No production deployment was performed.

## Follow-up: requested action labels

Grouped pending request actions are now **A. Reschedule**, **B. Let Admin Handle**, and **C. Refund**. The previous Decline control is removed from the Member choice screen. Refund starts the existing refund-review confirmation; it does not transfer money or cancel the reservation automatically. Historical declined statuses remain readable. Frontend build and the updated grouped browser workflow passed, including independent rescheduling, refund review, Admin handling and live counts.
