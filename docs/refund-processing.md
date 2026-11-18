# Booking refund processing

Court Rental and Private Course refunds now share an audited manual completion workflow. Staff record funds they have already returned. The application does not send a bank transfer, invoke a payment refund API, or dispense cash.

## Form and validation

Refund management appears in booking history for Admin/Badminton FO, Admin Finance, and Badminton FO Transactions. Existing reschedule-request details expose Process Refund, and completed requests expose View Refund. The selected booking's Refund action also opens the shared form. Multi-rental selections require choosing one booking for refund processing, so a refund never implicitly cancels every unit in a rental batch. The former private-course finance refund control opens this same form.

The form displays customer contact, booking code/type, court/floor, schedule, coach where present, original paid receipts/methods, request reason and refund state. It defaults Employee Name to the authenticated staff name and the amount to the verified paid balance. Refund Amount, Employee Name and Refund Notes are required. Online Payment additionally requires an actual refund Transaction ID; Cash does not have that field. A separate confirmation step repeats the amount, method, employee, online ID and notes and explicitly asks staff to confirm the money was already returned. No financial record is written when the form is opened or reviewed.

Server validation independently enforces authorized active staff, required trimmed fields, integer positive amount within the actual eligible paid balance, explicit confirmation, current review revision, and a retry key. Unknown/unlinked paid receipts and unresolved checkouts require reconciliation. Simulated receipt/source labels do not block a manually confirmed refund; eligible paid balances and staff confirmation are still required. Online references reject known placeholder patterns, original payment references and references already used for a completed refund. Case-normalized uniqueness is enforced in the database. Bank authenticity remains the employee's attestation; reference entry is not gateway verification.

A partial refund is allowed within the paid balance. The confirmation warns that it closes the entire selected booking, retains the remaining amount, and prevents another refund against that booking.

## Backend, ledger and audit

The additive `BookingRefund` model links the booking, original transaction, separate refund ledger transaction, customer account where linked, authenticated employee ID, employee-name snapshot, actual amount, eligible paid amount, method, private notes, online reference, processed timestamp, original receipt allocation snapshot and idempotency evidence. Booking uniqueness prevents multiple completed refunds; normalized online-reference uniqueness prevents reuse across bookings. Completed records have no mutation endpoint.

Completion locks the court and booking and performs all financial/reservation changes inside one database transaction. A failure, including a failure after ledger writes, rolls back the whole operation. Repeated identical submissions return the original result; changed repeat submissions and racing duplicate refunds are rejected.

Original payment transactions are preserved byte-for-byte. Refunds create a separate negative `Transaction` with `resourceType=booking_refund`, `status=refunded`, `confirmationMode=MANUAL` and the authenticated `confirmedById`. This appears in Admin and FO ledgers with the correct rental/course category. Gross, refunds and net filtered totals are separated; revenue metrics recognize these negative entries without counting historical positive refunded receipts as new sales.

Private-course completion updates the existing payment state and creates the existing `PrivateCourseAdjustment` audit, preserving original collector, receipt and settlement history. The older private-course refund route now delegates to this shared processor and requires the new explicit confirmation payload. Refund source balances include attributable paid rental-move surcharges once per batch and never use another booking unit's share.

Existing cancellation/reschedule request records become REFUNDED after completion, and a durable booking change entry records the verified employee, refund ID, amount and method. Internal notes stay in staff-only refund records rather than customer-facing cancellation review messages. Rejected legacy cancellation reviews display Refund Rejected; Refund Processing is shown while confirmation is being submitted. Pending requests retain their original reservation state.

## Availability and member notifications

The booking becomes CANCELLED with paymentStatus refunded, and reservation/payment deadlines are cleared. Existing availability queries exclude cancelled bookings, so release is authoritative in the backend. Court status/colors are not manually forced. Weekly classes, date overrides and other bookings still block the slot when applicable. Only the chosen booking unit changes. Private-course pending move proposals are withdrawn and the cancelled booking stops occupying its assigned coach.

Successful completion triggers the existing payment/notification refresh events. The Court Desk refreshes its actual bookings and availability immediately. Booking/refund/transaction history persists after reload. Other sessions use the existing visible-page polling/focus refresh rather than a new realtime connection.

Refund notification delivery happens after financial commit. The committed refund and its undelivered marker are the durable retry source. Notification insertion uses the existing Notification model and a unique dedupe key. Member notification polling and staff refund-list reads retry pending delivery; a failure cannot roll back the successful refund or double-post money. Member history and notifications select only safe booking, amount, method and timestamp fields, omitting internal notes and employee audit details.

## Files modified

- Both Prisma schemas and `20261117180000_booking_refunds` migrations.
- `backend/src/services/bookingRefunds.ts`, `rentalPaymentBalance.ts`, `transactionPresentation.ts`.
- `backend/src/routes/rescheduling.ts`, `privateCourseFinance.ts`, `notifications.ts`, and `backend/src/server.ts`.
- New `src/components/RefundWorkflow.tsx`; integration in `BookingRequestWorkflow.tsx`, `badminton/BadmintonTransactions.tsx`, `Operations.tsx`, `Bookings.tsx`, and `StaffPrivateCourses.tsx`.
- `src/context/OperationsContext.tsx` for signed refund revenue recognition.
- New `backend/tests/booking-refunds.test.ts`, updated private-course finance tests, and new `scripts/test-booking-refunds-browser.mjs`.
- Database diagram generator/Mermaid source documentation and this report.

## Verification and limitations

- Full backend suite: **250 tests; 247 passed, 3 PostgreSQL-only tests skipped, 0 failed**.
- Production build and frontend/backend TypeScript checks pass; `git diff --check` passes.
- Refund tests cover field/role validation, current balances, original receipt preservation, actual employee identity, cash/online processing, duplicate/global-reference races, immutable retries, rollback after financial writes, pending reservations, private payment/coach release, weekly blocks, partial refunds, signed net revenue, manual refunds for simulated rental/private-course receipts, notification failure/retry and note privacy.
- New real-API browser journey passes: pending request holds its slot; cash confirmation/cancel/failure; immediate release and a successful replacement booking; required online ID and duplicate/placeholder rejection; FO private-course completion; correct ledger totals and Admin/FO history; member history/notifications without internal notes; mobile layout and permission checks.
- Both existing customer-request and reviewed-rescheduling browser journeys pass, including weekly-class removal and rental-batch flows. The mobile refund confirmation screenshot was inspected.

The local SQLite database was backed up to `/tmp/zawana-before-refunds-20261117T193602.db`, the migration applied, and the Prisma client regenerated. Deployment environments need their migration and generated client, with the PostgreSQL schema flag where applicable:

```sh
cd backend
npx prisma migrate deploy
npx prisma generate
# PostgreSQL: add --schema prisma/postgresql/schema.prisma to both commands.
```

Live PostgreSQL and external banking systems were not exercised. External transfers are intentionally manual; no successful bank transfer or cash payout is simulated. Existing diagram PNGs remain historical snapshots; Mermaid documentation includes the new refund model.
