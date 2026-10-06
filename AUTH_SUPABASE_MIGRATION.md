# Firebase identity and Supabase PostgreSQL rollout

## Current application layout

- Vite + React frontend; Firebase JS SDK owns sign-in state.
- Express API in `backend/src/server.ts`; Firebase Admin verifies ID tokens and revocation before a user is loaded.
- Prisma `User` remains the canonical application identity, profile and role record. A verified Firebase identity is linked by unique `firebaseUid`; legacy account IDs and roles are preserved when linked by verified email.
- The existing `backend/prisma/schema.prisma` and `backend/prisma/migrations` remain the SQLite/local development path. The additive Firebase migration adds nullable `firebaseUid` and `emailVerified` fields.
- `backend/prisma/postgresql/schema.prisma` and its generated initial migration are the PostgreSQL/Supabase target. The Express raw SQL adapter translates bind placeholders and quoted camel-case identifiers for PostgreSQL, while SQLite-only runtime DDL is skipped on PostgreSQL.

## Environment setup

Frontend `.env` (safe Firebase web config only):

```dotenv
VITE_API_URL=http://localhost:8000/api
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
```

Backend `backend/.env` (secret values stay server-side):

```dotenv
DATABASE_URL="file:./dev.db"
PORT=8000
CLIENT_URL="http://localhost:5173"
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

For Supabase, use the **session/pooler connection for the running Express app** and the **direct database connection for Prisma migrations**:

```dotenv
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
```

Do not use a Supabase service-role key as a database password, and do not put either database URL or Firebase Admin credential in frontend environment variables.

## Firebase console checklist

1. Configure the same Firebase project ID as `FIREBASE_PROJECT_ID` and `VITE_FIREBASE_PROJECT_ID`.
2. Enable Google and email/password providers, email verification, and the application's development/production authorized domains.
3. Enable Firebase Authentication with Identity Platform and configure phone/SMS MFA, quotas, and authorized domains before using MFA enrollment or challenges.
4. Supply Admin SDK credentials through a deployment secret manager or Application Default Credentials. Never commit service-account JSON.
5. Provision privileged Zawana `User` rows and roles through the existing admin workflow. A new Google identity only creates a `member`; linking a matching, verified legacy email preserves that existing Zawana ID and role.

## Local SQLite rollout

The current local `dev.db` reports 14 existing migrations as pending in Prisma's migration history. Do not run `migrate dev`, `migrate deploy`, `db push`, or a reset against that database until its schema/history has been reconciled and a backup has been made. The Firebase identity migration itself is additive and preserves all user and migration, use the normal SQLite migration workflow after reviewing the generated SQL.

## Supabase rolloutbusiness IDs. For a database that is correctly at the previous 

1. Create a separate Supabase project/database for staging. Take a verified backup of the current SQLite database and keep it read-only during the first rehearsal.
2. Review the PostgreSQL schema and initial migration. The initial migration is for a **new empty PostgreSQL database**; never run it against an existing Supabase schema or use a reset to make it pass.
3. Set `DATABASE_URL` and `DIRECT_URL` in the backend environment, then from `backend` run `npm run prisma:generate:postgres` and `npm run prisma:migrate:postgres`. Build/run the API only after the deployment's Prisma Client was generated from `prisma/postgresql/schema.prisma`.
4. For existing Zawana data, migrate into a separate staging database using a reviewed, table-ordered importer. Preserve every primary key and relationship, import parent records before children, verify row counts and foreign keys, and compare account roles, booking/package balances, payment totals, and audit/history records. Do not link Firebase users until email ownership is verified; never default imported privileged accounts to `member`.
5. Run an application smoke-test against staging, then take another backup and schedule a write freeze/cutover. Keep the SQLite backup until PostgreSQL counts and workflows have been reconciled.

This repository does not contain a live Supabase connection or an existing-data importer. The target schema/migration and selectable Prisma commands are prepared, but production data has **not** been copied or switched. The copy/import and cutover need a staging rehearsal with the actual database and a reviewed data mapping; no migration is run automatically at server startup.


## Security behavior and remaining deployment setup

- The API never trusts a frontend role. It reads the active role from the canonical Zawana `User` row after Firebase token verification.
- Auth session/profile completion endpoints are rate-limited per process/IP; use a shared limiter store before deploying multiple API instances.
- Sensitive staff roles require a fresh Firebase MFA claim for normal APIs; Settings enrollment and sign-in challenge use Firebase's phone second factor. Firebase and its SMS provider must be configured before this can be exercised.
- No password, OTP, refresh token, Firebase ID token, or service credential is written to application logs.
- Live Firebase provider/MFA checks and Supabase data migration cannot be verified until project credentials and a staging database are configured.
