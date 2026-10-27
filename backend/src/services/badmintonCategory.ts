import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { today } from './courtPolicy.js';
import { changeError } from './courtChanges.js';
export const categoryCodeInput = z.enum(['FOUNDATION', 'SOCIAL', 'PATHWAY']);
export type CategoryCode = z.infer<typeof categoryCodeInput>;
export async function packageCategory(tx: Prisma.TransactionClient, packageId: string) {
  const pkg = await tx.badmintonPackage.findUnique({ where: { id: packageId }, include: { category: true } });
  if (!pkg || !pkg.category?.active || !categoryCodeInput.safeParse(pkg.category.code).success)
    throw changeError('CATEGORY_REVIEW_REQUIRED', 'Assign this package to Foundation, Social, or Pathway before activation.');
  return pkg.category!.code as CategoryCode;
}
export const ownerScope = (userId: string) => ({ OR: [{ userId }, { userId: null, studentId: userId }] });
export async function selectCategoryEnrollment(tx: Prisma.TransactionClient, memberId: string, categoryCode: CategoryCode, lock = false) {
  const date = today();
  if (lock) {
    const member = await tx.user.updateMany({ where: { id: memberId, active: true, deletedAt: null, role: 'member' }, data: { active: true } });
    if (!member.count) throw changeError('ACCOUNT_INACTIVE', 'Your member account is not available for check-in.');
  }
  return resolveCategoryEnrollment(tx, memberId, categoryCode, ownerScope(memberId), date);
}
async function resolveCategoryEnrollment(tx: Prisma.TransactionClient, memberId: string, categoryCode: CategoryCode, scope: Prisma.BadmintonEnrollmentWhereInput, date: string) {
  // An unknown entitlement/history might already have paid for this category today. Never guess.
  if (await tx.badmintonEnrollment.findFirst({ where: { AND: [scope, { categoryCode: null, status: 'active' }] } }) ||
      await tx.badmintonCheckIn.findFirst({ where: { date, categoryCode: null, enrollment: scope } }))
    throw changeError('CATEGORY_REVIEW_REQUIRED', 'An existing package or attendance record needs category review at the front desk. No session was deducted.');
  if (await tx.badmintonCheckIn.findFirst({ where: { date, categoryCode, OR: [{ memberId }, { enrollment: scope }] } }))
    throw changeError('ALREADY_CHECKED_IN', `You have already checked in to ${categoryCode.toLowerCase()} today. No session was deducted.`);
  const candidates = await tx.badmintonEnrollment.findMany({ where: { AND: [scope, { categoryCode }] }, orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
  const valid = candidates.filter(e => e.status === 'active' && e.startDate <= date && e.expiryDate >= date);
  const enrollment = valid.find(e => e.sessionsRemaining > 0);
  if (enrollment) return enrollment;
  if (valid.length) throw changeError('NO_SESSIONS', `Your ${categoryCode.toLowerCase()} packages have no sessions remaining.`);
  if (candidates.length) throw changeError('PACKAGE_EXPIRED', `No ${categoryCode.toLowerCase()} package is currently active, started and unexpired.`);
  throw changeError('NO_CATEGORY_PACKAGE', `You do not have a ${categoryCode.toLowerCase()} package. Please visit the front desk.`);
}
export async function selectStaffEnrollment(tx: Prisma.TransactionClient, enrollmentId: string) {
  const requested = await tx.badmintonEnrollment.findUnique({ where: { id: enrollmentId } });
  if (!requested) throw changeError('PACKAGE_NOT_FOUND', 'Student package not found.', 404);
  const categoryCode = categoryCodeInput.safeParse(requested.categoryCode);
  if (!categoryCode.success) throw changeError('CATEGORY_REVIEW_REQUIRED', 'This package needs category review before check-in.');
  // The supplied ID identifies a member/category; the server selects the actual entitlement.
  const memberId = requested.userId || requested.studentId;
  const member = await tx.user.findUnique({ where: { id: memberId } });
  if (member) return selectCategoryEnrollment(tx, memberId, categoryCode.data, true);
  // Walk-in entitlements have a stable studentId; no phone/name based identity merging.
  await tx.$executeRaw`UPDATE "BadmintonEnrollment" SET "status"="status" WHERE "id"=${requested.id}`;
  return resolveCategoryEnrollment(tx, memberId, categoryCode.data, { userId: null, studentId: requested.studentId }, today());
}
export async function checkInTransaction<T>(db: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(fn, { maxWait: 10000, timeout: 15000 }); }
    catch (error: any) {
      if (error.code === 'P2002') throw changeError('ALREADY_CHECKED_IN', 'This category has already been checked in today. No additional session was deducted.');
      if (['P2034', 'P2028', 'P1008'].includes(error.code) || (error.code === 'P2010' && /locked|busy|deadlock|serialization/i.test(String(error.meta?.message)))) {
        if (attempt < 2) continue;
        throw changeError('CHECK_IN_CONFLICT', 'Another check-in is in progress. Refresh and try again. No additional session was deducted.');
      }
      throw error;
    }
  }
}

// Explicit administrator review, separate from editing the catalogue. Never changes a classified snapshot.
export async function classifyLegacyPackage(tx: Prisma.TransactionClient, packageId: string, actorId?: string) {
  const categoryCode = await packageCategory(tx, packageId);
  const rows = await tx.badmintonEnrollment.findMany({ where: { packageId, categoryCode: null }, include: { purchase: true }, orderBy: { id: 'asc' } });
  if (rows.some(e => e.purchase && (e.purchase.packageId !== e.packageId || e.purchase.userId !== e.userId)))
    throw changeError('LEGACY_RELATIONSHIP_CONFLICT', 'A purchase relationship conflicts with this enrollment. Resolve it before classification.');
  const members = [...new Set(rows.map(e => e.userId || e.studentId))].sort();
  for (const id of members) await tx.$executeRaw`UPDATE "User" SET "active"="active" WHERE "id"=${id}`;
  let classifiedVisits = 0;
  for (const enrollment of rows) {
    await tx.badmintonEnrollment.update({ where: { id: enrollment.id }, data: { categoryCode } });
    if (actorId) await tx.attendanceModification.create({ data: { bookingId: `enrollment:${enrollment.id}`, actorId,
      reason: 'Administrator reviewed legacy package category', previous: JSON.stringify({ categoryCode: null, packageId }), current: JSON.stringify({ categoryCode, packageId }) } });
    const visits = await tx.badmintonCheckIn.findMany({ where: { enrollmentId: enrollment.id, categoryCode: null }, orderBy: { id: 'asc' } });
    for (const visit of visits) {
      let snapshot: { packageId?: string } | null;
      try { snapshot = visit.packageSnapshot ? JSON.parse(visit.packageSnapshot) : null; } catch { continue; }
      if (visit.packageSnapshot && (!snapshot || snapshot.packageId !== packageId)) continue;
      const memberId = enrollment.userId || enrollment.studentId;
      const attendanceKey = `${memberId}:${categoryCode}:${visit.date}`;
      const guarded = await tx.badmintonCheckIn.findUnique({ where: { attendanceKey } });
      await tx.badmintonCheckIn.update({ where: { id: visit.id }, data: { categoryCode, memberId, ...(guarded ? {} : { attendanceKey }) } });
      await tx.badmintonQrVisit.updateMany({ where: { checkInId: visit.id, categoryCode: null }, data: { categoryCode } });
      classifiedVisits++;
    }
  }
  return { enrollments: rows.length, checkIns: classifiedVisits, categoryCode };
}
