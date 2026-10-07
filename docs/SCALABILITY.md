# Scalability notes

This document records measured frontend bundle output and current backend scaling considerations from the codebase audit. It does not claim load-test results.

## Frontend route loading

`src/App.tsx` now lazy-loads page components using React Router's route tree and a shared `Suspense` boundary. Paths, role guards, and page modules remain the same.

Local Vite production output before and after this change:

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Initial JS, minified | 976.77 kB | 432.76 kB | about 56% smaller |
| Initial JS, gzip | 264.82 kB | 132.30 kB | about 50% smaller |

The larger pages now load as separate chunks when visited. For example, the `Admin` and `Operations` page chunks remain substantial; this change reduces the initial route cost but does not shrink those page-specific chunks. Re-measure after dependency or page changes rather than treating the numbers as a permanent budget.

## Backend and data access observations

- One shared Prisma Client is used by active server code and imported modules.
- Many member-facing and selected operational list APIs cap results or accept page/limit parameters. There are also uncapped collection reads in the active server and extracted modules; review query size and index needs before data volume grows.
- `OperationsContext` loads several role-eligible collections concurrently with `Promise.allSettled`. A failed request becomes an empty collection while the first failure is exposed as a load error. This allows partial dashboards but can make a failed domain look empty; changing that state contract should be an explicit UX/API decision.
- The authentication limiter keeps state in process memory. In a multi-instance deployment, each instance has independent counters.
- No load/performance test suite was found in the package scripts during this pass. Typechecks/builds and a browser route smoke check are not capacity tests.

## Recommended follow-up sequence

1. Inventory list endpoints with their expected maximum rows, query filters, ordering, and current frontend consumers.
2. Add server-side pagination to high-volume operational lists where required, preserving existing array response behavior until all consumers can migrate together.
3. Examine Prisma query plans/indexes using representative production-like data and the matching provider schema.
4. Load-test authenticated API flows and database connection behavior before production scaling decisions.
5. If deploying multiple API instances, evaluate shared rate-limit storage and connection-pool limits.

Do not change pagination contracts, booking transactions, or notification delivery semantics as an unreviewed side effect of structural refactoring.
