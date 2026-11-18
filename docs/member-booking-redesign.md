# Separate bookings and FO refund finance

Updated to reflect the requested separation of services. The previous combined booking service navigation has been removed.

## Member experience

- Court Rental and Private Course are independent pages with separate sidebar entries. Neither page contains tabs for switching services.
- Each booking page links to its own category in Booking history. A completed private-course request opens Private Course history.
- Personal training is temporarily unavailable for new member bookings. `/book/coach` redirects to Court Rental; public training booking promotions have been removed. Existing training records and staff gym workflows remain intact.
- `/book` opens Court Rental directly.
- Booking history provides All bookings, Court Rental, Private Course and Weekly Class categories. Category filtering happens on the server, before pagination; counts remain scoped correctly. Clearing other filters retains the chosen category.
- History uses a single date dropdown and optional advanced filters. Booking rows initially show only essentials; opening a row reveals the existing details and actions. Requests and refund history retain their separate views and notification links.
- Confirmed private courses expose “Change Date / Time” alongside their booking actions, matching court-rental terminology. This opens the existing proposal dialog; the coach must approve the new schedule, the original reservation stays held, and the existing 24-hour rule remains in effect.
- The compact review/action area and progressive booking steps remain. Returning to selections preserves the existing values. Shared dialogs retain focus handling and responsive scrolling.

## FO Finance

- Badminton FO Finance opens on Payments. Refunds have a separate view with their own total, pagination, status options and receipt details.
- Refund requests expand on demand within Refunds and show pending requests. Completed refunds appear in the refund ledger. “View refund record” opens the existing audited refund details, including staff information, without nested dialogs.
- Search and category remain visible. Payment method, status, dates and sorting expand under More filters. Desktop rows and mobile cards show the essentials; secondary payment and staff information stays in details.
- The optional `/transactions?ledger=payments|refunds` filter separates records before pagination and aggregates. It includes historical payments with no resource type, recognizes legacy refunded statuses, and retains existing FO business/ownership restrictions. The existing combined ledger remains available to other callers when no ledger filter is supplied.
- Original receipts, signed refund amounts, net-revenue calculations and refund processing rules are unchanged. No database migration is needed.

## Main changed files

- `src/App.tsx`, `src/pages/Book.tsx`, `src/pages/Generic.tsx`: remove member personal-training entry and combined service chooser.
- `src/layouts/Layouts.tsx`, `src/components/RoleLayout.tsx`: separate member labels and FO Finance label.
- `src/pages/CourtBooking.tsx`, `src/pages/PrivateCourse.tsx`: independent booking pages and category-specific history links.
- `src/pages/Bookings.tsx`: history categories, compact date selection and simpler management navigation.
- `src/components/badminton/BadmintonTransactions.tsx`, `src/components/RefundWorkflow.tsx`, `src/pages/Operations.tsx`: separated FO finance and retained audited refund details.
- `backend/src/server.ts`: optional ledger query filter, applied before pagination and totals.
- `src/components/member-booking/member-booking.css`: scoped responsive styles. The shared service-navigation component was removed.
- `backend/tests/customer-requests.test.ts`, `backend/tests/reviewed-rescheduling.test.ts`: fix existing early-morning fixtures to select a future session during operating hours rather than before 6 AM.

## Verification

- `npm run build`: frontend TypeScript and production build.
- `npm --prefix backend run typecheck`.
- `npm --prefix backend test`: 251 tests, 248 passed, 3 skipped, no failures.
- `node scripts/test-member-booking-browser.mjs`: independent pages, disabled training entry, category history/counts, preserved historical records, selections/back navigation, private-course submission failure/retry, coach approval, manual payment, responsive review and focus restoration.
- `node scripts/test-separated-finance-browser.mjs`: mixed historical/current payment/refund data across multiple pages, per-view totals/counts, search/category filters, FO scope, status options, receipt details, and tablet/mobile dialogs.
- `node scripts/test-court-browser.mjs`: multi-date/multi-court booking and recorded payments.
- `node scripts/test-booking-refunds-browser.mjs`: manual refund completion, failure/retry, availability release, audit record access, original receipts and member refund history.
- `node scripts/test-customer-requests-browser.mjs`: member notification links, permitted response choices and unchanged reschedule/refund behavior.
- `node scripts/test-payment-browser.mjs`: desktop/mobile manual-payment confirmation, failure recovery and duplicate-request handling.
- `git diff --check`.

Browser journeys use isolated temporary databases; the focused payment failure test uses controlled API responses. Layouts were checked at 320, 390, 768 and 1440px. External payment providers and deployment were not exercised. The existing production bundle-size warning remains.

## Screenshots

- [Booking history](previews/member-booking/bookings-mobile.png)
- [Private course](previews/member-booking/private-course-desktop.png)
- [FO refund finance on mobile](previews/member-booking/fo-refunds-mobile.png)
- [FO refund finance on desktop](previews/member-booking/fo-refunds-desktop.png)
