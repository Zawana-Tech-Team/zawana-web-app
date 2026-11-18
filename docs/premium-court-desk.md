# Court Rental Desk refinement and weekly removal correction

## UI/UX components refined

Court booking, weekly class creation/removal, private-course creation, staff moves, staff/customer reschedule requests, private proposals, holiday confirmations, booking details/history, transaction details and manual refund processing now use one dialog presentation. Existing actions, API payloads, validation, prices and approval/financial rules remain intact.

The Court Desk uses a compact filter panel, a consolidated date/session/holiday toolbar, consistent selection chips, clearer booking typography, subtle grid state styling, and compact customer/telephone details. Desktop elapsed cells retain their disabled state and accessible labels while avoiding repeated text across every court. Full details remain a deliberate action rather than an automatic modal.

Rescheduling separates editable replacement selection from a read-only original/replacement review. A visible step indicator explains the current phase. Required weekly scope selection, loss consent, actual additional-payment receipt confirmation, private coach approval, Admin Handle and refund review keep their existing server-side rules. Starting another customer action clears the prior action's transient success notice. Refund amount, original method, mandatory notes, online reference and manual-payment consequences remain clear; receipt identifiers are secondary disclosure.

Holiday Management, request/refund panels, booking filters/history and financial detail views use the same borders, spacing, type hierarchy and footer patterns. All changes use existing brand colors and design tokens, with no new dependency or decorative graphics.

## Shared components

`DeskDialog` wraps the existing `DialogSurface` and supplies a compact header/close control, optional description and steps, scrollable body, and a consistent Cancel/Close plus action footer. It owns no booking state or network logic. `DeskSteps` and `DeskSchedule` provide reusable progress and original/replacement summaries.

The existing action-menu portal remains anchored to its trigger, flips/clamps to the viewport, and closes on outside interaction or Escape. An open menu now also follows trigger-position changes from contact/status content loading, not only scroll/resize or element-size changes. One placement calculation is reused; listeners, observers and the frame watcher are cleaned up on close. This fixes the observed gap after a layout shift.

History display now uses the existing booking metadata's customer name for walk-ins instead of presenting the staff account that created the booking. This is presentation only; account ownership and permissions are unchanged.

## Root cause and correction for today's weekly class

The previous removal code set `effectiveUntil=today` if the occurrence had started. Recurrence bounds are inclusive, so the class still satisfied `blockOccurs(today)` and was returned by the active daily schedule and availability calculations. A UI refresh could not fix that authoritative reservation.

Removal now consistently ends the selected series and its linked moved occurrences at the Myanmar local date **before today**. It preserves the class rows, original notes, prior schedule audit, attendance, enrollments and transactions. Today's removed reservation and all future instances no longer occupy courts; past dates before today remain representable. Existing sorted court locks, atomic writes, exact-ID lineage and idempotent removal receipts remain in use. No schema, route or request/response shape changed.

Confirmation explicitly states that today's active occurrence is removed, including the remaining time of a started class. The existing post-success data refresh clears selection and updates the actual calendar/availability.

## Existing local records repaired

A read-only audit found six local class rows from two removal receipts today that still had the old inclusive end date. The database was backed up to `/tmp/zawana-before-weekly-today-repair-20261117T203236.db` before correcting these rows.

The maintenance routine only touches active class IDs listed in a genuine removal receipt for today's local date whose end date is still today. It never matches classes by title, alters naturally ending classes, or edits prior removal receipts. It stores a separate SYSTEM correction audit and is repeat-safe. All six audited stale rows were corrected. Hash comparisons confirmed Booking, Transaction, BadmintonEnrollment, BadmintonCheckIn, BookingAttendance and Court tables were unchanged. The running local daily API no longer returned any of those six classes.

Other environments with the old bug can run the same narrowly scoped repair after taking a backup, using their configured Prisma client/database:

```sh
cd backend
node --env-file=.env --import tsx scripts/repair-weekly-removal-today.ts
```

No data migration or new API is required. The normal Remove Weekly Class action uses the corrected behavior directly.

## Files modified

- New `src/components/court-desk/DeskDialog.tsx`; shared styles in `court-desk.css`.
- `CourtActionMenu.tsx`, `DeskMoveDialog.tsx`, `DeskBatchBookingDialog.tsx`, `DeskPrivateCourseDialog.tsx`, `RemoveWeeklyClassDialog.tsx`, `HolidayManagement.tsx`.
- `src/components/BookingRequestWorkflow.tsx`, `RefundWorkflow.tsx`, `PrivateRescheduling.tsx`, `CourtChangeDialog.tsx`, `CourtBookingSteps.tsx`, `badminton/BadmintonTransactions.tsx`.
- `src/pages/Operations.tsx`, `CourtReschedule.tsx`, and the display helper in `src/types/courtChanges.ts`.
- `backend/src/services/weeklyRemoval.ts`; new maintenance CLI `backend/scripts/repair-weekly-removal-today.ts`.
- `backend/tests/weekly-removal.test.ts`; new `scripts/test-weekly-today-browser.mjs`; expanded customer-request and refund browser journeys.
- This report, weekly removal documentation and review screenshots.

## Verification

- Production build, frontend/backend TypeScript and `git diff --check` pass.
- Full backend suite: **251 tests, 248 passed, 3 PostgreSQL-only tests skipped, zero failures**.
- Weekly removal tests cover preserved history, unrelated same-name classes, exact linked occurrences, idempotency/concurrency, stale reschedule rejection, started/finished occurrences and repeat-safe repair of only audited old removals.
- A controlled-time real-API browser journey runs at **09:00 Myanmar time**. It removes an already-started 08:00–11:00 class, observes today's and future slots become available, verifies the daily block API omits the removed records, reloads successfully and creates a new paid rental at 10:00–11:00. Attendance, enrollment, receipts and unrelated rental/private/class records stay unchanged. It also checks the new history dialog with the actual walk-in customer name.
- Existing reviewed-rescheduling, customer-request, refund and holiday browser journeys pass. Coverage includes arbitrary multi-court/date selections, weekly scopes, coach review, anchored menus through dynamic layout shifts, customer deep links and choices, price-loss acknowledgment, staff receipt handling, manual refunds, transaction details, holiday suspension/restoration and persistent booking history.
- Desktop, tablet and mobile screenshots were inspected. Dialogs remain within the viewport with scrollable bodies and accessible actions.

## Review screenshots

- [Tablet reschedule dialog](previews/court-desk/reschedule-tablet.png)
- [Desktop booking history](previews/court-desk/booking-history-desktop.png)
- [Mobile refund confirmation](previews/court-desk/refund-confirmation-mobile.png)

## Remaining limitations

Live PostgreSQL was not available; its integration tests remain skipped. Other sessions still use the existing polling/focus refresh instead of a new realtime transport. No external payment/refund provider behavior changed. The existing production bundle-size advisory remains. Older same-day removals in another database need the documented audit-based maintenance command or a fresh removal confirmation; no unaudited records are automatically changed on reads.
