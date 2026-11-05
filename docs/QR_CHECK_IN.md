# Category attendance QR check-in

Coach, Badminton FO and Admin use the same category QR desk. The category QR desk appears directly on Attendance and automatically restores both cards on page load. FO can also use the inline desk in Package Check-In & Sales. Select a category directly: **Foundation**, **Social** or **Pathway**. There is no member or package selection when generating a QR.

Two persistent cards represent **QR slot 1** and **QR slot 2**. Each can display a different category with its own image, status, two-hour countdown, check-in count, copy link, revocation/replacement controls and recent attendance. Both slots are shared across authorized badminton staff; opening a different staff view retrieves the same desk. On narrow screens the cards stack.

Generating slot 2 never replaces, hides or revokes slot 1. Generate / restore reuses a valid code with the same category in that slot and never extends its expiry. To change an occupied slot's category, select the new category and explicitly choose **Replace QR**. Replacement revokes only that slot's prior token. The same active category cannot occupy both slots. Expired/revoked cards remain visible until a new code is requested.

## Member scanning and deduction

A category QR is shared. Member A, B and C can each redeem the same active Social QR. A successful scan does **not** change the QR to USED. Each member may redeem that QR only once, enforced by a database unique constraint on `(qrId, memberId)`.

1. The member signs in and scans the code or uploads its photo.
2. The backend validates the secure token, active issuer, category and expiry.
3. The preview shows the QR's category, exact eligible package, one-session deduction and remaining balance. Members cannot change the category encoded by the stored QR record.
4. Confirmation revalidates inside a transaction, creates attendance, deducts one matching-category session and records the QR/member redemption.
5. The committed result shows the category, package and remaining sessions. The QR remains ACTIVE for other members.

A Social QR never debits Foundation or Pathway. Active, started, unexpired packages with remaining sessions are eligible; earliest expiry wins, then creation timestamp and ID. There is no cross-category fallback. The existing member/category/Myanmar-date attendance guard also remains: replacing a Social QR does not authorize a second Social visit that day. A separate Foundation QR can be used independently under the existing rules.

Duplicate feedback: **“You have already checked in using this QR code.”** Expiry feedback: **“QR code expired. Please request a new QR code.”** Rejected attempts create no attendance/redemption and deduct no sessions.

## Persistence, permissions and privacy

Each QR has a cryptographically random token, token hash, encrypted redisplay value, category, timestamps and independent ACTIVE → EXPIRED/REVOKED lifecycle. It is valid for exactly 120 minutes from its stored creation timestamp. API checks enforce expiry; the countdown is visual. Browser refresh and API restart restore both tokens with unchanged expiry.

Keep the stable private `QR_TOKEN_ENCRYPTION_KEY` configured on every API replica (or the existing stable `JWT_SECRET` of at least 32 characters). Rotating the key requires replacing affected codes. QR links contain an opaque token in the URL fragment and no member information.

Admin and Badminton FO can manage the desk and see recent QR arrivals. Coaches require an active linked Badminton coach profile. They share the same cards and aggregate counts, while named history is limited to their authorized assigned private-course students. Gym, unlinked/inactive coaches, other departments and members cannot manage or retrieve staff tokens. Scanners identify members from authentication, never from a staff-selected member ID.

The desk polls every five seconds and on focus. Check-in notifications and session/low-balance/exhaustion feedback reuse the existing notification service. Attendance history and package corrections retain their existing authorization and audit rules.

See [migration, API contracts and verification](category-attendance-qr.md). This contract supersedes the earlier member-specific, globally single-use QR implementation. Physical camera permissions still require HTTPS or localhost and device verification.
