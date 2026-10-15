import type { PrismaClient, PrivateTrainingStatus } from "@prisma/client";
import { z } from "zod";
import { audit, businessNow, dateInput, gymError, gymTransaction, isTraining, lockEnrollment, lockMembers, personSelect, today, type GymTx } from "./gymPolicy.js";
import { occupyingStatuses } from "./courtBooking.js";
import { range, toMinute } from "./courtPolicy.js";

export const sessionInclude = {
  member: { select: personSelect },
  coach: { include: { user: { select: personSelect } } },
  attendance: { include: { user: { select: personSelect } } },
  enrollment: { select: { id: true, code: true, snapshot: true, sessionsRemaining: true, sessionsTotal: true, expiryDate: true } },
  debit: true,
} as const;
export const scheduleInput = z.object({
  enrollmentId: z.string().min(1), coachId: z.string().min(1),
  date: dateInput, startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  notes: z.string().trim().max(1000).nullable().optional(),
  requestKey: z.string().uuid(),
});
const activeStatuses: PrivateTrainingStatus[] = ["SCHEDULED", "CHECKED_IN"];
function validateStart(date: string, start: number) {
  const now = businessNow();
  if (date < today() || (date === today() && start <= now.hour * 60 + now.minute))
    throw gymError("Choose a future session start.", 400);
}
export async function readGymSchedule(tx: GymTx, coachId: string, memberIds: string[], date: string, excludeId?: string) {
  const [coach, existing, bookings] = await Promise.all([
    tx.coach.findFirst({ where: { id: coachId, department: "Gym", status: "active", user: { is: { active: true, deletedAt: null, role: "coach" } } } }),
    tx.privateTrainingSession.findMany({ where: {
      id: excludeId ? { not: excludeId } : undefined, date, status: { in: activeStatuses },
      OR: [{ coachId }, { memberId: { in: memberIds } }, { attendance: { some: { userId: { in: memberIds } } } }],
    }, select: { startTime: true, endTime: true } }),
    tx.booking.findMany({ where: {
      date, status: { in: occupyingStatuses }, OR: [{ coachId }, { userId: { in: memberIds }, kind: "pt" }],
    }, select: { time: true } }),
  ]);
  return { coach, existing, bookings };
}
export function assertGymSchedule(calendar: Awaited<ReturnType<typeof readGymSchedule>>, start: number, end: number) {
  if (start < 360 || end > 1260 || start >= end) throw gymError("Gym sessions run between 06:00 and 21:00.", 400);
  if (!calendar.coach) throw gymError("Select an active Gym coach.");
  if (calendar.existing.some(s => start < toMinute(s.endTime) && toMinute(s.startTime) < end))
    throw gymError("The coach or a participant already has a session at this time.");
  if (calendar.bookings.some(b => { const r = range(b.time); return r && start < r.end && r.start < end; }))
    throw gymError("The coach or a participant already has a booking at this time.");
}
export async function checkGymSchedule(tx: GymTx, coachId: string, memberIds: string[], date: string, start: number, end: number, excludeId?: string) {
  assertGymSchedule(await readGymSchedule(tx, coachId, memberIds, date, excludeId), start, end);
}
export async function scheduleGymSession(db: PrismaClient, actorId: string, raw: z.input<typeof scheduleInput>, sessionId?: string) {
  const b = scheduleInput.parse(raw);
  return gymTransaction(db, async tx => {
    const enrollment = await lockEnrollment(tx, b.enrollmentId);
    const memberIds = enrollment.members.map(m => m.userId);
    if (!sessionId) {
      const replay = await tx.privateTrainingSession.findUnique({ where: { enrollmentId_requestKey: { enrollmentId: b.enrollmentId, requestKey: b.requestKey } }, include: sessionInclude });
      if (replay) {
        if (replay.coachId !== b.coachId || replay.date !== b.date || replay.startTime !== b.startTime || (replay.notes || "") !== (b.notes || ""))
          throw gymError("This request key belongs to a different session.");
        return replay;
      }
    }
    if (enrollment.status !== "ACTIVE" || !enrollment.paidAt || !isTraining(enrollment.kind))
      throw gymError("Choose an activated, paid training enrollment.");
    if (enrollment.sessionsRemaining <= 0 || enrollment.expiryDate < today()) throw gymError("No valid sessions remain.");
    if (b.date < enrollment.startDate || b.date > enrollment.expiryDate) throw gymError("Session must fall within package validity.");
    const snapshot = enrollment.snapshot as { sessionMinutes: number };
    const start = toMinute(b.startTime), end = start + snapshot.sessionMinutes;
    validateStart(b.date, start);
    // Every scheduling entry point uses these resource locks, in the same order.
    await tx.$executeRaw`UPDATE "Coach" SET "status"="status" WHERE "id"=${b.coachId}`;
    await lockMembers(tx, memberIds);
    if (await tx.user.count({ where: { id: { in: memberIds }, role: "member", active: true, deletedAt: null } }) !== memberIds.length)
      throw gymError("A participant is no longer active.");
    const old = sessionId ? await tx.privateTrainingSession.findUnique({ where: { id: sessionId } }) : null;
    if (sessionId && (!old || old.enrollmentId !== enrollment.id || old.status !== "SCHEDULED"))
      throw gymError("Only a scheduled session in this enrollment can be rescheduled.");
    if (old && old.coachId === b.coachId && old.date === b.date && old.startTime === b.startTime && (old.notes || "") === (b.notes || ""))
      return tx.privateTrainingSession.findUniqueOrThrow({ where: { id: old.id }, include: sessionInclude });
    const reserved = await tx.privateTrainingSession.count({ where: { enrollmentId: enrollment.id, status: { in: activeStatuses }, id: sessionId ? { not: sessionId } : undefined } });
    if (reserved >= enrollment.sessionsRemaining) throw gymError("All remaining sessions are already scheduled. Cancel or reschedule an existing session.");
    await checkGymSchedule(tx, b.coachId, memberIds, b.date, start, end, sessionId);
    const endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    const data = { coachId: b.coachId, date: b.date, startTime: b.startTime, endTime, durationMinutes: snapshot.sessionMinutes, notes: b.notes || null };
    const row = old
      ? await tx.privateTrainingSession.update({ where: { id: old.id }, data, include: sessionInclude })
      : await tx.privateTrainingSession.create({ data: {
        ...data, memberId: memberIds[0], enrollmentId: enrollment.id, requestKey: b.requestKey,
        createdById: actorId, attendance: { create: memberIds.map(userId => ({ userId })) },
      }, include: sessionInclude });
    const coach = await tx.coach.findUniqueOrThrow({ where: { id: b.coachId } });
    const recipients = new Set([...memberIds, ...(coach.userId ? [coach.userId] : [])]);
    if (old && old.coachId !== b.coachId) {
      const previousCoach = await tx.coach.findUnique({ where: { id: old.coachId } });
      if (previousCoach?.userId) recipients.add(previousCoach.userId);
    }
    await tx.notification.createMany({ data: [...recipients].map(userId => ({
      userId, title: old ? "Gym session rescheduled" : "Gym session scheduled", body: `${enrollment.code} · ${b.date} · ${b.startTime}–${endTime}`,
      link: memberIds.includes(userId) ? "/member/training" : "/coach/training", type: "training", entityType: "gym_session", entityId: row.id,
    })) });
    await audit(tx, actorId, old ? "SESSION_RESCHEDULED" : "SESSION_SCHEDULED", "session", row.id, old || undefined, row);
    return row;
  });
}

