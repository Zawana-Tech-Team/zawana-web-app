import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { code } from "./courtPolicy.js";
import {
  audit, dateInput, enrollmentInclude, expiryDate, gymError, gymTransaction,
  json, lockEnrollment, lockMembers, payloadHash, today, type GymTx,
} from "./gymPolicy.js";

export const enrollmentInput = z.object({
  packageId: z.string().min(1),
  packageVersion: z.number().int().positive(),
  memberIds: z.array(z.string().min(1)).min(1).max(100),
  coachId: z.string().min(1).optional(),
  startDate: dateInput,
  requestKey: z.string().uuid(),
  renewalOfId: z.string().min(1).optional(),
});
export async function createGymEnrollment(db: PrismaClient, actorId: string, raw: z.input<typeof enrollmentInput>) {
  const b = enrollmentInput.parse(raw);
  if (new Set(b.memberIds).size !== b.memberIds.length) throw gymError("Select each member once.", 400);
  b.memberIds.sort();
  const hash = payloadHash({ ...b, requestKey: undefined });
  const findReplay = async () => {
    const prior = await db.gymEnrollment.findUnique({
      where: { createdById_requestKey: { createdById: actorId, requestKey: b.requestKey } }, include: enrollmentInclude,
    });
    if (prior && prior.payloadHash !== hash) throw gymError("This request key belongs to a different enrollment.");
    return prior;
  };
  const prior = await findReplay();
  if (prior) return prior;
  try {
    return await gymTransaction(db, async tx => {
      await tx.$executeRaw`UPDATE "GymPackage" SET "version"="version" WHERE "id"=${b.packageId}`;
      const pkg = await tx.gymPackage.findUnique({ where: { id: b.packageId } });
      if (!pkg || pkg.status !== "active") throw gymError("Select a published package.");
      if (pkg.version !== b.packageVersion) throw gymError("Package details changed. Reload and review the new price.");
      if (b.memberIds.length < pkg.minMembers || b.memberIds.length > pkg.maxMembers)
        throw gymError(`This package requires ${pkg.minMembers}–${pkg.maxMembers} members.`, 400);
      if (pkg.coachRequired && !b.coachId) throw gymError("Assign a Gym coach.", 400);
      if (b.startDate < today()) throw gymError("Enrollment cannot start in the past.", 400);
      if (b.coachId) {
        const coach = await tx.coach.findFirst({ where: { id: b.coachId, department: "Gym", status: "active", user: { is: { active: true, deletedAt: null, role: "coach" } } } });
        if (!coach) throw gymError("Assign an active Gym coach.");
      }
      await lockMembers(tx, b.memberIds);
      if (await tx.user.count({ where: { id: { in: b.memberIds }, role: "member", active: true, deletedAt: null } }) !== b.memberIds.length)
        throw gymError("Every participant must be an active member.");
      const expiry = expiryDate(b.startDate, pkg.kind === "MEMBERSHIP" ? pkg.months : 0, pkg.validityDays);
      const overlaps = await tx.gymEnrollment.findMany({ where: {
        status: { in: ["ACTIVE", "PENDING_PAYMENT"] },
        startDate: { lte: expiry }, expiryDate: { gte: b.startDate },
        members: { some: { userId: { in: b.memberIds } } },
        ...(pkg.kind === "MEMBERSHIP" || pkg.kind === "WALK_IN" ? { kind: { in: ["MEMBERSHIP", "WALK_IN"] } } : { packageId: pkg.id }),
      } });
      if (overlaps.some(row => row.kind === "MEMBERSHIP" || row.kind === "WALK_IN" || row.sessionsRemaining > 0))
        throw gymError("A selected member already has an overlapping enrollment. Use an eligible renewal or cancel the unpaid duplicate.");
      if (b.renewalOfId) {
        const old = await tx.gymEnrollment.findUnique({ where: { id: b.renewalOfId }, include: { members: true, renewals: { where: { status: { not: "CANCELLED" } } } } });
        if (old?.renewals.length) throw gymError("A renewal already exists. Renew the latest enrollment instead.");
        if (!old || !old.paidAt || old.kind !== pkg.kind ||
            old.members.map(m => m.userId).sort().join("|") !== b.memberIds.join("|"))
          throw gymError("A renewal must match the paid enrollment's members and package category.");
      }
      const row = await tx.gymEnrollment.create({ data: {
        code: code("GYM"), packageId: pkg.id, packageVersion: pkg.version, snapshot: json(pkg),
        kind: pkg.kind, totalPrice: pkg.price, sessionsTotal: pkg.sessions, sessionsRemaining: pkg.sessions,
        startDate: b.startDate, expiryDate: expiry, coachId: b.coachId,
        createdById: actorId, requestKey: b.requestKey, payloadHash: hash, renewalOfId: b.renewalOfId,
        members: { create: b.memberIds.map(userId => ({ userId })) },
      }, include: enrollmentInclude });
      await audit(tx, actorId, "ENROLLMENT_CREATED", "enrollment", row.id, undefined, row);
      return row;
    });
  } catch (error) {
    const replay = await findReplay();
    if (replay) return replay;
    throw error;
  }
}

