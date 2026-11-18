# Holiday Management

The Court Rental Desk now has a Holiday button above the grid, opening a dedicated management view with monthly navigation, multi-date selection, configured-date markers, a selection count, Clear Selection, and a confirmation listing dates and affected weekly-class counts. Back to Court Rental returns to refreshed availability. The Special Opening Hours controls have been removed; existing operating hours, closure records, holiday rates and schedules are retained.

## Rules and persistence

The existing CourtDateOverride model now distinguishes weekly-only holidays from legacy opening overrides. Three additive fields (`weeklyOnly`, `holidayActive`, `suspendedBlockIds`) preserve historical records and their previous behavior. Holidays suppress only CourtBlock records of type `class`, including date-specific weekly replacements. Maintenance, rentals, private courses, payments and transactions are not changed. No HolidayRate records are created or updated.

All availability readers and booking validators use the shared backend block-schedule rules. Member monthly calendars receive the same metadata and rules. Weekly-class creation and move validation also honor holidays when checking dated booking conflicts. The desk shows suspended classes as Holiday / Overridden outside the occupying grid.

Removing a holiday locks courts in booking-lock order and checks restoring classes against occupying bookings and other facility blocks. Nonconflicting classes restore immediately; conflicting class IDs stay suspended on that date. The UI warns staff and provides Retry restoration after conflicts are resolved. Schedules are never deleted. Retrying also clears obsolete suspended IDs when classes have moved or bookings no longer occupy the slot.

Admin and Badminton FO are authorized in both UI and API. Other roles receive 403. Bulk confirmation checks a preview revision and writes all dates atomically. Unique dates prevent duplicate overrides. Existing facility closures cannot be overwritten or removed through Holiday Management.

## Interfaces and changed files

- `src/components/court-desk/HolidayManagement.tsx`: dedicated calendar view and confirmation.
- `src/pages/Operations.tsx`: Holiday entry, suspended-class display, Special Opening Hours removal and refresh integration.
- `backend/src/routes/holidays.ts`: role-restricted list, preview, bulk confirmation, removal/restoration, and suspended-class endpoints.
- Both Prisma schemas and `20261117120000_weekly_holidays` migrations: additive override metadata.
- Backend `blockSchedule`, `courtAvailability`, `courtBooking`, `privateCourseAvailability`, `deskWeekly`, `deskMoves` and `server`: consistent availability and booking validation.
- `src/pages/CourtBooking.tsx`, `src/utils/bookingTime.ts`, `src/api.ts`: member calendar interpretation and shared mutation refresh.
- `backend/tests/holidays.test.ts`, `scripts/test-holidays-browser.mjs`: integrity, authorization, restoration and responsive browser coverage.

## Verification and deployment

Tests exercise bulk creation, revision conflicts, closure preservation, authorization, released class occupancy, protected rental/private occupancy, unchanged bookings/payments, maintenance preservation, conflict-safe removal, retry restoration and actual booking into a released slot. The real-API browser journey checks dedicated navigation, confirmation counts, reactive availability, refresh persistence, removal/restoration and mobile layout.

Apply migrations and generate Prisma before starting the updated API:

```sh
cd backend
npx prisma migrate deploy
npx prisma generate
```

For PostgreSQL use `--schema prisma/postgresql/schema.prisma` on both commands. Verification uses isolated SQLite databases; the workspace's application database was not migrated, and live PostgreSQL was not tested. Restoration after conflict resolution is explicit via Retry restoration, rather than automatically cancelling or moving any booking.

Verification results: production build and both TypeScript checks passed; the full backend rerun passed 209 tests with 3 PostgreSQL-only skips. The first full run encountered the existing package-reauthentication timing assertions; the unchanged tests passed on rerun. Both the holiday browser journey and the reviewed-rescheduling regression journey passed.
