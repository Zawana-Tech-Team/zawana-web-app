# Firebase authentication production investigation

Investigated 2026-11-09 for `https://thezawana.com/api`, request
`2de76a89-9d67-43ef-9575-6a197c2f23de`.

## Findings and limits

- Public `/api/health` returned 200; `/api` returned the expected route-not-found
  404 with a generated request ID. Health does not exercise Firebase.
- A single session request with a deliberately invalid diagnostic proof returned
  401 `INVALID_PROOF`, `retryable: false`, request ID
  `ee3fcfde-0754-4194-92df-4b9282f27b49`. Production therefore distinguishes at
  least malformed proofs correctly; this does not exercise public certificate
  retrieval, credentials, revocation lookup, or a real sign-in.
- `.github/workflows/cd.yml` deploys to `/var/www/zawana-app` on an Ubuntu server
  and restarts PM2 process `zawana-backend`. Nginx serves the public domain.
- No production SSH credentials or historical server logs are available in this
  workspace. The precise cause of this request is **not established**. There is
  no evidence to justify replacing credentials or changing networking yet.
- Local frontend/backend project IDs both equal `zawana-54de8`; the production
  browser AuthContext asset contains `zawana-54de8.firebaseapp.com`. This is
  supporting evidence, not proof that the running production backend has the
  same project. Local `.env` files are not production configuration.
- Local `FIREBASE_WEB_API_KEY` does not equal the frontend key (it is absent or
  different). Different keys can belong to the same project. That variable is
  used for server password/custom-token REST exchanges, not web ID-token
  signature verification, and does not establish the reported incident cause.

## Complete active flow

1. `src/services/firebase.ts` initializes the Firebase browser SDK from
   `VITE_FIREBASE_*` and establishes browser-local persistence.
2. `src/context/AuthContext.tsx` uses `signInWithPopup` for Google or
   `signInWithEmailAndPassword`. Both explicit sign-in and `onAuthStateChanged`
   call `syncFirebaseUser`; unverified password users must verify their email.
3. `src/services/firebaseSession.ts` coalesces concurrent exchanges for the same
   UID, forces `getIdToken(true)`, and sends the Firebase ID token as a Bearer
   header on `POST /api/auth/session`. Exchanges expire after 25 seconds and
   account changes cancel stale results. Retry uses the existing Firebase user.
4. `backend/src/routes/auth.ts` enforces origin/rate limits and invokes
   `hybrid.webSession` in `modules/auth/hybrid.service.ts`.
5. `services/firebaseAdmin.ts` validates configuration, lazily initializes the
   named `zawana-auth` app, and calls `verifyIdToken(token, true)`. The SDK checks
   signature, algorithm/key, audience, issuer and expiry; `true` also enforces
   disabled-user/revocation checks using an authenticated user lookup.
6. `requireWebProof` applies provider/email policy. Account resolution uses
   Firebase UID/explicit identity links; application roles come from the DB.
   `completeSession` checks identity proofs and issues opaque application access
   and refresh credentials. Secrets are stored as hashes in the DB.
7. The browser stores the application access token; refresh uses the HTTP-only
   cookie for browser requests. Protected routes use `middleware/auth.ts` and
   `services/authSession.ts`: DB session expiry/revocation/active account checks,
   followed by Firebase identity/disabled/revocation/MFA checks. A successful
   login therefore does not remove the runtime Firebase dependency.

`withFirebaseIdentitySnapshot` only memoizes identity reads within one workflow;
token verification coalesces in-flight requests without caching authorization.

## Error source and verified fixes

`backend/src/services/firebaseReliability.ts`, `firebaseRead`, is the source of
the exact message **Firebase identity verification is temporarily unavailable.**
It produces `AUTH_UNAVAILABLE`, HTTP 503 and `retryable: true` only for detected
transient infrastructure failures or an exhausted deadline. Maximum wrapper
attempts: two, jittered delay, shared 20-second request budget. Individual HTTP
requests have a five-second bound; the SDK also has its own internal retries.
The server error handler adds `Retry-After: 2` and the generated request ID.

Other `AUTH_UNAVAILABLE` branches exist in `firebasePassword.ts` and
`authSession.ts`; they use different messages and do not emit `retryable: true`.

Verified bugs fixed:

