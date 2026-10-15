import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { addDateKeyDays, isDateKey } from "../utils/dateKeys.js";
import { today, businessNow } from "./courtPolicy.js";

export { today, businessNow };
export type GymTx = Prisma.TransactionClient;
export const gymError = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode, code: "GYM_CONFLICT" });
export const kinds = ["MEMBERSHIP", "PT", "COUPLE_PT", "GROUP_PT", "WALK_IN"] as const;
export const mmk = z.coerce.number().int().min(1).max(2_000_000_000);
export const dateInput = z.string().refine(isDateKey, "Choose a valid date.");
export const packageInput = z.object({
  title: z.string().trim().min(2).max(120),
  kind: z.enum(kinds),
  description: z.string().trim().max(2000).default(""),
  benefits: z.array(z.string().trim().max(160)).max(20).default([]),
  status: z.enum(["draft", "active", "archived", "inactive"]).default("draft"),
  price: mmk,
  rate: z.coerce.number().int().min(0).max(2_000_000_000),
  pricingMode: z.enum(["total", "rate"]).default("total"),
  months: z.coerce.number().int().min(0).max(60).default(0),
  sessions: z.coerce.number().int().min(0).max(1000).default(0),
  duration: z.coerce.number().int().min(1).max(3650).default(90),
  validityDays: z.coerce.number().int().min(1).max(3650).default(90),
  sessionMinutes: z.coerce.number().int().min(15).max(180).default(60),
  minMembers: z.coerce.number().int().min(1).max(100).default(1),
  maxMembers: z.coerce.number().int().min(1).max(100).default(1),
  coachRequired: z.boolean().default(false),
});
export function normalizeGymPackage(value: z.input<typeof packageInput>) {
  const { pricingMode, ...data } = packageInput.parse(value);
  const training = ["PT", "COUPLE_PT", "GROUP_PT"].includes(data.kind);
  if (data.kind === "MEMBERSHIP" && data.months < 1)
    throw gymError("Membership packages require at least one month.", 400);
  if (training && data.sessions < 1) throw gymError("Training requires a session count.", 400);
  if (data.kind === "COUPLE_PT") data.minMembers = data.maxMembers = 2;
  else if (data.kind !== "GROUP_PT") data.minMembers = data.maxMembers = 1;
  if (data.kind === "GROUP_PT" && data.minMembers < 5)
    throw gymError("Group PT requires at least five members.", 400);
  if (data.maxMembers < data.minMembers) throw gymError("Maximum members must cover the minimum.", 400);
  data.coachRequired = training || data.coachRequired;
  if (!training) data.sessions = data.kind === "WALK_IN" ? 1 : 0;
  if (data.kind !== "MEMBERSHIP") data.months = 0;
  if (data.kind === "WALK_IN") data.validityDays = 1;
  const units = data.kind === "MEMBERSHIP" ? data.months : data.sessions;
  if (pricingMode === "rate") {
    const total = data.rate * units;
    if (!Number.isSafeInteger(total) || total < 1 || total > 2_000_000_000)
      throw gymError("Total price exceeds the supported MMK amount.", 400);
    data.price = total;
  } else data.rate = Math.round(data.price / units);
  data.duration = data.validityDays;
  return data;
}
export function expiryDate(start: string, months: number, days: number) {
  if (!months) return addDateKeyDays(start, days - 1);
  const d = new Date(`${start}T00:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return addDateKeyDays(target.toISOString().slice(0, 10), -1);
}
export const payloadHash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
export const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export async function audit(tx: GymTx, actorId: string, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown) {
  await tx.gymAuditLog.create({ data: {
    actorId, action, entityType, entityId,
    ...(before === undefined ? {} : { before: json(before) }),
    ...(after === undefined ? {} : { after: json(after) }),
  } });
}
export async function gymTransaction<T>(db: PrismaClient, work: (tx: GymTx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(work, { maxWait: 10000, timeout: 15000 }); }
    catch (error: any) {
      if (attempt >= 3 || !(error?.code === "P2034" || /SQLITE_BUSY|database is locked/.test(error?.message || ""))) throw error;
      await new Promise(resolve => setTimeout(resolve, 30 * (attempt + 1)));
    }
  }
}
export async function lockEnrollment(tx: GymTx, id: string) {
  await tx.$executeRaw`UPDATE "GymEnrollment" SET "status"="status" WHERE "id"=${id}`;
  const row = await tx.gymEnrollment.findUnique({ where: { id }, include: enrollmentInclude });
  if (!row) throw gymError("Enrollment not found.", 404);
  return row;
}
export async function lockMembers(tx: GymTx, ids: string[]) {
  for (const id of [...new Set(ids)].sort())
    await tx.$executeRaw`UPDATE "User" SET "active"="active" WHERE "id"=${id}`;
}
export const personSelect = { id: true, name: true, email: true, phone: true } as const;
export const enrollmentInclude = {
  members: { include: { user: { select: personSelect } } },
  coach: { select: { id: true, name: true, userId: true } },
  transaction: true,
  membership: true,
} as const;
export const isTraining = (kind: string) => ["PT", "COUPLE_PT", "GROUP_PT"].includes(kind);
