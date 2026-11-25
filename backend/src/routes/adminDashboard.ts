import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { auth, roles } from '../middleware/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { adminDashboard } from '../services/adminDashboard.js';

export function createAdminDashboardRouter(db:PrismaClient,authenticate=auth){
 const router=Router();
 router.get('/',authenticate,roles('admin'),asyncRoute(async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await adminDashboard(db));}));
 return router;
}
