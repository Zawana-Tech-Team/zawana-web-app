import { createHash } from 'node:crypto';
import type { PrismaClient, Role, TransactionBusiness } from '@prisma/client';
import { bookingFailure as fail } from './courtBooking.js';
import { today } from './courtPolicy.js';
import { activateGymEnrollment } from './gymEnrollments.js';
import { packageCategory } from './badmintonCategory.js';

export type PaymentActor = { id: string; name: string; role: Role };
export const simulatedMethod = 'Manual (simulated)';
export const fingerprint = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
export const operationId = (actorId: string, key: string) => fingerprint([actorId, key]);
export const paymentMetadata = (actor: PaymentActor, resourceType: string, resourceId: string, cash = false) => ({
  resourceType, resourceId, confirmationMode: cash ? 'MANUAL' : 'SIMULATED', confirmedById: actor.id,
});
export async function confirmManualPayment(db: PrismaClient, actor: PaymentActor, type: string, id: string, method = simulatedMethod) {
  const execute = () => db.$transaction(async tx => {
    const cash = method === 'Cash';
    let userId: string | null = null, customer = '', amount = 0, business: TransactionBusiness = 'Badminton', item = '';
    let existingTransactionId: string | null = null;
    let apply: (transactionId: string) => Promise<unknown>;
    const permit = (owner: string | null, staff: string[]) => {
      if (!(actor.role === 'member' ? owner === actor.id && !cash : ['admin', ...staff].includes(actor.role))) throw fail(403, 'This account cannot confirm this payment.');
    };
    const previous = () => tx.transaction.findUnique({ where: { resourceType_resourceId: { resourceType: type, resourceId: id } } });
    if (type === 'booking') {
      await tx.$executeRaw`UPDATE "Booking" SET "id"="id" WHERE "id"=${id}`;
      const b = await tx.booking.findUnique({ where: { id }, include: { user: true, coach: { select: { userId: true } } } });
      if (!b) throw fail(404, 'Booking not found.');
      permit(b.userId, b.kind === 'pt' ? ['gym_fo'] : ['badminton_fo']);
      const paid = await previous(); if (paid?.status === 'paid' && b.paymentStatus === 'paid') return { transaction: paid, message: 'Manual payment already confirmed.' };
      if (b.paymentStatus !== 'pending' || !['CONFIRMED', 'confirmed', 'pending', 'AWAITING_PAYMENT'].includes(b.status)) throw fail(409, 'This booking is not payable. Private courses require coach approval first.');
      const deadline = b.paymentExpiresAt || b.reservationExpiresAt;
      if (deadline && deadline <= new Date()) throw fail(409, 'The payment window has expired.');
      userId = b.userId; customer = b.user.name; amount = b.price; business = b.kind === 'pt' ? 'Gym' : 'Badminton'; item = `${b.title} · ${b.code}`;
      apply = async transactionId => {
        await tx.booking.update({ where: { id }, data: { paymentStatus: 'paid', status: 'CONFIRMED', paymentExpiresAt: null, reservationExpiresAt: null } });
        if (b.kind === 'private_course') await tx.privateCoursePayment.create({ data: { bookingId: id, transactionId, amount, paymentSource: cash ? 'BADMINTON_FO' : 'SIMULATED', paymentMethod: method, collectedByUserId: cash ? actor.id : null, receivedAt: new Date(), verifiedByUserId: actor.id, notes: 'Explicit manual/simulated confirmation; no external gateway verification.' } });
        await tx.bookingChangeHistory.create({ data: { bookingId: id, action: 'MANUAL_PAYMENT_CONFIRMED', previous: b.paymentStatus, current: JSON.stringify({ paymentStatus: 'paid', transactionId, method }), requestedById: actor.id, reason: 'Explicit manual/simulated payment; no externally verified charge.' } });
        if (b.coach?.userId) await tx.notification.create({ data: { userId: b.coach.userId, audience: 'coach', title: 'Session payment confirmed', body: `${b.user.name} confirmed manual/simulated payment for ${b.title} on ${b.date}.`, type: 'booking', entityType: 'booking', entityId: id, link: '/coach/bookings' } });

      };
    } else if (type === 'gym_enrollment') {
      await tx.$executeRaw`UPDATE "GymEnrollment" SET "id"="id" WHERE "id"=${id}`;
      if (cash && process.env.GYM_ALLOW_CASH_PAYMENTS !== 'true') throw fail(403, 'Gym cash collection is not enabled.');
      const b = await tx.gymEnrollment.findUnique({ where: { id }, include: { members: true } });
      if (!b) throw fail(404, 'Enrollment not found.');
      permit(b.members.some(m => m.userId === actor.id) ? actor.id : null, ['gym_fo', 'owner']);
      const updated = await activateGymEnrollment(tx, id, b.totalPrice, method, actor.id, actor.name);
      const transaction = await tx.transaction.findUniqueOrThrow({ where: { id: updated.transactionId! } });
      return { enrollment: updated, transaction, message: 'Manual payment confirmed and package activated.' };
    } else if (type === 'badminton_package') {
      await tx.$executeRaw`UPDATE "BadmintonPackagePurchase" SET "id"="id" WHERE "id"=${id}`;
      const b = await tx.badmintonPackagePurchase.findUnique({ where: { id }, include: { user: true, package: true } });
      if (!b) throw fail(404, 'Package purchase not found.');
      permit(b.userId, ['badminton_fo']);
      const paid = await previous(); if (paid?.status === 'paid' && b.status === 'PAID') return { transaction: paid, message: 'Manual payment already confirmed.' };
      if (!['PENDING', 'AWAITING_PAYMENT'].includes(b.status)) throw fail(409, 'This package request is no longer payable.');
      userId = b.userId; customer = b.user.name; amount = b.price; item = `Package · ${b.packageName} · ${b.code}`;
      apply = async () => {
        const start = today(), end = new Date(`${start}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + Math.max(0, b.package.validity - 1));
        await tx.badmintonPackagePurchase.update({ where: { id }, data: { status: 'PAID', paymentMethod: method, paidAt: new Date() } });
        await tx.badmintonEnrollment.create({ data: { studentId: b.userId, userId: b.userId, studentName: customer, phone: b.user.phone || '', packageId: b.packageId, packageName: b.packageName, categoryCode: await packageCategory(tx, b.packageId), sessionsTotal: b.package.sessions, sessionsRemaining: b.package.sessions, startDate: start, expiryDate: end.toISOString().slice(0, 10), purchaseId: id } });
        await tx.user.update({ where: { id: b.userId }, data: { membership: b.packageName } });
      };
    } else if (type === 'cafe_order') {
      await tx.$executeRaw`UPDATE "CafeOrder" SET "id"="id" WHERE "id"=${id}`;
      const b = await tx.cafeOrder.findUnique({ where: { id } });
      if (!b) throw fail(404, 'Cafe order not found.');
      permit(b.customerId, ['cafe_fo']);
      if (['CANCELLED', 'cancelled'].includes(b.status)) throw fail(409, 'Cancelled orders cannot be paid.');
      const paid = await previous(); if (paid?.status === 'paid' && b.paymentStatus === 'paid') return { transaction: paid, message: 'Manual payment already confirmed.' };
      if (b.paymentStatus !== 'pending') throw fail(409, 'This order is no longer payable.');
      userId = b.customerId; customer = b.customer; amount = b.total; business = 'Cafe'; item = `Cafe order · ${b.orderNumber || id}`; existingTransactionId = b.transactionId;
      apply = async transactionId => tx.cafeOrder.update({ where: { id }, data: { paymentStatus: 'paid', paymentMethod: cash ? 'CASH' : 'ONLINE', transactionId } });
    } else if (type === 'store_order') {
      await tx.$executeRaw`UPDATE "StoreOrder" SET "id"="id" WHERE "id"=${id}`;
      const b = await tx.storeOrder.findUnique({ where: { id } });
      if (!b) throw fail(404, 'Store order not found.');
      permit(b.userId, ['store_fo']);
      const paid = await previous(); if (paid?.status === 'paid' && b.status === 'paid') return { transaction: paid, message: 'Manual payment already confirmed.' };
      if (b.status !== 'pending') throw fail(409, 'This order is no longer payable.');
      userId = b.userId; customer = b.customer; amount = b.total; business = 'Store'; item = `Store order · ${id}`; existingTransactionId = paid?.id || null;
      apply = async () => tx.storeOrder.update({ where: { id }, data: { paid: amount, status: 'paid' } });
    } else if (type === 'appointment') {
      await tx.$executeRaw`UPDATE "Appointment" SET "id"="id" WHERE "id"=${id}`;
      const b = await tx.appointment.findUnique({ where: { id } });
      if (!b) throw fail(404, 'Appointment not found.');
      permit(b.userId, ['clinic_fo']);
      const paid = await previous(); if (paid?.status === 'paid' && b.paymentStatus === 'paid') return { transaction: paid, message: 'Manual payment already confirmed.' };
      if (b.paymentStatus !== 'pending' || b.status === 'cancelled' || b.price <= 0) throw fail(409, 'A valid service price must be recorded before payment.');
      userId = b.userId; customer = b.patient; amount = b.price; business = 'Clinic'; item = `${b.type} · ${id}`;
      apply = async () => tx.appointment.update({ where: { id }, data: { paymentStatus: 'paid' } });
    } else throw fail(400, 'Unsupported payment resource.');
    if (!Number.isSafeInteger(amount) || amount < 0) throw fail(409, 'Invalid stored payment amount.');
    const data = { ...paymentMetadata(actor, type, id, cash), paymentMethod: method, status: 'paid', staff: actor.name };
    const transaction = existingTransactionId
      ? await tx.transaction.update({ where: { id: existingTransactionId }, data })
      : await tx.transaction.create({ data: { ...data, userId, customer, date: today(), business, item, amount, discount: 0, tax: 0, finalAmount: amount } });
    await apply(transaction.id);
    await tx.paymentAttempt.updateMany({ where: { resourceId: id, status: { in: ['INITIATING', 'PENDING'] } }, data: { status: 'EXPIRED', checkoutUrl: null, qrCode: null, failureReason: 'Replaced by explicit manual confirmation.' } });
    await tx.notification.create({ data: { userId, audience: userId ? 'member' : 'admin', title: 'Manual payment confirmed', body: `${item} · ${amount.toLocaleString()} MMK. ${cash ? 'Manually confirmed cash.' : 'Simulated confirmation; no external charge.'}`, type: 'payment', entityType: 'transaction', entityId: transaction.id, link: userId ? '/payments' : '/admin/finance' } });
    return { transaction, message: cash ? 'Cash payment manually confirmed.' : 'Simulated payment confirmed. No external charge was made.' };
  }, { maxWait: 10000, timeout: 20000 });
  try { return await execute(); } catch (error) {
    // A concurrent confirmation can win a unique constraint; rerun under the same resource lock.
    if ((error as { code?: string }).code === 'P2002') return execute();
    throw error;
  }
}
