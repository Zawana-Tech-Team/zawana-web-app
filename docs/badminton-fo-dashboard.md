# Badminton front-office dashboard

The front-office home screen now prioritizes daily operations: three quick actions for court rental, package check-in and package activation; daily net revenue, court rental and package check-in totals; the next six ongoing/upcoming sessions; and reschedule/refund follow-up links with real counts. Court rentals, private courses and weekly classes share the schedule preview. Each session opens its original booking or the current court calendar.

The full history/request/refund workspace is available through links rather than repeated on the dashboard. The promotional cover and decorative page trail are removed from this front-office home screen. Gym, admin and member dashboards retain their existing implementations.

Data comes from the existing authorized dashboard, bookings, court-block, request and refund endpoints. All pages of today's bookings are read before sorting the preview. Cancelled, completed, expired and ended bookings are excluded from the preview; weekly-class visibility uses the existing date-aware block endpoint. Refund follow-up includes manual cancellation reviews, even where there is no rescheduling request. Net revenue retains the server's Badminton-only daily ledger calculation.

Booking synchronization, payment events, date rollover and manual refresh update the screen. Each section rejects superseded responses, retains successful results during refresh and reports errors with a retry action. Unknown counts use a dash rather than a fabricated zero. Failed refreshes identify retained data. Links remain available in empty states.

No backend, database, pricing, payment, refund or booking-policy changes were made. Browsing this dashboard adds no new mutation calls.

## Validation

- `npm run build`
- `npm run lint:stabilization`
- `node scripts/test-badminton-fo-dashboard-browser.mjs`
- `git diff --check`

The isolated browser journey checks Badminton-only net totals; 103 cancelled records to exercise multiple booking pages; court/private/weekly previews; customer metadata; manual refund-review counts; quick-action and booking/request/refund/finance/attendance navigation; initial errors, refresh failure and retry; payment and booking event updates; resolved follow-up and empty schedules; 1440/768/390/320px layouts; absent cover/history duplication; and unchanged booking/ledger snapshots during read-only navigation. The journey is included in CI and the stabilization runner. Desktop and mobile screenshots were inspected locally; no deployment was performed.
