# Member booking history refinement

Updated the existing history screen with date-led booking cards, restrained status colors, visible payment summaries and clearer court/coach hierarchy. Search is always visible; less-used date/status/court/coach filters stay in the existing disclosure. Overview counts come from the backend and act as date shortcuts. Mobile category controls use two columns, and the repeated introductory copy is hidden to bring bookings closer to the top.

The existing expandable cards retain all cancellation, rescheduling, payment, detailed-history, request and refund actions. Native keyboard disclosure remains available, with visible inset focus outlines. Dates include their year. Background refresh retains the current cards and open details; skeletons appear for initial loads and changed queries. Cleanup also invalidates superseded reads.

Files:

- `src/pages/Bookings.tsx`: presentation, visible search, status-label normalization and background-loading behavior.
- `src/components/member-booking/booking-history.css`: scoped responsive styling using the existing brand and controls.
- `scripts/test-booking-history-browser.mjs`: isolated browser checks and screenshots for desktop/tablet/mobile, keyboard disclosure, live refresh, search/empty states and tab navigation.

No API, database, payment or booking-policy changes.

Verification:

- `npm run build`: passed; existing bundle-size warning remains.
- Focused ESLint with the repository's existing React/hooks/TypeScript rules on Bookings.tsx: passed.
- `node scripts/test-booking-history-browser.mjs`: passed after final layout/focus changes. Desktop 1440px, tablet 768px and mobile 390px; no horizontal overflow or page errors.
- `node scripts/test-member-booking-browser.mjs`: passed, including private-course creation, coach approval/manual payment, category filtering, historical records, details and keyboard/modal behavior.
- `git diff --check`: passed.

Visual review used local desktop/mobile screenshots. Full cross-browser and physical-device verification was not performed. No production deployment.
