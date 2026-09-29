
# Zawana Full-Stack

This version converts the existing Zawana UI from localStorage/demo state to a real API + Prisma backend.

## Stack
- Frontend: React + TypeScript + Vite + Tailwind
- Backend: Node.js + Express + TypeScript
- Database: Prisma + SQLite by default
- Auth: JWT + bcrypt
- Validation: Zod

## 1. Start backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

API: `http://localhost:8000`

Demo accounts all use:

`password123`

- member@zawana.test
- coach@zawana.test
- admin@zawana.test
- gymfo@zawana.test
- clinicfo@zawana.test
- badminton@zawana.test
- store@zawana.test
- cafe@zawana.test
- doctor@zawana.test

## 2. Start frontend

From the project root:

```bash
npm install
cp .env.example .env
npm run dev
```

The frontend defaults to `http://localhost:8000/api`.

## Main API areas

- `/api/auth/*`
- `/api/users`
- `/api/courts`
- `/api/coaches`
- `/api/schedules`
- `/api/bookings`
- `/api/bookings/availability`
- `/api/dashboard`
- `/api/packages/badminton`
- `/api/packages/gym`
- `/api/memberships`
- `/api/appointments`
- `/api/products`
- `/api/inventory`
- `/api/cafe/orders`
- `/api/students`
- `/api/transactions`
- `/api/content`
- `/api/notifications`
- `/api/analytics/overview`

## Booking flow

Member:
1. Frontend loads courts/coaches from API.
2. Availability is checked against real bookings.
3. Confirmation POSTs a booking.
4. Prisma persists it.
5. The backend rejects conflicting court/coach slots.
6. Booking appears in My Bookings from the database.
7. Cancel updates the server record.

Admin:
- `/admin/courts` — add/edit courts
- `/admin/coaches` — add/edit coaches
- `/admin/schedules` — assign coach schedule blocks
