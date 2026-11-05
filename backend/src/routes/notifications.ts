import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth } from '../middleware/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import type { AuthRequest } from '../types/auth.js';
import { changeError } from '../services/courtChanges.js';
import { notificationLifecycle, NOTIFICATION_LIFETIME_MS } from '../services/notificationLifecycle.js';
export function createNotificationRouter(db: PrismaClient = prisma, authenticate = auth) {
  const router = Router();
  const scope = (req: AuthRequest) => ({ OR: [{ userId: req.user!.id }, { userId: null, audience: 'all' }, { userId: null, audience: req.user!.role }] });
  router.get('/', authenticate, asyncRoute(async (req: AuthRequest, res) => {
    const history = req.query.history === '1';
    const rows = await db.notification.findMany({ where: { ...scope(req), ...(history ? {} : { activeInInbox: true, createdAt: { gt: new Date(Date.now() - NOTIFICATION_LIFETIME_MS) }, recipientReads: { none: { userId: req.user!.id } }, AND: [{ OR: [{ userId: null }, { read: false }] }] }) }, include: { recipientReads: { where: { userId: req.user!.id } } }, orderBy: { createdAt: 'desc' }, take: 100 });
    const lifecycle = await notificationLifecycle(db, rows);
    const archiveIds = lifecycle.filter(row => !row.activeInInbox).map(row => row.id);
    if (archiveIds.length) await db.notification.updateMany({ where: { id: { in: archiveIds }, activeInInbox: true }, data: { activeInInbox: false } });
    const items = lifecycle.map((row, index) => {
      const { recipientReads, ...original } = rows[index];
      const read = recipientReads.length > 0 || (row.userId === req.user!.id && row.read);
      return { ...original, expiresAt: row.expiresAt, read, readAt: recipientReads[0]?.readAt || null, activeInInbox: row.activeInInbox && !read };
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json(history ? items : items.filter(n => n.activeInInbox));
  }));
  const read = async (req: AuthRequest, ids: string[]) => {
    const unique = [...new Set(ids)];
    return db.$transaction(async tx => {
      const items = await tx.notification.findMany({ where: { id: { in: unique }, ...scope(req) } });
      if (items.length !== unique.length) throw changeError('NOTIFICATION_NOT_FOUND', 'Notification not found.', 404);
      for (const item of items) await tx.notificationRead.upsert({ where: { notificationId_userId: { notificationId: item.id, userId: req.user!.id } }, create: { notificationId: item.id, userId: req.user!.id }, update: {} });
      return items.map(item => ({ ...item, read: true, activeInInbox: false }));
    });
  };
  router.post('/read', authenticate, asyncRoute(async (req: AuthRequest, res) => {
    const { ids } = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }).strict().parse(req.body);
    await read(req, ids); res.json({ removedIds: [...new Set(ids)] });
  }));
  router.patch('/:id/read', authenticate, asyncRoute(async (req: AuthRequest, res) => {
    res.json((await read(req, [String(req.params.id)]))[0]);
  }));
  return router;
}
export default createNotificationRouter();
