import type { PrismaClient, Prisma } from '@prisma/client';
import type { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { credentialHash } from './authSession.js';
import { verifyFirebasePassword } from './firebasePassword.js';
import { verifyFirebaseIdToken } from './firebaseAdmin.js';
import { changeError } from './courtChanges.js';
import { checkInTransaction } from './badmintonCategory.js';
import { env } from '../config/env.js';
export function packageOperation(method: string, path: string) {
  if (!['POST', 'PATCH', 'DELETE'].includes(method)) return null;
  let normalized: string;
  try { normalized = decodeURIComponent(path).replace(/\/+$/, ''); } catch { return null; }
  const match = /^\/(?:packages\/(badminton|gym)|gym\/(packages))(?:\/([^/?]+))?(?:\/([^/?]+))?$/i.exec(normalized);
  if (!match || (match[4] && match[3].toLowerCase() !== 'categories' && match[4].toLowerCase() !== 'classify-legacy')) return null;
  const department = match[1]?.toLowerCase() === 'badminton' ? 'badminton' : 'gym';
  return { department, id: match[3]?.toLowerCase() === 'categories' ? match[4] || null : match[3] || null, path, method, category: match[3]?.toLowerCase() === 'categories', classify: match[4]?.toLowerCase() === 'classify-legacy' };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export const mutationHash = (method: string, path: string, body: unknown) => credentialHash(canonical({ method, path, body: body ?? null }));
function authorize(role: string, op: NonNullable<ReturnType<typeof packageOperation>>) {
  const allowed = op.department === 'badminton' && !op.category && !op.classify ? ['admin', 'badminton_fo'] : ['admin'];
  if (!allowed.includes(role)) throw changeError('FORBIDDEN', 'Insufficient permissions.', 403);
}
export function createPackageSecurity(db: PrismaClient, authenticate = auth, providers = { password: verifyFirebasePassword, token: verifyFirebaseIdToken }) {
  const router = Router();
  router.post('/challenge', authenticate, asyncRoute(async (req: AuthRequest, res) => {
    const input = z.object({ method: z.enum(['POST', 'PATCH', 'DELETE']), path: z.string().max(300), body: z.unknown().optional() }).strict().parse(req.body);
    const op = packageOperation(input.method, input.path);
    if (!op) throw changeError('INVALID_OPERATION', 'Unsupported package operation.', 400);
    authorize(req.user!.role, op);
    const challenge = await db.packageSecurityChallenge.create({ data: { actorId: req.user!.id, mutationHash: mutationHash(input.method, input.path, input.body), expiresAt: new Date(Date.now() + 5 * 60_000) } });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ id: challenge.id, expiresAt: challenge.expiresAt });
  }));
  router.get('/audit', authenticate, asyncRoute(async (req: AuthRequest, res) => {
    if (req.user!.role !== 'admin') throw changeError('FORBIDDEN', 'Insufficient permissions.', 403);
    res.json(await db.packageSecurityAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }));
  }));
  const protect = (req: AuthRequest, res: Response, next: NextFunction) => {
    const op = packageOperation(req.method, req.path);
    if (!op) return next();
    authenticate(req, res, error => {
      if (error) return next(error);
      void (async () => {
        // Persist the attempt before verification. Secrets never enter the ledger.
        const audit = await db.packageSecurityAudit.create({ data: { actorId: req.user!.id, packageId: op.id, action: `${op.method} ${op.path}`, changes: '{}', success: false, requestIp: req.ip } });
        authorize(req.user!.role, op);
        let rawProof: unknown;
        try { rawProof = JSON.parse(String(req.headers['x-package-verification'] || '{}')); } catch { rawProof = {}; }
        const proof = z.object({ challengeId: z.string(), password: z.string().max(1024).optional(), identityToken: z.string().max(16000).optional() }).strict().safeParse(rawProof);
        if (!proof.success) throw changeError('REAUTH_REQUIRED', 'Verify your account to save this package.', 403);
        const actor = await db.user.findUniqueOrThrow({ where: { id: req.user!.id } });
        const challenge = await db.packageSecurityChallenge.findFirst({ where: { id: proof.data.challengeId, actorId: actor.id, consumedAt: null, expiresAt: { gt: new Date() }, mutationHash: mutationHash(req.method, req.path, req.body) } });
        if (!challenge) throw changeError('REAUTH_REQUIRED', 'Verification expired or the package changed. Verify again.', 403);
        // Shared database counter applies across workers and application restarts.
        const key = `package-reauth:${actor.id}:${Math.floor(Date.now() / 600000)}`;
        const counter = await db.authAbuseCounter.upsert({ where: { key }, create: { key, count: 1, expiresAt: new Date(Date.now() + 600000) }, update: { count: { increment: 1 } } });
        if (counter.count > 5) throw changeError('RATE_LIMITED', 'Wait before trying verification again.', 429);
        let proofKey: string | null = null;
        try {
          if (env.databaseAuthEnabled && actor.passwordHash && proof.data.password) {
            if (!await bcrypt.compare(proof.data.password, actor.passwordHash)) throw new Error('invalid');
          } else {
            const claims = proof.data.identityToken ? await providers.token(proof.data.identityToken) : proof.data.password ? await providers.password(actor.email, proof.data.password) : null;
            if (!claims || claims.uid !== actor.firebaseUid || claims.auth_time < Math.floor(challenge.createdAt.getTime() / 1000) || claims.auth_time > Math.floor(Date.now() / 1000) + 30 || !['password', 'google.com', 'apple.com', 'microsoft.com', 'github.com', 'facebook.com', 'twitter.com', 'yahoo.com'].includes(claims.firebase?.sign_in_provider || '')) throw new Error('invalid');
            proofKey = `package-proof:${claims.uid}:${claims.auth_time}`;
          }
        } catch { throw changeError('REAUTH_FAILED', 'Account verification failed. Please try again.', 403); }
        await checkInTransaction(db, async tx => {
          if (proofKey) {
            const previousProof = await tx.authAbuseCounter.findUnique({ where: { key: proofKey } });
            if (previousProof) throw changeError('REAUTH_REQUIRED', 'Verification was already used. Verify again.', 403);
            await tx.authAbuseCounter.create({ data: { key: proofKey, count: 1, expiresAt: new Date(Date.now() + 3600000) } });
          }
          const consumed = await tx.packageSecurityChallenge.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
          if (consumed.count !== 1) throw changeError('REAUTH_REQUIRED', 'Verification was already used. Verify again.', 403);
        }).catch(error => {
          if (error.code === 'ALREADY_CHECKED_IN') throw changeError('REAUTH_REQUIRED', 'Verification was already used. Verify again.', 403);
          throw error;
        });
        await db.authAbuseCounter.update({ where: { key }, data: { count: { decrement: 1 } } });
        res.locals.packageAuditId = audit.id;
        next();
      })().catch(next);
    });
  };
  return { router, protect };
}

