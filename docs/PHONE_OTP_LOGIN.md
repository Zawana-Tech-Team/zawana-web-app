# Mobile phone OTP login

Existing members sign in with their registered phone number and a fresh Firebase SMS OTP. Phone login does not accept, request or verify an account password. Email login continues through `/api/auth/mobile/email-login` and requires its password.

## Contract

1. The app checks whether the number is registered, then requests Firebase SMS verification.
2. After Firebase confirms the OTP, the app sends its fresh primary-phone ID token as the Bearer proof to `POST /api/auth/mobile/challenge`, with `{ "intent": "signin" }`.
3. The backend validates the token's primary phone provider, Myanmar E.164 number and authentication freshness, enforces abuse limits and rejects replayed proofs. It resolves an unambiguous registered account and returns a short-lived challenge with `next: "session"`.
4. The app posts `{ "challengeToken": "...", "remember": true }` to `/api/auth/mobile/phone-login`. This strict request schema has no password field.
5. The backend rechecks ownership, restrictions, revocation and MFA, then consumes the challenge and issues the application session atomically. Only the application session authorizes protected APIs.

The former `/api/auth/mobile/password` route and phone-password verifier have been removed. Release the matching backend before the updated mobile client. No database migration is required.

## Registered numbers and existing accounts

Phone sign-in recognizes both enrolled phone identities and existing member contact numbers in E.164, country-code-without-plus, or Myanmar local trunk-prefix formatting. Spaces, hyphens, parentheses and dots are ignored in legacy contact lookup.

A fresh OTP for a uniquely registered contact number can enroll its phone identity during session issuance. This preserves the existing user ID and associated records. It does not create another member or ask for email/password linking. Independent email/password sign-in remains available.

The lookup checks enrolled and contact ownership together and rejects ambiguous numbers or an existing Firebase UID mapped to a different account with `PHONE_ACCOUNT_CONFLICT`. These cases receive support guidance, with no password fallback. Unknown numbers must register. Signup and explicitly requested account-linking operations retain their separate contracts.

## Session checks

The session contains the verified phone proof and, where separate, a canonical account reference marked `accountOnly` for revocation and MFA checks. That reference is not treated as another sign-in credential. Disablement, token revocation, member-role restrictions and MFA are checked during session creation and subsequent authentication/refresh. The phone capability is short-lived, single-use, and consumed in a serializable transaction that rechecks account ownership.

## Validation

All 83 backend tests and the 106-test mobile suite pass. Both projects pass TypeScript; mobile Expo lint also passes. Tests cover HTTP challenge/session exchange and protected API access, mandatory email passwords, registered legacy contacts, preserved user IDs, unknown/duplicate/conflicting numbers, expired/replayed/concurrent proofs, role restrictions, MFA, revocation and refresh. Provider proofs are fixtures; successful production SMS delivery and live OTP acceptance remain unverified.
