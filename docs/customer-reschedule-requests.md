# Customer reschedule requests and booking contacts

## Delivered workflow

Selecting one court-rental or private-course booking displays its stored customer name, phone, `tel:` call link, booking code/type, court/floor, original schedule, coach where relevant, recorded paid amount, payment status and booking status. Missing phone numbers are labeled unavailable. Operator contact details are never used as walk-in customer details.

Admin and Badminton FO can send an optional-reason reschedule request after confirmation. Requests are scoped to one booking, with a unique active key preventing duplicates. Selecting multiple booking records does not send an ambiguous request to the first customer. Bookings without an active linked member account cannot receive an in-app request; staff are directed to contact the customer directly.

Sending does not move or cancel the booking and does not touch its payment. The customer receives a durable, targeted notification linked to `/bookings?request=<id>`. Existing notification read/unread receipts and history are retained. The deep link opens the relevant request, including completed requests. There is no configured push-delivery transport in this codebase, so this feature persists real in-app notifications without claiming external push delivery.

Rental customers receive Reschedule / Let Admin Handle / Refund. Private-course customers receive Reschedule / Refund only. Admin handling leaves the original unchanged and notifies staff. Refund confirmation creates or reuses an existing BookingCancellationRequest with manual-review refund status, notifies staff and leaves the original booking, ledger and payment status unchanged. If a private proposal is pending, choosing refund withdraws that proposal atomically, preventing later coach approval from moving the session.

Private replacements retain the existing assigned-coach approval workflow. The customer chooses an available court/date/time; rejection retains the original; approval revalidates everything, preserves the payment, completes the parent request and notifies staff. Ordinary customer-initiated private changes keep the 24-hour restriction. An explicit valid staff request authorizes its own customer response within that window; it never authorizes another customer or booking. Started sessions cannot be moved through the customer replacement flow, but staff assistance/refund-review responses remain available while the underlying booking is eligible.

## Pricing and data integrity

Rental quotes use existing court rates, peak-hour rules, holiday rates and original duration. Differences are computed on the backend against attributable paid ledger amounts, including allocated, actually recorded reschedule surcharges. Partial payments are displayed as partial funds; unpaid bookings cannot be treated as fully paid. Legacy paid-state records lacking an attributable amount are sent for staff review instead of inventing credit.

A cheaper destination displays the exact loss and requires a checked non-refundable-difference acknowledgment plus Continue — I Understand; Choose Another Time returns to selection. The acknowledgment and difference are recorded in request events and booking history. Same-price replacements need no loss warning. A higher price records an Awaiting Additional Payment response but leaves the original reserved. No member surcharge gateway exists; the member is not marked as having paid. Staff use the existing received-payment review form to collect the difference, then booking, receipt, audit and request completion commit together. In-app notification creation is part of the corresponding transaction.

The original payment records are never rewritten. Court/booking locks, final availability checks, quote revisions, unique active-request keys and existing move receipts protect concurrent responses and retries. Refund-review requests block competing reschedules. Expired and externally invalidated requests are closed with audit events. Staff can close non-refund requests without cancelling their bookings; refund requests require the existing finance-review workflow.

## Request management and statuses

Staff booking history reuses the new request-management panel with customer/phone search, status filters, original and proposed schedules, booking references, updated time, details, closure and payment-assistance actions. Both the contact panel and request list refresh on mutation, focus and visible-page polling. Customer requests use the same persisted data with ownership filtering and no staff contact-data endpoint access.

Statuses: PENDING_CUSTOMER, ADMIN_HANDLING, CUSTOMER_SELECTING (private proposal awaiting coach), AWAITING_ADDITIONAL_PAYMENT, REFUND_REQUESTED, COMPLETED, CANCELLED and EXPIRED. Request lifetime is seven days, matching the existing notification lifetime. Refund review is not falsely completed or expired simply because money has not been transferred.

## Schema and APIs

Both Prisma schemas add BookingRescheduleRequest and RescheduleRequestEvent, with booking relations, customer/requester IDs, original/proposed snapshots, price fields, acknowledgment, linked private proposal, timestamps, unique active key and audit events. Migration: `20261117150000_customer_reschedule_requests`.

New routes under `/api/rescheduling`:

