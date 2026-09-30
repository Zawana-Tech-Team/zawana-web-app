# Store / POS 404 Fix

The API startup script uses `backend/src/server.ts`. The Store/POS and Menu routers are now registered there.

After extracting the project:

1. `cd backend`
2. `npm ci`
3. `npx prisma generate`
4. `npx prisma migrate deploy`
5. Start the API with `npm run dev` (or build/start in production).

The affected endpoints are:
- GET/POST/PATCH/DELETE `/api/menu`
- GET/POST/PATCH/DELETE `/api/store/categories`
- POST `/api/store/products/import`
- GET/POST `/api/store/orders`
