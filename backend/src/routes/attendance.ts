import { canManageCategoryQr } from '../services/categoryQrPolicy.js';
import { correctBadmintonVisit } from "../services/badmintonAttendance.js";
import { Router } from 'express';
import type { Prisma, PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, roles } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { isDateKey } from '../utils/dateKeys.js';
import { today } from '../services/courtPolicy.js';
import { readWeeklyAttendanceClass } from '../services/weeklyAttendance.js';

type Actor = { id: string; role: Role };
function safeSnapshot(value: string | null) {
  try {
    const s = value ? JSON.parse(value) : null;
    return s && typeof s.packageName === 'string' && typeof s.startDate === 'string' && typeof s.expiryDate === 'string' && Number.isFinite(s.sessionsTotal) && Number.isFinite(s.sessionsRemaining) ? s : null;
  } catch { return null; }
}
const profileSelect = { id: true, name: true, avatar: true, email: true, phone: true, membership: true } as const;
async function records(db: PrismaClient, actor: Actor, packageWhere: Prisma.BadmintonCheckInWhereInput) {
  const packages = await db.badmintonCheckIn.findMany({
    where: { AND: [packageWhere, actor.role === 'member' ? { enrollment: { userId: actor.id } } : {}] },
    include: { enrollment: { include: { user: { select: profileSelect }, purchase: { select: { createdAt: true, paidAt: true } } } } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }, { id: 'asc' }],
  });
  const ids = [...new Set(packages.flatMap(p => p.staffId ? [p.staffId] : []))];
  const names = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map(s => [s.id, s.name]));
  return [
    ...packages.map(p => {
      const snapshot = safeSnapshot(p.packageSnapshot) as { packageName: string; startDate: string; expiryDate: string; sessionsTotal: number; sessionsRemaining: number; renewalCount: number; purchaseDate: string | null; weeklyClass?: unknown } | null;
      const weeklyClass = readWeeklyAttendanceClass(snapshot?.weeklyClass, p.date, p.categoryCode);
      const original = snapshot ? { ...p.enrollment, packageName: snapshot.packageName, startDate: snapshot.startDate, expiryDate: snapshot.expiryDate, sessionsTotal: snapshot.sessionsTotal,
        sessionsRemaining: snapshot.renewalCount === p.enrollment.renewalCount ? p.enrollment.sessionsRemaining : snapshot.sessionsRemaining } : p.enrollment;
      return ({ id: p.id, personId: p.enrollment.userId || p.enrollment.studentId, memberId: p.enrollment.userId || p.enrollment.studentId,
      kind: 'package' as const, name: p.enrollment.studentName, avatar: p.enrollment.user?.avatar || null,
      contact: p.enrollment.phone || p.enrollment.user?.email || null, membership: p.enrollment.user?.membership || null,
      title: weeklyClass?.title || original.packageName, weeklyClass, coach: null, coachId: null, location: weeklyClass?.courts.map(court => court.floor ? `${court.name} (${court.floor})` : court.name).join(', ') || 'Zawana Badminton Arena', enrolledAt: p.enrollment.createdAt.toISOString(),
      categoryCode: p.categoryCode, source: p.source, sessionsDeducted: p.sessionsUsed, packageId: p.enrollment.id, package: { id: p.enrollment.id, name: original.packageName, type: 'Badminton visits', categoryCode: p.categoryCode,
        purchaseDate: snapshot ? snapshot.purchaseDate : p.enrollment.purchase?.createdAt.toISOString() || null, activationDate: original.startDate, expiryDate: original.expiryDate,
        total: original.sessionsTotal, used: original.sessionsTotal - original.sessionsRemaining, remaining: original.sessionsRemaining,
        status: original.expiryDate < today() ? 'expired' : original.sessionsRemaining <= 0 ? 'exhausted' : p.enrollment.status },
      date: p.date, time: p.time, checkedInAt: ['present', 'late'].includes(p.status) ? p.createdAt.toISOString() : null, recordedBy: p.staffId ? names.get(p.staffId) || 'Staff' : 'Member self check-in',
      notes: p.note, status: p.status, canCheckIn: false, canCorrect: actor.role === 'admin',
    }); }),
  ];
}
export function createAttendanceRouter(db: PrismaClient = prisma, authenticate = auth) {
  const router = Router();
  router.use(authenticate, roles('member', 'coach', 'admin', 'badminton_fo'));
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/', asyncRoute(async (req: AuthRequest, res) => {
    const month = z.string().regex(/^\d{4}-\d{2}$/).parse(req.query.month);
    if (!isDateKey(`${month}-01`)) return res.status(400).json({ message: 'Choose a valid month.' });
    for (const key of ['from', 'to'] as const) if (req.query[key] && !isDateKey(String(req.query[key]))) return res.status(400).json({ message: 'Choose valid filter dates.' });
    const from = String(req.query.from || ''), to = String(req.query.to || '');
    if (from && to && from > to) return res.status(400).json({ message: 'The start date must be on or before the end date.' });
    const dates = { gte: from || `${(to || month).slice(0, 7)}-01`, lte: to || `${(from || month).slice(0, 7)}-31` };
    let result = await records(db, req.user!, { date: dates });
    const query = String(req.query.q || '').trim().toLowerCase();
    result = result.filter(r => (!query || `${r.name} ${r.memberId} ${r.title} ${r.coach || ''} ${r.package?.name || ''} ${r.categoryCode || ''}`.toLowerCase().includes(query)) &&
      (!req.query.categoryCode || r.categoryCode === req.query.categoryCode) && (!req.query.title || r.title === req.query.title) && (!req.query.status || r.status === req.query.status) && (!req.query.coachId || r.coachId === req.query.coachId) &&
      (!req.query.packageId || r.packageId === req.query.packageId) && (!req.query.from || r.date >= String(req.query.from)) && (!req.query.to || r.date <= String(req.query.to)));
    if (req.query.export === 'csv') {
      if (req.user!.role !== 'admin') return res.status(403).json({ message: 'Only admins can export attendance.' });
      // Neutralize spreadsheet formula injection in participant-controlled strings.
      const cell = (value: unknown) => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
      res.type('text/csv').attachment(`attendance-${month}.csv`).send([
        ['Member ID', 'Participant', 'Weekly class', 'Package', 'Category', 'Sessions deducted', 'Source', 'Date', 'Check-in time', 'Class time', 'Location', 'Status', 'Recorded by'].map(cell).join(','),
        ...result.map(r => [r.memberId, r.name, r.weeklyClass?.title, r.package.name, r.categoryCode, r.sessionsDeducted, r.source, r.date, r.time, r.weeklyClass ? `${r.weeklyClass.start} — ${r.weeklyClass.end}` : '', r.location, r.status, r.recordedBy].map(cell).join(',')),
      ].join('\r\n'));
      return;
    }
    res.json({ records: result, permissions: { categoryQr: await canManageCategoryQr(db, req.user!.id) } });
  }));
  router.get('/:kind/:id/detail', asyncRoute(async (req: AuthRequest, res) => {
    const actor = req.user!, id = String(req.params.id);
    let personId: string | null = null;
    if (req.params.kind === 'package') {
      const p = await db.badmintonCheckIn.findFirst({ where: { id, ...(actor.role === 'member' ? { enrollment: { userId: actor.id } } : {}) }, include: { enrollment: true } });
      personId = p?.enrollment.userId || p?.enrollment.studentId || null;
    }
    if (!personId) return res.status(404).json({ message: 'Attendance not found.' });
    const history = await records(db, actor, { enrollment: { OR: [{ userId: personId }, { userId: null, studentId: personId }] } });
    const count = (status: string) => history.filter(r => r.status === status).length;
    const bookingIds = history.map(r => `package:${r.id}`);
    const modifications = actor.role === 'admin' ? await db.attendanceModification.findMany({ where: { bookingId: { in: bookingIds } }, orderBy: { createdAt: 'desc' } }) : [];
    const activePackages = await db.badmintonEnrollment.findMany({ where: { OR: [{ userId: personId }, { userId: null, studentId: personId }], status: 'active', startDate: { lte: today() }, expiryDate: { gte: today() } },
      select: { id: true, packageName: true, categoryCode: true, sessionsTotal: true, sessionsRemaining: true, expiryDate: true }, orderBy: { expiryDate: 'asc' } });
    res.json({ history, modifications, activePackages, summary: { attended: count('present') + count('late'), missed: count('absent'), late: count('late'), excused: count('excused'),
      recordedVisits: history.length, sessionsUsed: history.reduce((total, row) => total + row.sessionsDeducted, 0),
      weeklyClassVisits: history.filter(row => row.weeklyClass && ['present', 'late'].includes(row.status)).length } });
  }));
  router.post('/packages/:id/mark', roles('admin'), asyncRoute(async (req: AuthRequest, res) => {
    const b = z.object({ status: z.enum(['present', 'absent', 'late', 'excused']), reason: z.string().trim().min(3).max(1000), notes: z.string().trim().max(2000).optional() }).parse(req.body);
    res.json(await db.$transaction(tx => correctBadmintonVisit(tx, String(req.params.id), req.user!.id, b.status, b.reason, b.notes)));
  }));
  // Old links must not create private-course attendance or modify retained legacy records.
  router.post(['/courses/:id/mark', '/courses/:id/check-in'], roles('coach', 'admin', 'badminton_fo'), (_req, res) => {
    res.status(410).json({ message: 'Attendance is recorded through package check-in for weekly classes. Private courses are managed in bookings.' });
  });
  return router;
}
