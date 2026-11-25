# Badminton package management

The admin catalog highlights package title, category, price, session allowance, validity and available weekdays. Description, time restrictions, schedule notes and court rules remain in Package details. Repeated catalog statistics, raw category codes, filler schedule text and management captions are removed. Legacy purchase records remain available in a disclosure. Existing create/edit/archive, image upload, verification and legacy category-classification workflows are retained.

Category management is separate at `/admin/badminton-categories`, with a sidebar entry and a catalog link. Administrators can create, read, edit, archive and reactivate categories. Codes remain immutable after creation. The delete operation continues to archive, preserving package/class/attendance history. Existing password/identity verification and mutation audits still apply.

Active students opens a compact dialog showing the package title, active student total and names. Pagination appears only above 25 names. Contact information, session balances, dates, category filters and expired membership controls are removed from this dialog. The FO package directory uses the same simple dialog; activation and check-in management remain separate.

The new Admin/Badminton-FO-only `GET /packages/badminton/:id/active-students` endpoint returns names and a distinct-student count for the selected package. Eligible enrollments must be active, started, unexpired and have remaining sessions. Disabled/deleted linked accounts are excluded. Multiple enrollments and legacy identities for one student count once; unrelated students with identical names remain separate. The existing membership-detail API is unchanged.

Validation covers unique counts, package isolation, inactive/expired/future/exhausted exclusion, minimal response fields and role boundaries. The updated browser journey covers separate category CRUD with real verification, archive/reactivation, Admin/FO names-only dialogs, retained category holiday flows and 320/390/768/1440px layouts. No schema migration or production deployment is included.

## New and Edit package dialogs

Both badminton forms share `BadmintonPackageDialog`: title/category, highlighted MMK price, sessions/validity and visual weekday selection are visible first. Description/image, creation-only time windows/notes/court rules and the existing Admin legacy-category review use disclosures. Duplicate section headings and explanatory subtitles are removed. Edit retains status controls. The fixed footer provides Cancel and the primary save action; labels remain visible as values are entered. Upload/save state disables edits and accidental closing, and a synchronous submission guard prevents repeated submits. Existing API payloads, verification, image upload and legacy review behavior are preserved. Gym forms remain separate.

Browser checks cover required values, invalid sessions, inline save failure with retained input, duplicate submit, verified create/edit, optional fields, image upload/rejection/persistence/removal and 320/390/768/1440px modals. The focused package-modal journey is included in CI and the stabilization browser runner.
