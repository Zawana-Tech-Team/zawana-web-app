# Admin overview

The `/admin` home route now renders the live `Admin` page directly inside the existing Admin guard and workspace. It replaces the previous repeated statistics, estimated court-capacity panels, transaction preview, passive alerts and duplicate shortcut cards.

The overview keeps three key figures and two operational panels:

- **Today's net revenue:** today's recognized paid ledger entries plus recorded refund ledger entries, using the existing finance policy. Previous dates, pending/failed payments and unrelated legacy refund labels are excluded. View finance opens the existing finance workspace.
- **Bookings today:** today's court rentals and private courses, including completed sessions and excluding cancellations, expired reservations and coach declines. It is a complete database count rather than a count from the workspace's capped booking list.
- **Active members:** active, non-deleted member accounts, with a Manage users link.
- **Today's schedule:** up to five in-progress or remaining sessions, ordered by numeric start time. Original court/floor, customer (including recorded walk-in names), time, coach and status are retained. Each session links to its specific booking in the existing booking-history workflow.
- **Needs attention:** active Admin-assistance requests and bookings with pending cancellation/refund review. Refund reviews count a booking once even if multiple request records exist; rejected and already-refunded cases are excluded. Resolved items disappear after refresh. The links open the existing review workspace; no dashboard action performs financial mutations.

Open court desk remains the primary header action. The shared promotional cover is omitted for Admin home, bringing the operational figures to the top. Court availability is determined in that existing desk; the overview does not invent availability or utilization from a fixed daily capacity. The former lifetime-revenue value labelled as today's revenue is replaced with the date-scoped aggregate.

## Data and refresh

`GET /api/admin/dashboard` is Admin-only and sends `Cache-Control: no-store`. Its date comes from the existing business clock (Asia/Yangon by default). The read service uses database aggregates and bounded schedule presentation and does not rewrite bookings or transaction records.

The client uses the shared visible-tab booking refresh/focus mechanism, payment refresh events and date rollover. Initial loading never substitutes fake zeroes. Initial failure shows Retry; a refresh failure keeps previous figures and clearly labels them as previously loaded data. Owner and front-office dashboards retain their existing routes.

No schema migration or production deployment was performed.

## Verification

The backend service tests cover daily net revenue, refund recognition, active-account scope, numeric time ordering, in-progress sessions, walk-in names, review deduplication, bounded lists with complete counts and unchanged source records.

`scripts/test-admin-dashboard-browser.mjs` owns a disposable database and checks the complete Admin API/UI flow, role rejection, initial and refresh failures, retry, resolved priorities, booking/finance/users/desk/review links, financial preservation and 320/390/768/1440px layouts. It is included in the stabilization runner and Chromium CI job.
