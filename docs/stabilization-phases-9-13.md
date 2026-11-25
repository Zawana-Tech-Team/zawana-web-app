# Production stabilization — phases 9–13

Implemented locally on 24 November 2026 against the master production-stabilization brief. Later member booking, payment-difference and grouped-request instructions take precedence over the original brief. No production deployment, database reset or migration is part of this change.

## Phase 9: notification repair

Notification delivery remains transactional database persistence, with visible polling, mutation invalidation and focus/online/visibility recovery. A failed fetch retains the last successful inbox; the bell offers a clear retry. Account-specific inbox data is hidden while the authenticated recipient changes. Read receipts remain per recipient, including shared Admin/FO audience notices; another administrator's read state is independent.

The notification API now returns lifecycle-derived titles and bodies instead of accidentally replacing them with stored snapshots. Member group notices show the remaining actionable count and disappear when all items are handled. Initial single-request notices also archive after the response. Informational booking outcomes remain readable after a booking becomes terminal; an old task no longer hides a newly created decline/cancellation outcome.

`notificationEvents.ts` publishes Admin/Badminton FO events with a durable unique event/recipient key. Retrying the same event cannot duplicate it or reset a read receipt. A new request event after a coach rejection still gets its own notice. Group submission emits one member notice per actual recipient and one aggregate notice per staff audience, rather than staff spam for every child. Financial records are unchanged by notification delivery.

| Event | Recipients and navigation |
| --- | --- |
| Single operational change request | Owned member request group; Admin/FO request details |
| Group submission | One recipient-scoped member batch link; one staff aggregate batch link per audience |
| Member response, Admin Handle or refund review | Admin/FO link to the existing request/refund workflow |
| Member rental confirmation | Member booking notice plus staff event; existing authoritative move/payment rules |
| Private replacement proposal | Assigned coach only; exact proposal ID in notification and URL |
| Proposal decision | Member outcome and staff event; resolved proposal notices archive by proposal ID, so an older notice cannot reappear when another proposal is made |
| Initial private-course coach decision | Member's filtered, expanded booking; Admin/FO's exact course-finance record |
| Weekly occurrence/series removal | Idempotent staff notice linked to booking management; historical classes/attendance remain unchanged |
| Scoped holiday changes and refunds | Existing category/recipient-scoped holiday notices and retryable persisted refund delivery retained |

No external asynchronous transport was introduced. A transaction failure rolls back both the mutation and its notices; a persisted notice is available after reconnecting. Notification APIs retain bearer authentication, recipient/audience scope, atomic read-ID validation and no-store responses.

## Phase 10: Coach workspace

The dashboard now starts with today's assigned schedule, followed by pending booking/replacement counts, the next seven days and concise customer/notification/payment shortcuts. It uses Yangon dates and chronological time sorting. The decorative cover and duplicate introductory panel are removed. Existing booking revision updates refresh the dashboard; failed refreshes retain the last successful schedule and offer retry.

Bookings & Requests is the operational home. Coaches can accept or decline an assigned booking directly, with confirmation, loading, duplicate-submit protection and error feedback. This remains usable after a notification has been read. Replacement proposals retain the existing shared review controls and coach approval rules. Proposal links focus the exact request. The calendar starts on the business date and uses normalized readable status labels. Sidebar order puts Dashboard first; finance/history remains available.

No Admin/FO actions or customer-directory permissions are granted. Weekly court blocks have no coach assignment in this schema; the dashboard does not invent assignments or disclose all classes as a coach's own schedule. Existing attendance and other authorized routes remain available.

## Phase 11: authentication

`authErrors.ts` maps credentials, provider/network failures, rate limits, OTP expiry/invalid codes, permissions and expired sessions to safe messages. Unknown Firebase/Prisma responses and stack details are not rendered. Invalid-password, missing-user and disabled-user sign-in failures share the same response wording. Valid request references survive normalization for support; the backend retains its existing structured diagnostic codes.

Login, Google sign-in, MFA sending/submission and verification retry share a synchronous submission lock and visible processing state. A terminal refresh/replay 401 clears the application token and authenticated user through a shared session event. Network/provider failures do not falsely sign the user out. Explicit-authorization requests and stale failures cannot clear a newer login. Existing server token validation, role/object authorization, refresh cookie/origin rules, authentication rate limits and protected-route loading guards remain in force.

No identity-provider configuration or session-storage architecture was migrated. The existing browser token/cookie model is retained; this work does not claim to solve XSS through a change of storage alone.

## Phase 12: shared interaction refinement

