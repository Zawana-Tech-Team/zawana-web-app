import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { fingerprint, operationId } from '../services/manualPayments.js';
import type { AuthRequest } from '../types/auth.js';

export const operationMetadata = (res: Response) => res.locals.paymentOperation || {};
/** The ledger unique key is claimed inside each existing business transaction. */
export function paymentOperation(db: PrismaClient) {
  return async (request: Request, res: Response, next: NextFunction) => {
    try {
      const req = request as AuthRequest, key = req.get('Idempotency-Key');
      if (!key) { if (req.body?.confirmed === true || /\/badminton\/enrollments|\/transactions$/.test(req.originalUrl)) return res.status(400).json({ message: 'Send an Idempotency-Key UUID so retries cannot duplicate this sale.' }); return next(); }
      z.string().uuid().parse(key);
      const requestKey = operationId(req.user!.id, key), requestHash = fingerprint([req.originalUrl, req.body]);
      res.locals.paymentOperation = { requestKey, requestHash };
      const receipt = await db.transaction.findUnique({ where: { requestKey } });
      if (!receipt) return next();
      if (receipt.requestHash !== requestHash) return res.status(409).json({ message: 'Retry key belongs to a different payment request.' });
      const id = receipt.resourceId!;
      if (receipt.resourceType === 'cafe_order') return res.status(201).json({ order: await db.cafeOrder.findUnique({ where: { id }, include: { orderItems: true } }), message: 'Existing manual confirmation restored.' });
      if (receipt.resourceType === 'store_order') return res.status(201).json(await db.storeOrder.findUnique({ where: { id } }));
      if (receipt.resourceType === 'badminton_enrollment') return res.status(201).json(await db.badmintonEnrollment.findUnique({ where: { id } }));
      return res.status(201).json(receipt);
    } catch (error) { next(error); }
  };
}
