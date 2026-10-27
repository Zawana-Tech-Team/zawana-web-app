import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';
import type { Prisma } from '@prisma/client';
export async function categoryPreflight(db: Pick<Prisma.TransactionClient, '$queryRawUnsafe'>) {
  // SELECT * intentionally supports both sides of the forward migration. Read-only.
  const [categories, packages, enrollments, checkIns, visits] = await Promise.all([
    db.$queryRawUnsafe<any[]>('SELECT * FROM "BadmintonPackageCategory"'),
    db.$queryRawUnsafe<any[]>('SELECT * FROM "BadmintonPackage"'),
    db.$queryRawUnsafe<any[]>('SELECT * FROM "BadmintonEnrollment"'),
    db.$queryRawUnsafe<any[]>('SELECT * FROM "BadmintonCheckIn"'),
    db.$queryRawUnsafe<any[]>('SELECT * FROM "BadmintonQrVisit"'),
  ]);
  const codes = ['FOUNDATION', 'SOCIAL', 'PATHWAY'];
  const alias = (c: any) => String(c.name).trim().toUpperCase();
  const categoryCode = (c: any) => c && (c.code || (codes.includes(alias(c)) && categories.filter(x => alias(x) === alias(c)).length === 1 ? alias(c) : null));
  const catalogue = new Map(packages.map(p => [p.id, { ...p, code: categoryCode(categories.find(c => c.id === p.categoryId)) }]));
  const unresolvedEnrollments = enrollments.filter(e => !e.categoryCode && !catalogue.get(e.packageId)?.code).map(e => ({ id: e.id, packageId: e.packageId, status: e.status }));
  const groups = new Map<string, string[]>();
  const unclassifiedCheckIns: string[] = [], invalidSnapshots: string[] = [];
  for (const c of checkIns) {
    const e = enrollments.find(e => e.id === c.enrollmentId);
    let snapshot: any, invalid = false;
    try { snapshot = c.packageSnapshot ? JSON.parse(c.packageSnapshot) : null; } catch { invalidSnapshots.push(c.id); invalid = true; }
    const code = c.categoryCode || (!invalid && e && (!snapshot || snapshot.packageId === e.packageId) && (e.categoryCode || catalogue.get(e.packageId)?.code));
    if (!code) unclassifiedCheckIns.push(c.id);
    else {
      const key = `${c.memberId || e?.userId || e?.studentId}:${code}:${c.date}`;
      groups.set(key, [...(groups.get(key) || []), c.id]);
    }
  }
  const purchases = await db.$queryRawUnsafe<any[]>('SELECT * FROM "BadmintonPackagePurchase"');
  return {
    categoryMappings: categories.map(c => ({ id: c.id, name: c.name, proposedCode: categoryCode(c) || null })),
    packages: packages.map(p => ({ id: p.id, title: p.title, categoryCode: catalogue.get(p.id)?.code || null, enrollments: enrollments.filter(e => e.packageId === p.id).length })),
    unresolvedEnrollments,
    unresolvedActiveEnrollments: unresolvedEnrollments.filter(e => e.status === 'active'),
    unclassifiedCheckIns, invalidSnapshots,
    conflictingPurchases: enrollments.filter(e => e.purchaseId && !purchases.some(p => p.id === e.purchaseId && p.packageId === e.packageId && p.userId === e.userId)).map(e => e.id),
    historicalDuplicateGroups: [...groups.values()].filter(ids => ids.length > 1),
    orphanQrVisits: visits.filter(v => !checkIns.some(c => c.id === v.checkInId)).map(v => v.id),
    counts: { categories: categories.length, packages: packages.length, enrollments: enrollments.length, checkIns: checkIns.length, qrVisits: visits.length },
    balances: [...enrollments].sort((a, b) => a.id.localeCompare(b.id)).map(e => ({ id: e.id, total: e.sessionsTotal, remaining: e.sessionsRemaining })),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new PrismaClient();
  try {
    const report = await categoryPreflight(db);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (process.argv.includes('--require-ready') && (report.unresolvedActiveEnrollments.length || report.conflictingPurchases.length || report.invalidSnapshots.length || report.orphanQrVisits.length)) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
