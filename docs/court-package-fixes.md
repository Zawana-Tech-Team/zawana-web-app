# Court and badminton package fixes

## Causes and changes

- Court floor was inferred from trailing court numbers; no persisted floor field existed. Added nullable `Court.floor` in both Prisma schemas and migrations. The create/edit controls offer 2nd Floor and 6th Floor, require a selection, and retain the legacy surface value. Shared floor resolution now prefers the saved floor, then uses the existing court-number convention for unmigrated records. Court cards, member booking groups and desk filters use the same resolver.
- Package modal height was constrained independently from its header, allowing the overall content to be clipped. The panel now uses a viewport-bounded flex layout, a scrolling body, and sticky package actions. Session and validity controls have persistent labels; configuration and image sections are named. Saves and dismissals are blocked during uploads; repeated saves are disabled. Edit drafts reset from the latest record when opened.
- Package creation exposed an image URL input and editing omitted the image field. Both now reuse `ImageUpload` and `/media/images`, which validates and optimizes device images and writes files to the existing backend media directory. The database receives a file URL, never the image data. Existing upload preview, replacement, removal and error states are retained. Badminton FO now has permission to use this existing endpoint.
- Operations fetched the unpaginated booking endpoint, which returns at most 100 rows. It now reads every page. Concurrent refreshes could overwrite newer results: only the latest refresh can commit state. Failed endpoint reads retain their previous state and expose the existing load error rather than blanking out lists. Booking mutations trigger the existing shared refresh event, and booking queries return `Cache-Control: no-store`. Availability uses court IDs and normalized active statuses. Court configuration mutations are awaited before closing their form.
- Existing atomic booking, payment, overlap prevention and idempotency services are preserved.

## Files changed

- `backend/prisma/schema.prisma`, `backend/prisma/postgresql/schema.prisma`
- Both `20261116100000_court_floor/migration.sql` files
- `backend/src/server.ts`, `backend/src/routes/bookingQueries.ts`, `backend/src/routes/media.ts`
- `src/pages/AdminManagement.tsx`, `src/pages/Operations.tsx`, `src/pages/CourtBooking.tsx`
- `src/context/OperationsContext.tsx`, `src/api.ts`, `src/types/index.ts`
- `src/components/court-desk/timetable.ts`, `src/components/ImageUpload.tsx`
- `backend/tests/court-timetable-ui.test.ts`, `scripts/test-court-package-browser.mjs`

## Verification

- Frontend `npx tsc -b` and backend `npm --prefix backend run typecheck` pass.
- Focused court policy, booking, rescheduling, timetable and floor tests: 35 passed.
- Full backend suite on rerun: 199 tests, 196 passed, 3 skipped, 0 failed. The initial full run hit timing-sensitive package reauthentication assertions; that unchanged test passed in isolation and on the full rerun.
- `node scripts/test-court-desk-browser.mjs` passes against a real API and isolated migrated SQLite database: rental creation/payment, recurrence, conflicts, idempotent retries, private course flows, and responsive layouts.
- `node scripts/test-court-package-browser.mjs` passes against a real API and isolated migrated SQLite database: saved/invalid floor values, calendar visibility with more than 100 newer records, reload persistence, package modal at 1440/768/390/320 widths, invalid file rejection, real PNG upload, authenticated package creation, persisted preview/file retrieval, and image removal on edit.

## Deployment

Apply the additive migration to the chosen environment and regenerate Prisma before starting the updated app:

```sh
# SQLite
cd backend
npx prisma migrate deploy
npx prisma generate

# PostgreSQL, instead of the SQLite commands
npx prisma migrate deploy --schema prisma/postgresql/schema.prisma
npx prisma generate --schema prisma/postgresql/schema.prisma
```

Existing court records keep their surface data and nullable floors; their existing floor convention remains the fallback until explicitly edited. No new storage provider or environment variable is required. Uploaded files use `backend/uploads/media`, so deployments must retain that directory as with the existing image upload features.

PostgreSQL migrations were not executed against a live PostgreSQL database. Tests used isolated SQLite databases; the workspace's application database was not migrated during verification.
