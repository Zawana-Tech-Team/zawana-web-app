import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { auth, roles } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { isDateKey } from '../utils/dateKeys.js';
import { today } from '../services/courtPolicy.js';

export function createAttendanceRouter(db: PrismaClient = prisma, authenticate = auth) {
  const router = Router();
  router.use(authenticate, roles('member', 'coach', 'admin', 'badminton_fo'));
  router.get('/', asyncRoute(async (req: AuthRequest, res) => {
    const month = z.string().regex(/^\d{4}-\d{2}$/).parse(req.query.month);
    if (!isDateKey(`${month}-01`)) return res.status(400).json({ message: 'Choose a valid month.' });
    const dates = { gte: `${month}-01`, lte: `${month}-31` };
    const actor = req.user!;
    // Stable account relations enforce visibility; names and phone numbers are never authorization keys.
    const coachScope = { coach: { is: { userId: actor.id } } };
    const bookings = await db.booking.findMany({
      where: { kind: 'private_course', date: dates,
        ...(actor.role === 'member' ? { userId: actor.id } : actor.role === 'coach' ? coachScope : {}),
        OR: [{ paymentStatus: 'paid', status: { in: ['confirmed', 'CONFIRMED', 'completed', 'COMPLETED'] } }, { attendance: { isNot: null } }],
      },
      include: { attendance: true, user: { select: { name: true } }, coach: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });
    const packages = actor.role === 'coach' ? [] : await db.badmintonCheckIn.findMany({
      where: { date: dates, ...(actor.role === 'member' ? { enrollment: { userId: actor.id } } : {}) },
      include: { enrollment: { select: { studentName: true, packageName: true, userId: true, studentId: true } } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });
    const recorderIds = [...new Set([...bookings.flatMap(b => b.attendance ? [b.attendance.recordedById] : []), ...packages.flatMap(p => p.staffId ? [p.staffId] : [])])];
    const staff = await db.user.findMany({ where: { id: { in: recorderIds } }, select: { id: true, name: true } });
    const names = new Map(staff.map(s => [s.id, s.name]));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ records: [
      ...bookings.map(b => ({ id: b.id, personId: b.userId, kind: 'course', name: b.user.name, title: b.title, coach: b.coach?.name || null,
        date: b.date, time: b.time, checkedInAt: b.attendance?.checkedInAt.toISOString() || null,
        recordedBy: b.attendance ? names.get(b.attendance.recordedById) || 'Staff' : null,
        status: b.attendance ? 'present' : 'scheduled',
        canCheckIn: actor.role !== 'member' && !b.attendance && b.date === today() && b.paymentStatus === 'paid' && ['confirmed', 'CONFIRMED'].includes(b.status),
      })),
      ...packages.map(p => ({ id: p.id, personId: p.enrollment.userId || p.enrollment.studentId, kind: 'package', name: p.enrollment.studentName, title: p.enrollment.packageName,
        coach: null, date: p.date, time: p.time, checkedInAt: p.createdAt.toISOString(),
        recordedBy: p.staffId ? names.get(p.staffId) || 'Staff' : 'Member self check-in', status: 'present', canCheckIn: false,
      })),
    ] });
  }));
  router.post('/courses/:id/check-in', roles('coach', 'admin', 'badminton_fo'), asyncRoute(async (req: AuthRequest, res) => {
    const actor = req.user!;
    const booking = await db.booking.findFirst({ where: { id: String(req.params.id), kind: 'private_course',
      ...(actor.role === 'coach' ? { coach: { is: { userId: actor.id } } } : {}),
    } });
    if (!booking) return res.status(404).json({ message: 'Session not found.' });
    if (booking.date !== today() || booking.paymentStatus !== 'paid' || !['confirmed', 'CONFIRMED'].includes(booking.status))
      return res.status(409).json({ message: 'Only today’s paid, confirmed sessions can be checked in.' });
    // Upsert preserves the original timestamp/recorder when a request is retried.
    const attendance = await db.$transaction(async tx => {
      // Lock the eligible booking so cancellation/payment changes cannot race a check-in.
      const eligible = await tx.booking.updateMany({ where: { id: booking.id, date: today(), paymentStatus: 'paid',
        status: { in: ['confirmed', 'CONFIRMED'] },
        ...(actor.role === 'coach' ? { coach: { is: { userId: actor.id } } } : {}),
      }, data: { date: today() } });
      if (!eligible.count) throw Object.assign(new Error('This session is no longer available for check-in.'), { statusCode: 409 });
      return tx.bookingAttendance.upsert({ where: { bookingId: booking.id }, update: {},
        create: { bookingId: booking.id, recordedById: actor.id } });
    });
    res.json({ id: attendance.id, checkedInAt: attendance.checkedInAt });
  }));
  return router;
}
