import type { PrismaClient } from "@prisma/client";
import { audit, businessNow, gymError, gymTransaction, lockEnrollment, today } from "./gymPolicy.js";

export async function gymCheckIn(db: PrismaClient, membershipId: string, actorId: string, note?: string) {
  return gymTransaction(db, async tx => {
    const identity = await tx.membership.findUnique({ where: { id: membershipId }, select: { enrollmentId: true } });
    if (!identity) throw gymError("Membership not found.", 404);
    const enrollment = identity.enrollmentId ? await lockEnrollment(tx, identity.enrollmentId) : null;
    await tx.$executeRaw`UPDATE "Membership" SET "status"="status" WHERE "id"=${membershipId}`;
    const row = await tx.membership.findUniqueOrThrow({ where: { id: membershipId } });
    const date = today();
    if (row.status !== "active" || row.startDate > date || row.expiryDate < date ||
        (enrollment && (enrollment.status !== "ACTIVE" || !enrollment.paidAt)))
      throw gymError("This gym access is not currently valid.");
    if (row.userId && !await tx.user.findFirst({ where: { id: row.userId, active: true, deletedAt: null, role: "member" } }))
      throw gymError("This member account is no longer active.");
    const existing = await tx.gymCheckIn.findUnique({ where: { membershipId_date: { membershipId, date } } });
    if (existing) return { membership: row, checkIn: existing, replayed: true };
    const unlimited = row.accessMode === "unlimited";
    if (!unlimited && row.sessionsRemaining <= 0) throw gymError("No gym visits remain.");
    const now = businessNow(), time = `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`;
    const updated = await tx.membership.update({ where: { id: membershipId }, data: {
      lastCheckIn: `${date} ${time}`, ...(!unlimited ? { sessionsRemaining: { decrement: 1 } } : {}),
    } });
    if (enrollment && !unlimited) {
      const changed = await tx.gymEnrollment.updateMany({ where: { id: enrollment.id, sessionsRemaining: { gt: 0 } }, data: { sessionsRemaining: { decrement: 1 } } });
      if (!changed.count) throw gymError("No paid walk-in visits remain.");
    }
    const checkIn = await tx.gymCheckIn.create({ data: { membershipId, date, time, staffId: actorId, note, sessionsUsed: unlimited ? 0 : 1 } });
    await audit(tx, actorId, "GYM_CHECK_IN", "membership", membershipId, { sessionsRemaining: row.sessionsRemaining }, { checkInId: checkIn.id, sessionsRemaining: updated.sessionsRemaining });
    return { membership: updated, checkIn, replayed: false };
  });
}