- The installed Admin SDK can replace certificate network failures with
  `auth/argument-error`. The HTTP agent captured DNS/TLS evidence, but the
  classifier ignored non-transient transport signals. This incorrectly yielded
  a 401 invalid token for wrapped DNS/TLS failures. Recognized DNS/TLS failures
  now yield 503 `AUTH_CONFIGURATION`, no automatic retry, with safe transport
  codes. Transient DNS `EAI_AGAIN`, resets, timeouts and upstream 5xx remain
  retryable 503. Explicit expired/revoked/invalid tokens remain 401.
- API-level logs discarded endpoint, transport code, upstream HTTP status and
  configuration reason even when the Firebase wrapper had captured them. These
  now survive through an allowlisted sanitizer. This also correlates evidence
  for callers sharing an in-flight verification under different request IDs.
- `auth:diagnostics` previously exited successfully after outbound failures if
  the credential check succeeded. Failed probes now set a failing exit status;
  DNS has an explicit deadline. Expected OAuth/root endpoint 4xx are not treated
  as connectivity failures; the public certificate endpoint must return 200.
- The broader hybrid auth test harness used URL `.pathname` and a Unix CLI shim,
  preventing execution on Windows. It now uses `fileURLToPath` and launches the
  Prisma JavaScript entry point with the current Node executable.

The wrapper logs the underlying exception's allowlisted Firebase code, nested
transport code, endpoint category, status, configuration reason, operation,
attempt and duration with `requestId`. It never serializes exception messages,
stacks, credential objects, provider payloads, token contents or request headers.
Unrecognized exceptions remain 503 `AUTH_VERIFICATION_FAILED`, non-retryable;
they are not silently accepted or blindly retried.

## Exact deployment configuration

Backend runtime (PM2 environment or private `backend/.env`, resolved from the
process working directory):

| Variable | Requirement |
| --- | --- |
| `NODE_ENV` | `production` |
| `AUTH_MODE` | `firebase` |
| `FIREBASE_PROJECT_ID` | Exact Firebase project ID; local expected value is `zawana-54de8`, confirm production |
| `GOOGLE_CLOUD_PROJECT` | Optional fallback when `FIREBASE_PROJECT_ID` is absent; avoid conflicting values |
| `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | Both present for explicit service account mode, or both absent for ADC |
| `GOOGLE_APPLICATION_CREDENTIALS` | For ADC on this non-Google server: absolute path to a readable private service-account file, unless another supported ADC identity is provisioned |
| `FIREBASE_WEB_API_KEY` | Firebase web key belonging to the same project, for server password/custom-token/recovery REST operations |
| `FIREBASE_AUTH_EMULATOR_HOST` | Must be unset in production |
| `CLIENT_URL` | `https://thezawana.com` plus any other explicitly allowed HTTPS browser origins, comma-separated |
| `PUBLIC_API_URL` | Public HTTPS API URL used by this deployment; existing application docs require an HTTPS URL |
| `DATABASE_URL`, `DIRECT_URL` | PostgreSQL runtime and migration connections, provisioned privately |
| `UPLOADS_DIR`, `PORT` | Persistent upload directory and actual upstream listening port |

The split private key must be a valid RSA PEM. Actual PEM newlines and literal
`\n` sequences are supported. Do not paste an entire service account JSON into
`FIREBASE_PRIVATE_KEY`, add literal enclosing quotes in a hosting dashboard, or
base64-encode it. A private JSON file belongs in ADC configuration. Validation
checks structure only; it cannot prove that Google accepts the key. Grant the
credential identity only the Firebase Auth permissions required by the API's
user read/manage operations for the target project. A revoked or invalid key,
bad system clock, missing ADC or insufficient permissions requires remediation,
not a token verification bypass.

Frontend **build-time** values:

```dotenv
VITE_API_URL=https://thezawana.com/api
VITE_AUTH_MODE=firebase
VITE_FIREBASE_PROJECT_ID=zawana-54de8
VITE_FIREBASE_AUTH_DOMAIN=zawana-54de8.firebaseapp.com
VITE_FIREBASE_API_KEY=<public Firebase web app key for that project>
VITE_FIREBASE_APP_ID=<Firebase web app ID for that project>
VITE_FIREBASE_MESSAGING_SENDER_ID=<optional sender ID>
```

Confirm the actual project before applying these example project values. Browser
API keys are public configuration; Admin keys must never be in `VITE_*`. Add
`thezawana.com` to Firebase Auth authorized domains. Rebuild the frontend after
changes. Restart the backend after runtime changes. Dotenv does not override an
already-set PM2 variable: a stale PM2 environment can override a corrected file.
Do not inspect that environment with commands that print all values.

