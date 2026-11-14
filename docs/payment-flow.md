# Temporary manual payment confirmation

Payments now use explicit, server-side manual confirmation. There is no external
checkout, redirect, QR screen, provider popup or gateway configuration requirement.
This is a temporary simulated/manual system, not a real payment gateway.

Court rentals are the exception: confirming a court rental saves its booking and
payment together in one atomic operation. There is no second payment step,
receipt-reference field or receipt-confirmation checkbox. Desk staff choose Cash
or Online; member bookings use simulated payment. Failed ledger writes roll back
the booking too. Existing unpaid historical rentals are not silently backfilled.

Other package requests, appointments and orders do not become paid merely on
creation. Their Pay/Confirm action explicitly submits `confirmed: true`.
Cash is a staff attestation; non-cash confirmation is labeled `SIMULATED` and
`Manual (simulated)`. Existing historical provider receipts remain unchanged.

## API and consistency

`POST /api/payments/confirm` accepts:

```json
{
  "resourceType": "booking",
  "resourceId": "existing-resource-id",
  "confirmed": true,
  "method": "Manual (simulated)"
}
```

Supported resource types: `booking` (court, class, private course and standalone
PT), `gym_enrollment` (membership, walk-in and training), `badminton_package`,
`appointment`, `store_order` and `cafe_order`. Cash uses method `Cash` and is
limited to authorized staff. Gym cash retains `GYM_ALLOW_CASH_PAYMENTS=true`.
Members may confirm only their own records, including their Gym participation.

- Amounts come from stored server records, never the confirmation request.
- Resource locks, one Prisma transaction and a unique resource/receipt constraint
  commit the ledger and service status together. Database failure rolls back both.
- A repeated or concurrent confirmation returns the same linked transaction.
- New receipts include customer/account, business/service, authoritative amount,
  payment method, timestamp, resource type/ID, actor and `confirmationMode`.
- Existing schema conventions use lowercase `paid` for ledger/payment enum values;
  this is the PAID state. Package purchase statuses use uppercase `PAID`.
- Private courses still require assigned-coach approval and keep the existing
  payment deadline. Desk payments recorded before approval remain awaiting coach.
- Successful confirmations refresh operations data, finance histories and receipts.
- Frontend errors never set local payment state to paid. Native callers validate
  the saved receipt before refreshing the booking/dashboard.

Store/Cafe POS creation accepts `confirmed: true` only for the explicit payment
action. Omit it to create an unpaid order. Pay Later stays unpaid. Order/sale
creation must send a UUID `Idempotency-Key` for a paid confirmation. The web API
helper retains the same retry key through uncertain failures, clearing it only
after success. The database claims the key inside the existing sale transaction,
so duplicate retries cannot repeat stock deductions, package activation or revenue.

Member package purchase accepts a UUID `requestKey` and optional `confirmed: true`.
Without confirmation it creates a pending request with no active enrollment.
Existing pending purchases can be confirmed from the package page.

Clinic appointments store a service price. Historical zero-price appointments
must be priced by Admin/Clinic FO before settlement, through
`PATCH /api/payments/appointments/:id/price`. Payment status cannot be changed via
the generic booking editor. Weekly timetable reservations without a charge retain
their existing recurrence rules; their paid packages use the package workflows.

The old member private-course pay, staff course settlement, Gym enrollment
payment and Cafe settlement endpoints delegate to the shared confirmation
service. `/api/payments/:id` reads a receipt or a historical attempt without
exposing a checkout URL or QR. The retired gateway callback returns 410 and
cannot modify payment state. The legacy clinic demo URL resolves to the existing
live appointment interface, which supports stored prices and payment confirmation.

## Deployment

Deploy backend and web changes together. Build/release the native app separately.
The additive migration `20261113180000_manual_payment_confirmation` exists for
both SQLite development and PostgreSQL production. It adds receipt metadata and
clinic price, retains historical receipts, and expires unfinished old gateway
attempts **without activating or paying their resources**.

