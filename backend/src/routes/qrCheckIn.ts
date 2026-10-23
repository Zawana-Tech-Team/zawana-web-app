import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, roles } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { today, businessNow } from '../services/courtPolicy.js';
import { credentialHash, newCredential } from '../services/authSession.js';
const fail = (message: string, code: string) => { throw Object.assign(new Error(message), { statusCode: 409, code }); };
export function createQrCheckInRouter(db: PrismaClient = prisma, authenticate = auth) {
  const router = Router();
  router.use(authenticate, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.post('/qr', roles('admin', 'badminton_fo'), asyncRoute(async (req: AuthRequest, res) => {
    const token = newCredential(), expiresAt = new Date(Date.now() + 60 * 60_000);
    const qr = await db.$transaction(async tx => {
      await tx.badmintonEntryQr.updateMany({ where: { createdById: req.user!.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return tx.badmintonEntryQr.create({ data: { tokenHash: credentialHash(token), createdById: req.user!.id, expiresAt } });
    });
    res.status(201).json({ id: qr.id, token, expiresAt });
  }));
  router.delete('/qr/:id', roles('admin', 'badminton_fo'), asyncRoute(async (req: AuthRequest, res) => {
    await db.badmintonEntryQr.updateMany({ where: { id: String(req.params.id), ...(req.user!.role === 'admin' ? {} : { createdById: req.user!.id }) }, data: { revokedAt: new Date() } });
    res.json({ revoked: true });
  }));
  router.post('/scan', roles('member'), asyncRoute(async (req: AuthRequest, res) => {
    const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().parse(req.body);
    const result = await db.$transaction(async tx => {
      const qr = await tx.badmintonEntryQr.findUnique({ where: { tokenHash: credentialHash(token) } });
      const issuer = qr && await tx.user.findFirst({ where: { id: qr.createdById, active: true, deletedAt: null, role: { in: ['admin', 'badminton_fo'] } } });
      if (!qr || !issuer || qr.revokedAt || qr.expiresAt.getTime() <= Date.now()) fail('This QR code has expired. Ask the front desk for a new code.', 'QR_EXPIRED');
      const date = today(), time = `${String(businessNow().hour).padStart(2, '0')}:${String(businessNow().minute).padStart(2, '0')}`, userId = req.user!.id;
      // Serialize this member's scans, including scans against different packages/QRs.
      const member = await tx.user.updateMany({ where: { id: userId, active: true, deletedAt: null, role: 'member' }, data: { active: true } });
      if (!member.count) fail('Your account is not available for check-in.', 'ACCOUNT_INACTIVE');
      if (await tx.badmintonQrVisit.findUnique({ where: { userId_date: { userId, date } } }) ||
        await tx.badmintonCheckIn.findFirst({ where: { date, enrollment: { OR: [{ userId }, { studentId: userId }] } } }))
        fail('You have already checked in today. No session was deducted.', 'ALREADY_CHECKED_IN');
      const enrollment = await tx.badmintonEnrollment.findFirst({ where: { OR: [{ userId }, { studentId: userId }], status: 'active', startDate: { lte: date }, expiryDate: { gte: date }, sessionsRemaining: { gt: 0 } }, orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
      if (!enrollment) fail('No active package with remaining sessions was found. Please visit the front desk.', 'NO_ACTIVE_PACKAGE');
      const selected = enrollment!;
      const updated = await tx.badmintonEnrollment.updateMany({ where: { id: selected.id, status: 'active', startDate: { lte: date }, expiryDate: { gte: date }, sessionsRemaining: { gt: 0 }, checkIns: { none: { date } } }, data: { sessionsRemaining: { decrement: 1 }, lastCheckIn: `${date} ${time}` } });
      if (!updated.count) fail('This package is no longer available. Refresh and try again.', 'CHECK_IN_CONFLICT');
      const checkIn = await tx.badmintonCheckIn.create({ data: { enrollmentId: selected.id, date, time, sessionsUsed: 1, note: 'Member QR check-in' } });
      await tx.badmintonQrVisit.create({ data: { userId, date, checkInId: checkIn.id } });
      return { checkIn, enrollment: await tx.badmintonEnrollment.findUniqueOrThrow({ where: { id: selected.id } }) };
    });
    res.status(201).json(result);
  }));
  return router;
}
