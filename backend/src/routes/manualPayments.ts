import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { auth } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { confirmManualPayment } from '../services/manualPayments.js';

export function createManualPaymentRouter(db: PrismaClient) {
  const router = Router();
  router.patch('/appointments/:id/price', auth, asyncRoute(async (req: AuthRequest, res) => {
    if (!['admin', 'clinic_fo'].includes(req.user!.role)) return res.status(403).json({ message: 'Only clinic payment staff may set a price.' });
    const input = z.object({ price: z.number().int().positive().max(2_000_000_000) }).strict().parse(req.body);
    const changed = await db.appointment.updateMany({ where: { id: String(req.params.id), paymentStatus: 'pending', status: { not: 'cancelled' } }, data: input });
    if (!changed.count) return res.status(409).json({ message: 'Only unpaid appointments may be priced.' });
    res.json(await db.appointment.findUniqueOrThrow({ where: { id: String(req.params.id) } }));
  }));
  router.post('/confirm', auth, asyncRoute(async (req: AuthRequest, res) => {
    const input = z.object({ resourceType: z.enum(['booking', 'gym_enrollment', 'badminton_package', 'appointment', 'store_order', 'cafe_order']), resourceId: z.string().min(1), confirmed: z.literal(true), method: z.enum(['Cash', 'Manual (simulated)']).default('Manual (simulated)') }).strict().parse(req.body);
    res.json(await confirmManualPayment(db, req.user!, input.resourceType, input.resourceId, input.method));
  }));
  router.post('/kpay/webhook', (_req, res) => res.status(410).json({ message: 'External checkout has been retired. No payment was recorded.' }));
  router.get('/:id', auth, asyncRoute(async (req: AuthRequest, res) => {
    const receipt = await db.transaction.findUnique({ where: { id: String(req.params.id) } });
    if (receipt) {
      if (req.user!.role === 'member' ? receipt.userId !== req.user!.id : !['admin', 'owner', 'badminton_fo', 'gym_fo', 'clinic_fo', 'store_fo', 'cafe_fo'].includes(req.user!.role)) return res.status(403).json({ message: 'Not allowed.' });
      return res.json({ ...receipt, reference: receipt.id, amount: receipt.finalAmount, currency: 'MMK', status: receipt.status.toUpperCase(), provider: receipt.confirmationMode, checkoutUrl: null, qrCode: null });
    }
    const legacy = await db.paymentAttempt.findUnique({ where: { id: String(req.params.id) } });
    if (!legacy || legacy.userId !== req.user!.id) return res.status(404).json({ message: 'Payment receipt not found.' });
    res.json({ id: legacy.id, reference: legacy.reference, resourceType: legacy.resourceType, amount: legacy.amount, status: legacy.status, currency: legacy.currency, checkoutUrl: null, qrCode: null, message: 'Legacy payment record. External checkout is retired.' });
  }));
  return router;
}
