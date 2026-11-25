import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { blockOccurs } from './blockSchedule.js';
import { toMinute } from './courtPolicy.js';
import { isDateKey } from '../utils/dateKeys.js';

const classSnapshot = z.object({
  blockIds: z.array(z.string().min(1)).min(1),
  title: z.string().min(1), categoryCode: z.string().min(1),
  date: z.string().refine(isDateKey), start: z.string(), end: z.string(),
  courts: z.array(z.object({ id: z.string(), name: z.string(), floor: z.string().nullable() })).min(1),
});
export type WeeklyAttendanceClass = z.infer<typeof classSnapshot>;

/** Preserve the class as it was at check-in; later schedule edits must not rewrite attendance. */
export function readWeeklyAttendanceClass(value: unknown, date: string, categoryCode: string | null) {
  const result = classSnapshot.safeParse(value);
  return result.success && result.data.date === date && result.data.categoryCode === categoryCode
    && toMinute(result.data.end) > toMinute(result.data.start) ? result.data : null;
}

export async function weeklyClassAtCheckIn(tx: Prisma.TransactionClient, categoryCode: string | null, date: string, time: string): Promise<WeeklyAttendanceClass | null> {
  if (!categoryCode) return null;
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
  const [blocks, override] = await Promise.all([
    tx.courtBlock.findMany({
      where: { active: true, type: 'class', categoryCode, OR: [{ date }, { date: '', dayOfWeek }] },
      include: { court: { select: { id: true, name: true, floor: true } } }, orderBy: { id: 'asc' },
    }),
    tx.courtDateOverride.findUnique({ where: { date } }),
  ]);
  if (override?.type === 'closed') return null;
  // A single weekly session can reserve several courts. Keep one attendance record/debit.
  const groups = new Map<string, WeeklyAttendanceClass>();
  for (const block of blocks) {
    if (!blockOccurs(block, date, override) || !(toMinute(block.end) > toMinute(block.start))) continue;
    const key = JSON.stringify([block.title, block.start, block.end]);
    const group = groups.get(key) || { blockIds: [], title: block.title, categoryCode, date, start: block.start, end: block.end, courts: [] };
    group.blockIds.push(block.id);
    if (!group.courts.some(court => court.id === block.court.id)) group.courts.push(block.court);
    groups.set(key, group);
  }
  const candidates = [...groups.values()];
  if (candidates.length === 1) return candidates[0];
  const minute = toMinute(time);
  const current = candidates.filter(row => toMinute(row.start) <= minute && minute < toMinute(row.end));
  // Category check-in remains valid when the exact class is ambiguous or unavailable.
  return current.length === 1 ? current[0] : null;
}
