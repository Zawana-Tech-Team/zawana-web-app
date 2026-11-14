import type { Booking, Prisma } from '@prisma/client';
import { today } from './courtPolicy.js';

/** Runs inside the reservation transaction: booking is the payment action. */
export async function recordCourtRentalPayment(tx: Prisma.TransactionClient, booking: Booking, actor: { id: string; name: string }, customer = actor.name, method: 'CASH' | 'ONLINE' = 'ONLINE') {
  const transaction = await tx.transaction.create({ data: {
    userId: booking.userId, date: today(), customer, business: 'Badminton',
    item: `Court rental · ${booking.title} · ${booking.code}`, amount: booking.price,
    discount: 0, tax: 0, finalAmount: booking.price, status: 'paid',
    paymentMethod: method === 'CASH' ? 'Cash' : 'Manual (simulated)', staff: actor.name,
    resourceType: 'booking', resourceId: booking.id,
    confirmationMode: method === 'CASH' ? 'MANUAL' : 'SIMULATED', confirmedById: actor.id,
  } });
  const updated = await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'paid', paymentExpiresAt: null, reservationExpiresAt: null } });
  await tx.bookingChangeHistory.create({ data: {
    bookingId: booking.id, action: 'COURT_RENTAL_PAYMENT_RECORDED', requestedById: actor.id,
    previous: 'pending', current: JSON.stringify({ paymentStatus: 'paid', transactionId: transaction.id, method }),
    reason: 'Rental booking and payment saved together. No external gateway verification.',
  } });
  return updated;
}
