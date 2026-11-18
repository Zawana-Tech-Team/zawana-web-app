import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { auth, roles } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { isDateKey } from '../utils/dateKeys.js';
import { blockOccurs } from '../services/blockSchedule.js';
import { bookingFailure, occupyingStatuses } from '../services/courtBooking.js';
import { overlaps } from '../services/courtPolicy.js';
import { digest } from '../services/deskMoves.js';
const dateInput = z.string().refine(isDateKey, 'Choose a valid local date.');
const datesInput = z.array(dateInput).min(1).max(366).transform(dates => [...new Set(dates)].sort());
async function preview(tx: Prisma.TransactionClient, dates: string[]) {
  const [blocks, overrides] = await Promise.all([tx.courtBlock.findMany({ where: { active: true, type: 'class' }, include: { court: { select: { name: true } } }, orderBy: { id: 'asc' } }), tx.courtDateOverride.findMany({ where: { date: { in: dates } }, orderBy: { date: 'asc' } })]);
  if (overrides.some(o => o.type === 'closed')) throw bookingFailure(409, 'A selected date has an existing facility closure. Holiday management does not change closures.');
  const days = dates.map(date => ({ date, sessions: blocks.filter(b => blockOccurs(b, date)).map(b => ({ id: b.id, courtId: b.courtId, courtName: b.court.name, title: b.title, start: b.start, end: b.end })) }));
  return { days, count: days.reduce((n, d) => n + d.sessions.length, 0), revision: digest({ days, overrides }) };
}
export function createHolidayRouter(db: PrismaClient, authenticate = auth) {
  const r = Router(); r.use(authenticate, roles('admin', 'badminton_fo'));
  r.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  r.get('/', asyncRoute(async (_req, res) => res.json(await db.courtDateOverride.findMany({ where: { OR: [{ weeklyOnly: true }, { type: 'open' }] }, orderBy: { date: 'asc' } }))));
  r.post('/preview', asyncRoute(async (req, res) => { const { dates } = z.object({ dates: datesInput }).parse(req.body); res.json(await db.$transaction(tx => preview(tx, dates))); }));
  r.post('/', asyncRoute(async (req: AuthRequest, res) => {
    const { dates, revision } = z.object({ dates: datesInput, revision: z.string().min(1) }).strict().parse(req.body);
    res.status(201).json(await db.$transaction(async tx => {
      // Same court-lock order as bookings and rescheduling; changes are all-or-nothing.
      for (const c of await tx.court.findMany({ orderBy: { id: 'asc' }, select: { id: true } })) await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${c.id}`;
      const current = await preview(tx, dates);
      if (current.revision !== revision) throw bookingFailure(409, 'The weekly schedule changed. Review the holiday preview again.');
      for (const date of dates) await tx.courtDateOverride.upsert({ where: { date }, create: { date, type: 'open', title: 'Holiday', weeklyOnly: true, holidayActive: true, createdById: req.user!.id }, update: { type: 'open', title: 'Holiday', weeklyOnly: true, holidayActive: true, suspendedBlockIds: [], createdById: req.user!.id } });
      return current;
    }, { maxWait: 10000, timeout: 20000 }));
  }));
  r.delete('/:date', asyncRoute(async (req, res) => {
    const date = dateInput.parse(req.params.date);
    res.json(await db.$transaction(async tx => {
      for (const c of await tx.court.findMany({ orderBy: { id: 'asc' }, select: { id: true } })) await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${c.id}`;
      const existing = await tx.courtDateOverride.findUnique({ where: { date } });
      if (!existing || existing.type !== 'open') throw bookingFailure(404, 'Holiday override not found.');
      const [classes, bookings, blocks] = await Promise.all([tx.courtBlock.findMany({ where: { active: true, type: 'class' }, include: { court: { select: { name: true } } } }), tx.booking.findMany({ where: { date, status: { in: occupyingStatuses } } }), tx.courtBlock.findMany({ where: { active: true, type: { not: 'class' } } })]);
      const conflicts = classes.filter(c => blockOccurs(c, date) && (bookings.some(b => b.courtId === c.courtId && overlaps(b.time, `${c.start} — ${c.end}`)) || blocks.some(b => b.courtId === c.courtId && blockOccurs(b, date) && overlaps(`${b.start} — ${b.end}`, `${c.start} — ${c.end}`))));
      await tx.courtDateOverride.update({ where: { date }, data: { weeklyOnly: true, holidayActive: false, suspendedBlockIds: conflicts.map(c => c.id), title: conflicts.length ? 'Weekly restoration pending' : 'Holiday removed' } });
      return { date, conflicts: conflicts.map(c => ({ id: c.id, courtName: c.court.name, courtId: c.courtId, title: c.title, start: c.start, end: c.end })), message: conflicts.length ? `${conflicts.length} conflicting weekly sessions remain suspended. Resolve the bookings and retry restoration.` : 'Holiday removed. Weekly classes restored.' };
    }, { maxWait: 10000, timeout: 20000 }));
  }));
  r.get('/:date/classes', asyncRoute(async (req, res) => { const date = dateInput.parse(req.params.date); const blocks = await db.courtBlock.findMany({ where: { active: true, type: 'class' }, include: { court: { select: { name: true } } } }); const override = await db.courtDateOverride.findUnique({ where: { date } }); res.json(blocks.filter(b => blockOccurs(b, date) && !blockOccurs(b, date, override)).map(b => ({ ...b, status: 'Holiday / Overridden' }))); }));
  return r;
}