export async function updateGymSession(db: PrismaClient, id: string, actor: { id: string; role: string }, status: PrivateTrainingStatus, presentMemberIds?: string[]) {
  return gymTransaction(db, async tx => {
    // Read enrollment identity, then lock it before the session for consistent ordering.
    const identity = await tx.privateTrainingSession.findUnique({ where: { id }, select: { enrollmentId: true } });
    if (!identity) throw gymError("Session not found.", 404);
    const enrollment = identity.enrollmentId ? await lockEnrollment(tx, identity.enrollmentId) : null;
    await tx.$executeRaw`UPDATE "PrivateTrainingSession" SET "status"="status" WHERE "id"=${id}`;
    const session = await tx.privateTrainingSession.findUniqueOrThrow({ where: { id }, include: sessionInclude });
    if (actor.role === "coach" && session.coach.userId !== actor.id) throw gymError("This session belongs to another coach.", 403);
    if (actor.role === "coach" && session.coach.status !== "active") throw gymError("This coach profile is inactive.", 403);
    if (session.status === status && !(status === "CHECKED_IN" && presentMemberIds)) return session;
    if (!activeStatuses.includes(session.status)) throw gymError("Finalized sessions cannot be changed.");
    if (!["CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"].includes(status)) throw gymError("Choose a supported session transition.", 400);
    if (status !== "CANCELLED" && enrollment && (enrollment.status !== "ACTIVE" || !enrollment.paidAt || enrollment.expiryDate < today() || enrollment.startDate > today()))
      throw gymError("This enrollment is not currently valid.");
    if (status === "CHECKED_IN" && session.date !== today()) throw gymError("Attendance is recorded on the session date.");
    const now = businessNow();
    if (["COMPLETED", "NO_SHOW"].includes(status) && (session.date > today() || (session.date === today() && toMinute(session.endTime) > now.hour * 60 + now.minute)))
      throw gymError("Wait until the session has ended.");
    if (presentMemberIds) {
      if (new Set(presentMemberIds).size !== presentMemberIds.length || presentMemberIds.some(userId => !session.attendance.some(a => a.userId === userId)))
        throw gymError("Attendance must contain enrolled participants only.", 400);
      for (const a of session.attendance) await tx.gymSessionAttendance.update({
        where: { sessionId_userId: { sessionId: id, userId: a.userId } },
        data: { status: presentMemberIds.includes(a.userId) ? "PRESENT" : "ABSENT" },
      });
    }
    if (status === "COMPLETED" && enrollment) {
      const present = presentMemberIds?.length ?? session.attendance.filter(a => a.status === "PRESENT").length;
      if (!present) throw gymError("Mark at least one participant present before completing.");
      const changed = await tx.gymEnrollment.updateMany({ where: { id: enrollment.id, status: "ACTIVE", sessionsRemaining: { gt: 0 } }, data: { sessionsRemaining: { decrement: 1 } } });
      if (!changed.count) throw gymError("No sessions remain to deduct.");
      await tx.gymSessionDebit.create({ data: { sessionId: id, enrollmentId: enrollment.id, actorId: actor.id } });
    }
    if (status === "NO_SHOW") await tx.gymSessionAttendance.updateMany({ where: { sessionId: id }, data: { status: "ABSENT" } });
    const row = await tx.privateTrainingSession.update({ where: { id }, data: { status }, include: sessionInclude });
    await audit(tx, actor.id, `SESSION_${status}`, "session", id, session, row);
    return row;
  });
}
