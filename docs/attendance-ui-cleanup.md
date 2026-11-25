# Attendance: package check-ins and weekly classes

Attendance now reads recorded badminton package check-ins. Paid private-course bookings and legacy `BookingAttendance` records are excluded from staff/member calendars, records, participant history, summaries and CSV exports. Private bookings and historical private attendance remain stored, unchanged.

## Sources and weekly class linkage

- Both category QR scans and front-office package check-ins use `createBadmintonVisit`. Each successful visit creates one attendance record and applies the existing category/day duplicate guard and one-session deduction.
- At check-in, active class blocks are matched by category and the actual business date, using the existing recurrence rules, effective dates, occurrence exclusions, moved dated classes and date/holiday overrides.
- Several courts with the same class title and schedule are represented as one weekly session. When there is one matching session that day it is linked; with several sessions, only a unique session covering the check-in time is linked. Ambiguous or unavailable classes leave a valid category/package check-in without a guessed class assignment.
- The class IDs, category, date, title, class time, courts and floors are saved in the existing package snapshot. Later class edits/removals cannot change the recorded attendance. Historical visits without a class snapshot are retained without retrospective matching.
- Private-course mark/check-in endpoints return 410 without writes. Old private-course detail links return 404. The normal court-rental and private-course booking/rescheduling flows remain unchanged.

## Staff workspace and participant dialog

Calendar remains the default, with month navigation, Today, date selection and a selected-day agenda. Records shows the period list. Search, weekly-class, category, package, status and date filters share one Clear control and one Admin-only CSV export. There is no private-course coach filter, scheduled private check-in action, pending-course count or attendance percentage calculated from private bookings.

Rows show the participant, weekly class/package, actual check-in date/time and status, with the remaining package balance. The detail dialog shows the saved weekly class time and courts separately from the recorded check-in time. History and Admin-only correction audits remain available. Summary figures use actual visits and session consumption rather than an assumed scheduled roster. Empty dates do not imply absence.

Admin corrections require a reason and retain the existing package balance/cycle guards and audit trail. Coaches and front-office staff retain shared read access; corrections and exports retain their existing Admin restrictions. CSV exports include the weekly class, package, actual check-in time, class time, location, category, status, session deduction and recorder.

Members retain their personal check-in calendar, keyboard date navigation, month picker, refresh/retry and selected-day visits. Staff actions are not shown to members.

## Validation

The API attendance suite covers exclusion of paid and previously attended private courses, retired mutation endpoints, retained legacy records, actual staff/QR visits, weekly-class snapshots, multi-court deduplication, category ownership, filter/export scope, correction audits/balances, holiday/exclusion/moved-class matching and ambiguous/legacy visits.

The isolated staff and member browser journeys use real APIs and check weekly class display, private-course exclusion, corrections, audit history, CSV filtering, personal isolation, month navigation, retry and 320/390/768/1440px layouts. The journeys are included in the stabilization runner and Chromium CI job. Frontend/backend builds and attendance/stabilization lint are also checked.

This change uses existing snapshot storage; no schema migration, production data rewrite or deployment is required.

## Package-focused UI update

The staff and member interfaces now prioritize the student’s package and actual check-in. Weekly-class names, filters, schedules and court details are hidden. Staff summaries show check-ins and sessions used; package/category/date/status filters and the existing correction workflow remain. Stored class metadata and exports are unchanged by this presentation update.
