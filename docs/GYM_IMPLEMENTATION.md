# Gym implementation plan and operating rules

The active backend is `backend/src/server.ts`. Reuse GymPackage, User, Coach,
PrivateTrainingSession, Membership, GymCheckIn, Transaction, PaymentAttempt,
Notification, the authenticated API client, and existing operational layouts.

1. Extend both Prisma schemas additively. Implement versioned package editing,
   immutable enrollment snapshots, enrollment participants, shared balances,
   payment-linked activation, attendance, and append-only audit records.
2. Replace the Admin gym package editor and Gym FO package sale screen with real
   API workflows. Extend the existing training and membership screens to display
   paid enrollments, group attendance, rescheduling, receipts, and access rules.
3. Verify isolated SQLite migrations and real HTTP journeys, authorization,
   payment callbacks, duplicate requests, concurrent session completion, and
   scheduling conflicts. Run both schema validations and application builds.

## Reversible business assumptions

- Memberships use calendar months, with an inclusive last access date and
  clamping for short months. PT validity is a configurable number of days.
- PT packages share a balance across their participants. At least one participant
  must be present to complete a session. Cancellation and no-show do not deduct.
  PT does not itself grant open gym access; sell a gym membership separately.
- Membership access is unlimited once per business day. Walk-ins grant one visit
  on their selected date. Legacy memberships retain their session-based rules.
- Group PT defaults to 5–20 members; Admin may configure its maximum and a
  minimum of at least five. Couple PT is always exactly two members.
- A paid enrollment may have one current renewal. Cancelling that renewal
  preserves its history and allows a replacement renewal.
- Gym supports KPay and authorized cash. Only a signed, amount-matched existing
  provider callback activates an online enrollment. This facility enables cash
  with `GYM_ALLOW_CASH_PAYMENTS=true`; authorized
  front-desk staff must then attest that cash was received. No bank transfer or
  client-supplied paid status is accepted.
- Front desk registration creates only a central member profile, with no login
  credentials and no verified identity claims. Existing Admin identity-linking
  workflows control subsequent login setup; matching contact data never links
  an external identity automatically.
- Cancellation preserves purchases and receipts and does not issue refunds.
  Paid enrollment cancellation is Admin-only and requires a recorded reason.
- Initial catalog records have stable IDs and are inserted only when absent.
  Walk-in pricing is never seeded; Admin must create and publish it.

No production database reset, destructive reseeding, or external deployment is
part of implementation. Deploy the migration matching the database provider.

## Implemented screens

- `/admin/gym-packages`: searchable and filterable catalog, create/edit forms,
  publishing, archival/reactivation, revisions, enrollment statistics, enrollment
  operations, and an activity log with before/after details.
- `/gym-fo/memberships`: package → members → coach/dates → review → payment →
  activation → printable receipt. Search enrollment history, resume pending
  payments, cancel unpaid enrollments, and renew a paid package.
- `/gym-fo/private-training`: individual/couple/group scheduling, live coach and
  participant availability, rescheduling, attendance, completion and history.
  Its **PT enrollments** view includes pending purchases, new PT enrollment,
  cash collection, receipts and renewals. Pending purchases become available in
  the scheduling dropdown after payment activates them.
- `/gym-fo/check-in`: existing membership table now handles unlimited paid
  memberships, session-based legacy access and single paid walk-ins.
- `/coach/training`: assigned sessions and individual participant attendance.
- `/member/training`: owned enrollments, shared balances, training and receipts.
- Existing payment history includes receipts for every participant in a shared
  enrollment, while keeping other transactions scoped to their owner.

The route guard waits for session restoration before deciding whether to redirect
to login, so these screens can be loaded directly or refreshed.

## API contracts

All endpoints use the existing Bearer session middleware. Paths include `/api`.

