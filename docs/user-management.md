# User management

The admin Users page now focuses on account identity, contact details, role, status and actions. Repeated summaries and low-priority table columns are removed. Account dates and recent activity are available through View.

- Ten accounts per page, visible range/count, Previous/Next controls and page status. Search, role and archive filters reset to page one. The API uses creation date and account ID for deterministic ordering, including accounts created at the same time. Deleting the final account on a page moves to the remaining last page.
- Desktop rows become compact cards on small screens. Each account has View, Edit and an anchored More menu for status changes and deletion. Existing self-deletion and self-deactivation restrictions remain in place.
- Create and Edit use one responsive dialog with fixed actions, essential fields, optional password reset and coach image controls. Forms, confirmations and image uploads prevent duplicate submissions and accidental closing while busy. Errors remain inside the relevant dialog.
- Account saves and list refreshes are handled separately: a failed refresh offers Retry without making a successful save look like a failed create. New filter results cannot be replaced by older responses.
- View merges bookings, packages, payments and appointments by creation time, with booking dates/times, session balances and payment amounts retained. It shows ten recent entries with Show more and supports activity-load retries. All timestamps use Yangon time.
- Account deletion and archived email release retain the existing typed-name confirmation and backend rules. Booking, package and financial histories remain attached to the account.

No schema or authentication-policy changes, production data mutations or deployment are required by this UI update.

## Validation

`node scripts/test-user-management-browser.mjs` uses an isolated database and the actual UI/API to cover pagination, filters, account creation, errors, busy guards, save/refresh separation, contact edits, password changes, role changes, coach images, activity retry, deletion, email release, authorization and record preservation. Screenshots and viewport checks cover 320, 390, 768, 900, 1024 and 1440 pixel widths. The journey is included in CI and the stabilization browser runner.

Also checked: frontend/backend builds, stabilization lint, admin-dashboard and court-booking browser journeys, and the backend suite (291 passed; 3 environment-specific tests skipped).
