# Admin and Badminton FO notifications

Admin and Badminton FO use one inbox presentation at their existing `/notifications` routes. The role-scoped API and server-provided destination links remain authoritative.

The page has one title, a search field, category filter and unread filter. Each row contains a category icon, notification title, message, Yangon timestamp, destination link when supplied and Dismiss. The list uses 20-row pagination and moves back to a valid page when the last row on a page is dismissed. Polling, focus and reconnect refresh the list; errors retain existing rows and offer Retry.

The staff bell uses the same category visuals, a six-notification preview, concise message excerpts and View all notifications. Full messages remain available in the inbox. Sound, unread counts, keyboard dismissal, focus restoration and existing viewed-on-close behavior remain available. Only notices visible for the existing viewing duration are cleared when the bell closes; off-screen and unrendered notices remain available.

Dismiss uses the existing authorized read/archive endpoint and updates the inbox and bell together. Dismissing a notice does not perform its underlying booking, refund or payment action. Existing coach and member notification actions are retained.

Validation:
- `npm run build`
- `npm run lint:stabilization`
- `node scripts/test-badminton-notifications-browser.mjs`: admin and FO desktop/touch inbox, filters, dismissal failure/retry, pagination/clamping, persisted removal, bell synchronization, sound, role links, Escape focus and viewport fit at 320, 390, 768 and 1440 pixels.
- `node scripts/test-notifications-browser.mjs`: isolated real API/database, visible-only viewing, expiry, persisted removal and automatic completed-task removal.
- Backend `node_modules/.bin/tsx --test tests/notifications.test.ts`: recipient authorization, archive lifecycle and duplicate-event handling.
