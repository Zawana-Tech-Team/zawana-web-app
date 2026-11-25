# Separate front-office packages and check-in

Badminton FO navigation now has independent **Packages** and **Check-in** entries. Packages focuses on activation; its Package Members directory and Active students lookup have been removed. The canonical check-in route is `/badminton-fo/check-in`, with **QR Generation** and **Manual Check-in** tabs. Tab selection persists in the URL. Legacy `/badminton-fo/packages/check-in` and student links redirect to the manual tab. The dashboard shortcut uses the canonical route.

QR Generation reuses the existing two shared category QR slots, with a shorter introduction. Generation, restore, replacement, revocation, expiry, copying and recorded check-ins retain their existing services and permissions. The member scan/confirmation flow remains unchanged.

Manual Check-in uses a new read-only, staff-authorized `/api/badminton/check-in-students` endpoint. Only active, started, unexpired packages with remaining sessions are returned; unavailable member accounts are excluded. Counts use the complete active roster instead of the legacy 500-enrollment cap. All-active-student and category cards count stable identities, including walk-ins, and filter the list. Search, refresh, server pagination, empty states and retry are available.

Students appear once, with independent category rows. Multiple active packages for one student/category use the same expiry/creation/ID order as the existing entitlement selector. Today’s check-in state includes visits on earlier or exhausted packages, preventing the UI from offering a duplicate check-in against another active package. A confirmation dialog explains the one-session deduction. The existing transaction, category, holiday and duplicate guards remain authoritative. Successful check-in refreshes balances and counts; students without another active package disappear after using their final session. No expired/inactive list filters, repeated active labels, sales forms or attendance-history panels are shown in the manual view.

No schema migration, historical-data deletion, pricing or financial-rule changes are included.

## Validation

- Frontend and backend builds passed.
- Stabilization and rescheduling lint passed.
- New roster backend tests: 5 passed, covering grouping, account eligibility, historical daily guards, more than 500 active students, filtering, pagination, read-only behavior, staff authorization and query validation.
- Existing attendance, renewal and package-management backend regressions: 20 passed.
- New FO check-in browser journey passed: navigation and legacy URLs, tab persistence, QR restore, active-only filtering, exact category counts, unique student grouping, pagination, confirmation cancellation, error/retry, duplicate clicks, independent package/category balances, final-session removal, unchanged finance and four viewport widths.
- Existing package-sales browser journey passed, including member search, activation, cash discounts, renewal, permissions and mobile navigation.
- Updated FO dashboard browser journey passed with the new check-in destination.
- Full attendance browser journey passed across four roles, including QR persistence through API restart, shared scans, replay protection, exact category deduction, package verification, member history and language switching. Its selectors were aligned with the existing calendar/dashboard presentation. A separate fresh QR member now tests successful redemption after the profile scenario has already checked in the original member; the same-day category guard remains intact.
- `git diff --check` passed. Desktop/mobile screenshots were inspected locally. No deployment was performed.
