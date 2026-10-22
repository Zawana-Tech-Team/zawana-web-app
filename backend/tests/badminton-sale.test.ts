import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { badmintonSaleFields, badmintonSaleTotals } from '../src/services/badmintonSale.js';

const input = z.object(badmintonSaleFields);
test('front desk accepts Cash and KPay and defaults existing sales to no discount', () => {
  for (const paymentMethod of ['Cash', 'KPay']) {
    assert.deepEqual(input.parse({ paymentMethod }), { paymentMethod, discountPercent: 0 });
  }
  assert.throws(() => input.parse({ paymentMethod: 'Card' }));
});
test('percentage discounts preserve the original price and round to whole MMK', () => {
  assert.deepEqual(badmintonSaleTotals(150000, 10), { amount: 150000, discount: 15000, tax: 0, finalAmount: 135000 });
  assert.equal(badmintonSaleTotals(999, 12.5).finalAmount, 874);
  assert.equal(badmintonSaleTotals(150000, 0).finalAmount, 150000);
  assert.equal(badmintonSaleTotals(150000, 100).finalAmount, 0);
});
test('invalid discounts cannot create a negative or inflated sale', () => {
  for (const discountPercent of [-1, 100.01, Infinity, NaN, '10']) {
    assert.throws(() => input.parse({ paymentMethod: 'Cash', discountPercent }));
  }
  assert.throws(() => badmintonSaleTotals(-100, 10));
});
