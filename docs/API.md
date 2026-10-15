# API notes

All endpoints use the base URL from `VITE_API_URL` (default `http://localhost:8000/api`). Protected requests use `Authorization: Bearer <token>`. The token issuer is selected by the matching client/server auth mode.

## Authentication

Auth router is mounted at `/api/auth` from the active `backend/src/server.ts`.

| Endpoint | Local database mode | Firebase mode |
| --- | --- | --- |
| `POST /auth/register` | Creates a member account using database auth | Returns a mode-specific unavailable response; create identity in Firebase and complete profile |
| `POST /auth/login` | Accepts `{ username, password }`; username may resolve to a unique email prefix | Unavailable; sign in through Firebase client |
| `POST /auth/session` | Firebase token exchange is not used | Resolves verified Firebase ID token to an active Zawana user |
| `POST /auth/complete-profile` | Not used | Creates/links a member profile for a verified Firebase identity |
| `GET /auth/me` | Requires local signed session token | Requires Firebase ID token linked to Zawana user |
| `GET /auth/mfa/status` | Returns no database-session factors | Reads Firebase enrollment metadata; this app does not require MFA |

Local database auth is development-only and is guarded by backend configuration. Do not enable it in a deployed environment.

## Member bookings

### `GET /bookings`

Returns a list for legacy requests or a paginated response when `page` is supplied. Supported filters in the current handler include page/limit, date preset/range, search, kind, status, payment status, court, coach, and time range. A member is scoped to their own records; operational roles have route-specific visibility. Confirm exact accepted values in the handler before extending the client.

### `GET /member/booking-filters`

Returns active badminton courts and linked active badminton coaches for member filters.

### `GET /member/dashboard?referenceDate=YYYY-MM-DD`

Returns member booking data (today, upcoming, recent and combined lists/counts), badminton packages, enrollment/check-in data, unread notifications, and purchase history. The reference date is supplied by the client to align day views with the member's local calendar.

## Packages, profile, notifications

- `GET /packages/badminton` lists packages visible to the caller; member visibility and operational visibility differ by role.
- `POST /member/badminton-packages/:id/purchase` initiates the existing package purchase workflow; payment configuration determines whether a checkout can be started.
- `GET /profile`, `PATCH /profile`, `POST /profile/avatar` operate on the authenticated user's own profile. The profile update handler whitelists name/phone fields and avatar upload stores a validated image.
- Notification routes are mounted according to the active route registry. Check `backend/src/server.ts` and its router mounts before adding or assuming a URL.

## Route ownership

The active route registry is `backend/src/server.ts`, with auth, store, and menu routers mounted from modules. Other router files and `backend/src/app.ts` are not proof that those routes are active. Preserve existing public paths and response contracts when extracting handlers. Use the schemas and handlers as the authority for request fields and permissions.

Gym private-training, Cafe ordering/status/payment, media upload, and migration details are recorded in [GYM_TRAINING_CAFE_MEDIA.md](GYM_TRAINING_CAFE_MEDIA.md). The Gym training endpoints are mounted from `backend/src/routes/gymTraining.ts`; Cafe menu and order routes use the shared Prisma instance. Online Cafe orders remain unpaid until a verified payment provider is available.

## Gym payments and PT enrollment visibility

- `GET /gym/policy` returns the authorized payment methods. This facility enables
  cash with `GYM_ALLOW_CASH_PAYMENTS=true` in the backend environment.
- Staff collect cash through `POST /gym/enrollments/:id/payment` with
  `{ "method": "Cash", "cashReceived": true }`. Successful collection atomically
  activates the enrollment and creates its paid transaction and receipt. Members
  cannot mark their own enrollment as paid.
- `GET /gym/enrollments?category=training` returns individual, couple and group PT
  purchases, including those awaiting payment. Gym FO can view them and take
  payment from **Private Training → PT enrollments**.
- `GET /gym/enrollments?forScheduling=true` returns paid, active, unexpired PT
  enrollments with sessions remaining. These filters apply before pagination.
  Pending payments remain visible in PT enrollment history and become selectable
  for scheduling after payment is recorded.

Full contracts and operating rules: [Gym implementation guide](GYM_IMPLEMENTATION.md).
