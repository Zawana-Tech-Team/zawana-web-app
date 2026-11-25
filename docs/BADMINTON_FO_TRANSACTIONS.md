# Badminton Front Office transactions

The sidebar now uses Court Rental Desk and Transactions as its booking and payment entry points. The former Court Bookings and Course Bookings & Finance entries are removed. Existing routes remain available for historical links and operational workflows. Transactions links to Course operations, which retains coach approvals, collections, cash handovers and settlement history. Court bookings remain accessible from the dashboard and timetable.

Transactions reads the existing `/api/transactions` ledger. It provides search, category, payment method, payment status, date range and deterministic sorting, with server-side pagination. Desktop uses a table; phones use receipt cards. Both open the same accessible transaction details dialog. Requests refresh after the existing payment revision event and on page load; a failed fetch never displays a successful payment.

Categories use linked booking kinds or package resources. Recognizable legacy item prefixes and private-course payment relations are supported. Unidentifiable historical records stay visible as Historical / unclassified, rather than being assigned an invented category. Weekly court schedule blocks are not payments; only recorded weekly-class transactions appear here. No new charge is created by scheduling a class.

New payment controls expose Cash and Online Payment only. Existing API values are retained (including `Manual (simulated)`), with manual/simulated confirmation clearly labelled. Recognized historical online method aliases are included by the Online Payment filter; transaction details retain the original stored method. No historical data is rewritten or deleted. Other historical methods remain visible in unfiltered history.

The transactions endpoint enforces the current front-office business scope, preserves member ownership checks and validates category, date range and sort inputs. The payment writers, Prisma schemas, booking/coach rules and atomic/idempotent payment operations are unchanged. This update needs no database migration.

Validation:

- Web TypeScript and Vite production build; backend TypeScript.
- `node --import tsx --test tests/manual-payments.integration.test.ts` from backend: isolated database integration tests, including all four categories, aliases, failed/refunded records, sorting, business isolation and historical preservation; existing atomicity, duplicate/retry, rollback and session persistence coverage.
- `node scripts/test-badminton-transactions-browser.mjs`: desktop and touch/mobile UI fixtures covering navigation, query parameters, details, error/retry, empty state, reload and page width. UI fixtures are synthetic and do not alter production data.

Files:

- `src/components/RoleLayout.tsx`: remove duplicate Badminton FO navigation entries.
- `src/components/badminton/BadmintonTransactions.tsx`: filters, table/cards, transaction details and refund-record access.
- `src/pages/Operations.tsx`: use the centralized Badminton ledger; show Cash / Online Payment labels in package sales.
- `src/pages/StaffPrivateCourses.tsx`: replace the free-text payment-method filter with the two supported choices.
- `backend/src/server.ts`: category/method/date/sort query support and front-office business scope.
- `backend/src/services/transactionPresentation.ts`: category inference, legacy aliases and deterministic sorting without record mutations.
- `backend/src/routes/privateCourseFinance.ts`: recognize legacy method aliases in contextual course filters.
- `backend/tests/manual-payments.integration.test.ts`, `backend/tests/transaction-presentation.test.ts`: real API/database and presentation regression coverage.
- `scripts/test-badminton-transactions-browser.mjs`: desktop/mobile browser regression checks; screenshots go to the OS temporary preview directory.


## Finance filter refinement

The Badminton FO Finance screen now keeps search, category, payment method and status visible together in one responsive filter panel. All dates / Today / This month shortcuts apply the existing date-range API fields. More filters groups custom start/end dates and sorting; its applied count identifies hidden selections. Reset appears when needed, restores defaults and returns to page one. A dedicated refresh control reloads the current view.

The Private course bookings shortcut and private-course Open booking link were removed from Finance. Existing financial records, category filtering, payment/refund tabs, totals, pagination, receipt audits and refund-processing dialogs remain available. No transaction records or financial rules were changed.

Verified with frontend build, stabilization lint, the real-API separated-finance browser journey, desktop/touch Finance UI fixtures, the existing booking-refund browser regression, and git diff checks. Coverage includes date shortcuts, custom ranges, sorting, reset, API parameters, status options, permission scope, payment/refund separation, totals, errors/retry, modal focus, and 1440/768/390/320px layouts. Local screenshots were reviewed.
