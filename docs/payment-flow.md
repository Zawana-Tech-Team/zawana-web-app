# Direct KBZPay payment flow

The booking payment action, member notification page, notification bell, operations
inbox and gym payment form use `src/services/paymentFlow.ts` to start the existing
payment endpoint. There is no separate KPay checkout confirmation screen.

1. The action shows a loading state and shares any initialization already in flight
   for that endpoint.
2. The backend creates or reuses the existing payment attempt and booking reference.
3. An HTTPS provider URL opens immediately in the same browser tab. The previous
   history entry becomes `/payment/:id`, so Back opens verification without
   initiating another payment. Provider return URLs already target this route.
4. A QR-only response opens `/payment/:id` directly as the payment interface.
5. The status page reads `/api/payments/:id`, polls pending attempts, and refreshes
   on browser focus or page restoration. It does not infer success from return URL
   parameters. Pending sessions offer a resume link; terminal sessions do not.
6. The existing signed, amount/reference-matched backend callback alone completes
   online payment and updates the associated booking, package and ledger. Payment
   initiation and provider return never activate a service.

Gym cash collection retains its existing authorized collection form. Staff can
return to payment verification with their existing role layout; payment ownership
and staff permissions remain enforced by the API. Online payment notifications
are not explicitly cleared by the payment action before verification.

Provider cancellation stays pending until the adapter reports its existing FAILED
or EXPIRED callback status; leaving the provider page is not evidence of failure.
The UI also recognizes CANCELLED if a backend supplies that status.

## Validation

- `npm run build`
- `npm --prefix backend run typecheck`
- `npm --prefix backend run build`
- From `backend`: `./node_modules/.bin/tsx --test tests/private-course.test.ts tests/gym-management.test.ts`
- `node scripts/test-payment-browser.mjs`

Browser tests use mocked provider/API responses on desktop and mobile viewports.
They cover direct redirect, loading, duplicate suppression, provider Back/return,
refresh, backend-reported success/failure/cancellation/expiry, QR-only payment and
initialization errors. Backend tests exercise real temporary SQLite databases,
HTTP APIs and signed callbacks, including concurrent initialization, callback
replay protection and failed-payment retries.

Live merchant processing requires the existing configured approved adapter and
sandbox validation. No gateway was replaced. This repository contains the web
application; a separate native mobile application was not modified or tested.
