
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

## Badminton court booking rules
- Court rentals are fixed to 60-minute slots from 06:00 AM through 09:00 PM (15 slots).
- Base court price applies from 06:00 AM–03:00 PM.
- 03:00 PM–09:00 PM automatically adds 5,000 MMK.
- A configured `HolidayRate` overrides the normal/peak price; the default holiday rate is 30,000 MMK.
- `CourtBlock` records reserve a court for academy classes or other facility use and prevent customer bookings.
- Front Office court desk supports walk-in bookings and class/facility reservations.
- Booking, court block, holiday-rate, badminton-package, and gym-package records expose edit/delete APIs where applicable.