| Method | Path | Authorization / behavior |
| --- | --- | --- |
| GET | `/gym/packages` | Admin/Owner: all; Gym FO: published only |
| POST | `/gym/packages` | Admin only; creates version 1 and audit entry |
| PATCH | `/gym/packages/:id` | Admin only; `version` required; rejects stale edits |
| DELETE | `/gym/packages/:id` | Admin only; `version` in body; archives, never deletes history |
| GET | `/gym/packages/:id/history` | Admin/Owner; revisions and enrollment statistics |
| GET | `/gym/policy` | Staff; current business date, timezone and authorized payment methods |
| POST | `/gym/members` | Staff; creates an unverified member profile, never a staff account |
| GET | `/gym/private-training/members?q=…` | Staff; active central member search |
| GET | `/gym/private-training/coaches` | Staff; active linked Gym coaches |
| GET | `/gym/enrollments` | Staff, or Member scoped to own participation |
| POST | `/gym/enrollments` | Staff; immutable snapshot; UUID `requestKey`, `packageVersion`, `memberIds`, `startDate`, optional `coachId` and `renewalOfId` |
| POST | `/gym/enrollments/:id/payment` | Staff; `method: KPay` starts existing adapter checkout; optional authorized Cash requires `cashReceived: true` |
| POST | `/gym/enrollments/:id/cancel` | Staff for unpaid; Admin for paid; reason required, no automatic refund |
| GET | `/gym/enrollments/:id/receipt` | Staff or participant; only returns paid receipt |
| GET | `/gym/coach-availability` | Staff; `coachId`, `date`, `durationMinutes`, optional `enrollmentId`, `excludeId` |
| GET | `/gym/private-training?scope=…` | Staff; Member/Coach scoped to own sessions |
| POST | `/gym/private-training` | Staff; paid enrollment only; UUID `requestKey`, `enrollmentId`, `coachId`, `date`, `startTime`, optional notes |
| PATCH | `/gym/private-training/:id` | Staff; same scheduling payload, only scheduled sessions |
| PATCH | `/gym/private-training/:id/status` | Staff or assigned Coach; `status`, optional `presentMemberIds` |
| GET | `/coach/private-training?scope=…` | Assigned Coach only |
| POST | `/memberships/check-in` | Staff; `membershipId`; safe daily replay |
| GET | `/gym/audit` | Admin/Owner; paginated, filter by `entityType` and `entityId` |

`/packages/gym` remains an alias for the package APIs. Its mutations now require
Admin and a version on edits. `GET /gym/enrollments` supports `q`, `status`,
`page`, and `limit` (maximum 100). `category=training` filters to PT categories;
`forScheduling=true` filters to paid, active, unexpired PT with a positive balance.
Filtering happens before pagination. Session scopes are `today`, `upcoming`,
`completed`, `all`; the existing list limit remains 300 and the UI indicates it.

`POST /payments/kpay/webhook` remains the existing signature-verified payment
entry point. `gym_enrollment` is a new resource type. Failed or expired attempts
never activate the enrollment; a new checkout may be initiated while the purchase
remains eligible. Checkout creation locks the enrollment, and cash collection or
cancellation cannot compete with an active online checkout.

## Integrity and compatibility

- The new migration is `20261015120000_gym_management` in both provider-specific
  histories. SQLite uses additive ALTERs, preserving existing tables, rows,
  triggers and indexes. PostgreSQL adds columns, relations, tables and checks.
- New relations: package revisions, enrollments, participants, session attendance,
  one debit per completed session, and append-only gym audit records.
- Existing `Membership` and `PrivateTrainingSession` rows keep nullable enrollment
  links, retaining their legacy behavior. Existing GymPackage duration is retained;
  its monthly display is inferred from rounded 30-day periods. Admin should review
  migrated catalog rules before selling those legacy packages. Existing purchases
  are never rewritten by package edits.
- Package, enrollment, coach, member and session locks serialize competing writes.
  A conditional balance decrement and unique session debit prevent double use.
  Scheduling reserves balance capacity without deducting it until completion.
- Database guards reject negative or excessive balances and purchase-price/rule
  mutation. Package revisions and audit entries reject update/delete operations.
- Gym open-access check-ins do not consume PT balances. A membership cannot grant
  access before its start date, after expiry, or following cancellation. Legacy
  session-based memberships retain their previous visit allowance.
- Coach availability currently uses facility hours (06:00–21:00), active linked
  coach accounts, all participants, existing PT sessions, and legacy coach bookings.
  It is a read snapshot; confirmation checks availability again under locks.

## Verification and repeatable commands

```sh
# Existing project dependencies must already be installed.
npm --prefix backend run prisma:generate
npm --prefix backend test
npm --prefix backend run typecheck
npm --prefix backend run build
npm run build

# Separate tooling avoids changing the application's TypeScript 7 dependency.
npm ci --prefix tooling/gym
npm run lint:gym

# Uses an isolated database and test-only users, never the working database.
# Uses installed Chrome on macOS; otherwise install Playwright Chromium first:
node tooling/gym/node_modules/playwright/cli.js install chromium
npm run test:gym:browser
```

