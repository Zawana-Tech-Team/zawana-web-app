# Court Desk booking details and actions fixes

## Root cause and dropdown fix

The old `.desk-context-menu` used `position: absolute; right: 0; top: calc(100% + 6px)` inside the entire `.desk-selection-actions` container. That container spans the selection area, rather than the clicked Actions button. The menu therefore aligned to the container's opposite edge. Its containing layout also determined scrolling, clipping and stacking behavior.

`CourtActionMenu` now renders one shared menu implementation for available slots, rentals, private courses and weekly classes. It uses a body portal with viewport positioning calculated from the trigger's actual bounding rectangle. It prefers left alignment, keeps a 6px gap, clamps to the viewport, and flips above if the available space below cannot fit the menu. It constrains menu height and allows internal scrolling when necessary. No screen location is hardcoded. There was no installed dropdown positioning library; the implementation follows the existing Select component's portal approach without adding a dependency.

Position updates follow captured scroll events (including nested containers), window/visual viewport changes, and trigger/menu resizing. Outside pointer or focus, selecting an action, and Escape close the menu. Escape restores focus to the trigger; arrow keys and Home/End navigate enabled actions. Listeners and observers are removed when the menu closes.

## Booking/customer UX

Selecting a rental or private booking shows a compact contextual summary inside the action area. Customer name and the actual phone number appear first, with a small accessible telephone link and call icon. Booking type, court, date and time follow. Active request status is shown inline.

Full booking information is available only through **View Details**. This opens the existing dialog surface with court/floor, coach where relevant, booking code, actual paid amount and booking/payment states. Selecting the grid booking does not automatically open a dialog. No unrelated profile information is shown. Missing contact information remains explicitly unavailable rather than being replaced with staff information.

Rental bookings can be selected together when every selected rental matches by customer name or member account. Names are compared after normalizing case and whitespace. The member account is retained in the operations data; a walk-in booking does not use its staff creator as a customer account. Unrelated customer selections replace the previous selection. Private courses remain single-selection. Clicking a selected booking deselects that booking. The multi-rental tray shows each court, customer and schedule, with individual removal and batch rescheduling. Arbitrary available court/time cells still support multiple selection across dates and floors; weekly-class selection is retained.

## Request Reschedule integration

Rental actions expose **Reschedule**, **Request Reschedule**, and the existing **Refund** entry. The request action opens the shared confirmation dialog with the selected rental ID and optional reason. The existing `/rescheduling/requests` API, active-request uniqueness, status model, customer-scoped notifications and audit records are reused. Private courses use the same entry point, with accurate coach-approval guidance instead of showing that guidance on rental requests.

A failed backend send stays in the dialog with an error, creates no success message and changes no booking. Existing active requests cannot be sent again from the confirmation dialog. Successful mutations refresh the selected booking status through the existing revision event. Customer responses from another session are picked up by the existing visible-page polling/focus refresh; status survives a page reload.

Business rules are unchanged: rental customers have Reschedule / Let Admin Handle / Refund; private customers have Reschedule / Refund and coach approval. Ordinary self-service retains the 24-hour restriction, while authorized staff requests retain the scoped exception. Cheaper-rental consent, pending extra payment until staff receipt confirmation, and manual refund review remain intact. This change makes no database or API contract changes.

## Files changed for this task

- `src/components/court-desk/CourtActionMenu.tsx` — shared anchored menu, viewport collision handling and dismissal/focus behavior.
- `src/components/BookingRequestWorkflow.tsx` — compact `BookingContextSummary`, explicit details dialog and clearing recovered load errors.
- `src/pages/Operations.tsx` — contextual placement, related-customer rental selection, single private-course selection and all Court Desk action triggers using the shared menu.
- `src/components/court-desk/court-desk.css` — portal menu styling and compact contact summary styles.
- `scripts/test-customer-requests-browser.mjs` — contact/details UX, below/above positioning, mobile/scroll/resize/dismissal, failed request submission, rental/private request actions, status persistence and Badminton FO coverage.
- `scripts/test-reviewed-rescheduling-browser.mjs` — regression journey updated for the requested single-booking selection while preserving multi-session creation, weekly class changes, payment and coach workflows.
- `docs/booking-details-actions-fixes.md` — this report.

## Verification

- Production build passes; frontend and backend TypeScript checks pass.
- Relevant backend tests: **26 passed, 0 failed**, covering customer requests, reviewed rescheduling, multi-court operations and timetable behavior.
- Customer request browser journey passes against a real API and isolated migrated SQLite database: compact details, telephone link, explicit View Details, menu below/above, scrolling/resizing, mobile viewport, Escape/outside dismissal, failed send, optional reason persistence, rental/private customer response choices, notifications/read receipts, staff status refresh, single rental selection, FO request, cheaper-price acknowledgment, additional payment confirmation, refund review and coach approval.
- Existing reviewed-rescheduling browser journey passes: selections across dates/floors, multi-session rental creation, single selected rental move with actual surcharge, mobile preview, weekly occurrence/future series changes, private requests and coach decisions, unchanged original receipts and FO history actions.
- `git diff --check` passes. Browser journeys report no uncaught page errors.

Browser screenshots are saved in the temporary artifact directory printed by each script. A successful mobile actions screenshot was inspected visually.

## Remaining limitations

The direct staff **Refund** entry now opens the shared audited refund form described in `refund-processing.md`. A customer's **Refund** response creates a review request; staff must separately confirm returned funds. Cross-session updates use the existing 15-second visible-page polling and focus refresh; this task does not add a realtime transport. Verification used SQLite; live PostgreSQL was not exercised. The production build retains the existing large-bundle advisory.

## Follow-up: related-customer rental multi-selection

A later user request enables multi-selection for rentals with the same customer name **or** member account. This supersedes the original single-rental selection requirement. `rentalSelection.ts` implements the identity comparison, and `OperationsContext.tsx` / `CourtBooking` now retain the real customer identity. The existing bookings query supplies the linked user's role so that staff-created walk-ins never use the operator as a customer account. Batch rescheduling reuses the existing per-booking destination and payment review; each customer request remains scoped to one booking, and staff can send requests for multiple selected rentals from one confirmation dialog.

Focused tests cover different names on one member account, matching names across different accounts or walk-ins, case/whitespace normalization, unrelated or unknown customers, and attempts to bridge unrelated customers through one matching booking. Browser journeys cover same-name walk-in batch moves with separate destinations and a surcharge, and same-account selection with different booking names.