/** Called only by authorized cash collection or the existing verified KPay webhook. */
export async function activateGymEnrollment(tx: GymTx, id: string, amount: number, method: "Cash" | "KPay", actorId: string, staff: string) {
  const row = await lockEnrollment(tx, id);
  if (row.totalPrice !== amount) throw gymError("Payment amount does not match the enrollment snapshot.");
  if (row.status === "ACTIVE" && row.transactionId) return row;
  if (row.status !== "PENDING_PAYMENT" || row.expiryDate < today()) throw gymError("Enrollment is no longer payable.");
  await lockMembers(tx, row.members.map(m => m.userId));
  const count = await tx.user.count({ where: { id: { in: row.members.map(m => m.userId) }, role: "member", active: true, deletedAt: null } });
  if (count !== row.members.length) throw gymError("An enrollment member is no longer active.");
  const lead = row.members[0].user;
  const snapshot = row.snapshot as { title: string };
  const receipt = await tx.transaction.create({ data: {
    userId: lead.id, date: today(), customer: row.members.map(m => m.user.name).join(", "),
    business: "Gym", item: `${snapshot.title} · ${row.code}`, amount, discount: 0, tax: 0,
    finalAmount: amount, paymentMethod: method, staff, status: "paid",
  } });
  const updated = await tx.gymEnrollment.update({ where: { id }, data: { status: "ACTIVE", transactionId: receipt.id, paymentMethod: method, paidAt: new Date() } });
  if (["MEMBERSHIP", "WALK_IN"].includes(row.kind)) await tx.membership.create({ data: {
    enrollmentId: id, accessMode: row.kind === "MEMBERSHIP" ? "unlimited" : "sessions",
    customerId: lead.id, userId: lead.id, customer: lead.name, phone: lead.phone || "",
    packageId: row.packageId, package: snapshot.title, startDate: row.startDate, expiryDate: row.expiryDate,
    status: "active", sessionsTotal: row.kind === "WALK_IN" ? 1 : 0, sessionsRemaining: row.kind === "WALK_IN" ? 1 : 0,
  } });
  await tx.notification.createMany({ data: row.members.map(m => ({
    userId: m.userId, title: "Gym package activated", body: `${snapshot.title} · valid ${row.startDate}–${row.expiryDate}.`,
    link: "/member/training", type: "payment", audience: "member", entityType: "gym_enrollment", entityId: id,
  })) });
  await audit(tx, actorId, "PAYMENT_VERIFIED_AND_ACTIVATED", "enrollment", id, { status: row.status }, { ...updated, receiptId: receipt.id });
  return tx.gymEnrollment.findUniqueOrThrow({ where: { id }, include: enrollmentInclude });
}

export async function cancelGymEnrollment(db: PrismaClient, id: string, actorId: string, admin: boolean, reason: string) {
  return gymTransaction(db, async tx => {
    const row = await lockEnrollment(tx, id);
    if (row.status === "CANCELLED") return row;
    if (row.paidAt && !admin) throw gymError("Only Admin can cancel a paid enrollment.", 403);
    if (await tx.paymentAttempt.count({ where: { resourceType: "gym_enrollment", resourceId: id, status: { in: ["PENDING", "INITIATING"] }, expiresAt: { gt: new Date() } } }))
      throw gymError("Wait for the active checkout to expire before cancelling.");
    const updated = await tx.gymEnrollment.update({ where: { id }, data: { status: "CANCELLED" } });
    await tx.membership.updateMany({ where: { enrollmentId: id }, data: { status: "cancelled" } });
    await tx.privateTrainingSession.updateMany({ where: { enrollmentId: id, status: { in: ["SCHEDULED", "CHECKED_IN"] } }, data: { status: "CANCELLED" } });
    await tx.notification.createMany({ data: row.members.map(member => ({
      userId: member.userId, title: "Gym enrollment cancelled", body: `${row.code} was cancelled. Contact Gym Front Office for any payment adjustment.`,
      link: "/member/training", type: "training", entityType: "gym_enrollment", entityId: id,
    })) });
    await audit(tx, actorId, "ENROLLMENT_CANCELLED", "enrollment", id, { status: row.status }, { status: updated.status, reason, refundIssued: false });
    return updated;
  });
}
