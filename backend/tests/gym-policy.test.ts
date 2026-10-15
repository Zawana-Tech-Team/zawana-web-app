import test from 'node:test';
import assert from 'node:assert/strict';
import { expiryDate, normalizeGymPackage } from '../src/services/gymPolicy.js';

const base = { title: 'QA Package', kind: 'PT' as const, price: 160000, rate: 32000, sessions: 5 };
test('gym MMK pricing supports both directions and bounded integer totals', () => {
  assert.equal(normalizeGymPackage(base).rate, 32000);
  assert.equal(normalizeGymPackage({ ...base, rate: 35000, pricingMode: 'rate' }).price, 175000);
  assert.equal(normalizeGymPackage({ ...base, price: 160001 }).rate, 32000);
  assert.throws(() => normalizeGymPackage({ ...base, rate: 2000000000, pricingMode: 'rate' }));
  assert.throws(() => normalizeGymPackage({ ...base, price: 12.5 }));
  assert.throws(() => normalizeGymPackage({ ...base, price: -1 }));
});
test('gym participant invariants and training requirements', () => {
  const couple = normalizeGymPackage({ ...base, kind: 'COUPLE_PT', minMembers: 1, maxMembers: 20, coachRequired: false });
  assert.equal(couple.minMembers, 2); assert.equal(couple.maxMembers, 2); assert.equal(couple.coachRequired, true);
  assert.throws(() => normalizeGymPackage({ ...base, kind: 'GROUP_PT', minMembers: 4, maxMembers: 20 }));
  assert.throws(() => normalizeGymPackage({ ...base, kind: 'GROUP_PT', minMembers: 5, maxMembers: 4 }));
  assert.throws(() => normalizeGymPackage({ ...base, sessions: 0 }));
  assert.throws(() => normalizeGymPackage({ ...base, kind: 'MEMBERSHIP', months: 0 }));
  assert.equal(normalizeGymPackage({ ...base, kind: 'WALK_IN', sessions: 9, validityDays: 20 }).sessions, 1);
  assert.equal(normalizeGymPackage({ ...base, kind: 'WALK_IN' }).validityDays, 1);
});
test('gym validity uses inclusive dates and calendar-month clamping', () => {
  assert.equal(expiryDate('2026-10-15', 1, 90), '2026-11-14');
  assert.equal(expiryDate('2026-10-15', 3, 90), '2027-01-14');
  assert.equal(expiryDate('2026-01-31', 1, 90), '2026-02-27');
  assert.equal(expiryDate('2028-01-31', 1, 90), '2028-02-28');
  assert.equal(expiryDate('2026-10-15', 0, 1), '2026-10-15');
  assert.equal(expiryDate('2026-10-15', 0, 90), '2027-01-12');
});
