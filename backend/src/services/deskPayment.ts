import { createHash } from 'node:crypto';
import type { Booking, Prisma } from '@prisma/client';
import { z } from 'zod';
import { today } from './courtPolicy.js';
import { bookingFailure } from './courtBooking.js';

export const deskPaymentInput = z.object({
  method: z.enum(['CASH', 'ONLINE']),
  received: z.literal(true),
  reference: z.string().trim().max(200).default(''),
}).strict().superRefine((value, context) => {
  if (value.method === 'ONLINE' && value.reference.length < 3)
    context.addIssue({ code: 'custom', path: ['reference'], message: 'Enter the existing online payment reference.' });
});
export type DeskPayment = z.infer<typeof deskPaymentInput>;
type Actor = { id: string; role: string; name: string };

/** Manual staff attestation, never a provider-verified receipt or a checkout request. */
export async function recordDeskPayment(tx: Prisma.TransactionClient, booking: Booking, actor: Actor, raw: DeskPayment, customer: string, awaitCoach = false) {
  if (!['admin', 'badminton_fo'].includes(actor.role)) throw bookingFailure(403, 'Only authorized desk staff can record this payment.');
  const payment = deskPaymentInput.parse(raw);
  if (payment.method === 'ONLINE') {
    const [providerReceipt, existingReceipt] = await Promise.all([
      tx.paymentAttempt.findFirst({ where: { providerReference: payment.reference, status: 'SUCCEEDED' } }),
      tx.privateCoursePayment.findFirst({ where: { OR: [{ externalReceiptReference: payment.reference }, { providerReference: payment.reference }] } }),
    ]);
    if (providerReceipt || existingReceipt) throw bookingFailure(409, 'This receipt already belongs to a recorded payment. Reconcile that payment instead of posting another sale.');
  }
  const id = payment.method === 'ONLINE'
    ? `desk-online-${createHash('sha256').update(payment.reference.toLowerCase()).digest('hex')}`
    : `desk-cash-${booking.id}`;
  // The primary key claims each manual online reference globally and atomically,
  // including concurrent receipts entered by different staff on different courts.
  if (await tx.transaction.findUnique({ where: { id } })) throw bookingFailure(409, 'This online receipt or cash collection has already been recorded.');
  const sale = await tx.transaction.create({ data: {
    resourceType: 'booking', resourceId: booking.id, confirmationMode: 'MANUAL', confirmedById: actor.id,
    id, userId: booking.userId, date: today(), customer, business: 'Badminton',
    item: `${booking.kind === 'private_course' ? 'Private course' : 'Court rental'} · ${booking.title} · ${booking.code}`,
    amount: booking.price, discount: 0, tax: 0, finalAmount: booking.price,
    paymentMethod: payment.method === 'CASH' ? 'Cash' : 'Online (staff verified)', staff: actor.name, status: 'paid',
  } });
  if (booking.kind === 'private_course') await tx.privateCoursePayment.create({ data: {
    bookingId: booking.id, transactionId: sale.id, amount: booking.price,
    paymentSource: payment.method === 'CASH' ? 'BADMINTON_FO' : 'ONLINE',
    paymentMethod: payment.method === 'CASH' ? 'CASH' : 'MANUAL_ONLINE',
    collectedByUserId: payment.method === 'CASH' ? actor.id : null,
    receivedAt: new Date(), verifiedByUserId: actor.id, verifiedAt: new Date(),
    externalReceiptReference: payment.reference || null,
    notes: 'Received payment recorded by desk staff; coach approval remains separate. No provider verification inferred.',
  } });
  const updated = await tx.booking.update({ where: { id: booking.id }, data: {
    paymentStatus: 'paid', status: awaitCoach ? 'PENDING_COACH_CONFIRMATION' : booking.status,
    paymentExpiresAt: null, reservationExpiresAt: null,
  } });
  await tx.bookingChangeHistory.create({ data: {
    bookingId: booking.id, action: 'DESK_PAYMENT_RECORDED',
    previous: JSON.stringify({ paymentStatus: booking.paymentStatus, status: booking.status }),
    current: JSON.stringify({ paymentStatus: 'paid', status: updated.status, transactionId: sale.id, method: payment.method, reference: payment.reference }),
    requestedById: actor.id, approvedById: actor.id,
    reason: payment.method === 'CASH' ? 'Staff confirmed cash personally received at booking.' : 'Staff confirmed receipt of an existing online payment; reference recorded.',
  } });
  return updated;
}
