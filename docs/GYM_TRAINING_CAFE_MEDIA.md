# Gym training, media, and Cafe workflows

## Gym private training

Private training is modeled by `PrivateTrainingSession`; member and creator are existing `User` records and coach is an existing `Coach` profile linked to a coach user. Gym FO creates the session, with server-side checks for active member/coach accounts, valid future date/time, coach conflicts, and member conflicts. Sessions have their own `SCHEDULED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, and `NO_SHOW` attendance states; this does not consume or alter normal gym membership check-ins.

- Gym FO: `GET /api/gym/private-training/coaches`, `GET /api/gym/private-training/members`, `GET /api/gym/private-training?scope=...`, `POST /api/gym/private-training`, `PATCH /api/gym/private-training/:id/status`
- Coach: `GET /api/coach/private-training?scope=today|upcoming|completed`
- Member: `GET /api/gym/private-training?scope=all` (server scopes results to the signed-in member)

Attendance history remains attached to user and coach identities so future programs, exercises, and progress records can relate to these sessions without introducing duplicate member or coach accounts. Performance measurements are not fabricated or stored in this iteration.

## Shared media

`POST /api/media/images` accepts an optimized JPEG, PNG, or WebP data URL, checks MIME syntax and file signature, caps decoded files at 5 MiB, stores bytes under `backend/uploads/media`, and returns a URL. Product, Cafe menu item, and coach profiles store that URL in their existing/new `imageUrl` field. `ImageUpload` handles preview, replacement, removal, and compression. Image bytes are not persisted in PostgreSQL/SQLite. Existing coach-specific image upload routes remain for compatibility.

There is no Store service entity or API in this repository, so service images are not exposed as a separate catalog. Doctor profile image fields/workflows are likewise not modeled here.

## Cafe orders and payment behavior

Cafe orders retain the legacy JSON item and floor fields for historical compatibility while new orders also save normalized `CafeOrderItem` snapshots. The order references existing `User`, `Court`, and `Transaction` records when available. Cafe locations are defined in `src/constants/cafe.ts` and validated at the API boundary. New orders are recorded as `NEW`; staff can move them through `PREPARING`, `READY`, `DELIVERING`, `COMPLETED`, or `CANCELLED` using the cafe order endpoints. Existing floor values are normalized for display.

Cash is recorded as paid, Pay Later and Online remain pending, and a pending order can only be settled as Cash by Cafe FO/Admin. The Online payment endpoint deliberately returns `503` until a verified provider is connected; it does not mark online orders as paid. Transaction and notifications are created with the order in a Prisma transaction.

## Database changes

Apply the matching migration for the selected database; do not mix migration histories:

- SQLite: `backend/prisma/migrations/20261006100000_gym_training_cafe_media/migration.sql`
- PostgreSQL: `backend/prisma/postgresql/migrations/20261006100000_gym_training_cafe_media/migration.sql`

The active SQLite development server also contains guarded startup compatibility additions for legacy local databases. Hosted PostgreSQL must deploy its migration explicitly. Regenerate Prisma Client from the schema selected by the backend environment after switching database providers.
