import type { PrismaClient } from '@prisma/client';
import { today } from './courtPolicy.js';

/** Read only: eligible packages and category counts use the whole active roster. */
export async function badmintonCheckInRoster(db: PrismaClient, filters: { q: string; category: string; page: number; pageSize: number }, date = today()) {
  const [enrollments, categories, visits] = await Promise.all([
    db.badmintonEnrollment.findMany({ where: { status: 'active', startDate: { lte: date }, expiryDate: { gte: date }, sessionsRemaining: { gt: 0 } }, include: { user: { select: { id: true, name: true, phone: true, active: true, deletedAt: true } } }, orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }),
    db.badmintonPackageCategory.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    db.badmintonCheckIn.findMany({ where: { date }, select: { memberId: true, categoryCode: true, enrollment: { select: { userId: true, studentId: true } } } }),
  ]);
  const legacyIds = [...new Set(enrollments.filter(row => !row.userId).map(row => row.studentId))];
  const legacy = new Map((legacyIds.length ? await db.user.findMany({ where: { id: { in: legacyIds } }, select: { id: true, name: true, phone: true, active: true, deletedAt: true } }) : []).map(row => [row.id, row]));
  const checked = new Set(visits.flatMap(row => [`${row.memberId}|${row.categoryCode || ''}`, `${row.enrollment.userId || row.enrollment.studentId}|${row.categoryCode || ''}`]));
  const names = new Map(categories.filter(row => row.code).map(row => [row.code!, row.name]));
  type Entry = { id: string; packageName: string; categoryCode: string | null; categoryName: string; sessionsRemaining: number; expiryDate: string; checkedInToday: boolean };
  const students = new Map<string, { id: string; name: string; phone: string; packages: Entry[] }>();
  const seen = new Set<string>();
  for (const row of enrollments) {
    const account = row.user || legacy.get(row.studentId);
    if (account && (!account.active || account.deletedAt)) continue;
    const id = account?.id || row.studentId, key = `${id}|${row.categoryCode || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!students.has(id)) students.set(id, { id, name: account?.name || row.studentName, phone: account?.phone || row.phone, packages: [] });
    students.get(id)!.packages.push({ id: row.id, packageName: row.packageName, categoryCode: row.categoryCode, categoryName: row.categoryCode ? names.get(row.categoryCode) || row.categoryCode : 'Category needs review', sessionsRemaining: row.sessionsRemaining, expiryDate: row.expiryDate, checkedInToday: checked.has(key) });
  }
  const categoryCounts = new Map<string, { code: string; name: string; activeStudents: number }>();
  for (const category of categories) if (category.code && category.active) categoryCounts.set(category.code, { code: category.code, name: category.name, activeStudents: 0 });
  for (const student of students.values()) for (const entry of student.packages) {
    const code = entry.categoryCode || 'unclassified';
    if (!categoryCounts.has(code)) categoryCounts.set(code, { code, name: entry.categoryName, activeStudents: 0 });
    categoryCounts.get(code)!.activeStudents++;
  }
  const term = filters.q.toLowerCase();
  const matching = [...students.values()].map(student => ({ ...student, packages: student.packages.filter(entry => !filters.category || (entry.categoryCode || 'unclassified') === filters.category) })).filter(student => student.packages.length && (!term || `${student.name} ${student.phone} ${student.packages.map(entry => `${entry.packageName} ${entry.categoryName}`).join(' ')}`.toLowerCase().includes(term))).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const totalPages = Math.max(1, Math.ceil(matching.length / filters.pageSize)), page = Math.min(filters.page, totalPages);
  return { date, totalActiveStudents: students.size, categories: [...categoryCounts.values()].sort((a, b) => a.name.localeCompare(b.name)), total: matching.length, page, pageSize: filters.pageSize, totalPages, rows: matching.slice((page - 1) * filters.pageSize, page * filters.pageSize) };
}
