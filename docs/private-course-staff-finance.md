# Private course staff booking and finance

## Architecture assessment

The production entry point is `backend/src/server.ts` (see backend dev/start scripts). `backend/src/app.ts` and the older bookings/transactions/coaches route modules are a separate older application; changes to those modules alone would not affect the running platform. The live generic transaction POST already restricts sales to validated Cafe transactions and is not reused here.

Existing private course requests create a `Booking` owned by the original member, reserve both court and coach, and wait for the assigned coach. Coach acceptance opens a 24-hour payment window. The signed KPay webhook creates a transaction and confirms the booking atomically. The expiry sweep releases unpaid accepted reservations. `privateCourseAvailability.ts`, the court/coach row locks, and the existing court overlap database guards remain authoritative. The member course wizard, coach decision/calendar, and member payment history retain their existing endpoints.

The extension uses `services/privateCourseFinance.ts` for staff booking, cash posting, ownership and handover allocations, and `routes/privateCourseFinance.ts` for authorized staff APIs. The existing webhook now creates the structured online receipt in the same database transaction as its existing sales posting. `BookingSubmission` records the staff actor and retry fingerprint; the booking remains owned by the member. Creator/course snapshots remain in existing booking metadata, while all financial and custody information lives in dedicated tables.

## Database changes

Migration `20261028120000_private_course_finance` exists for SQLite and PostgreSQL. It adds four tables without updating historical bookings or transactions:

- `PrivateCoursePayment`: one successful payment record per booking, unique optional transaction and payment-attempt links, amount/currency, source/method, collector, verifier, timestamps, external/provider reference and notes.
- `PrivateCourseSettlement`: collector, receiving staff, amount, submission/receipt times, status, notes, retry key and payload fingerprint.
- `PrivateCourseSettlementItem`: a positive partial allocation from an original payment to a handover. The service serializes allocation updates on the payment row and prevents over-allocation.
- `PrivateCourseAdjustment`: one full refund/reversal record per payment, with actor, amount, evidence, reason and external reference.

Foreign keys restrict deletion of referenced bookings, transactions, attempts and financial records. Actor IDs are retained as immutable historical identity snapshots; user accounts use the existing soft-deletion workflow. Unknown historical collectors are never inferred from booking creators or assigned coaches.

## Staff workflows and roles

Open `/admin/course-finance`, `/badminton-fo/course-finance`, or `/coach/course-finance` from the sidebar. Admin course management also links to this workspace.

The booking form searches existing active members by name, phone or email, selects an active course and eligible coach, court, Yangon session date and available time, then reviews the server price and payment information. Submission revalidates eligibility, duration, price and availability under the same locks used by existing reservations. Retry keys are committed with the booking and payment. Reusing a key with a different payload is rejected.

| Role | Booking scope | Cash recording | Finance scope | Other permissions |
| --- | --- | --- | --- | --- |
| Admin | Any eligible coach/member | Cash personally received at the staff desk | All private course records | Legacy evidence verification, refund recording, acknowledge handovers |
| Badminton FO | Any eligible coach/member | Cash personally received by the signed-in FO user | Private course records, own and total FO collections | Verified online reconciliation and actual handover receipt acknowledgment |
| Coach | Own active eligible courses only | Cash personally received by that coach | Assigned bookings and own handovers | Submit partial handovers; existing acceptance/decline workflow |

A staff user cannot nominate a different collector. FO/Admin selecting “Paid directly to Coach” is disabled and rejected server-side: the collecting coach must record it. A coach cannot record FO cash. Admin cash records identify that admin rather than inventing an FO collector.

Member creation retains the existing authorization: Admin uses User Management. FO is instructed to ask an admin when an account is missing; this feature does not broaden account-creation privileges or create duplicate accounts automatically.

Paid cash bookings confirm immediately. Unpaid and “Paid Online” selections create requests awaiting coach acceptance. Choosing online never verifies or posts payment. The member then follows the existing acceptance/payment deadline. Staff can look up receipts on existing bookings and reconcile a successful provider attempt only to that same booking, member, amount and currency. Payments cannot be transferred from another reservation. Successful historical provider receipts display as online in finance even before a structured receipt is linked; linking never reposts historical revenue or guesses a transaction association.

