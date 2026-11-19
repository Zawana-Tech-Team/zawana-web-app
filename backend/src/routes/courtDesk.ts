import { isDateKey } from '../utils/dateKeys.js';
import { occupyingStatuses } from '../services/courtBooking.js';
import { reserveDeskWeekly, reserveWeeklySelections } from '../services/deskWeekly.js';
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
  router.get('/rentals', asyncRoute(async (req, res) => {
    const date = String(req.query.date || '');
    if (!isDateKey(date)) throw bookingFailure(400, 'Choose a valid booking date.');
    const rows = await db.booking.findMany({ where: { date, kind: 'court', status: { in: occupyingStatuses } }, include: { court: true, user: { select: { id: true, name: true, role: true } } }, orderBy: { id: 'asc' } });
    res.json(rows.map(row => {
      let meta: { customerName?: string; source?: string } = {};
      try { meta = JSON.parse(row.meta || '{}'); } catch { /* Keep legacy records readable. */ }
      return { id: row.id, courtId: row.courtId, customer: meta.customerName || row.user.name, customerAccountId: row.user.role === 'member' && meta.source !== 'walk_in' ? row.user.id : null, customerName: meta.customerName || (row.user.role === 'member' ? row.user.name : null), court: row.court?.name || row.title, date: row.date, time: row.time, session: 60, price: row.price, paymentStatus: row.paymentStatus, status: row.status };
    }));
  }));
  router.post('/weekly', asyncRoute(async (req: AuthRequest, res) => {
    if (req.body.selections) {
      const input = z.object({ selections: z.array(z.object({ courtId: z.string().min(1), date: z.string(), time: z.string() }).strict()).min(1).max(30), title: z.string().trim().min(1).max(120), requestKey: z.string().uuid() }).strict().parse(req.body);
      res.status(201).json(await reserveWeeklySelections(db, req.user!.id, input)); return;
    }
    const input = z.object({ courtIds: z.array(z.string().min(1)).min(1).max(20), date: z.string(), time: z.string(), title: z.string().trim().min(1).max(120), requestKey: z.string().uuid() }).strict().parse(req.body);
    res.status(201).json(await reserveDeskWeekly(db, req.user!.id, input));
  }));
  router.post('/rentals', asyncRoute(async (req: AuthRequest, res) => {
    const input = z.object({ courtId: z.string().min(1).optional(), courtIds: z.array(z.string().min(1)).min(1).max(20).optional(), selections: z.array(z.object({ courtId: z.string().min(1), date: z.string(), time: z.string() }).strict()).min(1).max(30).optional(), date: z.string().optional(), time: z.string().optional(), customer: z.string().trim().min(1).max(100),
      expectedPrice: z.number().int().nonnegative(), requestKey: z.string().uuid(), payment: z.object({ method: z.enum(['CASH', 'ONLINE']) }).strict() }).strict().refine(input => input.selections ? !input.courtId && !input.courtIds : (!!input.courtId !== !!input.courtIds) && !!input.date && !!input.time, 'Choose explicit sessions, or courts with a date and time.').parse(req.body);
    const courtIds = input.courtIds || [input.courtId!];
    const meta = JSON.stringify({ source: 'walk_in', customerName: input.customer, expectedPrice: input.expectedPrice, deskPayment: input.payment });
    const result = await createCourtBooking(db, req.user!, { bookings: input.selections || courtIds.map(courtId => ({ courtId, date: input.date!, time: input.time! })), meta }, input.requestKey, async (tx, rows) => {
      if (rows.reduce((sum, row) => sum + row.price, 0) !== input.expectedPrice) throw bookingFailure(409, 'Price changed. Review the reservation again.');
      for (const row of rows) {
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
