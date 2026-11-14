# Daily Court Rental Desk timetable

The Admin Court Rentals view and Badminton Front Office Court Rental Desk share
the same updated `CourtDesk` presentation. The application shell and role
navigation are retained. No screenshot attachment was available in this chat;
the implementation follows the written timetable requirements and existing
Zawana workspace tokens.

## Presentation

- Daily court columns and time rows, with sticky headers and a sticky time
  column inside a horizontally/vertically scrollable timetable.
- Desktop pointer layouts use a compact, fluid overview: all configured courts
  share the available width and the complete day fits in a viewport-sized frame
  without internal scrolling. Cards show name and short time; full type,
  booking/payment states and other details remain in hover text, accessible
  labels and the existing click-through dialogs. Touch/tablet/mobile layouts
  retain roomier scrollable cells.
- Actual configured court names, type, surface and status. Floor labels reuse
  the application's existing Court 1–4 / Court 5–8 naming convention; other
  configured courts remain visible under Other courts. The court count is not
  fixed. Operating times and intervals come from the existing desk's
  `courtSlots`, currently 06:00–21:00 in one-hour sessions.
- Recorded reservation durations are positioned in minutes, including partial
  rows, instead of repeating a booking card in every occupied cell. Overlapping
  records receive separate visual lanes rather than obscuring each other.
- Separate booking/payment labels, restrained rental/class/pending/blocked
  tints, a date toolbar, court search, floor/status filters and the existing
  reservation-type segmented control. Nonmatching records remain visibly
  occupied when filtered; status filtering never makes a reserved slot free.
- Available cells open the current form with court/date/time selected. Rental
  blocks open the existing CourtChangeDialog. Weekly blocks open the existing
  weekly reservation management section. Forms retain all fields/actions,
  selected-reservation summaries, recurring weekday information and pricing.
- Loading/read failures do not expose stale dates as available. Availability
  refresh still uses the existing read endpoints; all courts are loaded for
  the timetable. Private-course occupancy is loaded from the existing staff
  booking endpoint, scoped to the selected day.

## Desk payment and private-course extension

The subsequent request explicitly expanded the original UI-only scope: cash
means cash actually received at booking, and online means an existing payment
verified by staff, not a new checkout. Two role-protected desk endpoints now
reuse the existing reservation and pricing services:

- `POST /api/staff/court-desk/rentals`: customer, selected court/date/time,
  expected server price, UUID retry key and confirmed CASH/ONLINE payment.
- `POST /api/staff/court-desk/private-courses`: coach, assigned package,
  existing active member, court/date/time, expected price, retry key and payment.

Cash requires an explicit staff receipt confirmation. Online additionally
requires a transaction/receipt reference. Staff attestation is recorded as
`MANUAL_ONLINE`; it never claims verification by the payment provider. No KPay
checkout is started. Each sale uses the collection day for the ledger date,
while the booking retains its selected session date.

Booking, sale and payment audit are committed in one database transaction.
Retry keys prevent repeated submissions; an atomic globally unique receipt
claim prevents staff from recording the same online receipt twice, including
concurrent submissions on different courts. Existing provider/course receipt
records are checked before a sale is posted. Failed pricing, availability,
permission or receipt checks roll back the complete reservation.

Paid desk private courses stay `PENDING_COACH_CONFIRMATION`. Only the assigned
active coach can approve; approval moves a paid session to `CONFIRMED` with no
second payment deadline. A decline retains the paid ledger entry and alerts
Admin/FO for separate audited refund or rebooking review. No automatic refund
is issued. Existing staff cash booking behavior and unpaid member/coach flows
are retained.

Weekly class recurrence, unreserve, date overrides, prices, conflicts and
permissions continue to use existing rules. The later system-wide manual-payment
update requires the additive receipt migration described in `payment-flow.md`.
Deploy frontend and backend together.

## Verification

- Production build and TypeScript checks pass. Existing large-chunk advisory
  remains.
- New court-desk components/helpers pass scoped lint. The large existing
  Operations.tsx retains unrelated legacy lint findings (23 at HEAD, 21 now;
  no new findings). Finance and notifications pages pass scoped lint.
- `cd backend && npx tsx --test tests/court-timetable-ui.test.ts`: 3 tests pass,
  covering exact duration placement, clipping, overlap lanes and floor labels.
- `node scripts/test-court-desk-browser.mjs`: real HTTP API and isolated SQLite
  migrations/fixtures verify rental creation/pricing, weekly-class creation and
  appearance the following week, duplicate-rental rejection, existing booking
  details and weekly management, date navigation, filters, cash/manual-online
  posting, idempotent retries, duplicate/concurrent receipt rejection, private
  popup, assigned-coach approval/decline and unchanged unpaid behavior, and sticky scrolling
  at desktop, 768px, 390px and 320px widths. No production data is used.
- QA screenshots and results go to a temporary directory by default. Set
  `COURT_DESK_ARTIFACTS` to retain them elsewhere. Existing Playwright QA
  dependencies are in `tooling/gym`.

## Files changed for the desk update

- `src/pages/Operations.tsx`: compact timetable, rental/weekly forms, payment
  controls, private-course entry and accurate coach approval feedback.
- `src/components/court-desk/CourtTimetable.tsx`, `timetable.ts`,
  `court-desk.css`: shared timetable layout, duration positioning and modal styles.
- `src/components/court-desk/DeskPaymentFields.tsx`,
  `DeskPrivateCourseDialog.tsx`: shared receipt fields and simplified coach form.
- `src/pages/StaffPrivateCourses.tsx`: open the selected course from timetable.
- `src/pages/Notifications.tsx`: accurate paid-session approval feedback.
- `backend/src/routes/courtDesk.ts`, `services/deskPayment.ts`: authorized,
  atomic receipt recording with duplicate protection and audit history.
- `backend/src/services/courtBooking.ts`, `privateCourseFinance.ts`: reuse
  existing booking validation; add atomic desk payment and coach request metadata.
- `backend/src/routes/privateCourseFinance.ts`: optional date-scoped read.
- `backend/src/server.ts`: mount desk routes and approve paid courses without
  asking for a second payment; preserve declined payment for review.
- `backend/tests/court-timetable-ui.test.ts`,
  `court-desk-browser-fixture.ts`, `scripts/test-court-desk-browser.mjs`: isolated
  layout, API, payment and real coach-browser regression checks.
- `docs/COURT_DESK_UI.md`: behavior, checks and rollout notes.

Earlier login branding/member-header workspace edits are independent of this
update and were preserved. Publication and deployment are tracked in the repository commit and Actions history.

## Court rental clarification

Court rentals now book and record payment in one action. Only customer and payment
method are required; the extra receipt acknowledgement/reference controls are
reserved for the private-course flow. The shared court reservation service posts
one linked receipt inside the booking transaction for web and native clients.
