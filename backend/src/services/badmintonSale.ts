import { z } from 'zod';

export const badmintonSaleFields = {
  paymentMethod: z.enum(['Cash', 'KPay']),
  discountPercent: z.number().finite().min(0).max(100).default(0),
};

export function badmintonSaleTotals(price: number, discountPercent: number) {
  const percent = badmintonSaleFields.discountPercent.parse(discountPercent);
  if (!Number.isSafeInteger(price) || price < 0) throw new Error('Invalid package price.');
  const discount = Math.round(price * percent / 100);
  return { amount: price, discount, tax: 0, finalAmount: price - discount };
}
