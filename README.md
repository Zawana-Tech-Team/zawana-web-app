# Zawana Life Management System

Zawana Life is a multi-role sports and facility management application. The web client is a React/Vite SPA; the API is an Express/TypeScript service backed by Prisma and SQLite for local development or PostgreSQL for hosted deployments.

## Architecture

The active backend entry point is `backend/src/server.ts`. It creates the Express app, mounts the auth/store/menu routers, and currently owns many domain endpoints and business rules. Authentication is extracted into `backend/src/routes/auth.ts` and `backend/src/modules/auth`; shared auth/configuration and Prisma access live in dedicated modules. The older `backend/src/app.ts` is not used by package scripts and must not be treated as the active route registry.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for request flow and domain details, [docs/API.md](docs/API.md) for API notes, and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for contribution guidance.

## Technology stack

- Frontend: React, TypeScript, Vite, React Router, Tailwind CSS, Lucide, Recharts, Framer Motion, date-fns
- Backend: Node.js, Express, TypeScript, Zod
- Data: Prisma ORM; SQLite locally and a separate PostgreSQL schema/migration history for hosted deployments
- Identity: Firebase Authentication for Firebase mode; database username/password sessions are available only for local SQLite development

## Repository structure

```text
src/                         React application, pages, contexts, API client, shared types
backend/src/server.ts        Active Express entry point and legacy domain routes
backend/src/routes/          Extracted route modules
backend/src/modules/auth/    Auth validation and service workflows
backend/src/middleware/      Authentication, authorization, rate limiting, error handling
backend/src/services/        Firebase, payment, session, and safe user helpers
backend/src/lib/prisma.ts    Shared Prisma Client instance
backend/prisma/              SQLite schema and migrations
backend/prisma/postgresql/   PostgreSQL schema and migrations
 docs/                       Architecture, API, development, and assessment notes
```

## Frontend architecture

- `src/App.tsx` owns route composition and role guards.
- `src/components/RoleLayout.tsx` renders shared role navigation and page chrome.
- `src/pages/` contains page-level UI. Domain extraction is incremental; some pages and contexts still coordinate data loading and mutations.
- `src/api.ts` is the shared HTTP client and attaches the current auth token.
- `src/context/AuthContext.tsx` exposes the selected sign-in mode and authenticated application user.
- `src/context/OperationsContext.tsx` shares operational data/actions used by staff pages.

Prefer the shared API client and existing domain types when adding screens. Avoid duplicating authorization assumptions in the browser: backend checks are authoritative.

## Backend architecture

The active API currently has two levels of modularity:

1. Auth routes are mounted from `routes/auth.ts`; validation and identity/session work live in `modules/auth`, with shared auth middleware, session services, rate limiting, and safe serialization.
2. Many other domain routes still live in `server.ts`. A number of route modules exist and are mounted there, but `app.ts` is not the runtime entry point. Extract domains from the active server one at a time and preserve route contracts and transaction boundaries.

`lib/prisma.ts` exports the process-wide Prisma Client used by the server and router modules. Do not instantiate another client for a route module.

## Database

- `backend/prisma/schema.prisma` is the SQLite development schema.
- `backend/prisma/postgresql/schema.prisma` is the PostgreSQL schema used by the PostgreSQL-specific scripts.
- The two schemas and migration histories are maintained separately. Review both before changing shared models.
- No database schema change is required for the auth/config refactor documented here.

The Gym private-training, shared media, and Cafe order extensions are documented in [docs/GYM_TRAINING_CAFE_MEDIA.md](docs/GYM_TRAINING_CAFE_MEDIA.md). Their SQLite and PostgreSQL migrations must be applied using the corresponding migration history.

## Authentication flow

The frontend and backend modes must agree:

### Local development (`database`)

`VITE_AUTH_MODE=database` and `AUTH_MODE=database` enable username/password accounts stored in the local SQLite database. The API issues a signed database session token; protected API requests resolve the current user and role from Prisma. The backend rejects this mode in production or when `DATABASE_URL` is not a `file:` SQLite URL. `JWT_SECRET` must be a private random value of at least 32 characters.

For a fresh local database, seed demo records only if appropriate for your local work. The seed script can clear sample operational data, so use it only on a disposable database. Seeded account usernames/passwords are defined by `backend/prisma/seed.ts`; inspect that file rather than assuming credentials. Admin-created accounts use their database email/username and password.

### Firebase (`firebase`)

Set `VITE_AUTH_MODE=firebase` and `AUTH_MODE=firebase`. Firebase issues the browser ID token. The API verifies it through Firebase Admin, links it to a Zawana `User`, then loads the application role from the database. Configure the Firebase web app and Admin credentials through environment variables or Application Default Credentials. Do not put Admin credentials in frontend variables.

