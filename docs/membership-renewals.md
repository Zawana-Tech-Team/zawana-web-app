# Membership packages and renewal

`/membership` has two sections: **Active Packages** and **Package Store**. Active cards show the package, remaining sessions, validity and a Renew action. Check-in and personal check-in history appear once above the cards. The store shows available active packages with session count, validity, available days and price; additional schedule details appear in the review dialog. An already-owned active offer directs the member back to their active package.

Inactive, expired, exhausted and future-start enrollments are hidden from Active Packages. Existing enrollments and check-in history remain in the database. An active package is still visible when its catalogue category is archived, but archived categories cannot be sold or renewed.

## Renewal rule

As confirmed by the user, **validity restarts on the renewal date**, in Asia/Yangon, using the package's inclusive validity period. A 30-day package renewed on November 24 is valid through December 23. Validity does not extend from the previous expiry date.

For example, renewing an active 10-session package with 5 unused eligible sessions creates a new active enrollment with 15 sessions. The source becomes inactive. Only the price of the new package is recorded; carried sessions are not charged again. Expired or inactive source balances do not carry over. Renewal stays within the same registered package category.

The member reviews a server quote showing carried sessions, new sessions, total balance, dates and price. If a check-in or package edit changes the quote before confirmation, confirmation fails without recording a payment and requires a refreshed review. Members cannot set prices, discounts, dates or balances. Staff renewal uses the same transfer service while retaining existing staff payment and discount rules.

## Persistence and safety

- Migration `20261124180000_badminton_package_renewals` adds a nullable, unique `renewalOfId` self-reference to `BadmintonEnrollment`. Each source can have only one successor.
- Renewal locks the member and source enrollment in the same order as check-in, then atomically creates the purchase, successor enrollment, transaction, audit and notification and deactivates the source.
- Source balances are retained as historical values. Spendable totals must use eligible **active** enrollments only; do not sum inactive balances into entitlement.
- Actor-scoped payment keys and payload fingerprints restore a successful receipt on retry. A competing key cannot transfer the same source twice.
- Check-in still deducts exactly one session and preserves same-day category deduplication across renewal cycles. Balance-changing corrections to a transferred historical cycle require staff review rather than restoring already-carried credit.
- Migration and lifecycle processing normalize enrollment states to `active` or `inactive`. Exhausted and expired active rows become inactive. Financial purchase/payment statuses remain separate.
- The client refreshes from the shared revision/focus polling mechanism and after successful actions. Failed writes keep retry keys; a failed refresh after a completed purchase also retains its key.

Member endpoints are `GET /api/member/badminton-enrollments/:id/renewal` and `POST /api/member/badminton-enrollments/:id/renew`. The existing staff `POST /api/badminton/enrollments/:id/renew` uses the same service. Ownership and role checks apply before any payment is recorded.

Payments currently use the application's existing **simulated payment** flow; the member review explicitly states that no money is charged. This change does not add a live payment processor.

## Migration and verification

SQLite and PostgreSQL migrations are provided. The local SQLite migration was applied after making an integrity-checked backup at `/tmp/zawana-before-package-renewals-20261124-164425.db`. Booking (89), Transaction (55), BadmintonEnrollment (18), BadmintonCheckIn (29) and BadmintonPackagePurchase (10) row counts were preserved. Foreign-key and integrity checks passed. No production migration or deployment was performed.

Validation includes both Prisma schemas, frontend/backend builds, scoped lint, the backend suite, and isolated browser journeys:

```sh
npm --prefix backend test
node scripts/test-membership-renewals-browser.mjs
node scripts/test-court-package-browser.mjs
node scripts/test-package-management-browser.mjs
```

The new browser journey covers active/store separation, hidden history, early renewal, failure/retry, receipt replay, tampered input/role rejection, check-in invalidation of a stale quote, an independent category purchase, existing-offer navigation, persistence and 320/390/768/1440px layouts. Browser fixtures own temporary databases and never target configured app data. The renewal and package purchase journeys are included in the stabilization runner and Chromium CI job. Real PostgreSQL concurrency remains a CI/environment check; local validation does not substitute for it.
