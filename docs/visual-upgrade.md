# ZAWANA visual and motion system

Implemented locally on 14 October 2026. The original crowned-lion image and wordmark assets remain in use. The product keeps its forest sidebar, warm ivory canvas, muted gold actions and existing purple accent. No backend files, route destinations, role rules or business payloads were changed by the visual work. The authentication corrections from the preceding task remain in the checkout.

## Foundations and shared components

- `src/styles/premium.css` defines surface, radius, shadow, typography and CSS interaction tokens. It loads after the existing workspace styles. Page headers, tables, forms, cards, statistics, empty states and authentication layouts share these foundations.
- `src/design/motion.ts` defines reusable easing, a damped spring, page entrance and popover variants. Simple hover/focus/press interactions use CSS. Existing Framer Motion handles coordinated state changes. No frontend dependency was added.
- `UI.tsx` adds shaped skeletons, animated statistic updates, a loading button state and restrained page entrances. Route-loading screens and the member dashboard use content-shaped loading placeholders.
- `Interactions.tsx` supplies sliding segmented selections, router-aware active navigation indicators, content updates animated in place, dialog behavior and a shared booking dialog/drawer surface.
- `Select.tsx` adds anchored desktop listboxes with arrow/Home/End selection, typeahead, Enter commit, Escape dismissal, outside-click dismissal, disabled states and selected checkmarks. 49 page selectors use this component. The original native select remains the form and change-event source. Touch devices, multiple selects and listbox-style native selects retain native interaction. Selection does not change the existing handlers or option values.
- Application-wide `MotionConfig` respects reduced motion. CSS motion, shimmer, chart animation and custom indicator transitions also respect the preference.

## Coverage

The shared `Page`, workspace shells and UI components update the visual presentation of all existing page families. Direct changes include:

| Area | Presentation and interactions upgraded |
| --- | --- |
| Member | Dashboard columns, KPI cards, schedule/notification hierarchy, booking-date filters, history selectors, court-checkout drawer, private-course availability modal, payment-history selectors, package/training forms |
| Admin and owner | Shared page/table hierarchy, user-role filters, account dialogs, course-view selections/content transitions, facility selectors and dialogs, finance-business filters and charts |
| Front office | Shared operational tables/cards/forms, all operational modal families, court-status filters, cafe category selections, inventory/appointment/payment selectors and POS surfaces |
| Coach and doctor | Workspace navigation, calendar day/week/month selection and content transitions, shared schedule/patient/customer/training interfaces |
| Authentication and public | Authentication type/spacing/forms, public-service cards and headers, shorter landing reveals, tactile public actions and an introductory layer that allows interaction while it exits |
| Navigation and feedback | Sliding active sidebar indicators, animated sidebar width and labels, persistent mobile drawer DOM with transitions, notification popover, toast presence boundaries, focus treatments and a workspace skip link |

Existing light content and dark sidebar/auth-editorial treatments are retained. The application did not have a full user-selectable dark theme, and none was introduced.

Dialog behavior contains keyboard focus, restores it on dismissal, makes background branches inert, locks background scrolling and responds to Escape. Modal backgrounds use a translucent scrim without heavy blur. Animated content wrappers do not use route keys or delay navigation. Tables receive CSS hover/focus feedback; their rows do not receive Motion layout animation.

## Design research

Public pages were read at [Linear](https://linear.app/), [Vercel](https://vercel.com/) and [Stripe](https://stripe.com/). Their homepage browser captures were inspected: Vercel's clear heading/action grouping and Stripe's section framing informed hierarchy and spacing; Linear's navigation capture and public product structure informed navigation restraint. No design or asset was copied. The initial Linear capture exposed its navigation but not the fully loaded product visuals, so this work does not claim a review of its complete interactive UI.

Dribbble dashboard search results were reviewed as discovery material, without claiming individual shot inspection. Getlayer could not be reliably identified in the search results. Apple's motion-guideline URL was located, but its fetched page required JavaScript; its full guidance was not reviewed.

## Verification

`npm run build` passed (TypeScript project build and Vite production build). `git diff --check` passed. The existing warning about large application/3D/chart chunks remains.

Browser QA used locally installed Chrome with temporary Playwright tooling outside the repository, a local Vite server, database-auth mode for the test harness, and mocked API responses. No live account, booking, order or payment was created or changed.

- 65 existing routes rendered with empty API fixtures across member, admin, owner, badminton FO, gym FO, clinic FO, store FO, cafe FO, coach and doctor roles. Each had a heading, no uncaught page error and no horizontal document overflow at 1280px. Reduced motion was enabled for this sweep.
- Desktop and mobile checks covered the member dashboard, booking history, notifications, admin accounts, account creation modal, navigation drawer and sign-in page. Desktop selection committed `kind=court` through the existing booking request. The account role selector changed the native form value to `coach`.
- Segmented filters responded to arrow-key selection. Account modals contained Tab/Shift+Tab, dismissed with Escape and restored focus to the launch button. Mobile navigation made the main content inert while open and restored it after Escape.
- An emulated touch device at 390px used the native select, retained the selected value, respected reduced motion and had no horizontal document overflow. Mobile fields use 16px text to avoid small-input zoom.
- The legacy clinic screen also passed a separate render/overflow smoke check after adopting the shared dialog surface.
- Additional responsive checks passed for admin course management, finance, the coach calendar and cafe POS at 320px, 768px and 1024px after their selection controls were upgraded.
- Local sidebar-animation sampling measured approximately 16.7ms median and 95th-percentile frame intervals at normal CPU speed and 4x CPU throttling. This is a limited headless-browser measurement with empty data, not a guarantee of performance on physical mobile devices or large datasets.

These checks verify presentation, keyboard behavior and request-handler continuity against fixtures. Live Firebase sign-in, real backend/data integration, real payment processing and physical-device screen-reader behavior were not exercised by this visual QA.

## Review previews

All screenshots use fictitious QA account data.

- [Member dashboard](previews/member-dashboard.png)
- [Booking history on touch mobile](previews/bookings-mobile.png)
- [Account creation modal](previews/account-modal.png)
