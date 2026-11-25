# Booking and holiday presentation

Court booking dialogs use the reservation title as their main heading and show the reference once. Date/time, customer, amount, payment, change eligibility, cancellation review and history remain available. Rental entry retains all customer/payment fields and confirmations, with the redundant selection progress strip removed. Member checkout retains court/floor grouping, session removal, prices and the total.

Admin history combines date/time and amount/payment columns and suppresses technical weekly IDs and zero-price display while retaining all row actions and details. The admin page heading follows the active screen; Holiday Management hides the outer court-rental heading and tab bar. Member-only layouts remain at their previous design.

Holiday Management puts the calendar first with settings beside it on desktop and below it on mobile. Holiday names lead the configured list and confirmation dialog. Categories, notes, range selection, individual dates, class-category assignment, edit, preview, confirmation, conflict warnings, removal and restoration remain available. Optional class-category administration appears after configured holidays.

This is a presentation change. API payloads, pricing, payment validation, booking permissions, holiday rules and persistence are unchanged. No migration or deployment is included.

Validation: frontend build; package and rescheduling lint; court booking, member history/pagination, holiday suspension/restoration and reviewed court-desk browser journeys against temporary databases or existing browser fixtures.

## Staff booking-history visibility

Admin and Badminton FO now share a booking-first layout. Requests and refund panels follow the list and visible 20-record pagination. Four primary filters stay visible; specific date, date range and time range use one disclosure. Clear filters, Refresh bookings, loading feedback and Retry bookings distinguish active requests, failures and genuine empty results. Out-of-range pages clamp after a refresh. Existing rental, private-course and weekly-class tabs and all record actions remain.

The isolated staff-history browser journey checks both role routes with 25 real records, paging, failed load/retry, search/reset, date filters, list placement and 320/390/768/1440px layouts. It is included in CI and the stabilization browser runner.

## Staff request organization

Admin and Badminton FO request lists use compact customer groups with original court, date/time, reference, status and individual actions. Full notices are disclosed once per group. Search and status filters show matching bookings; pagination keeps up to five groups intact per page. Loading, empty results, refresh, filter reset and error/retry states are explicit. Grouped requests now offer the existing details dialog alongside replacement/refund actions. Request and batch links retain access to their target, including groups beyond page one. Member notices and request business rules are unchanged.

The staff-request browser journey checks both roles, seven real groups, two bookings in a batch, paging/search/reset, failure/retry, detail access, batch links and four viewport widths. Bookings and transactions are compared before and after the read journeys. The existing reviewed court-desk workflow journey also passes.

## Unified staff history and requests refinement

Court rental, private course and weekly-class history now use one responsive record per booking instead of separate desktop table and mobile card trees. Each record prioritizes the court/course/class title, customer where applicable, original date/time, status, payment where applicable and existing actions. Weekly class names appear once; rental references remain searchable and available in details. Private-course rows retain their court and coach. Weekly schedules omit payment controls and placeholder amounts.

View Details uses the original rental history workflow or a compact private-course/weekly-class dialog with the title, schedule and status once. Reschedule and Cancel retain their original handlers and eligibility conditions. Category tabs, filters, pagination and zero-result controls remain visible. Refresh shares the category toolbar rather than an extra introductory section.

Affected-booking requests retain customer groups, independent actions, original schedules, one notice disclosure per group, search, status filters, deep links and pagination. Rows use date/time icons, clearer state colors and one View Details action; reference codes are searchable and available in details instead of repeated in the list. Private-course booking request cards also use View Details. Arrangement, refund and request state transitions retain their existing services and permissions.

Verification covers both Admin and Badminton FO, all three history categories, private/weekly details, request grouping and private-course requests, failed-load retry, filtering, paging, deep links, four screen widths and unchanged booking/ledger snapshots. The frontend build, focused React/TypeScript lint, private-course management and reviewed rescheduling browser journeys are also checked. No API, database, booking-policy or financial changes are included.

## Separate booking activity tabs

Admin and Badminton FO now show **Booking history**, **Requests** and **Refund requests** as sibling navigation tabs. Court-desk routes also retain **Availability & times** alongside them. The history tab contains its existing Court Rentals / Private Courses / Weekly Classes categories, filters, details and pagination. Requests and refund requests each render only within their own tab; their existing processing dialogs and services are reused.

The active tab is represented by the `activity` query parameter, preserving refresh and browser navigation. Existing `history=1`, booking/category links and request/batch deep links remain supported. Request and batch links select Requests automatically. Empty sections retain navigation and a clear empty message.

Validation: frontend build and rescheduling lint; staff-history checks for exclusive content, all history categories, empty sections, tab reload and four screen sizes; staff-request checks for grouped/private requests, batch deep-link reload, refund-tab processing access and read-only data preservation; the existing cash/online/private-course refund regression journey. No refund validation, financial writes or booking rules were changed.

## Admin request-tab visual refinement

The admin Requests tab now uses one compact search/status/refresh toolbar, a Needs staff action filter, customer initials, clearer booking-type labels, shorter status text and visible primary actions. The page title is not repeated inside the panel. Grouping, original schedules, per-request details, replacement/refund actions, notices, pagination and request links retain their existing behavior. Badminton FO keeps its prior presentation.

The admin Refund Requests tab has a dedicated responsive list with customer/court identity, date/time icons, separate amount and status hierarchy, search by customer/phone/reference/court, status filtering and ten-record pagination. Amount paid is clearly distinguished from the amount actually refunded; completed partial refunds display the recorded refund amount. Reconciliation problems show their existing server reason and open the original details dialog instead of presenting an immediate processing action. Loading, empty, filtered-empty, refresh and retry states are explicit. Processing, audit data, amount validation and duplicate protection remain in the existing RefundDialog and backend services.

Only the admin booking workspace opts into this presentation. Finance and front-office refund views retain their existing markup. The shared refund reader now rejects superseded results, retains records on refresh failure and supports explicit retry; existing polling, payment events and focus refresh remain.

Validation: frontend build, rescheduling lint, the new isolated admin-request-tabs browser journey, existing staff requests/history journeys and admin single/bulk refund workflow checks. Browser checks include 13 real refund records, search/filter/pagination, failure/retry, blocked records, recorded partial refunds, request action filtering, 1440/768/390/320px layouts and unchanged booking/refund/ledger snapshots during browsing. The new journey is included in CI and the stabilization runner. No backend, schema or financial-rule changes were made.
