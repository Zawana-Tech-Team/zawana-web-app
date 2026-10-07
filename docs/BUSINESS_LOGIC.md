# Business workflows

This guide records the current implementation shape for developers joining the project. `backend/src/server.ts`, mounted route modules, Prisma schemas, and the frontend API consumers are authoritative. Confirm current code before changing a transition or response contract.

## Identity and permissions

1. Firebase Authentication verifies a sign-in in deployed mode. The client sends its Firebase ID token as a bearer token.
2. Backend auth middleware verifies the token (including revocation), resolves `firebaseUid` to an active Prisma `User`, and loads the user's current role from the database.
3. `roles(...)` middleware authorizes protected operations. Firebase custom claims are not used as the Zawana role authority.
4. Local SQLite development can use the database username/password session mode. The backend rejects this mode in production and for non-SQLite URLs.

The `User` database record is the application identity anchor. Its optional unique `firebaseUid` links the external authentication identity. Business records should retain their existing foreign keys; prefer deactivation/archive for accounts with history.

## Court rental

1. The member selects a date, court, and time in the frontend.
2. The booking API validates the request and checks server-side court blocks, date rules, and overlapping bookings. Frontend availability is only a preview.
3. Booking records and their status/payment fields are the source of truth. If configured, checkout creates a payment attempt and reserves the slot during payment.
4. A verified KPay callback updates the payment attempt and booking in a Prisma transaction, records a transaction, and creates notifications. Duplicate callbacks are gated by the pending-attempt status transition.

## Badminton package and check-in

1. Staff maintain package catalog data and can create cash enrollments; member purchases use the existing package-purchase/payment handlers.
2. A successful payment activates an enrollment and records the transaction/notification in the payment callback workflow. If checkout is not configured, the API fails closed rather than inventing a paid result.
3. Check-in verifies active status, expiry, remaining sessions, and duplicate same-day use. The conditional decrement and check-in record are written transactionally.

## Gym membership and private training

Gym packages and memberships are distinct Prisma models from badminton enrollments. Gym session counts and check-ins use `Membership`/`GymCheckIn`. Private gym sessions use `PrivateTrainingSession`, linked to member and coach accounts, with server-side schedule/conflict checks. Current flows should be reviewed in `backend/src/routes/gymTraining.ts` and the corresponding active handlers before altering status rules.

## Private badminton course

1. Admin maintains active `PrivateCourse` records and their coach assignments.
2. A member selects an active course, assigned coach, court, date, and time. The server validates course duration, court status, course/coach association, date restrictions, blocks, and overlapping reservations.
3. Requests begin in `PENDING_COACH_CONFIRMATION`. Coach actions move the booking to `AWAITING_PAYMENT` or a decline/cancel terminal path; accepted reservations have an expiry window.
4. A successful, verified payment transitions the booking to `CONFIRMED`, stores the transaction, and notifies member and coach. The calendar reads booking records rather than maintaining a duplicate event store.

## Store and inventory

1. The Store POS builds cart lines from active products and submits product IDs/quantities to `/api/store/orders`.
2. The server reloads authoritative names/prices/tax, checks discount and stock, decrements stock conditionally, creates the order, and records a cash transaction atomically.
3. Pay-later orders remain pending and do not record a cash transaction. Online checkout is unavailable until an approved provider path exists.

## Cafe and menu

1. Staff choose available menu items, quantity, location, optional court, customer label, discount, and payment method.
2. The server snapshots item names/prices, computes totals, creates `CafeOrder` and line items, and writes its transaction/notification.
3. Cash orders are paid; online orders stay pending until verified provider confirmation. Cafe fulfillment status moves through the allowed states in the Cafe order route.

## Clinic, notifications, finance

- Clinic appointments link a member and a doctor profile; doctor actions are scoped to the doctor's own records.
- Notifications are persisted in `Notification`, scoped by user or role audience, and read/action state is handled through protected endpoints.
- Finance views derive from `Transaction` and related order/booking data. Do not treat a frontend success message as proof of payment; provider callbacks and backend transaction status are authoritative.

## Transaction boundaries and retention

Court/package/check-in/order/payment paths use Prisma transactions or conditional updates where conflicts matter. Keep these boundaries when extracting modules. `User` relations include cascade delete behavior for some historical entities, so admin account removal should continue to use the existing archive/deactivate workflow rather than direct Prisma hard deletion. Review every `onDelete` relation before changing retention behavior.
