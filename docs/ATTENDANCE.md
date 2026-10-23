# Attendance calendar

The Attendance navigation item is available to members (`/attendance`), coaches (`/coach/attendance`), administrators (`/admin/attendance`) and badminton front office (`/badminton-fo/attendance`).

Members see their own badminton package check-ins and paid, confirmed/completed private-course bookings. Coaches see only private-course students assigned through their linked coach account. Admin and badminton front office see all badminton attendance. Legacy walk-in package records remain visible to staff even without a member account. Gym attendance remains in its existing workflows.

Existing package check-in actions automatically populate the calendar; they still consume package sessions under the existing rules. Coaches and staff can check a student into today's paid, confirmed private course from its calendar record. Course check-in does not take a package session or change payment/booking status. Repeated check-ins keep the original arrival timestamp and recorder. Historical records remain visible after cancellation. No absence is inferred from an empty date.

All date navigation and arrival displays use Myanmar time. The calendar includes month navigation, today shortcut, search, status filter and per-day records. Refresh or returning focus to the page reloads attendance.

## Deployment

Apply `20261023090000_booking_attendance` using the existing migration command for the deployment database, regenerate its Prisma client, and rebuild/restart the API before releasing the frontend. PostgreSQL:

```sh
npm --prefix backend run prisma:migrate:postgres
npm --prefix backend run prisma:generate:postgres
npm --prefix backend run build
npm run build
```

Do not use the SQLite schema for PostgreSQL. No production migration was applied during implementation.

## Verification

- `cd backend && node_modules/.bin/tsx --test tests/attendance.test.ts`: real HTTP authorization, member/coach ownership, invalid month, ineligible sessions, existing package history, persistent check-ins and retry preservation against an isolated SQLite database; executes the new SQLite migration.
- `node scripts/test-attendance-browser.mjs`: isolated database/API/UI journey, four roles, check-in persistence after reload, calendar navigation/search and screenshots at desktop/tablet/mobile widths.

## Desktop 3D

The landing page always uses the scroll-driven cinematic court and shuttlecock. It no longer switches to still images for device preferences or viewport size. Low-power quality settings remain separate from camera framing. Renderer failures use a premium photographic hero with booking, discovery and an optional 3D retry. Windows hardware behavior still needs confirmation on a physical device.
