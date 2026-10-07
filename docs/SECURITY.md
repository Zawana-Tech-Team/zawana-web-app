# Security overview

This document describes the current code paths inspected during the production refactor. It is an engineering snapshot, not a substitute for a deployment-specific security review.

## Identity and roles

- Firebase Authentication verifies external sign-in identity. Protected API requests resolve the Firebase UID to an active Zawana `User` record; the database role is used for authorization.
- Local database username/password sessions are explicitly limited to local SQLite development. `backend/src/config/env.ts` rejects database auth in production and requires a sufficiently long `JWT_SECRET` when local database auth is enabled.
- The `auth` middleware reloads active user and role data for each authenticated request. The `roles(...)` middleware enforces the allowed application roles.
- Firebase Admin credentials belong only on the backend. Never expose service-account credentials or private signing secrets in frontend configuration.

## Request boundary

- CORS origins are configured through `CLIENT_URL`; production configuration requires HTTPS origins.
- JSON request bodies have an 8 MB limit. Several routes use Zod validation, but validation coverage is not uniform across all handlers in the active `server.ts`.
- Authentication routes use the shared rate-limit factory. Its current storage is an in-process `Map`; it does not share counters across multiple API instances and is not a general API-wide limiter.
- Production error handling logs limited error metadata and avoids returning internal exception detail. Continue checking new routes for safe error responses.

## Authorization review guardrails

For each new or refactored endpoint, verify:

1. It uses authentication unless intentionally public.
2. It checks the caller's role server-side.
3. Member/coach resources are scoped to the authenticated user's linked record and cannot be selected by trusting a client-supplied owner ID.
4. Status transitions, payment completion, booking conflicts, and check-in eligibility are enforced by the API and database transaction path, not by UI state alone.
5. Inputs are parsed and bounded before Prisma/raw SQL or filesystem operations.

The active `backend/src/server.ts` is the authority for many routes. Extracted route files and the older `backend/src/app.ts` are not automatically equivalent; do not infer active authorization behavior from an unmounted router.

## Deployment requirements

Production startup currently requires Firebase auth, PostgreSQL `DATABASE_URL`, `DIRECT_URL` for Prisma migrations, persistent `UPLOADS_DIR`, HTTPS `CLIENT_URL` origin(s), `PUBLIC_API_URL`, and Firebase project configuration. Keep these values in the deployment secret/configuration manager. Do not commit `.env` files or production credentials.

## Review limits and follow-up

- This refactor pass did not run penetration tests, role-matrix API tests, or authenticated end-to-end flows.
- Authentication and role middleware were inspected, but every endpoint was not independently audited for object-level authorization.
- Review rate-limit deployment topology before horizontal scaling; use a shared limiter store if distributed enforcement is required.
- Complete a route-by-route validation/object-authorization audit alongside each future domain extraction. Fixes that change who may access an endpoint should be reviewed as a security behavior change, not hidden inside a structural refactor.
