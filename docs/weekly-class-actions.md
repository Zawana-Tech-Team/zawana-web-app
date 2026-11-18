# Weekly Class contextual actions

Weekly Class selections now show exactly **Reschedule** and **Remove Weekly Class**. Removal uses the existing action-menu portal, destructive styling, and a compact confirmation dialog. Court Rental and Private Course menu definitions and workflows remain unchanged.

Reschedule reuses the reviewed weekly move workflow. Staff must explicitly choose **This occurrence only** or **This and future occurrences** before requesting a preview. The selected scope is repeated in the preview. Existing authoritative court/time/future-series availability checks and transaction validation remain in effect. Successful moves refresh the court calendar and availability.

Removal calls the staff-only `POST /rescheduling/weekly/remove` endpoint. It ends recurrence before today using the existing `effectiveUntil` field. Today’s active reservation is removed even when the class has already started; historical class rows, attendance and the original schedule audit remain saved. Related continuations and single-occurrence exceptions are located using the exact parent IDs recorded by the existing reschedule workflow; identical titles do not link unrelated classes. Previously ended periods are never extended.

The operation uses sorted court locks and a transaction, with an idempotent audit receipt in the existing `DeskMoveBatch` model. It records the prior/current block snapshots, preserves student enrollment, attendance, completed bookings and transaction rows, and rejects stale reschedule confirmations that would restore the removed class. Future availability is released immediately and the selection clears after a successful refresh. Weekly history recognizes expired recurrence periods as inactive while retaining their records.

Changed files:

- `backend/src/services/weeklyRemoval.ts`
- `backend/src/routes/rescheduling.ts`
- `src/components/court-desk/RemoveWeeklyClassDialog.tsx`
- `src/components/court-desk/DeskMoveDialog.tsx`
- `src/components/court-desk/court-desk.css`
- `src/pages/Operations.tsx`
- `backend/tests/weekly-removal.test.ts`
- `scripts/test-reviewed-rescheduling-browser.mjs`

Validation: production build and frontend/backend TypeScript checks pass; 18 relevant backend tests pass; both real-API browser journeys pass. Browser checks cover exact weekly action labels, explicit scopes, rescheduling, cancellation/failed removal, successful FO removal, released availability, retained rows/payments, mobile layout, and rental/private regression flows. The mobile confirmation screenshot was inspected. `git diff --check` passes.

No database migration is needed. Verification used SQLite, with no live PostgreSQL run. The later audited staff refund implementation is documented in `refund-processing.md`; Weekly Class still has no refund action.

The later UI refinement and audit-based repair of old same-day removals are documented in `premium-court-desk.md`.
