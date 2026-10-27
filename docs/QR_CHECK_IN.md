# Badminton category QR check-in

Front office chooses **Foundation, Social, or Pathway** before generating a QR in Package Check-In & Sales. The label above the QR identifies its immutable category. The code is valid for one hour and shows a countdown. Generating any new code revokes all earlier codes issued by that staff account, including other categories. Revoke ends it immediately. Disabled or unauthorized issuers cannot authorize a scan.

Members scan using the in-app camera, upload a QR photo, or follow the phone camera's link. Sign-in is required; the token survives sign-in in session storage and is removed after success. Preview validates the stored QR/category and displays the eligible package, current balance, one-session charge and expected balance. Confirm independently revalidates and deducts inside a transaction. Success uses the committed API response.

Only matching-category, active, started, unexpired enrollments with a positive balance are candidates. Earliest expiry wins, then creation timestamp and ID. An exhausted package can be skipped for another eligible package **in the same category**. There is no cross-category fallback. Members can use Foundation and Social on the same Myanmar date, but cannot consume Social twice that date through QR or staff assistance. The shared check-in ledger provides this protection across both entry paths.

Package activation and renewal create separate entitlements; existing balances and dates stay intact. Member packages and staff sales/check-in show each package separately. Category editing affects future activations. Enrollment/check-in category snapshots remain fixed. Unknown legacy packages/history stay visible and require explicit administrator review before category-based deduction; old category-neutral QR codes must be regenerated.

QR tokens are random, stored hashed, and placed in the URL fragment without member data. Scans accept only the token; client category, enrollment or member IDs are rejected. The old direct member check-in endpoint remains QR_REQUIRED. Gym and private-course attendance keep their existing rules.

See [architecture, API contracts, legacy review, migration and rollout instructions](badminton-category-checkin.md) before deployment. Both providers require the new forward category migration and the matching Prisma client/API/UI. No production migration or deployment was performed.

Verification: `npm --prefix backend test`, the real PostgreSQL category suite documented above, and `node scripts/test-attendance-browser.mjs` exercise category isolation, preview, balances, duplicate rejection, QR/manual concurrency, rotation/revocation, ownership and legacy history. Real camera access still requires HTTPS (or localhost) and physical-device permission testing.
