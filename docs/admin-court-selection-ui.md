# Admin court selection cleanup

The admin court-rental timetable remains the primary selection summary. Selecting available cells, rentals, private courses or weekly classes shows a compact count and existing action controls below the timetable. The selection bar remains visible with **0 rentals selected** when empty and its actions disabled. Repeated court, date, time, customer and contact summaries are hidden.

For a single rental or private course, **View Details** opens the original booking and customer contact information, with loading, retry and focus restoration. For other selections, **View Details** opens the retained sessions and individual removal controls, including sessions on another day or floor. Booking details remain available per rental in that dialog. Clear Selection, availability validation and booking actions retain their existing handlers. Invalid selections and same-customer constraints still show actionable feedback.

Admin and Badminton FO now use this same timetable presentation, including the empty selection bar and on-demand details. Member booking flows and server permissions retain their existing behavior. See `badminton-fo-court-rentals.md` for shared request, reschedule and refund presentation.

## Verification

- `npm run build`
- `npm run lint:rescheduling`
- `node scripts/test-admin-court-selection-browser.mjs`: compact and empty states, no automatic duplicate-detail requests, cross-date/floor retention, individual removal, detail loading failure/retry, contact links, focus restoration, original action menu entries, 1440/768/390/320 layouts, nested details, and unchanged booking/ledger snapshots in an isolated database.
- `node scripts/test-reviewed-rescheduling-browser.mjs`: existing rental, private-course, weekly-class and front-office booking actions. Selection-tray checks now open View Details for admin.
