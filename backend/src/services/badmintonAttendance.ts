import type { Prisma } from '@prisma/client';
import { today, businessNow } from './courtPolicy.js';
import { selectStaffEnrollment } from './badmintonCategory.js';
import { changeError } from './courtChanges.js';
export function consumingStatus(status: string) {
  const configured = (process.env.BADMINTON_CONSUMING_ATTENDANCE_STATUSES || 'present,late').split(',').map(s => s.trim());
  if (!configured.includes('present') || configured.some(s => !['present', 'late', 'absent', 'excused'].includes(s)))
    throw changeError('INVALID_ATTENDANCE_POLICY', 'Attendance consumption policy requires configuration review.');
  return configured.includes(status);
}
export async function createBadmintonVisit(tx: Prisma.TransactionClient, enrollmentId: string, staffId: string | null, note?: string, qrId?: string) {
  // Both entry paths serialize the member before selecting/locking a package.
  const selected = await selectStaffEnrollment(tx, enrollmentId);
  enrollmentId = selected.id;
  await tx.$executeRaw`UPDATE "BadmintonEnrollment" SET "status"="status" WHERE "id"=${enrollmentId}`;
  const enrollment = await tx.badmintonEnrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { purchase: { select: { createdAt: true, paidAt: true } } } });
  const date = today();
  const now = businessNow(), time = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`;
  const updated = await tx.badmintonEnrollment.updateMany({ where: { id: enrollmentId, categoryCode: enrollment.categoryCode, status: 'active', startDate: { lte: date }, expiryDate: { gte: date }, sessionsRemaining: { gt: 0 } }, data: { sessionsRemaining: { decrement: 1 }, lastCheckIn: `${date} ${time}` } });
  if (!updated.count) throw changeError('CHECK_IN_CONFLICT', 'Package eligibility changed. Refresh and try again.');
  const memberId = enrollment.userId || enrollment.studentId;
  const checkIn = await tx.badmintonCheckIn.create({ data: { enrollmentId, memberId, categoryCode: enrollment.categoryCode,
    attendanceKey: `${memberId}:${enrollment.categoryCode}:${date}`, source: qrId ? 'QR' : 'STAFF', actorId: staffId || memberId, qrId,
    date, dailyKey: `${enrollmentId}:${date}`, time, staffId, note, sessionsUsed: 1,
    packageSnapshot: JSON.stringify({ packageId: enrollment.packageId, packageName: enrollment.packageName, categoryCode: enrollment.categoryCode, purchaseId: enrollment.purchaseId,
      purchaseDate: enrollment.purchase?.createdAt.toISOString() || null, startDate: enrollment.startDate, expiryDate: enrollment.expiryDate,
      sessionsTotal: enrollment.sessionsTotal, sessionsRemaining: enrollment.sessionsRemaining - 1, renewalCount: enrollment.renewalCount }) } });
  return { success: true, categoryCode: enrollment.categoryCode, sessionsDeducted: 1, checkInId: checkIn.id,
    checkIn, enrollment: await tx.badmintonEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } }), warning: enrollment.sessionsRemaining <= 3 };
}
export async function correctBadmintonVisit(tx: Prisma.TransactionClient, id: string, actorId: string, status: string, reason: string, notes?: string) {
  const initial = await tx.badmintonCheckIn.findUnique({ where: { id } });
  if (!initial) throw changeError('ATTENDANCE_NOT_FOUND', 'Attendance not found.', 404);
  await tx.$executeRaw`UPDATE "BadmintonEnrollment" SET "status"="status" WHERE "id"=${initial.enrollmentId}`;
  const visit = await tx.badmintonCheckIn.findUniqueOrThrow({ where: { id }, include: { enrollment: true } });
  const used = consumingStatus(status) ? 1 : 0, delta = used - visit.sessionsUsed;
  if (delta !== 0) {
    let snapshot: { renewalCount?: number; purchaseId?: string | null } | null;
    try { snapshot = visit.packageSnapshot ? JSON.parse(visit.packageSnapshot) : null; } catch { snapshot = null; }
    if (!snapshot || snapshot.renewalCount !== visit.enrollment.renewalCount || snapshot.purchaseId !== visit.enrollment.purchaseId)
      throw changeError('HISTORICAL_PACKAGE_REVIEW_REQUIRED', 'This visit belongs to an earlier or unverified package cycle. Review its original entitlement before adjusting sessions.');
    if (delta > 0 && (visit.enrollment.status !== 'active' || visit.enrollment.startDate > today() || visit.enrollment.expiryDate < today()))
      throw changeError('PACKAGE_EXPIRED', 'An expired package cannot be charged again. Historical attendance remains available.');
    const changed = await tx.badmintonEnrollment.updateMany({ where: { id: visit.enrollmentId, sessionsRemaining: delta > 0 ? { gte: delta } : { lte: visit.enrollment.sessionsTotal + delta } }, data: { sessionsRemaining: { decrement: delta } } });
    if (!changed.count) throw changeError('NO_SESSIONS', 'This correction would exceed the package session balance.');
  }
  const changed = await tx.badmintonCheckIn.update({ where: { id }, data: { status, sessionsUsed: used, note: notes ?? visit.note } });
  const { enrollment: _enrollment, ...previous } = visit;
  await tx.attendanceModification.create({ data: { bookingId: `package:${id}`, actorId, reason, previous: JSON.stringify(previous), current: JSON.stringify(changed) } });
  return changed;
}
