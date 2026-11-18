# Court desk multi-selection implementation

This describes the earlier shared-time version. The current independent-session and reviewed-move flow is documented in [Reviewed rescheduling](reviewed-rescheduling.md).

## Changed files

- `src/pages/Operations.tsx`: court selection, contextual menus, reuse of the existing forms, batch totals, shared FO/Admin history.
- `src/components/court-desk/CourtTimetable.tsx`: selected court/slot/event states and exact booking callbacks.
- `src/components/court-desk/court-desk.css`: selection highlights, compact action menu and responsive selection summary.
- `src/utils/deskRescheduleEligibility.ts`: future UI eligibility policy.
- `backend/src/routes/courtDesk.ts`: backward-compatible batch rental input and new weekly batch endpoint.
- `backend/src/services/deskWeekly.ts`: locked, atomic recurring reservations and retry handling.
- `backend/tests/desk-multicourt.test.ts`, `scripts/test-court-desk-browser.mjs`: policy, integrity and browser coverage.

## Selection and forms

Selecting an available timetable cell selects its court at that time; selecting it again deselects it. At a common time, courts across both floors can be selected together. Changing the time or floor clears selection; changing the date also closes any form. Refreshed availability removes stale available selections. While a form is open, a conflicting selection remains visible and confirmation is disabled rather than silently reducing the intended batch.

Court headings select at the chosen session time. If no time is selected, staff are prompted to choose one. The summary shows the count, names and time, with Clear Selection and an Actions menu. Escape or clicking outside dismisses the menu.

Rental and weekly actions reuse the existing dialog layout and customer/payment or recurring-class form. Both display all selected courts. Private Course reuses `DeskPrivateCourseDialog` and requires exactly one court; the action is disabled with an explanation for a larger selection.

Booking event buttons retain their exact booking ID, including overlapping event lanes. Selecting a booked rental, private course or weekly class clears new-booking selections and displays the appropriate contextual action button. The three new booked-court actions only show a coming-soon notification: they make no HTTP mutations.

## Atomicity and synchronization

Rental input accepts either legacy `courtId` or new `courtIds`, never both. The existing `createCourtBooking` service validates all slots and holds court locks, and booking creation plus one payment receipt per court remain inside a single transaction. The displayed expected price is the complete batch total, validated before receipts are recorded. A conflict, wrong total or payment failure rolls back the whole operation. Existing request keys prevent duplicate paid reservations.

`POST /staff/court-desk/weekly` locks the selected court rows in the same order as rental creation, rechecks court status, closure, weekly blocks, date-specific blocks and all future occupying bookings on the recurrence weekday. It writes all blocks inside one transaction. Hashed actor/request identifiers and payload checks make retries repeatable without extra blocks or silently accepting different payloads. Weekly classes retain the existing indefinite weekly schedule model.

Both endpoints retain the existing Admin/Badminton FO authorization. Mutation events refresh shared operations/history data; the calendar re-reads authoritative availability. No page reload workaround is used.

## Permissions and history

The new UI-only eligibility utility uses Yangon start times. Members need at least 24 hours (the exact boundary is eligible); Admin and Badminton FO are exempt. Other roles are ineligible. This utility does not authorize a write. Existing rescheduling endpoints and their existing policies are unchanged; future integration of these placeholders must enforce the new policy on the backend as well.

FO Court Rental Desk now has the same Availability / Booking history tabs as Admin. Both use `BookingQueue`, including search, date/time, court, status, payment filters, pagination and details. Rental and private-course records use the existing role-filtered booking API. Weekly classes use existing CourtBlock records and show their recurrence day. Weekly status options match active/cancelled blocks, and payment filtering is disabled because recurring blocks have no payment records. Date filters match recurrence weekdays within the range.

## Verification

- Frontend/backend TypeScript checks pass.
- Production build passes (Vite reports its existing large-chunk advisory).
- Backend suite: 201 tests, 198 passed, 3 skipped, 0 failed.
- New tests verify exact member policy boundaries, staff exemption, weekly atomic rollback, payload-safe retries, conflicts beyond the first week, and concurrent rental-versus-weekly creation.
- Real API/isolated SQLite browser journey passes: multi-floor selection, deselection, floor reset, multi-court paid rental totals, two-court weekly recurrence, conflict rejection, idempotent payments, single-court private course form and coach workflow, non-mutating rental/private placeholders, tablet/mobile modals, and FO rental/weekly/private history.

## Limitations and deployment

No new migration, dependency or configuration is required for this task. The earlier floor-field migration is a separate change already present in the workspace.

Weekly classes are recurring schedule records, not per-occurrence attendance/payment history. The application does not retain a deleted block as a booking-history entry; this change does not invent one or introduce a history database model. Each batch uses one common session time. Private courses remain single-court bookings.

PostgreSQL was not exercised against a live database; verification used SQLite. The new weekly transaction uses the existing court-locking convention for PostgreSQL compatibility. The new booked-court reschedule/refund actions remain placeholders. Existing history controls elsewhere are preserved.
