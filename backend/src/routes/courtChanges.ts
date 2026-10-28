import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { auth, roles } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { courtChangeDetail, quoteCourtChange, rescheduleCourt, requestCourtCancellation, reviewCourtCancellation } from '../services/courtChanges.js';
const target = z.object({ date: z.string(), time: z.string(), courtId: z.string().min(1), exceptionReason: z.string().trim().min(5).max(1000).optional() });
export function createCourtChangeRouter(db: PrismaClient, authenticate = auth) {
  const router = Router();
  router.use(authenticate, roles('member', 'admin', 'badminton_fo'));
  router.get('/:id/changes', asyncRoute(async (req: AuthRequest, res) => res.json(await courtChangeDetail(db, String(req.params.id), req.user!))));
  router.post('/:id/reschedule/quote', asyncRoute(async (req: AuthRequest, res) => {
    const b = target.parse(req.body);
    res.json(await quoteCourtChange(db, String(req.params.id), req.user!, b, b.exceptionReason));
  }));
  router.post('/:id/reschedule', asyncRoute(async (req: AuthRequest, res) => {
    const b = target.extend({ revision: z.string().min(1), reason: z.string().trim().min(3).max(1000) }).parse(req.body);
    res.json(await rescheduleCourt(db, String(req.params.id), req.user!, b, b.revision, b.reason, b.exceptionReason));
  }));
  router.post('/:id/cancellation-requests', asyncRoute(async (req: AuthRequest, res) => {
    const b = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(req.body);
    res.status(201).json(await requestCourtCancellation(db, String(req.params.id), req.user!, b.reason));
  }));
  router.post('/:id/cancellation-requests/:requestId/review', roles('admin', 'badminton_fo'), asyncRoute(async (req: AuthRequest, res) => {
    const b = z.object({ approve: z.boolean(), reason: z.string().trim().min(3).max(1000) }).parse(req.body);
    res.json(await reviewCourtCancellation(db, String(req.params.id), String(req.params.requestId), req.user!, b.approve, b.reason));
  }));
  return router;
}
