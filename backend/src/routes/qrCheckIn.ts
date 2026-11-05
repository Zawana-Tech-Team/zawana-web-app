import { canManageCategoryQr } from '../services/categoryQrPolicy.js';
import { Router } from 'express';
import type { Prisma, PrismaClient, BadmintonEntryQr } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
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
const scanInput = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
function encryptionKey() {
  const secret = process.env.QR_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (secret.length < 32) throw changeError('QR_CONFIGURATION', 'QR encryption requires a stable server key.', 503);
  return createHash('sha256').update(secret).digest();
}
function encrypt(token: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  return Buffer.concat([iv, cipher.update(token), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
function decrypt(value: string) {
  const bytes = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString();
}
type Db = PrismaClient | Prisma.TransactionClient;
async function describe(db: Db, qr: BadmintonEntryQr) {
  const [checkInCount, recent] = await Promise.all([
    db.badmintonQrRedemption.count({ where: { qrId: qr.id } }),
    db.badmintonQrRedemption.findMany({ where: { qrId: qr.id },
      select: { attendanceId: true, redeemedAt: true, attendance: { select: { enrollment: { select: { studentName: true, packageName: true } } } } }, orderBy: { redeemedAt: 'desc' }, take: 20 }),
  ]);
  const status = qr.status === 'ACTIVE' && qr.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : qr.status;
  return { id: qr.id, categoryCode: qr.categoryCode, status, createdAt: qr.createdAt, expiresAt: qr.expiresAt, serverNow: new Date(), checkInCount,
    token: status === 'ACTIVE' && qr.encryptedToken ? decrypt(qr.encryptedToken) : undefined,
    recentCheckIns: recent.map(row => ({ id: row.attendanceId, redeemedAt: row.redeemedAt, memberName: row.attendance.enrollment.studentName, packageName: row.attendance.enrollment.packageName })) };
}
const alreadyRedeemed = () => changeError('QR_ALREADY_REDEEMED', 'You have already checked in using this QR code.');
async function validateQr(tx: Prisma.TransactionClient, token: string, memberId: string, lock: boolean) {
  if (lock) {
    const changed = await tx.user.updateMany({ where: { id: memberId, active: true, deletedAt: null, role: 'member' }, data: { active: true } });
    if (!changed.count) throw changeError('MEMBER_UNAVAILABLE', 'This member is unavailable for check-in.');
  }
  const found = await tx.badmintonEntryQr.findUnique({ where: { tokenHash: credentialHash(token) } });
  if (!found || found.kind !== 'CATEGORY' || found.memberId) throw changeError('QR_INVALID', 'This QR code is invalid. Please request a category QR code.');
  // Scans serialize this QR; generation and revocation take the same row lock after the slot lock.
  if (lock) await tx.$executeRaw`UPDATE "BadmintonEntryQr" SET "expiresAt"="expiresAt" WHERE "id"=${found.id}`;
  const qr = await tx.badmintonEntryQr.findUniqueOrThrow({ where: { id: found.id } });
  if (qr.revokedAt || qr.status === 'REVOKED') throw changeError('QR_REVOKED', 'This QR code was revoked or replaced. Please request a new QR code.');
  if (qr.status !== 'ACTIVE' || qr.expiresAt.getTime() <= Date.now()) throw changeError('QR_EXPIRED', 'QR code expired. Please request a new QR code.');
  if (!await canManageCategoryQr(tx, qr.createdById)) throw changeError('QR_ISSUER_INACTIVE', 'The QR issuer is no longer authorized. Please request a new QR code.');
  const category = categoryCodeInput.safeParse(qr.categoryCode);
  if (!category.success) throw changeError('QR_INVALID', 'This QR code has no valid category.');
  if (await tx.badmintonQrRedemption.findUnique({ where: { qrId_memberId: { qrId: qr.id, memberId } } })) throw alreadyRedeemed();
  return { qr, categoryCode: category.data };
}
export function createQrCheckInRouter(db: PrismaClient = prisma, authenticate = auth) {
  const router = Router();
  router.use(authenticate, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const staff = asyncRoute(async (req: AuthRequest, _res, next) => {
    if (!await canManageCategoryQr(db, req.user!.id)) throw changeError('FORBIDDEN', 'Badminton staff access required.', 403);
    next();
  });
  router.get('/qr', staff, asyncRoute(async (req: AuthRequest, res) => {
    await db.badmintonEntryQr.updateMany({ where: { kind: 'CATEGORY', status: 'ACTIVE', expiresAt: { lte: new Date() } }, data: { status: 'EXPIRED' } });
    const slots = await db.badmintonQrDeskSlot.findMany({ orderBy: { id: 'asc' }, include: { qr: true } });
    res.json({ slots: await Promise.all(slots.map(async slot => ({ slot: slot.id, qr: slot.qr ? await describe(db, slot.qr) : null }))) });
  }));
  router.get('/qr/:id', staff, asyncRoute(async (req: AuthRequest, res) => {
    const qr = await db.badmintonEntryQr.findUnique({ where: { id: String(req.params.id) } });
    if (!qr || qr.kind !== 'CATEGORY') throw changeError('QR_NOT_FOUND', 'QR code not found.', 404);
    res.json(await describe(db, qr));
  }));
  router.post('/qr', staff, asyncRoute(async (req: AuthRequest, res) => {
    const { slot, categoryCode, regenerate } = z.object({ slot: z.number().int().min(1).max(2).default(1), categoryCode: categoryCodeInput, regenerate: z.boolean().default(false) }).strict().parse(req.body);
    const qr = await checkInTransaction(db, async tx => {
      // Sorted desk locks prevent concurrent writers from choosing the same category in both slots.
      for (const id of [1, 2]) await tx.$executeRaw`UPDATE "BadmintonQrDeskSlot" SET "updatedAt"="updatedAt" WHERE "id"=${id}`;
      if (!await tx.badmintonPackageCategory.findFirst({ where: { code: categoryCode, active: true } })) throw changeError('CATEGORY_UNAVAILABLE', 'This category is unavailable. Ask an administrator to review it.');
      const slots = await tx.badmintonQrDeskSlot.findMany({ include: { qr: true } });
      const existing = slots.find(s => s.id === slot)?.qr;
      const live = (value: BadmintonEntryQr | null | undefined) => value && value.status === 'ACTIVE' && !value.revokedAt && value.expiresAt.getTime() > Date.now();
      if (slots.some(s => s.id !== slot && live(s.qr) && s.qr!.categoryCode === categoryCode)) throw changeError('QR_CATEGORY_DISPLAYED', 'This category is already active in the other QR slot.');
      if (live(existing) && !regenerate && await canManageCategoryQr(tx, existing!.createdById)) {
        if (existing!.categoryCode !== categoryCode) throw changeError('QR_SLOT_OCCUPIED', 'This slot has a valid QR. Use Replace QR to change its category.');
        return existing!;
      }
      if (existing) {
        await tx.$executeRaw`UPDATE "BadmintonEntryQr" SET "expiresAt"="expiresAt" WHERE "id"=${existing.id}`;
        await tx.badmintonEntryQr.updateMany({ where: { id: existing.id, status: 'ACTIVE' }, data: { status: existing.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : 'REVOKED', revokedAt: existing.expiresAt.getTime() <= Date.now() ? null : new Date() } });
      }
      const token = newCredential(), createdAt = new Date();
      const row = await tx.badmintonEntryQr.create({ data: { kind: 'CATEGORY', categoryCode, authorizedCategories: JSON.stringify([categoryCode]), tokenHash: credentialHash(token), encryptedToken: encrypt(token), createdById: req.user!.id, createdAt, expiresAt: new Date(createdAt.getTime() + 120 * 60_000) } });
      await tx.badmintonQrDeskSlot.update({ where: { id: slot }, data: { qrId: row.id } });
      return row;
    });
    res.status(201).json({ slot, ...await describe(db, qr) });
  }));
  router.delete('/qr/:id', staff, asyncRoute(async (req, res) => {
    await checkInTransaction(db, async tx => {
      const initial = await tx.badmintonQrDeskSlot.findFirst({ where: { qrId: String(req.params.id) } });
      if (!initial) throw changeError('QR_NOT_FOUND', 'QR code not found.', 404);
      await tx.$executeRaw`UPDATE "BadmintonQrDeskSlot" SET "updatedAt"="updatedAt" WHERE "id"=${initial.id}`;
      // Stale revoke requests must never affect a replacement token.
      await tx.badmintonEntryQr.updateMany({ where: { id: String(req.params.id), kind: 'CATEGORY', status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
    });
    res.json({ revoked: true });
  }));
  router.post('/preview', roles('member'), asyncRoute(async (req: AuthRequest, res) => {
    const { token } = scanInput.parse(req.body);
    res.json(await db.$transaction(async tx => {
      const { qr, categoryCode } = await validateQr(tx, token, req.user!.id, false);
      const enrollment = await selectCategoryEnrollment(tx, req.user!.id, categoryCode);
      return { qrId: qr.id, categoryCode, enrollment: { id: enrollment.id, packageName: enrollment.packageName, sessionsRemaining: enrollment.sessionsRemaining, expiryDate: enrollment.expiryDate }, sessionsDeducted: 1, expectedRemaining: enrollment.sessionsRemaining - 1 };
    }));
  }));
  router.post('/scan', roles('member'), asyncRoute(async (req: AuthRequest, res) => {
    const { token } = scanInput.parse(req.body);
    const result = await checkInTransaction(db, async tx => {
      const { qr, categoryCode } = await validateQr(tx, token, req.user!.id, true);
      const selected = await selectCategoryEnrollment(tx, req.user!.id, categoryCode);
      const result = await createBadmintonVisit(tx, selected.id, null, 'Category QR check-in', qr.id);
      // Recheck at commit: waiting on another debit must not extend a token's lifetime.
      const stillActive = await tx.badmintonEntryQr.updateMany({ where: { id: qr.id, status: 'ACTIVE', revokedAt: null, expiresAt: { gt: new Date() } }, data: { status: 'ACTIVE' } });
      if (!stillActive.count) throw changeError('QR_EXPIRED', 'QR code expired. Please request a new QR code.');
      await tx.badmintonQrRedemption.create({ data: { qrId: qr.id, memberId: req.user!.id, enrollmentId: result.enrollment.id, attendanceId: result.checkIn.id } });
      await tx.badmintonQrVisit.create({ data: { userId: req.user!.id, date: today(), categoryCode, qrId: qr.id, checkInId: result.checkIn.id } });
      return result;
    });
    res.status(201).json(result);
  }));
  return router;
}
