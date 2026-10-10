# UI/UX modernization plan

## Repository map

- `src/App.tsx` is the active React Router table. It owns public, member, admin/owner, front-office, coach, doctor, and payment routes plus the existing role guards.
- `src/layouts/Layouts.tsx` is the member-facing shell. `src/components/RoleLayout.tsx` is used for authenticated staff/professional workspaces.
- `src/components/UI.tsx` holds shared buttons, cards, badges, statistics, pagination, page headers, empty states, and toasts. `AuthShell.tsx`, `NotificationBell.tsx`, and `OptimizedImage.tsx` are shared feature components.
- Member experiences are primarily in `Dashboard.tsx`, `CourtBooking.tsx`, `PrivateCourse.tsx`, `Bookings.tsx`, `Membership.tsx`, and related pages. Most operational route content is composed in `Operations.tsx`; detailed one-off screens include admin management, private-course management, and the coach calendar.
- `src/context/AuthContext.tsx`, `OperationsContext.tsx`, `AppContext.tsx`, and `src/api.ts` own identity state, role-scoped operational data, notifications/app state, and HTTP requests. Backend API/data contracts are served by the active `backend/src/server.ts`.

## Audit findings

- The app already uses a predominantly white canvas and gold branding, but its color tokens were semantically inconsistent: deep indigo was used as both ink and large surface, while several shade tokens did not represent a neutral scale.
- The member shell, staff shell, and legacy front-office shell had distinct spacing and active-navigation patterns. `FrontOfficeLayout.tsx` is not mounted from the current route table, so this first pass targets the active shells rather than reviving it.
- Common buttons, cards, badges, headings, and form fields had inconsistent density, contrast, focus treatment, and disabled styling.
- The public hero relied on geometric decoration, while the authentication shell had a dark graphic panel. The repository already includes Zawana facility photography that can be reused.
- `App.tsx` eagerly imported the page barrel and all role pages, producing one large initial JavaScript chunk. Authentication, API contracts, role guards, and backend workflows are separate and should remain unchanged by the visual pass.

## Incremental plan

1. **Foundation — completed in this pass:** define neutral white/gray surfaces, ink, accessible gold, status, and focus tokens; align shared components and active application shells; refresh the public hero and auth shell with the existing court image; add route-level page loading with a visible loading state.
2. **Member flows — next:** refine the badminton dashboard, booking selection, booking history, package/check-in states, and private-course selection using current APIs and real data only.
3. **Operations — next:** improve the shared operations workspace by department, prioritizing POS speed, table readability, filters, pagination, and modal/drawer consistency without changing calculations or permissions.
4. **Specialist pages — next:** review coach calendar, clinic appointment, store/cafe catalog, and admin management screens against the shared tokens and responsive rules.
5. **Verification:** after each page group, run TypeScript/build checks and inspect desktop/mobile layouts. Test the authenticated business flows only with a running API and known test accounts; this design pass does not change or claim those flows.

## Design guardrails

- Keep existing URLs, role checks, API request/response shapes, and business calculations.
- Use live API results when a page already has a data source; do not add UI-only sample results to replace failed requests.
- Keep page surfaces primarily white with a soft gray app canvas and sparse Zawana gold accents.
- Prefer shared primitives and the existing icon/image dependencies. Support visible keyboard focus, reduced motion, and touch-size controls.
- Treat the user-owned working-tree change outside these UI files as preserved.
