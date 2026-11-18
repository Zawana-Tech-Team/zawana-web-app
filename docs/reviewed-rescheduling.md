# Reviewed court and private-course rescheduling

## Delivered behavior

The court desk selects individual court/date/time cells, rather than a shared time across court columns. A tray retains up to 30 sessions while changing dates and floors, identifies unavailable selections, and supports removal and clearing. Available-session creation stays separate from existing-booking selection. Existing rentals and weekly classes can be selected as same-type batches; private courses remain individually customer-led.

Rental and weekly creation accept independent sessions in a single atomic operation. Private-course creation reuses the existing single-court form. Rental and weekly move review assigns each selected source its own destination, checks availability, and previews charges before confirmation. Existing session duration is preserved, including longer legacy sessions.

A rental move charges each positive difference individually. Lower destination rates do not offset other charges and never generate a refund. The booking amount remains at least its previous amount. Extra payment must be attested as received using the existing cash/manual-online workflow. Receipt, schedule changes, audit snapshots and notifications commit together. Existing online receipt identifiers prevent reusing a payment reference. A pending original rental needing a surcharge must have its original payment settled first, preventing double collection of that surcharge through its unpaid invoice.

Weekly moves offer this occurrence only or this and future occurrences. Occurrence moves exclude the source date and create a date-specific replacement. Future moves end the old series before the chosen occurrence and create a date-bounded replacement series. Earlier occurrences remain intact; existing later occurrence exceptions are carried to the corresponding new dates. Availability, booking validation, monthly member calendars and history interpret the same effective bounds and exclusions.

## Private courses and permissions

FO may ask the customer to choose a different session, but cannot choose or apply the destination. The customer proposes a court/date/time at least 24 hours before the original session. The original court remains reserved, and the proposed destination is not held while awaiting review.

Only the assigned coach can approve or reject. Approval locks and revalidates the court, coach, original revision, duration, status and payment checkout before changing the session. Rejection, withdrawal, expiration or a destination conflict leaves the original unchanged. The existing coach, course price and payment receipt remain unchanged. There is at most one pending proposal per booking; withdrawal allows replacement. Proposals expire when the original session starts, via lazy checks and a minute-based worker.

Customer and coach pages include a request inbox, with court names, original/proposed schedules, reasons and decisions. Customer booking data and request inboxes refresh after mutations, on focus, and periodically while visible. The new desk move endpoints exempt Admin and Badminton FO from the member 24-hour window, but do not move started sessions. Existing staff reschedule links route into the reviewed flow; member rental self-service retains its existing policy.

Refund actions remain coming-soon placeholders. No gateway charge, automatic refund or payment-provider integration was added.

## Interfaces and persistence

- Rental creation accepts `selections: [{courtId,date,time}]` with a batch total, while retaining legacy `courtId`/`courtIds` plus shared date/time inputs.
- Weekly creation accepts the same independent selections and retains its legacy single-time input.
- `POST /api/rescheduling/moves/quote` accepts a typed rental/weekly move set and reason; returns original/proposed rows, surcharges and a revision.
- `POST /api/rescheduling/moves/confirm` accepts that input, revision, idempotency key and optional received-payment confirmation.
- `GET /api/rescheduling/private` returns role-scoped proposal history, optionally filtered by booking.
- `POST /api/rescheduling/private/:bookingId/invite` is staff-only.
- `POST /api/rescheduling/private/:bookingId/proposals` is customer-only.
- `POST /api/rescheduling/private/proposals/:id/decision` permits customer withdrawal or assigned-coach approval/rejection.

Both Prisma schemas add CourtBlock effective-date bounds and excluded dates, DeskMoveBatch audit/idempotency receipts, and PrivateRescheduleRequest records with a unique pending key. Existing rows are preserved. Move receipts retain original/target snapshots, reason, actor, per-booking surcharge allocations and surcharge receipt details. Requests retain their original revision and coach decision. Swap validation checks the final batch schedule; temporary release occurs only inside the committing transaction.

## Files changed for this feature

- Backend: `routes/courtDesk.ts`, new `routes/rescheduling.ts`; new `services/deskMoves.ts`, `privateRescheduling.ts`, `blockSchedule.ts`; `deskWeekly.ts`, `courtBooking.ts`, `courtAvailability.ts`, `privateCourseAvailability.ts`, and `server.ts`.
- Frontend: `Operations.tsx`, `Bookings.tsx`, `CourtReschedule.tsx`, `CourtBooking.tsx`; new `PrivateRescheduling.tsx`, `DeskMoveDialog.tsx`, `DeskBatchBookingDialog.tsx`; `CourtTimetable.tsx`, `CourtChangeDialog.tsx`, `bookingTime.ts` and `api.ts`.
- Persistence/docs: both Prisma schemas and `20261117090000_reviewed_rescheduling` migrations; Mermaid database documentation and its generator.
- Verification: new backend `reviewed-rescheduling.test.ts` and `test-reviewed-rescheduling-browser.mjs`. The existing `test-court-desk-browser.mjs` command delegates to the new workflow journey because its previous shared-time/placeholder interactions are superseded.

Paths above are relative to `backend/src`, `src`, or their named test/documentation roots. Earlier workspace changes from the preceding tasks are retained.

## Verification and deployment

Verification uses a real local API and isolated migrated SQLite databases, without migrating the workspace's application database. Frontend and backend TypeScript checks and the production build pass. The full backend suite reports 211 tests: 208 passed, 3 PostgreSQL-only tests skipped, 0 failed. The focused new suite passes all 10 tests, and the reviewed workflow browser journey passes. Vite retains its large-chunk advisory. Coverage includes atomic rollback, surcharge non-netting, stale revisions, same-batch swaps, concurrent rental conflicts, different-row/column weekly creation, weekly exceptions/future series, staff exemptions, customer timing, ownership, withdrawal, expiration, coach decisions, payment preservation, mobile review, FO history and existing staff entry points.

Apply migrations and regenerate the correct Prisma client before starting the updated API:

```sh
cd backend
# SQLite
npx prisma migrate deploy
npx prisma generate
```

For PostgreSQL instead:

```sh
npx prisma migrate deploy --schema prisma/postgresql/schema.prisma
npx prisma generate --schema prisma/postgresql/schema.prisma
```

Deploy the updated API and UI together. Older API versions do not interpret the new weekly recurrence exceptions. PostgreSQL migration SQL is generated from the PostgreSQL schema; a live PostgreSQL database was not available for verification. Existing PNG database diagrams remain snapshots from before this feature; Mermaid documentation reflects the new models.

The workflow uses staff-attested payment confirmation and does not charge a provider. Pending private destinations are deliberately not reserved; approval may report a conflict and leave the original session intact. Weekly classes remain schedule records rather than per-occurrence payment/attendance records.