- Notification panels render in a body portal beside the bell, with viewport-aware position/height, a hidden positioning pass, scrollable content, clear retry, large close/sound controls, Escape dismissal and focus restoration.
- Select popovers account for the visual viewport and available space rather than imposing a minimum height that can overflow a small screen. Native touch selection remains supported.
- Nested dialogs route keyboard dismissal/focus handling to the top dialog only. Existing backdrop, busy-state, focus containment and restoration behavior is preserved.
- The notification page has one primary heading. Coach cards reuse the existing status badges and brand colors. Working booking, finance, refund and attendance actions remain available.

## Phase 13: automated checks and security review

Run `npm run test:stabilization` for scoped lint, builds and backend tests. Add `-- --browser` to run the isolated browser journeys as well, or use `node scripts/verify-stabilization.mjs --browser-only` after the code checks. The CI workflow now includes a Chromium stabilization job with disposable fixture data and screenshot artifacts; no production endpoint is used.

Local verification:

- Frontend/backend builds and stabilization/rescheduling scoped lint passed. The existing frontend bundle-size warning remains.
- Backend: **279 passed, 3 PostgreSQL integration tests skipped, 0 failed** (282 including subtests). Added safe authentication presentation, dynamic group notifications, recipient isolation, durable event retries and per-administrator read-state checks.
- SQLite and PostgreSQL Prisma schemas validate. Frozen pnpm lock checks pass; npm and pnpm locks are maintained together.
- New stabilization browser journey: safe credential/provider/network/rate failures; duplicate sign-in prevention; owned Coach dashboard; direct coach acceptance; exact private proposal focus and resolved-notice removal; Admin course-finance and member booking detail links; coach finance object scope; wrong-role rejection; expired-session redirect/token removal; notification recovery and 320px panel bounds.
- Existing notification bell persistence/expiry/completed-task browser journey passed. The FO inbox's full-page assertion now uses its explicit Mark read action; the bell still verifies viewed-on-close persistence.
- Existing FO notification desktop/mobile filtering, mark-read failure/retry, retained data and bell synchronization passed.
- Normal member rental/private booking, coach approval/manual payment, historical filtering and responsive controls passed.
- Grouped request/refund/Admin Handle, weekly occurrence-only removal and staff refund completion passed.
- Reviewed rescheduling/coach decisions, recurring removal and price/duration preservation passed. Higher/equal/lower rental differences, failed confirmation/retry and mobile review passed.
- Package/category management, scoped holiday editing/restoration, membership privacy and unchanged balances passed. Existing category-specific attendance, expiry, auth, ownership and financial integrity cases remain in the backend suite.
- Chrome screenshots were inspected at 320, 390, 768 and 1440px. Checks use temporary SQLite databases. `git diff --check` passed.

### Dependency audit and remaining release limits

Compatible updates address Vite, Zod, Express/body-parser, query parsing, Firebase transitive gRPC/re2js and Effect advisories. Direct version minima and explicit compatible overrides keep npm and pnpm installations aligned. Firebase and Prisma major versions remain unchanged.

The root production lock audit is clean after the targeted fixes. The backend pnpm production-lock audit still reports:

| Package | Severity | Remaining consideration |
| --- | --- | --- |
| deepmerge-ts | High | Prisma 6 config tooling pins the affected major; the offered fix crosses a major version. A Prisma/tooling upgrade needs separate compatibility validation. |
| glob | Moderate | Transitive Google SDK dependency; the patched release crosses its declared major range. |
| minimatch | Moderate | Transitive Google SDK dependency; the patched release crosses its declared major range. |

These findings are recorded rather than suppressed or resolved with an untested forced major upgrade. npm may count vulnerable parents differently; pnpm's production lock includes the Google SDK paths used by the deployment install. Review the corresponding advisories: [deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).

Real PostgreSQL concurrency/migration execution remains unverified locally because no PostgreSQL server/container runtime is available. The existing PostgreSQL CI service job remains enabled. Firefox/WebKit installation was attempted but Playwright reports that the local macOS 13 host is unsupported. Actual Safari/Firefox/Edge and physical iOS/Android testing, live Firebase/OTP provider health, formal WCAG conformance and production security clearance are not established by these local checks. No destructive production testing was performed.

Phase 14 deployment, staging, monitoring and backup/rollback verification remain separate work. This report is not production release approval.

## Follow-up: remove Course Finance from staff workspaces

Removed the dedicated Course Finance page and all navigation/shortcut links from Admin, Badminton FO and Coach. Historical URLs remain protected redirects to the existing private-course booking history; the booking identifier is preserved. New notices and transaction links go directly to booking history. Admin's private-course management links to the normal court booking desk for creation. Booking-query filtering keeps the existing role/member scope, and existing booking, payment and audit records are retained. No database migration is required.

Verified with frontend/backend builds, scoped stabilization lint and the real browser journey for all three legacy URL redirects, matching booking visibility, absent finance links and existing role/session protections. The prior phase report's Course Finance destinations are superseded by this follow-up.
