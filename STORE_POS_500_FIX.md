# Store/POS 500 fix

The backend now prepares the Store/POS tables at startup for older local SQLite databases.

It also includes a Prisma migration for clean deployments.

If you have an existing database, restart the backend. The server will create missing `ProductCategory` and `CafeMenuItem` tables automatically and seed the default records only when absent.