## Safe server diagnostics

These commands are for the server administrator. Run inside the actual backend
container/process environment, as the API user, with its real working directory.
A separate login shell does not automatically inherit PM2-only variables.

```bash
cd /var/www/zawana-app/backend
pnpm run auth:diagnostics
date -u
curl --silent --show-error --max-time 10 https://thezawana.com/api/health
```

The diagnostic prints only configuration project/mode, endpoint categories,
DNS family counts, HTTP statuses, clock skew and sanitized error metadata. It
tests DNS, normal CA-validated TLS, public certificate connectivity, OAuth and
Identity Toolkit connectivity, and credential acquisition. A successful token
acquisition is not proof of project-level Auth permissions or a successful login.
The certificate body is not printed. Root OAuth/Identity Toolkit 400/404/405
responses can demonstrate HTTPS connectivity. DNS/TLS failures cannot.

Allow outbound DNS resolution and HTTPS 443 to `www.googleapis.com` (Firebase
public certificates), `oauth2.googleapis.com`/`accounts.google.com` (credentials),
and `identitytoolkit.googleapis.com` (revocation/user reads). ADC mechanisms may
require additional identity endpoints. Check both IPv4/IPv6 routes, CA trust,
firewall/NAT/proxy policy and system time from the API host. `TRUSTED_PROXY_CIDRS`
controls inbound Express trust, not an outbound Google proxy. A workstation
connectivity test cannot prove server connectivity. Never disable TLS validation
or set `NODE_TLS_REJECT_UNAUTHORIZED=0`.

For existing structured logs in the default PM2 log directory, print only safe
fields for the incident (requires `jq`; custom PM2 log paths may differ):

```bash
cd /var/www/zawana-app/backend
jq -Rc 'fromjson? | select(.requestId == "2de76a89-9d67-43ef-9575-6a197c2f23de") | {event,requestId,operation,attempt,category,firebaseCode,configurationReason,endpoint,transportCode,upstreamStatus,status,code,authentication}' \
  "$HOME/.pm2/logs/zawana-backend-error.log" \
  "$HOME/.pm2/logs/zawana-backend-out.log"
```

Do not share raw log files, `pm2 env`, `pm2 jlist`, `printenv`, `.env`, private
JSON or browser Authorization headers. If the incident predates structured
logging, deploy the diagnostic fixes and reproduce once to obtain a new request
ID. The original exception cannot be reconstructed from the public response.

## Deploy and verify

Local validation: 76 tests passed across Firebase reliability, identity policy,
API diagnostics, hybrid authentication and package reauthentication suites.
Backend type checking and `git diff --check` passed. The local generated Prisma
client initially lagged the schema; regenerating it resolved type errors without
source or database changes. Local credential structure validated as service
account mode; this did not contact Google or validate production credentials.

1. Inspect safe incident logs and diagnostics in the actual runtime environment.
   Fix the evidenced credential/project/permissions/network/clock issue.
2. Build using the existing PostgreSQL deployment procedure. No DB migration
   or auth policy change is introduced by this fix. Restart the existing PM2
   process from the intended runtime environment; the CD workflow uses
   `pm2 restart zawana-backend --update-env`. This investigation did not deploy.
3. Confirm health, run diagnostics on every replica, then sign in normally with
   an existing test account. Verify `POST /api/auth/session` succeeds, the app
   displays the DB role, a protected read succeeds, and refresh succeeds. Do
   not copy token values from developer tools.
4. In isolated regression tests confirm expired/revoked/tampered/wrong-project
   tokens return 401, malformed config and DNS/TLS faults return non-retryable
   503, transient failures retry once then return retryable 503, and valid
   signatures plus revocation checks succeed. Never inject faults into live auth.
5. Confirm correlated logs contain safe evidence and no secrets. Health alone
   is not a successful end-to-end authentication check.

Regression commands (OpenSSL must be on PATH for the local HTTPS SDK test):

```bash
cd backend
pnpm exec tsx --test tests/firebase-reliability.test.ts tests/firebase-identity-policy.test.ts tests/api-diagnostics.test.ts tests/hybrid-auth.test.ts
pnpm run prisma:generate:postgres
pnpm run typecheck
```

Reference: [Firebase ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
and [revocation/session management](https://firebase.google.com/docs/auth/admin/manage-sessions).
