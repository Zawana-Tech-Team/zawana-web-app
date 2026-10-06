# Refactoring assessment

## Current shape

- The frontend is a Vite/React application with role routes in `src/App.tsx`, shared UI in `src/components`, three cross-page contexts, and mostly flat page files under `src/pages`.
- The frontend API client is centralized in `src/api.ts`. Authentication currently supports Firebase mode and the local database-backed mode requested for development.
- Backend scripts run `backend/src/server.ts`. It is approximately 1,465 lines and combines startup, compatibility migrations, route declarations, input parsing, database operations, and booking/payment rules.
- `backend/src/app.ts` composes many routers but is not used by the current `dev` or `start` scripts. Several of its routers overlap with routes still declared in `server.ts`; switching to it wholesale would change or drop behavior.
- The active server and router modules now share `backend/src/lib/prisma.ts`, avoiding duplicate Prisma clients in one process.
- Backend responsibilities are partly modularized in `routes`, `middleware`, `services`, and `utils`, but the active server remains the source of truth for many domains.
- SQLite and PostgreSQL have separate Prisma schemas/migration histories. They must be treated as two maintained deployment targets, not mechanically consolidated.
- The auth route/service boundary, shared runtime configuration, database-session service, rate-limit factory, and safe-user serializer have been extracted. The frontend can still select local database or Firebase mode, with the backend preventing database auth outside local SQLite development.
- README and developer documentation now explain the actual auth modes and active server routing; they should be kept in sync as more routes are extracted.

## Largest refactoring risks

- Moving route registration from the active server to the unused app could silently break endpoints and role checks.
- Booking, private-course, availability, and payment transitions are implemented across handlers and Prisma transactions; extraction must preserve transaction boundaries and response contracts.
- Local database authentication and Firebase authentication use different token issuers. The selected mode must be explicit, and database-issued sessions must remain local-only.
- Several contexts/pages use broad `any` types and combine data loading, transformation, mutations, and UI. Replacing these all at once would make regressions difficult to isolate.

## Incremental plan

1. Keep the active server and route contracts stable; establish a single Prisma client and one auth router/service boundary. **Completed for auth and Prisma access.**
2. Document local database auth versus Firebase deployment auth and centralize runtime configuration. **Completed for the current auth/config needs.**
3. Extract profile and simple backend domains from the active server one at a time, retaining compatibility paths and checking exact route contracts.
4. Centralize frontend domain constants/types and progressively split the largest pages/contexts by feature.
5. Consolidate the active Express application only after all mounted endpoints have owners and parity is verified.

## Baseline constraints

- Do not rewrite or reset the SQLite database or either migration history.
- Do not alter booking, package, payment, notification, or role behavior as part of structural changes.
- Preserve existing uncommitted work in the repository, including package-manager metadata and generated artifacts.

## Work completed in this pass

- Added validated auth mode/port/database configuration in `backend/src/config/env.ts` and kept `src/config.ts` as a compatibility export.
- Extracted login, registration, Firebase profile linking, and MFA metadata logic into `modules/auth` and mounted one auth router from the active server.
- Centralized the app-user projection, rate-limit factory, and database session token helpers; authentication and route modules use the shared Prisma client.
- Updated root and docs onboarding materials to reflect local username/password and Firebase modes, active entrypoint, separate database schemas, commands, and known limits.
- No Prisma schema or migration changes were made for this refactor pass.

## Remaining work and verification limits

- `server.ts` still owns most application routes/business logic; this pass is a safe first extraction, not completion of the full modularization roadmap.
- Frontend pages and `OperationsContext` still contain large responsibilities and broad types. Refactor domain by domain.
- No automated test runner is configured in the package manifests. Frontend and backend compilation/build were run, but API integration, authorization, and workflow regression tests were not available in this pass.
- The frontend build reports an existing large JavaScript chunk warning; output is successful, but code splitting is a future performance task.