For historical paid records without provider evidence, finance displays “Legacy Payment — Source Unknown.” Only Admin may classify a historically paid online record with evidence, method, reference and reason; the review is recorded in booking change history and creates no new revenue. It cannot mark an unpaid booking paid or invent a provider reference. Admin may separately link an existing unlinked paid private-course sales transaction for the same member and amount with an evidence-backed audit. Historical refunds require this original transaction link so that the original sales posting is also marked refunded.

Cash handovers reserve partial amounts on submission. Cash remains held by the coach until a different authorized admin/FO receiver acknowledges actual receipt. Receipt acknowledgment is idempotent. Both submitted and received allocations reduce the amount available for another submission. Handovers never create sales transactions. Finance distinguishes booking revenue, personal collection, cash held and amounts received by ZAWANA. Filters use session dates, not cash receipt dates; settlement history is shown independently of booking filters.

Unpaid staff cancellations require a reason and preserve change history. Paid cancellations use the admin refund record, which requires evidence that money was already returned and an external reference. It atomically marks the structured payment and linked transaction refunded, cancels the booking, and preserves a positive adjustment record. Retry on the same payment/reference returns the existing adjustment. No negative duplicate transaction or history deletion is used. This API records external refunds; it does not initiate gateway transfers. Payments allocated to a handover require separate treasury review and are blocked from this refund action. Partial refunds, settlement rejection/withdrawal and treasury refunds after handover are outside this implementation.

Printable receipts open a dedicated document containing only the selected booking and receipt; browser Print / Save as PDF provides the export.

## API endpoints

All paths below are relative to `/api/staff/private-courses`; all require an authenticated Admin, Badminton FO or Coach unless restricted further.

| Method / path | Purpose |
| --- | --- |
| `GET /members?q=` | Search existing members; minimum two characters, maximum 20 matches |
| `GET /catalog` | Eligible active courses/coaches and available courts; coaches see only their own course assignments |
| `POST /bookings` | Create a booking with required `requestKey`, `expectedPrice`, member/course/coach/court/date/time/paymentSource; optional receipt reference and notes |
| `POST /bookings/:id/cash` | Record authenticated collector cash; optional reference and notes; unique booking payment provides retry protection |
| `POST /bookings/:id/cancel` | Cancel an unpaid request with an audited reason; coaches restricted to own booking |
| `GET /bookings/:id/online` | Lookup actual provider attempt/status/reference; coaches restricted to own booking |
| `POST /bookings/:id/reconcile-online` | Admin/FO link an existing successful attempt with `paymentAttemptId`, without duplicating its original sales posting |
| `POST /bookings/:id/link-transaction` | Admin link of the original historical sales transaction with evidence and reason |
| `POST /bookings/:id/verify-legacy` | Admin review of already-paid online history with evidence, reason, reference and method |
| `GET /finance` | Scoped bookings, payment details, collector identities, custody totals and settlement history; filters: from/to, coachId, paymentSource, paymentMethod, status, paymentStatus |
| `POST /settlements` | Coach submits own cash allocations; `requestKey`, optional notes, `items: [{paymentId, amount}]` |
| `POST /settlements/:id/receive` | Admin/FO acknowledge actual cash receipt; empty body |
| `POST /bookings/:id/refund` | Admin records a completed full refund with reason, evidence and reference |

Financial operations use booking/payment uniqueness or actor retry keys as appropriate, transaction boundaries, Zod validation and backend role/ownership checks. Payment source, collector, booking price and verification status cannot be supplied as arbitrary cash-payment fields.

## Deployment

Back up the target database using the normal deployment process. Do not reset or re-seed production.

SQLite (from `backend`):

```sh
npx prisma validate --schema prisma/schema.prisma
npx prisma migrate deploy --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
npm run build
```

