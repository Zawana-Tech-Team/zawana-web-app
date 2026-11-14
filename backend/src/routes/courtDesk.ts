import { recordCourtRentalPayment } from "../services/courtRentalPayment.js";
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { auth, roles } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { bookingFailure, createCourtBooking } from '../services/courtBooking.js';
import { createStaffCourse } from '../services/privateCourseFinance.js';
import { deskPaymentInput } from '../services/deskPayment.js';

export function createCourtDeskRouter(db: PrismaClient, expire: () => Promise<void> = async () => {}) {
  const router = Router();
  router.use(auth, roles('admin', 'badminton_fo'));
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(asyncRoute(async (_req, _res, next) => { await expire(); next(); }));
  router.post('/rentals', asyncRoute(async (req: AuthRequest, res) => {
    const input = z.object({ courtId: z.string().min(1), date: z.string(), time: z.string(), customer: z.string().trim().min(1).max(100),
      expectedPrice: z.number().int().nonnegative(), requestKey: z.string().uuid(), payment: z.object({ method: z.enum(['CASH', 'ONLINE']) }).strict() }).strict().parse(req.body);
    const meta = JSON.stringify({ source: 'walk_in', customerName: input.customer, expectedPrice: input.expectedPrice, deskPayment: input.payment });
    const result = await createCourtBooking(db, req.user!, { courtId: input.courtId, date: input.date, time: input.time, meta }, input.requestKey, async (tx, rows) => {
      for (const row of rows) {
        if (row.price !== input.expectedPrice) throw bookingFailure(409, 'Price changed. Review the reservation again.');
        Object.assign(row, await recordCourtRentalPayment(tx, row, req.user!, input.customer, input.payment.method));
      }
    });
    res.status(201).json(result);
  }));
  router.post('/private-courses', asyncRoute(async (req: AuthRequest, res) => {
    const input = z.object({ memberId: z.string().min(1), courseId: z.string().min(1), coachId: z.string().min(1), courtId: z.string().min(1),
      date: z.string(), time: z.string(), expectedPrice: z.number().int().nonnegative(), requestKey: z.string().uuid(), payment: deskPaymentInput }).strict().parse(req.body);
    const { payment, ...selection } = input;
    res.status(201).json(await createStaffCourse(db, req.user!, { ...selection, paymentSource: payment.method === 'CASH' ? 'BADMINTON_FO' : 'ONLINE', reference: payment.reference }, payment));
  }));
  return router;
}
