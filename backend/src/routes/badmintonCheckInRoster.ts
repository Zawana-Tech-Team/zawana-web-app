import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { auth, roles } from '../middleware/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { badmintonCheckInRoster } from '../services/badmintonCheckInRoster.js';

export function createBadmintonCheckInRosterRouter(db: PrismaClient, authenticate = auth) {
  const router = Router();
  router.get('/', authenticate, roles('admin', 'badminton_fo'), asyncRoute(async (req, res) => {
    const filters = z.object({ q: z.string().trim().max(120).default(''), category: z.string().max(40).default(''), page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json(await badmintonCheckInRoster(db, filters));
  }));
  return router;
}