- `GET /bookings/:id/details`: staff-only customer/booking summary.
- `GET /requests`: ownership-scoped member data or authorized staff management data.
- `POST /requests`: staff-only request creation; duplicate active requests return the existing request without duplicate notifications.
- `POST /requests/batch`: staff-only atomic delivery for up to 30 matching rental bookings; returns per-booking requests plus new/existing counts.
- `POST /requests/:id/respond`: member-owned Admin Handling or Refund Requested.
- `GET /requests/:id/availability`: court/coach availability for the original duration.
- `POST /requests/:id/quote`: authoritative rate/paid-credit comparison.
- `POST /requests/:id/confirm`: loss-acknowledged completion, pending payment assistance, or coach proposal as appropriate.
- `POST /requests/:id/cancel`: staff closure of a non-refund request.

Existing private invitation/proposal and staff move endpoints now synchronize parent requests. Existing notification delivery/read endpoints are reused.

## Files changed

Backend: both Prisma schemas and migrations; new `services/bookingRequests.ts`, `services/rentalPaymentBalance.ts`; `routes/rescheduling.ts`, `services/privateRescheduling.ts`, `services/deskMoves.ts`, and `services/courtChanges.ts`.

Frontend: new `components/BookingRequestWorkflow.tsx`; `pages/Operations.tsx`, `pages/Bookings.tsx`, and `components/court-desk/DeskMoveDialog.tsx`. Existing authentication, role checks, API mutation events, notification components and coach proposal inboxes are reused.

Verification/docs: `backend/tests/customer-requests.test.ts`, new `scripts/test-customer-requests-browser.mjs`, updated reviewed-rescheduling browser journey, and database Mermaid documentation/generator.

## Verification and deployment

- Production build and frontend/backend TypeScript pass.
- Full backend suite: 222 tests; 219 passed, 3 PostgreSQL integration tests skipped, 0 failed.
- New tests cover contacts/ownership, duplicate requests, targeted notifications, price-loss consent, pending payment, real staff-recorded surcharge, unchanged refund ledgers, scoped 24-hour exceptions, partial payment, expiration audits, and concurrent customer/staff/coach responses.
- Real-API browser journey passes for notification deep links and read receipts, customer contacts/call link, rental choices, staff handling, dynamic loss consent, staff payment completion, refund review, private choices/coach approval and mobile layout.
- The existing reviewed-rescheduling browser regression journey also passes.

The local SQLite database was backed up to `/tmp` and the migration applied, avoiding a schema mismatch in the running development API. Deployments still need the migration and the correct generated client:

```sh
cd backend
npx prisma migrate deploy
npx prisma generate
```

For PostgreSQL use `--schema prisma/postgresql/schema.prisma` on both commands. Live PostgreSQL was not available for testing. Existing PNG diagrams remain historical snapshots; Mermaid diagrams include the new models.

No external payment or refund transfer is implemented. Extra funds require staff receipt confirmation; refunds remain pending existing finance review. No successful payment, refund or push delivery is simulated by the new workflow.

## Multiple selected rental requests

Staff can select rentals sharing a customer name or member account and choose **Actions → Request Reschedule**. One confirmation lists every selected rental, an optional shared reason, existing request states and any ineligible booking. The send button states how many new requests will be sent. Each booking retains its existing request lifecycle, notification deep link and independent customer response. Same-name bookings on different accounts notify their actual linked owners; recipients are never inferred from a name.

The batch endpoint verifies staff authorization, unique IDs (maximum 30), rental kind, matching identity and active linked member accounts. It locks booking rows in sorted order and reuses the single-booking creation logic in one database transaction. If any booking fails validation, every new request, audit event and notification rolls back. Existing active requests are returned without duplicate delivery. Retries and overlapping batches create at most one active request and notification per booking. Original booking and payment rows are unchanged. Walk-ins without linked member accounts are shown as ineligible rather than assigned to an account by name. Private-course requests continue through the existing single-booking flow. No schema migration is required for this addition.

Additional changed files: `backend/src/services/bookingRequests.ts`, `backend/src/routes/rescheduling.ts`, `src/components/BookingRequestWorkflow.tsx`, `src/pages/Operations.tsx`, backend request tests and the two browser journeys.

Follow-up verification: **31 relevant backend tests passed**, frontend production build and backend TypeScript passed, and both real-API browser journeys passed. Coverage includes the same-name cross-account batch UI, independent responses, existing-request skipping, duplicate retries, role checks, failed submission, all-or-nothing rollback, simultaneous overlapping batches, unchanged ledgers, mobile layout, and an unlinked walk-in batch that cannot be sent. The mobile batch confirmation screenshot was inspected. Testing used SQLite; live PostgreSQL was not exercised.