Changing only one mode creates an incompatible client/server pair and sign-in will fail. Firebase remains the production authentication mode; local database auth is a development convenience and is guarded server-side.

## Authorization and roles

Application roles are stored on the Zawana `User` record and enforced by backend `auth`/`roles(...)` middleware. The authenticated identity provider proves identity; the database role controls access. Frontend route guards improve navigation but do not replace server authorization. Member registration can create only a member role; elevated roles are assigned through protected administration workflows.

## Local development

Requirements: Node.js compatible with the lockfile, and npm or pnpm.

1. Install root and backend dependencies:

   ```sh
   npm install
   npm --prefix backend install
   ```

2. Copy `.env.example` to `.env` and `backend/.env.example` to `backend/.env`. Defaults select local database auth. Set a unique `JWT_SECRET` (at least 32 characters) in `backend/.env`; never commit real secrets.
3. Generate the SQLite Prisma client and apply migrations:

   ```sh
   npm --prefix backend run prisma:generate
   npm --prefix backend run prisma:migrate
   ```

4. Start the API and client in separate terminals:

   ```sh
   npm run api
   npm run dev
   ```

The API defaults to `http://localhost:8000`; Vite defaults to `http://localhost:5173`.

## Environment variables

Root `.env.example` documents `VITE_API_URL`, `VITE_AUTH_MODE`, and Firebase web-app values. `backend/.env.example` documents `DATABASE_URL`, `PORT`, `CLIENT_URL`, `PUBLIC_API_URL`, `AUTH_MODE`, `JWT_SECRET`, Firebase Admin settings, and optional KPay adapter settings. `VITE_*` values are public browser configuration; never place server secrets there.

For PostgreSQL, configure `DATABASE_URL` (pooled/runtime connection) and `DIRECT_URL` (direct connection) in the deployment environment, and use the PostgreSQL Prisma schema/scripts. Database auth mode is not allowed with PostgreSQL.

## Prisma commands

```sh
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate
npm --prefix backend run prisma:seed

npm --prefix backend run prisma:generate:postgres
npm --prefix backend run prisma:migrate:postgres
```

The seed script may clear sample operational records. Never run it against a shared or production database without reviewing the script and data impact. Do not use reset or `db push` against shared data.

## Build and checks

```sh
npm run build
npm --prefix backend run build
```

The root build runs TypeScript project checks and Vite production build. The backend build runs strict TypeScript compilation. At this time, package scripts do not define a repository-wide lint or test command; see package files for the current available checks.

## API structure

The API base path is `/api`. The auth router is mounted at `/api/auth`; extracted route modules cover selected domains, while the active `server.ts` still declares many other endpoints. See [docs/API.md](docs/API.md) and search the active server before adding an endpoint to avoid duplication. Existing API contracts should be preserved unless every consumer is updated.

## Major business workflows

- Sign-in resolves an authenticated identity to an active Zawana user and reads the role from the database.
- Court rentals and private courses use shared booking records and server-side court conflict validation.
- Package enrollment, payments, notifications, operations, clinic, gym, store, and cafe flows remain existing domain workflows; this refactor does not intentionally change their business rules.
- Payment adapter code is not evidence that live KPay merchant credentials or production payment behavior are configured. Confirm deployment configuration before representing a payment flow as live.

## Deployment

Use Firebase auth for deployed environments, PostgreSQL schema/client scripts for PostgreSQL deployments, HTTPS, strict CORS origins, managed secret storage, and reviewed forward-only migrations. Run backend and frontend builds in CI. Database username/password auth is rejected in production by runtime configuration checks.

## Common troubleshooting

- **Client login mode mismatch:** ensure root `VITE_AUTH_MODE` matches backend `AUTH_MODE`, then restart Vite and the API.
- **Database auth startup error:** check that `DATABASE_URL` is a local `file:` URL, `NODE_ENV` is not `production`, and `JWT_SECRET` is at least 32 characters.
- **Firebase token verification error:** verify the Firebase project ID and Admin credentials/ADC, and confirm the web client and API use the same project.
- **SQLite migration P3018 / table already exists:** older API versions created tables without recording Prisma migrations. Back up the database, compare its schema against a temporary database built from the migration history, and reconcile missing schema changes while preserving records. Only after verifying the schema, use `prisma migrate resolve --applied <migration-name>` for changes already present. Generating the client does not repair migration history. Do not reset a database containing records.
- **Prisma client/schema mismatch:** run the matching generate command for the selected schema, then restart the API.
- **Route returns 404:** check `backend/src/server.ts` and the router mounts there. `backend/src/app.ts` is currently not started by package scripts.
- **CORS failure:** set `CLIENT_URL` to the exact client origin(s), comma-separated when needed.
