import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentMethodMatches, transactionCategory, transactionOrder } from '../src/services/transactionPresentation.js';

test('linked booking kind takes precedence over ambiguous labels; unknown history is not invented', () => {
  assert.equal(transactionCategory({ resourceType: 'booking', item: 'QA session' }, 'class'), 'Weekly Class');
  assert.equal(transactionCategory({ resourceType: 'booking', item: 'Package · old title' }, 'private_course'), 'Private Course');
  assert.equal(transactionCategory({ resourceType: 'badminton_enrollment', item: 'QA' }), 'Badminton Package');
  assert.equal(transactionCategory({ resourceType: null, item: 'Court rental · Court 1' }), 'Court Rental');
  assert.equal(transactionCategory({ resourceType: null, item: 'Unclassified historic payment' }), null);
});

test('method filters recognize legacy aliases without changing stored values', () => {
  assert.ok(paymentMethodMatches('CASH', 'Cash'));
  for (const value of ['ONLINE', 'KPay', 'Manual (simulated)']) assert.ok(paymentMethodMatches(value, 'Online Payment'));
  assert.equal(paymentMethodMatches('Cash', 'Online Payment'), false);
  assert.equal(paymentMethodMatches('Pay Later', 'Online Payment'), false);
  assert.equal(paymentMethodMatches(null, 'Cash'), false);
});

test('sort orders have stable tie breakers for pagination', () => {
  assert.deepEqual(transactionOrder('oldest'), [{ createdAt: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(transactionOrder('newest'), [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.deepEqual(transactionOrder('amount_desc'), [{ finalAmount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]);
});
