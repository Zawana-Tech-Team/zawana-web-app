# Phase 1 — Navigation and application structure

## Implemented

Badminton Front Office now has one **Packages** sidebar entry. Inside Packages, **Active Packages** retains activation, renewal and member lookup; **Scan Check-in** retains the QR desk and package-holder check-in workflow. The selected sidebar entry stays highlighted on both sections. Section links wrap on narrow screens and use native keyboard-accessible navigation with current-page indicators.

Badminton FO already had no Gym entry. Following the requested navigation adjustment, the Admin Gym group and Coach Gym Training entry are also removed. Gym FO navigation, protected direct routes and backend functionality remain available. The Member sidebar no longer has a standalone Scan check-in entry; active packages already provide the scan action. Category management remains Admin-only; no new FO permissions were introduced.

## Files changed

- `src/components/RoleLayout.tsx`: consolidate package entries and match the nested check-in route.
- `src/App.tsx`: protected Packages routes and compatibility redirects.
- `src/pages/Operations.tsx`: shared Packages page with section navigation and existing workflows; update dashboard check-in shortcut.
- `scripts/test-badminton-browser.mjs`: exercise section navigation, legacy routes, activation, renewal, mobile overflow and member access rejection. Update stale payment selectors and add required mutation retry keys.
- `backend/tests/badminton-browser-fixture.ts`: assign the fixture package to Social and issue a separate member session for access tests.

## Database and API changes

None. No migration or financial policy change. Existing backend role and object checks remain authoritative.

## Route compatibility

| URL | Result |
| --- | --- |
| `/badminton-fo/packages` | Active Packages |
| `/badminton-fo/packages/check-in` | Scan Check-in |
| `/badminton-fo/active-packages` | Protected redirect to Packages |
| `/badminton-fo/check-in` | Protected redirect to Packages / Scan Check-in |
| `/badminton-fo/pos` | Protected redirect to Packages |
| `/badminton-fo/students` | Protected redirect to Packages / Scan Check-in |

## Verification

- `npm run build`: passed; existing Vite warning for chunks over 500 kB remains.
- `npm --prefix backend run typecheck` and `npm --prefix backend run build`: passed.
- `npm run lint:attendance`: passed. This is the existing attendance lint scope; there is no general project lint command. Changed React components also received a source review for hooks, routing, accessibility and conditional rendering.
- `npm --prefix backend test`: 248 passed, 3 skipped, 0 failed (251 tests). Skipped PostgreSQL checks remain unverified locally.
- `node scripts/test-badminton-browser.mjs`: passed using an isolated temporary database and headless Chrome. Covers package section switching, sidebar active state, legacy redirects, Cash activation/discount and renewal persistence, invalid discount rejection, check-in holder selection, mobile overflow and member route/API rejection.
- `node scripts/test-admin-navigation-browser.mjs`: failed at the court-time selector `8:00 AM — 9:00 AM available`, after Admin Badminton/Gym navigation checks. This script did not complete; court selection was not changed in Phase 1.
- `node scripts/test-attendance-browser.mjs`: failed waiting for the `Reschedule your court` heading. It did not complete the subsequent QR scenario; rescheduling was not changed in Phase 1.
- `git diff --check`: passed.
- **Manually verified:** source review only; no human-operated browser or camera verification.

## Remaining risks and next phase

Physical camera scanning, Safari/Firefox/Edge and real mobile devices have not been manually verified. This phase reuses the existing check-in components and backend deduction services. Phase 2 will consolidate availability synchronization and reconnect behavior.
