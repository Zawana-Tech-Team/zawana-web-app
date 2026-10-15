import type { PrismaClient } from "@prisma/client";
import { audit, gymError, gymTransaction, json, normalizeGymPackage, packageInput } from "./gymPolicy.js";
import type { z } from "zod";

export async function saveGymPackage(db: PrismaClient, actorId: string, input: z.input<typeof packageInput>, id?: string, expectedVersion?: number) {
  const data = normalizeGymPackage(input);
  return gymTransaction(db, async tx => {
    if (id) await tx.$executeRaw`UPDATE "GymPackage" SET "version"="version" WHERE "id"=${id}`;
    const previous = id ? await tx.gymPackage.findUnique({ where: { id } }) : null;
    if (id && !previous) throw gymError("Package not found.", 404);
    if (previous && previous.version !== expectedVersion)
      throw gymError("This package was edited elsewhere. Reload before saving.");
    if (previous) await tx.gymPackageRevision.upsert({
      where: { packageId_version: { packageId: previous.id, version: previous.version } },
      create: { packageId: previous.id, version: previous.version, snapshot: json(previous), actorId }, update: {},
    });
    const row = previous
      ? await tx.gymPackage.update({ where: { id }, data: { ...data, version: { increment: 1 } } })
      : await tx.gymPackage.create({ data });
    await tx.gymPackageRevision.create({ data: { packageId: row.id, version: row.version, snapshot: json(row), actorId } });
    await audit(tx, actorId, previous ? "PACKAGE_UPDATED" : "PACKAGE_CREATED", "package", row.id, previous || undefined, row);
    return row;
  });
}

/** Stable IDs and empty updates preserve Admin changes across repeated runs. */
export async function seedGymCatalog(db: PrismaClient) {
  const families = [
    { kind: "MEMBERSHIP", title: "Gym Membership", counts: [1, 3, 8, 12], prices: [170000, 435000, 720000, 1260000], min: 1, max: 1 },
    { kind: "PT", title: "Personal Training", counts: [1, 5, 10, 20, 30], prices: [35000, 160000, 300000, 560000, 780000], min: 1, max: 1 },
    { kind: "COUPLE_PT", title: "Couple PT", counts: [1, 5, 10, 20, 30], prices: [62000, 300000, 520000, 900000, 1200000], min: 2, max: 2 },
    { kind: "GROUP_PT", title: "Group PT", counts: [1, 5, 10, 20, 30], prices: [150000, 650000, 1100000, 1900000, 2400000], min: 5, max: 20 },
  ] as const;
  for (const f of families) for (const [i, count] of f.counts.entries()) {
    const id = `gym-initial-${f.kind.toLowerCase()}-${count}`;
    await gymTransaction(db, async tx => {
      const data = normalizeGymPackage({
        title: `${f.title} · ${count} ${f.kind === "MEMBERSHIP" ? "month(s)" : "session(s)"}`,
        kind: f.kind, price: f.prices[i], rate: Math.round(f.prices[i] / count),
        months: f.kind === "MEMBERSHIP" ? count : 0,
        sessions: f.kind === "MEMBERSHIP" ? 0 : count,
        minMembers: f.min, maxMembers: f.max, status: "active",
      });
      const row = await tx.gymPackage.upsert({ where: { id }, create: { id, ...data }, update: {} });
      await tx.gymPackageRevision.upsert({
        where: { packageId_version: { packageId: id, version: row.version } },
        create: { packageId: id, version: row.version, snapshot: json(row) }, update: {},
      });
    });
  }
}
