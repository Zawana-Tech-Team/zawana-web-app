# ZAWANA UI redesign - verification record

Branch: `codex/new-landing-page-ui`. Local verification performed on 13 October 2026.

## Completed checks

| Check | Result | Evidence / scope |
| --- | --- | --- |
| TypeScript + production bundle | Passed | `npm run build` (`tsc -b && vite build`) |
| Git whitespace check | Passed | `git diff --check` |
| Three.js hero | Passed | Actual WebGL canvas rendered at 360, 390, 768, 1024, 1440, and 1920px; no hero photograph and no browser runtime errors |
| Hero motion | Passed | Explicit pause/resume, offscreen stop, viewport return/resume, reduced-motion demand rendering |
| Renderer failure handling | Passed | Deliberately lost WebGL context; architectural fallback displayed, CTA remained usable |
| Production renderer isolation | Passed with qualification | Built preview at port 4173: login did not request `HeroScene` or `three-core` chunks; a shared 20.7KB `react-three` helper chunk is preloaded by the existing bundler configuration |
| Production hero render | Passed | Built preview rendered WebGL without browser runtime errors |
| Public homepage responsiveness | Passed | All six target widths; no horizontal document overflow or broken local media during full-page checks |
| Public navigation | Passed | Mobile Tab loop, Escape, trigger focus return, body/scroll restoration, section anchor positioning, desktop resize close |
| Skip link + accessible H1 | Passed | Keyboard skip link focuses main; accessible H1 is “ELEVATE YOUR GAME. REDEFINE YOUR LIFESTYLE.” |
| Anonymous booking path | Passed | Hero court CTA reaches the existing `/login` guard |
| Partner carousel | Passed | Pause/resume button, reduced-motion suppression, offscreen pause |
| CMS presentation | Passed with fixtures | Published content rendered, draft hidden, registration URL retained, empty state displayed; actual API failure displayed an honest unavailable state |
| Membership presentation | Passed with fixtures | Mock member and package API: exact supplied price/session/validity rendered, inactive package excluded, error state displayed; radio keyboard selection works |
| Role UI smoke coverage | Passed with fixtures | 31 dashboard/service routes across all ten roles checked at 1440px and 390px, no runtime errors or horizontal overflow |
| Role dashboard breakpoints | Passed with fixtures | All ten dashboards also checked at 360, 768, 1024, and 1920px |
| Workspace navigation | Passed with fixtures | All ten role drawers: Tab loop, Escape, background inertness, body restoration |
| Account screens | Passed | Login, signup, and password recovery rendered on desktop/mobile with no horizontal overflow |
| Public secondary pages | Passed | Facilities, memberships, coaches, and contact rendered at 1440px/390px with no horizontal overflow |
| Protected business code | Preserved by diff inspection | No changes to `App.tsx`, `api.ts`, authentication/operations/app contexts, Firebase services, backend, or dependency manifests |

## Route coverage

- Member: `/member`, `/book`, `/book/court`, `/membership`, `/revive`, `/classes`, `/training`, `/cafe-order`, `/profile`, `/settings`, `/payments`, `/member/training`.
- Admin: `/admin`, `/admin/users`, `/admin/courts`, `/admin/badminton-packages`, `/admin/cms`.
- Owner: `/owner`.
- Badminton front office: `/badminton-fo`.
- Gym front office: `/gym-fo`, `/gym-fo/check-in`.
- Clinic front office: `/clinic-fo`, `/clinic-fo/appointments`.
- Store: `/store-fo`, `/store-fo/pos`.
- Cafe: `/cafe`, `/cafe/orders`.
- Coach: `/coach`, `/coach/schedule`.
- Doctor: `/doctor`, `/doctor/schedule`.

Staff/member screenshots contain deliberately mocked QA accounts and empty test data, not real business figures. Fixtures are confined to the headless QA browser; they are not added to application source or the user's preview session. No real bookings, account updates, purchases, or payments were submitted.

## Issues resolved during QA

- Explicit focus trapping supplements the public native dialog, so Tab wraps reliably in automated Chrome as well as the browser's modal focus handling.
- Mobile section navigation waits for menu exit and scroll restoration before scrolling to its target; existing router history state is retained.
- Masked headings have explicit word spacing and accessible text independent of the animated visual spans.
- The profile file input previously inherited a full-width global input rule and caused document overflow; hidden file inputs now retain their 1px clipped footprint.
- Native checkboxes/radios use deliberate dimensions rather than the global full-width field rule.
- Financial/stat values wrap instead of clipping.
- Corrupted staff display punctuation is repaired while legacy booking-slot generation/parsing values remain unchanged.
- The shared product stylesheet is explicitly imported after the base stylesheet, avoiding Tailwind import-order issues.

## Remaining limits

- `http://localhost:8000/api/health` was connection-refused. Live database/CMS/package reads, authenticated booking, purchase, and payment end-to-end testing could not be completed. Presentation checks use fixtures and do not certify those backend flows.
- Firebase email verification, Google sign-in, MFA, role authorization with real accounts, and staff write actions were not exercised. Their implementation/configuration remains unchanged.
- Browser verification used local desktop Chrome automation, not physical iOS/Android devices or assistive-technology sessions.
- Vite reports an entry chunk above 500KB (~636KB before gzip). The requested Three.js hero remains lazy, but total production performance/Core Web Vitals require profiling with realistic network and devices; no score is claimed.
- Licensed Gotham webfont assets and approved translations for newly introduced copy were not supplied. Existing/system typography and language dictionary fallbacks remain in use.
- Facebook's direct content was access-blocked during research; its arena page destination is identified by the public listing. Phone/email/address come from the supplied brand guideline.

## Reproducible local evidence

Headless QA scripts, JSON results, and screenshots are retained at:

`C:/Users/HP/.codex/visualizations/2026/10/13/01a13617-8618-7fa0-b7a9-a32d3d444d07/`

- `verify-landing.cjs`: public keyboard, anchor, CMS, media, and reduced-motion checks from the initial public implementation; its obsolete “no Three.js” expectation is superseded by the hero-specific script below.
- `verify-three.cjs`: final Three.js renderer, all six widths, pause/resume, reduced motion, offscreen rendering, and context-loss checks.
- `verify-final.cjs`: accessible headings, skip link, scroll/resize restoration, contacts, and mocked member pricing/error checks.
- `verify-workspaces.cjs`: all ten roles, 31 operational/service routes, six dashboard widths, three account screens, and four public secondary pages.
- `qa-results.json`, `final-qa-summary.json`, `workspace-qa-results.json`, and the PNG captures record the observed UI evidence.

The live development preview remains at `http://127.0.0.1:5173/`.
