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
import { scheduleInstant } from '../services/courtChanges.js';

type Actor = { id: string; role: Role };
function safeSnapshot(value: string | null) {
  try {
    const s = value ? JSON.parse(value) : null;
    return s && typeof s.packageName === 'string' && typeof s.startDate === 'string' && typeof s.expiryDate === 'string' && Number.isFinite(s.sessionsTotal) && Number.isFinite(s.sessionsRemaining) ? s : null;
  } catch { return null; }
}
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const profileSelect = { id: true, name: true, avatar: true, email: true, phone: true, membership: true } as const;
const courseScope = (actor: Actor): Prisma.BookingWhereInput => ({ kind: 'private_course',
  ...(actor.role === 'member' ? { userId: actor.id } : actor.role === 'coach' ? { coach: { is: { userId: actor.id } } } : {}),
  OR: [{ paymentStatus: 'paid', status: { in: ['confirmed', 'CONFIRMED', 'completed', 'COMPLETED'] } }, { attendance: { isNot: null } }],
});
function completed(b: { date: string; time: string; status: string }) {
  if (['cancelled', 'CANCELLED', 'EXPIRED', 'COACH_DECLINED'].includes(b.status)) return false;
  try { return scheduleInstant(b.date, b.time, true) <= new Date(); } catch { return false; }
}
async function records(db: PrismaClient, actor: Actor, extra: Prisma.BookingWhereInput, packageWhere: Prisma.BadmintonCheckInWhereInput) {
  const [bookings, packages] = await Promise.all([
    db.booking.findMany({ where: { AND: [courseScope(actor), extra] },
      include: { attendance: true, user: { select: profileSelect }, coach: { select: { id: true, name: true } } }, orderBy: [{ date: 'asc' }, { time: 'asc' }] }),
    actor.role === 'coach' ? Promise.resolve([]) : db.badmintonCheckIn.findMany({
      where: { AND: [packageWhere, actor.role === 'member' ? { enrollment: { userId: actor.id } } : {}] },
      include: { enrollment: { include: { user: { select: profileSelect }, purchase: { select: { createdAt: true, paidAt: true } } } } }, orderBy: [{ date: 'asc' }, { time: 'asc' }] }),
  ]);
  const ids = [...new Set([...bookings.flatMap(b => b.attendance ? [b.attendance.recordedById] : []), ...packages.flatMap(p => p.staffId ? [p.staffId] : [])])];
  const names = new Map((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map(s => [s.id, s.name]));
  return [
    ...bookings.map(b => ({ id: b.id, personId: b.userId, memberId: b.userId, kind: 'course' as const, name: b.user.name, avatar: b.user.avatar,
      contact: b.user.phone || b.user.email, membership: b.user.membership, title: b.title, coach: b.coach?.name || null, coachId: b.coachId,
      categoryCode: null as string | null, source: null as string | null, sessionsDeducted: null as number | null, package: null, packageId: null, location: b.location, enrolledAt: b.createdAt.toISOString(),
      date: b.date, time: b.time, checkedInAt: b.attendance && ['present', 'late'].includes(b.attendance.status) ? b.attendance.checkedInAt.toISOString() : null,
      recordedBy: b.attendance ? names.get(b.attendance.recordedById) || 'Staff' : null, notes: b.attendance?.notes || null,
      status: b.attendance?.status || 'pending', scheduledCompleted: completed(b), bookingStatus: b.status,
      canCheckIn: actor.role !== 'member' && !b.attendance && b.date === today() && b.paymentStatus === 'paid' && ['confirmed', 'CONFIRMED'].includes(b.status),
      canCorrect: actor.role === 'admin' && !!b.attendance,
    })),
    ...packages.map(p => {
      const snapshot = safeSnapshot(p.packageSnapshot) as { packageName: string; startDate: string; expiryDate: string; sessionsTotal: number; sessionsRemaining: number; renewalCount: number; purchaseDate: string | null } | null;
      const original = snapshot ? { ...p.enrollment, packageName: snapshot.packageName, startDate: snapshot.startDate, expiryDate: snapshot.expiryDate, sessionsTotal: snapshot.sessionsTotal,
        sessionsRemaining: snapshot.renewalCount === p.enrollment.renewalCount ? p.enrollment.sessionsRemaining : snapshot.sessionsRemaining } : p.enrollment;
      return ({ id: p.id, personId: p.enrollment.userId || p.enrollment.studentId, memberId: p.enrollment.userId || p.enrollment.studentId,
      kind: 'package' as const, name: p.enrollment.studentName, avatar: p.enrollment.user?.avatar || null,
      contact: p.enrollment.phone || p.enrollment.user?.email || null, membership: p.enrollment.user?.membership || null,
      title: original.packageName, coach: null, coachId: null, location: 'Zawana Badminton Arena', enrolledAt: p.enrollment.createdAt.toISOString(),
      categoryCode: p.categoryCode, source: p.source, sessionsDeducted: p.sessionsUsed, packageId: p.enrollment.id, package: { id: p.enrollment.id, name: original.packageName, type: 'Badminton visits', categoryCode: p.categoryCode,
        purchaseDate: snapshot ? snapshot.purchaseDate : p.enrollment.purchase?.createdAt.toISOString() || null, activationDate: original.startDate, expiryDate: original.expiryDate,
        total: original.sessionsTotal, used: original.sessionsTotal - original.sessionsRemaining, remaining: original.sessionsRemaining,
        status: original.expiryDate < today() ? 'expired' : original.sessionsRemaining <= 0 ? 'exhausted' : p.enrollment.status },
      date: p.date, time: p.time, checkedInAt: ['present', 'late'].includes(p.status) ? p.createdAt.toISOString() : null, recordedBy: p.staffId ? names.get(p.staffId) || 'Staff' : 'Member self check-in',
      notes: p.note, status: p.status, scheduledCompleted: false, bookingStatus: null, canCheckIn: false, canCorrect: actor.role === 'admin',
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
    let result = await records(db, req.user!, { date: dates }, { date: dates });
    const query = String(req.query.q || '').trim().toLowerCase();
    result = result.filter(r => (!query || `${r.name} ${r.memberId} ${r.title} ${r.coach || ''} ${r.package?.name || ''} ${r.categoryCode || ''}`.toLowerCase().includes(query)) &&
      (!req.query.categoryCode || r.categoryCode === req.query.categoryCode) && (!req.query.title || r.title === req.query.title) && (!req.query.status || r.status === req.query.status) && (!req.query.coachId || r.coachId === req.query.coachId) &&
      (!req.query.packageId || r.packageId === req.query.packageId) && (!req.query.from || r.date >= String(req.query.from)) && (!req.query.to || r.date <= String(req.query.to)));
    if (req.query.export === 'csv') {
      if (req.user!.role !== 'admin') return res.status(403).json({ message: 'Only admins can export attendance.' });
      // Neutralize spreadsheet formula injection in participant-controlled strings.
      const cell = (value: unknown) => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
      res.type('text/csv').attachment(`attendance-${month}.csv`).send([
        ['Member ID', 'Participant', 'Class/package', 'Category', 'Sessions deducted', 'Source', 'Coach', 'Date', 'Time', 'Status', 'Recorded by'].map(cell).join(','),
        ...result.map(r => [r.memberId, r.name, r.title, r.categoryCode, r.sessionsDeducted, r.source, r.coach, r.date, r.time, r.status, r.recordedBy].map(cell).join(',')),
      ].join('\r\n'));
      return;
    }
    res.json({ records: result });
  }));
  router.get('/:kind/:id/detail', asyncRoute(async (req: AuthRequest, res) => {
    const actor = req.user!, id = String(req.params.id);
    let personId: string | null = null;
    if (req.params.kind === 'course') {
      const b = await db.booking.findFirst({ where: { AND: [courseScope(actor), { id }] } });
      personId = b?.userId || null;
    } else if (req.params.kind === 'package' && actor.role !== 'coach') {
      const p = await db.badmintonCheckIn.findFirst({ where: { id, ...(actor.role === 'member' ? { enrollment: { userId: actor.id } } : {}) }, include: { enrollment: true } });
      personId = p?.enrollment.userId || p?.enrollment.studentId || null;
    }
    if (!personId) return res.status(404).json({ message: 'Attendance not found.' });
    const history = await records(db, actor, { userId: personId }, { enrollment: { OR: [{ userId: personId }, { userId: null, studentId: personId }] } });
    const scheduled = history.filter(r => r.kind === 'course' && r.scheduledCompleted);
    const count = (status: string) => scheduled.filter(r => r.status === status).length;
    const bookingIds = history.map(r => r.kind === 'course' ? r.id : `package:${r.id}`);
    const modifications = actor.role === 'admin' ? await db.attendanceModification.findMany({ where: { bookingId: { in: bookingIds } }, orderBy: { createdAt: 'desc' } }) : [];
    res.json({ history, modifications, summary: { attended: count('present') + count('late'), missed: count('absent'), late: count('late'), excused: count('excused'),
      completedScheduled: scheduled.length, percentage: scheduled.length ? Math.round((count('present') + count('late')) / scheduled.length * 100) : null } });
  }));
  router.post('/packages/:id/mark', roles('admin'), asyncRoute(async (req: AuthRequest, res) => {
    const b = z.object({ status: z.enum(['present', 'absent', 'late', 'excused']), reason: z.string().trim().min(3).max(1000), notes: z.string().trim().max(2000).optional() }).parse(req.body);
    res.json(await db.$transaction(tx => correctBadmintonVisit(tx, String(req.params.id), req.user!.id, b.status, b.reason, b.notes)));
  }));
  router.post('/courses/:id/mark', roles('coach', 'admin', 'badminton_fo'), asyncRoute(async (req: AuthRequest, res) => {
    const b = z.object({ status: z.enum(['present', 'absent', 'late', 'excused']), notes: z.string().trim().max(2000).optional(), reason: z.string().trim().min(3).max(1000).optional() }).parse(req.body);
    const actor = req.user!, id = String(req.params.id);
    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "Booking" SET "date"="date" WHERE "id"=${id}`;
      const booking = await tx.booking.findFirst({ where: { id, kind: 'private_course', ...(actor.role === 'coach' ? { coach: { is: { userId: actor.id } } } : {}) }, include: { attendance: true } });
      if (!booking) throw fail('Session not found.', 404);
      if (booking.attendance) {
        if (actor.role !== 'admin') throw fail('Only admins can correct recorded attendance.', 403);
        if (!b.reason) throw fail('A reason is required to correct attendance.', 400);
        const changed = await tx.bookingAttendance.update({ where: { bookingId: id }, data: { status: b.status, notes: b.notes ?? booking.attendance.notes, recordedById: actor.id } });
        await tx.attendanceModification.create({ data: { bookingId: id, actorId: actor.id, reason: b.reason, previous: JSON.stringify(booking.attendance), current: JSON.stringify(changed) } });
        return changed;
      }
      if (booking.paymentStatus !== 'paid' || !['confirmed', 'CONFIRMED', 'completed', 'COMPLETED'].includes(booking.status) || booking.date > today() || (actor.role !== 'admin' && booking.date !== today()))
        throw fail('Only eligible paid sessions can be marked; staff marking is limited to today.');
      if (['absent', 'excused'].includes(b.status) && scheduleInstant(booking.date, booking.time) > new Date()) throw fail('A future session cannot be marked absent or excused.');
      return tx.bookingAttendance.create({ data: { bookingId: id, status: b.status, notes: b.notes, recordedById: actor.id } });
    });
    res.json(result);
  }));
  router.post('/courses/:id/check-in', roles('coach', 'admin', 'badminton_fo'), asyncRoute(async (req: AuthRequest, res) => {
    const actor = req.user!, id = String(req.params.id);
    const attendance = await db.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "Booking" SET "date"="date" WHERE "id"=${id}`;
      const booking = await tx.booking.findFirst({ where: { id, kind: 'private_course', ...(actor.role === 'coach' ? { coach: { is: { userId: actor.id } } } : {}) } });
      if (!booking) throw fail('Session not found.', 404);
      if (booking.date !== today() || booking.paymentStatus !== 'paid' || !['confirmed', 'CONFIRMED'].includes(booking.status)) throw fail('Only today’s paid, confirmed sessions can be checked in.');
      return tx.bookingAttendance.upsert({ where: { bookingId: id }, update: {}, create: { bookingId: id, recordedById: actor.id } });
    });
    res.json({ id: attendance.id, checkedInAt: attendance.checkedInAt });
  }));
  return router;
}
