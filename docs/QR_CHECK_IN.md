# Badminton QR check-in

Badminton front office opens Package Check-In & Sales and chooses Generate check-in QR. The same QR can serve multiple signed-in members for **one hour**. A visible timer shows expiry. Generate new code revokes previous codes from that staff account; Revoke code ends it immediately. Deactivated staff accounts cannot issue usable codes.

Members use Scan check-in in navigation, their package card, or their phone's camera. The in-app scanner also supports uploading a QR image when a camera is unavailable. Camera access needs HTTPS (or localhost) and browser permission. When scanning with the phone's camera before sign-in, the code is retained for the member's sign-in flow. The member explicitly confirms before one session is deducted.

The backend chooses the member's active, started, unexpired package with sessions remaining, earliest expiry first. It atomically deducts one session and writes a normal BadmintonCheckIn, so attendance displays it. Duplicate scans, even using different QR codes/packages, cannot deduct twice on the same Myanmar calendar date. Existing attendance that day also blocks a QR deduction. The old direct member check-in endpoint now returns QR_REQUIRED; staff-assisted check-in remains available. Gym and private-course attendance are unchanged.

QR payloads use a random token stored hashed on the server. Tokens are in the URL fragment, not query strings. A QR is shared entry proof, not a member identity: sign-in is always required. Codes can be photographed/shared while valid; scanning is not a location verification mechanism.

## Deployment

Apply both new migration chains (attendance and QR) for the chosen database, regenerate Prisma, then build/restart the backend and release the frontend. For PostgreSQL:

```sh
npm --prefix backend run prisma:migrate:postgres
npm --prefix backend run prisma:generate:postgres
npm --prefix backend run build
npm run build
```

No production migrations or deployment were performed.

## Validation

`npm --prefix backend test` includes concurrent QR deduction. `node scripts/test-attendance-browser.mjs` uses isolated SQLite and real API requests: four attendance roles, user filtering, package link, QR generation/revocation UI, one-hour expiry, actual QR image decoding through the scanner library, one-session deduction and duplicate/rotation rejection. A real device camera still requires phone testing.