Production requires the existing PostgreSQL `DATABASE_URL` and `DIRECT_URL`,
Firebase authentication configuration, and application origins. No KPay variables
are required; old gateway settings can be removed from deployment configuration.
Do not copy local SQLite authentication settings into production.

Run with the deployment environment already securely configured:

```powershell
npm --prefix backend run prisma:migrate:postgres
npm --prefix backend run build:postgres
npm run build
```

Back up production through the existing database backup procedure before migration.
Production deployment is performed by the repository CD workflow after publication.
The local SQLite database was backed up before its additive migration.

## Verification

```powershell
cd backend
npx tsx --test tests/manual-payments.integration.test.ts tests/private-course.test.ts tests/private-course-finance.test.ts tests/gym-management.test.ts tests/badminton-sale.test.ts tests/court-timetable-ui.test.ts
cd ..
node scripts/test-payment-browser.mjs
node scripts/test-court-desk-browser.mjs
```

The integration suite uses an isolated database and real HTTP sessions/APIs.
It covers explicit intent, ownership, server prices, all payable resource types,
manual/cash POS records, discounts/tax, stock, retry keys, concurrent confirmation,
forced database failure/rollback, package activation, receipt history and a new
authenticated session. Browser tests cover desktop/mobile, zero gateway
navigation/popups, backend failure recovery, finance labels and coach approval.

For isolated PostgreSQL QA, `scripts/test-manual-payments-postgres.mjs` uses the
optional `embedded-postgres` package from `MANUAL_PG_TOOLS` (default:
`$env:TEMP/zawana-manual-pg-tools`). It creates a new local PostgreSQL cluster,
generates a separate temporary Prisma client, runs the same integration suite,
and stops the cluster. It overrides both connection URLs and never uses the
workspace database or changes the application's generated client.

Native app, in `../zawana-mobile-app`: run `npm run typecheck`, `npm run lint`
and `npm test`. The native booking/detail/dashboard actions use the same API;
tests reject failed responses and pending receipts. No Android device/emulator
was connected for device-level testing.

## Main changed files

- Backend: `services/manualPayments.ts`, `middleware/paymentOperation.ts`,
  `routes/manualPayments.ts`, existing Store/Cafe/Gym/desk/course services and
  routes, `server.ts`, both Prisma schemas and additive migrations. Removed
  `services/kpay.ts`.
- Web: `services/paymentFlow.ts`, `api.ts`, `hooks/usePaymentRevision.ts`, booking,
  package, Gym, Cafe, POS, clinic, finance/history and notification entry points.
- Native: auth API confirmation method, booking detail/confirmation UI, member
  dashboard payment action and manual-payment regression tests.
- Tests: cross-module integration and PostgreSQL runner, updated Gym/course
  tests and payment/desk browser checks.

Earlier login branding and Member-header workspace edits were preserved.

## Recorded validation results

- Web production build and backend TypeScript passed.
- Scoped React lint has no new findings; pre-existing large-file findings remain.
- 54 targeted backend tests passed, including the existing Gym/course/cash-custody
  regressions and cross-module manual-payment suite.
- The same cross-module suite passed on isolated PostgreSQL: 10 tests.
- Desktop/mobile payment browser checks and the real-API court desk / coach
  approval browser checks passed.
- Native TypeScript/lint and all 100 native tests passed.
- Local frontend (`localhost:5173`) and backend (`localhost:8000/api/health`)
  respond successfully. These validation checks were performed before publication.

## Court rental follow-up validation

Court rental booking now includes payment recording, including native booking
submissions. The 17-test court booking regression suite passed with paid-at-booking
and staff-review cancellation expectations. The updated 11-test cross-module
suite passed on SQLite and PostgreSQL, including failed booking/payment rollback.
Member booking and desk browser flows passed without a second payment action.
Web build, TypeScript checks and the native TypeScript/lint/100-test checks passed.
