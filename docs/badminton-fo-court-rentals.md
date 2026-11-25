# Shared admin and Badminton FO court rentals

The existing FO route `/badminton-fo/courts` now uses the same court-rental presentation as `/admin/court-rentals`. Both roles share one page composition and the existing StaffBookingWorkspace/CourtDesk components.

- Availability, booking history, Requests and Refund requests use the same tabs and layouts.
- The timetable has the compact selection count, including “0 rentals selected”, with View Details, Clear Selection and the existing booking actions. Court, schedule and contact summaries are available on demand rather than repeated beneath the matrix. Cross-date/floor selection and individual removal remain available.
- Holiday management has one page heading and hides the rental tabs until Back to Court Rental is used.
- Rental rescheduling uses the same original/replacement summary, available-only times, quote/review and confirmation. Changing court or date clears the selected time and rechecks availability. Surcharge payment confirmation and existing lower-price rules remain in place.
- Affected-booking requests use the same compact confirmation, one customer notice and original-booking details. No replacement slot is required to send a notice.
- Single and batch refund dialogs use the shared compact presentation and existing amount, reference, revision and idempotency validation. The dedicated Refund requests tab uses the same searchable and paginated management list. Finance's existing embedded inbox is retained.

Role-specific navigation and backend permissions are unchanged. Manage courts remains in the admin page header. Existing private-course and weekly-class workflows use their existing business logic.

Validation:
- `npm run build`
- `npm run lint:stabilization`
- `npm run lint:rescheduling`
- `node scripts/test-badminton-fo-court-parity-browser.mjs` runs the existing admin acceptance journeys with real FO sessions and FO routes in isolated databases: selection/details, request and reschedule, available-only slots, single/batch refund, and Requests/Refund requests tabs. Includes responsive checks at 320/390/768/1440 pixels.
- `node scripts/test-admin-court-selection-browser.mjs` checks the existing admin selection presentation.
- `node scripts/test-booking-refunds-browser.mjs` checks the existing admin/FO financial workflow and ledger preservation.
