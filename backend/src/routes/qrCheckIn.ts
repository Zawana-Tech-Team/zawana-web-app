import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, roles } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { today } from '../services/courtPolicy.js';
import { credentialHash, newCredential } from '../services/authSession.js';
import { changeError } from '../services/courtChanges.js';
import { createBadmintonVisit } from '../services/badmintonAttendance.js';
import { categoryCodeInput, checkInTransaction, selectCategoryEnrollment } from '../services/badmintonCategory.js';
const tokenInput = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
async function validateQr(tx: Prisma.TransactionClient, token: string, lock: boolean) {
  const found = await tx.badmintonEntryQr.findUnique({ where: { tokenHash: credentialHash(token) } });
  if (!found) throw changeError('QR_INVALID', 'This QR code is invalid. Ask the front desk for a new code.');
  // Issuance, revocation and scan lock issuer then QR in the same order.
  if (lock) {
    await tx.$executeRaw`UPDATE "User" SET "active"="active" WHERE "id"=${found.createdById}`;
    await tx.$executeRaw`UPDATE "BadmintonEntryQr" SET "expiresAt"="expiresAt" WHERE "id"=${found.id}`;
  }
  const qr = await tx.badmintonEntryQr.findUniqueOrThrow({ where: { id: found.id } });
  if (qr.revokedAt) throw changeError('QR_REVOKED', 'This QR code has been revoked. Ask the front desk for a new code.');
  if (qr.expiresAt.getTime() <= Date.now()) throw changeError('QR_EXPIRED', 'This QR code has expired. Ask the front desk for a new code.');
  const issuer = await tx.user.findFirst({ where: { id: qr.createdById, active: true, deletedAt: null, role: { in: ['admin', 'badminton_fo'] } } });
  if (!issuer) throw changeError('QR_ISSUER_INACTIVE', 'This QR issuer is no longer authorized. Ask the front desk for a new code.');
  const category = categoryCodeInput.safeParse(qr.categoryCode);
  if (!category.success) throw changeError('QR_CATEGORY_REQUIRED', 'This older QR has no category. Ask the front desk to generate a new code.');
  return { qr, categoryCode: category.data };
}
export function createQrCheckInRouter(db: PrismaClient = prisma, authenticate = auth) {
  const router = Router();
  router.use(authenticate, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.post('/qr', roles('admin', 'badminton_fo'), asyncRoute(async (req: AuthRequest, res) => {
    const { categoryCode } = z.object({ categoryCode: categoryCodeInput }).strict().parse(req.body);
    const token = newCredential(), expiresAt = new Date(Date.now() + 60 * 60_000);
    const qr = await checkInTransaction(db, async tx => {
      await tx.$executeRaw`UPDATE "User" SET "active"="active" WHERE "id"=${req.user!.id}`;
      const category = await tx.badmintonPackageCategory.findUnique({ where: { code: categoryCode } });
      if (!category?.active) throw changeError('CATEGORY_UNAVAILABLE', 'This category is unavailable. Ask an administrator to review its configuration.');
      await tx.badmintonEntryQr.updateMany({ where: { createdById: req.user!.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return tx.badmintonEntryQr.create({ data: { tokenHash: credentialHash(token), categoryCode, createdById: req.user!.id, expiresAt } });
    });
    res.status(201).json({ id: qr.id, token, categoryCode, createdAt: qr.createdAt, expiresAt });
  }));
  router.delete('/qr/:id', roles('admin', 'badminton_fo'), asyncRoute(async (req: AuthRequest, res) => {
    await checkInTransaction(db, async tx => {
      const qr = await tx.badmintonEntryQr.findFirst({ where: { id: String(req.params.id), ...(req.user!.role === 'admin' ? {} : { createdById: req.user!.id }) } });
      if (!qr) throw changeError('QR_NOT_FOUND', 'QR code not found.', 404);
      await tx.$executeRaw`UPDATE "User" SET "active"="active" WHERE "id"=${qr.createdById}`;
      await tx.badmintonEntryQr.update({ where: { id: qr.id }, data: { revokedAt: new Date() } });
    });
    res.json({ revoked: true });
  }));
  router.post('/preview', roles('member'), asyncRoute(async (req: AuthRequest, res) => {
    const { token } = tokenInput.parse(req.body);
    const result = await db.$transaction(async tx => {
      const { categoryCode } = await validateQr(tx, token, false);
      const enrollment = await selectCategoryEnrollment(tx, req.user!.id, categoryCode);
      return { categoryCode, enrollment: { id: enrollment.id, packageName: enrollment.packageName, sessionsRemaining: enrollment.sessionsRemaining, expiryDate: enrollment.expiryDate }, sessionsDeducted: 1, expectedRemaining: enrollment.sessionsRemaining - 1 };
    });
    res.json(result);
  }));
  router.post('/scan', roles('member'), asyncRoute(async (req: AuthRequest, res) => {
    const { token } = tokenInput.parse(req.body);
    const result = await checkInTransaction(db, async tx => {
      const { qr, categoryCode } = await validateQr(tx, token, true);
      const selected = await selectCategoryEnrollment(tx, req.user!.id, categoryCode, true);
      const result = await createBadmintonVisit(tx, selected.id, null, 'Member QR check-in', qr.id);
      await tx.badmintonQrVisit.create({ data: { userId: req.user!.id, date: today(), categoryCode, qrId: qr.id, checkInId: result.checkIn.id } });
      return result;
    });
    res.status(201).json(result);
  }));
  return router;
}
