# Development guide

## Environment setup

Create local copies of the example files:

```powershell
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
```

The examples select local database username/password auth. Set a unique random `JWT_SECRET` of at least 32 characters in `backend/.env`. Keep `.env` files private and out of source control.

- Root `.env`: `VITE_API_URL`, `VITE_AUTH_MODE`, optional Firebase web config.
- `backend/.env`: `DATABASE_URL`, `PORT`, `CLIENT_URL`, `PUBLIC_API_URL`, `AUTH_MODE`, `JWT_SECRET`, optional Firebase Admin/KPay settings.
- The frontend and backend auth modes must match.
- Database auth is rejected in production and for non-SQLite database URLs. Use Firebase auth for deployed environments.
- Never put private server credentials in `VITE_*` values.

## Install and start

```sh
npm install
npm --prefix backend install
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate
npm run api
npm run dev
```

Start API and frontend in separate terminals. The API defaults to port 8000 and Vite to 5173.

## Demo/local accounts

For a fresh disposable SQLite database, `npm run api:seed` creates sample data. Read `backend/prisma/seed.ts` for the exact accounts/passwords; seeding can clear sample operational tables and must not be run against shared data. For a real local app, an administrator can create additional users through the protected admin workflow.

## Database workflow

SQLite schema/migrations are under `backend/prisma/`. PostgreSQL schema/migrations are under `backend/prisma/postgresql/`. Generate and migrate using the matching scripts:

```sh
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate
npm --prefix backend run prisma:generate:postgres
npm --prefix backend run prisma:migrate:postgres
```

Review migrations before applying them. Do not reset or push schema changes to shared data without an explicit backup and review. Do not mix migration histories across SQLite and PostgreSQL.

## Checks

```sh
npm run build
npm --prefix backend run build
```

There is currently no configured lint/test script in the package manifests. Do not claim tests ran when no suite is configured. Add focused tests when a test runner is introduced and verify important workflows after business-logic changes.

## Adding or changing an API route

1. Search the whole backend for the path and confirm where the active app registers it. `backend/src/server.ts` is active; `backend/src/app.ts` is not launched by package scripts.
2. Reuse the shared Prisma instance from `src/lib/prisma.ts`.
3. Apply `auth` and the narrowest appropriate `roles(...)` check. A frontend guard is not an authorization boundary.
4. Validate body/query input, whitelist writable fields, and scope records by the authenticated user where applicable.
5. Keep race-sensitive booking/payment writes and their conflict checks inside a transaction.
6. Preserve established status codes, payload shape, and business transitions unless all consumers are deliberately migrated.
7. Use the frontend API client in `src/api.ts` so token handling and common errors stay consistent.
8. Run frontend and backend builds after the change.

## Refactoring conventions

Extract one domain at a time from the active server. Each extraction should document route ownership and preserve middleware order, response contracts, role checks, and transaction boundaries. Avoid broad rewrites and avoid deleting a route/module until repository-wide references and runtime registration have been checked.

## Troubleshooting

- **401 after sign-in:** restart both processes after changing auth mode; confirm `VITE_AUTH_MODE` equals `AUTH_MODE`.
- **Database auth startup validation:** `DATABASE_URL` must be a local `file:` path, `NODE_ENV` must not be `production`, and `JWT_SECRET` must be 32+ characters.
- **Firebase verification unavailable:** set Firebase project/Admin configuration or use Application Default Credentials in Firebase mode.
- **Prisma generated client mismatch:** regenerate against the schema selected by the backend script.
- **404 despite a route file existing:** confirm that route module is mounted by `server.ts`; files mounted only in unused `app.ts` are inactive.
