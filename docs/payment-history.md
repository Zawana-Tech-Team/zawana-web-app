# Member payment history and pagination

Booking History and Payments now use 10 records per page and a shared member pager. Previous/Next, the displayed record range and Page X of Y stay visible for a single page, with unavailable navigation disabled. Filtering resets to page one. If background changes remove the last page, the view returns to a valid page. Successful page navigation moves focus to the results and scrolls there.

Booking queries retain server-side ownership, search, date, category and status filtering. Ordering uses `createdAt DESC, id DESC` so equal timestamps do not introduce ambiguous page boundaries. The existing generic pagination component remains available to other screens.

## Payment presentation

- A graphical date tile preserves the ledger's receipt date.
- The amount is prominent, with an icon and label for Paid, Pending, Refunded or Failed.
- Recorded time comes from the existing `createdAt` timestamp in **Asia/Yangon**. It is explicitly labelled Recorded, rather than presented as an external payment processor's charge time. If it falls on a different day from the receipt date, the full recorded date and time are shown. Missing timestamps show Time not recorded.
- Item and payment method remain visible. Simulated receipts retain a clear No external charge note.
- Receipt references remain available in a keyboard-accessible Receipt details disclosure. Long identifiers and repeated confirmation/account copy no longer dominate the cards.
- Search works while typing or on Enter; status and date-range filters are in one disclosure. Clear filters, empty/loading states and retry remain available. Refresh failures preserve previously loaded records.
- Amount signs, statuses and payment methods in the database are unchanged. No spending total is computed from mixed payment/refund/pending entries.

This work does not change payment confirmation, refunds, permissions or financial writes. No schema migration is required. No production deployment was performed.

## Verification

`scripts/test-member-history-pagination-browser.mjs` uses a disposable SQLite database with 25 bookings (including equal timestamps), 25 member transactions and another member's private receipt. It checks three real API pages, unique coverage, filtering and page reset, disabled boundaries, Yangon timestamps, signed refund amounts, receipt disclosure, member ownership, refresh failure/retry, valid-page recovery when results shrink and 320/390/768/1440px layouts. Original transaction records are compared after verification.

The journey is included in the stabilization browser runner and Chromium CI job. Existing payment confirmation and booking-history browser journeys are also run to check that their actions still work. Builds, scoped lint and backend tests provide the remaining regression checks.