The backend suite covers arithmetic, participant limits, date validity, migration
preservation, package revisions, authorization, duplicate enrollment and session
requests, snapshot retention, signed/mismatched/failed payment callbacks, checkout
recovery, receipt ownership, coach/member conflicts, rescheduling, concurrent
group deduction, capacity reservation, daily check-in, future renewals, single
walk-ins, archival/reactivation and immutable audit records. Existing court and
authentication tests run in the same suite.

Browser verification uses real local API requests and a temporary database. It
checks Admin publishing, couple member-count enforcement, authorized cash
activation, receipt rendering, scheduling, member/coach access, and a 390px mobile
layout. Screenshots are saved in the reported temporary artifact directory; use
`GYM_QA_ARTIFACT_DIR` to select another directory. API tests use a local test
checkout adapter; no mock checkout is used by production routes.

Additional local verification applied the complete PostgreSQL migration chain to
a disposable PostgreSQL 17.6 instance and ran Prisma enrollment, payment
activation, concurrent scheduling conflicts and shared deductions, plus database
balance/snapshot/audit guards. Merchant-issued credentials and actual monetary
settlement were not exercised.

## Deployment

Back up the target database using the facility's existing operational procedure.
Deploy the migration for its provider before starting the updated API. Do not run
the repository's general demo seed against an existing database.

SQLite development:

```sh
cd backend
npx prisma migrate deploy --schema prisma/schema.prisma
npm run prisma:generate
npm run gym:seed
npm run dev
```

PostgreSQL (set the existing deployment's `DATABASE_URL` and `DIRECT_URL`):

```sh
cd backend
npm run prisma:migrate:postgres
npm run prisma:generate:postgres
npm run gym:seed
npm run build
npm start
```

`gym:seed` only inserts the 19 specified initial packages by stable ID and their
initial revisions. Re-running it preserves Admin edits and archived states. It
does not create walk-in prices, users, payments, purchases or operational data.

Keep Firebase auth in deployed environments. Configure the existing
`KPAY_CHECKOUT_ADAPTER_URL`, `KPAY_ADAPTER_API_KEY`, `KPAY_WEBHOOK_SECRET` and
`KPAY_CALLBACK_URL` for merchant checkout and verify the signed callback in staging.
The local environment and example enable Gym cash collection with
`GYM_ALLOW_CASH_PAYMENTS=true`. Set it to `false` to disable cash collection.
An absent setting also disables cash. Restart the API after environment
changes. Build and deploy the frontend through the existing workflow.

Refunds and proration are intentionally manual financial operations: cancellation
does not alter a receipt or automatically return funds. No external deployment or
migration of the working database was performed during implementation.

## Main changed files

- Backend domain: `src/routes/gymManagement.ts`, `src/routes/gymTraining.ts`,
  `src/services/gymPolicy.ts`, `gymPackages.ts`, `gymEnrollments.ts`,
  `gymSessions.ts`, `gymCheckIn.ts`, and active `src/server.ts` registration.
- Persistence: both `prisma/**/schema.prisma` files and their matching new
  migration directories; `scripts/seed-gym-catalog.ts` and its package script.
- Frontend: `GymPackageManager.tsx`, `GymEnrollments.tsx`, `GymPrivateTraining.tsx`,
  `GymReceipt.tsx`, `CoachTraining.tsx`, `MemberTraining.tsx`, `GymCheckIn.tsx`,
  `Operations.tsx`, `PaymentStatus.tsx`, `App.tsx`, gym types and receipt print CSS.
- Verification: `backend/tests/gym-policy.test.ts`, `gym-management.test.ts`,
  `gym-browser-fixture.ts`, `scripts/test-gym-browser.mjs`,
  `eslint.gym.config.mjs`, and isolated `tooling/gym` dependency lockfile.

The frontend build retains its existing warning about a shared JavaScript chunk
over 500 kB. The focused lint command covers the new gym domain rather than
silencing unrelated legacy lint findings. Browser console output also reports
pre-existing React key warnings in shared layouts/localization; no browser runtime
exceptions occurred in the verified gym flow.