// Called inside the same transaction as the catalogue mutation.
export async function recordPackageMutation(tx: Prisma.TransactionClient, actorId: string, department: string, before: unknown, after: { id: string; title?: string; name?: string; status?: string }, auditId?: string) {
  const action = before ? 'PACKAGE_UPDATED' : 'PACKAGE_CREATED';
  const data = { actorId, packageId: after.id, action, changes: JSON.stringify({ fields: Object.keys(after).filter(key => JSON.stringify((before as Record<string, unknown> | null)?.[key]) !== JSON.stringify((after as Record<string, unknown>)[key])), before, after }), success: true };
  if (auditId) await tx.packageSecurityAudit.update({ where: { id: auditId }, data });
  else await tx.packageSecurityAudit.create({ data });
  const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId }, select: { name: true } });
  const recipients = await tx.user.findMany({ where: { active: true, deletedAt: null, role: { in: department === 'gym' ? ['admin', 'gym_fo'] : ['admin', 'badminton_fo'] } }, select: { id: true } });
  await tx.notification.createMany({ data: recipients.map(user => ({ userId: user.id, type: 'package', title: !before ? 'Package created' : ['inactive', 'archived'].includes(after.status || '') ? 'Package deactivated' : 'Package updated',
    body: `${actor.name} ${before ? 'updated' : 'created'} ${after.title || after.name || 'package configuration'}.`, entityType: `${department}-package`, entityId: after.id })) });
}
