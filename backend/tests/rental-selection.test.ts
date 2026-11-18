import test from 'node:test';
import assert from 'node:assert/strict';
import { canCombineRentals } from '../../src/components/court-desk/rentalSelection.js';

test('rentals on the same member account can have different customer names', () => {
  assert.equal(canCombineRentals([{ customerAccountId: 'member-1', customerName: 'Alex' }],
    { customerAccountId: 'member-1', customerName: 'Family booking' }), true);
});
test('same-name rentals match across accounts and walk-ins with normalized spacing and case', () => {
  assert.equal(canCombineRentals([{ customerAccountId: 'member-1', customerName: '  Alex   Tan ' }],
    { customerAccountId: 'member-2', customerName: 'alex tan' }), true);
  assert.equal(canCombineRentals([{ customerAccountId: null, customerName: 'Alex Tan' }],
    { customerAccountId: null, customerName: 'alex tan' }), true);
});
test('unrelated customers and missing identities cannot be grouped', () => {
  assert.equal(canCombineRentals([{ customerAccountId: 'member-1', customerName: 'Alex' }],
    { customerAccountId: 'member-2', customerName: 'Sam' }), false);
  assert.equal(canCombineRentals([{ customerAccountId: null, customerName: 'First walk-in' }],
    { customerAccountId: null, customerName: 'Second walk-in' }), false);
  assert.equal(canCombineRentals([{}], {}), false);
  assert.equal(canCombineRentals([{ customerName: ' ' }], { customerName: '  ' }), false);
});
test('matching one selected booking cannot bridge unrelated customers into a batch', () => {
  assert.equal(canCombineRentals([
    { customerAccountId: 'member-1', customerName: 'Alex' },
    { customerAccountId: 'member-1', customerName: 'Sam' },
  ], { customerAccountId: 'member-2', customerName: 'Alex' }), false);
});