PostgreSQL (from `backend`, with the deployment's `DATABASE_URL` and `DIRECT_URL` configured):

```sh
npx prisma validate --schema prisma/postgresql/schema.prisma
npx prisma migrate deploy --schema prisma/postgresql/schema.prisma
npm run build:postgres
```

From the repository root run `npm run build` and deploy the existing frontend/backend together. Restart the API only after the additive migration completes: the webhook now requires the receipt table. No historical financial backfill or production deployment was performed during implementation. Existing successful attempts can be reconciled on demand without changing original transaction rows.

## Validation and limitations

- Full backend suite: 144 passed, 3 skipped, no failures. The PostgreSQL integration tests require an explicitly configured isolated PostgreSQL test database and were skipped.
- New backend finance suite covers all three staff roles, member search, own eligible catalog, collector impersonation, coach ownership, changed prices, idempotent booking/payment retries, partial handover and over-allocation, receiver authorization, no revenue duplication, online verification/linking, concurrent staff reservations, audited refunds and legacy review.
- Existing private course/member/KPay callback tests pass, including expiry, signed callbacks and replay protection.
- SQLite and PostgreSQL Prisma validation and backend TypeScript check pass.
- Frontend TypeScript/production build and focused ESLint pass. Vite retains its existing large-chunk warning.
- Browser tests pass for the existing member wizard/mobile conflicts, staff FO cash creation through the UI into confirmed finance history, and locked coach identity/mobile layout. Browser fixtures apply the complete SQLite migration chain to a temporary database.
- PostgreSQL migration SQL was generated from both actual schemas and validated; it was not executed against a live PostgreSQL server in this session.
- Finance currently loads matching bookings in one response; very large histories may need server pagination/aggregated reporting. Session date filters should not be used as a receipt-date cashbook.
- No payment-provider credentials or services were replaced. A provider payment arriving after staff cash collection is rejected by the existing inactive-attempt rules and requires provider refund/reconciliation through operations.

Repeatable checks from the repository root:

```sh
npm --prefix backend run prisma:validate:sqlite
# PostgreSQL validation requires DATABASE_URL and DIRECT_URL for that provider.
npm --prefix backend run prisma:validate:postgres
npm --prefix backend run typecheck
npm --prefix backend test
npm run build
node tooling/gym/node_modules/eslint/bin/eslint.js --config eslint.private-course.config.mjs src/pages/StaffPrivateCourses.tsx backend/src/services/privateCourseFinance.ts backend/src/routes/privateCourseFinance.ts backend/tests/private-course-finance.test.ts
node scripts/test-private-course-browser.mjs
```

## Changed files

- Database: `backend/prisma/schema.prisma`, `backend/prisma/postgresql/schema.prisma`, and each provider's `20261028120000_private_course_finance/migration.sql`.
- Backend: `backend/src/services/privateCourseFinance.ts`, `backend/src/routes/privateCourseFinance.ts`, `backend/src/server.ts`, `backend/src/routes/bookingQueries.ts`.
- Frontend: `src/pages/StaffPrivateCourses.tsx`, `src/pages/PrivateCourseAdmin.tsx`, `src/pages/Bookings.tsx`, `src/App.tsx`, `src/components/RoleLayout.tsx`, `src/layouts/Layouts.tsx`.
- Validation: `backend/tests/private-course-finance.test.ts`, `backend/tests/private-course.test.ts`, `backend/tests/private-course-browser-fixture.ts`, `scripts/test-private-course-browser.mjs`, `eslint.private-course.config.mjs`.
- Documentation: this file.

## Staff workspace UX refresh

The workspace now separates **Book a session**, **Bookings & payments**, and **Cash handovers**. Booking uses four stages: member/course, session, payment, and review. Visual course/coach/court cards, a date strip, available-time cards and a live desktop summary reduce the amount of information shown at once. Payment and receipt details expand on demand. Handovers have a visual collection-to-receipt flow, partial-amount controls and in-app receipt confirmation dialogs.

The page includes scoped styles in `src/pages/staff-private-courses.css`, keyboard focus on stage headings and confirmation, readable status labels, preserved form state between workspace views, and explicit loading/search/empty/error states. The shared availability endpoint now permits coaches only when the selected profile belongs to the authenticated coach; this fixes the coach UI's previous availability authorization gap.

Validation for the refresh: frontend production build, focused ESLint, backend TypeScript and 24 relevant backend tests passed. Browser coverage verifies the four-step FO and coach bookings, partial coach handover and FO receipt acknowledgment, retained member flow, reduced motion, and responsive widths of 320, 390 and 768 pixels. Previews: `docs/previews/staff-private-course-desktop.png` and `docs/previews/staff-private-course-mobile.png`.
