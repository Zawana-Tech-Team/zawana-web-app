import type { Prisma, PrismaClient } from '@prisma/client';

export const badmintonCategories = ['Court Rental', 'Private Course', 'Badminton Package', 'Weekly Class'] as const;
export const onlinePaymentMethods = ['Online Payment', 'Online payment', 'ONLINE', 'Online', 'Pay Online', 'KPay', 'KPAY', 'Manual (simulated)'];
export function paymentMethodMatches(stored: string | null, filter: string) {
  return filter === 'Cash' ? ['Cash', 'CASH'].includes(stored || '')
    : filter === 'Online Payment' ? onlinePaymentMethods.includes(stored || '') : stored === filter;
}
export function transactionCategory(row: { resourceType: string | null; item: string }, kind?: string) {
  if (kind === 'court') return 'Court Rental';
  if (kind === 'private_course') return 'Private Course';
  if (kind === 'class') return 'Weekly Class';
  if (['badminton_package', 'badminton_enrollment'].includes(row.resourceType || '')) return 'Badminton Package';
  // Only classify recognizable legacy labels; never guess or rewrite historical data.
  if (/^court rental\s*[·—-]/i.test(row.item)) return 'Court Rental';
  if (/^private course\s*[·—-]/i.test(row.item)) return 'Private Course';
  if (/^weekly class\s*[·—-]/i.test(row.item)) return 'Weekly Class';
  if (/^package(?: renewal)?\s*[·—-]/i.test(row.item)) return 'Badminton Package';
  return null;
}

export async function categoryWhere(db: PrismaClient, category: string): Promise<Prisma.TransactionWhereInput> {
  const kinds: Record<string, 'court' | 'private_course' | 'class'> = { 'Court Rental': 'court', 'Private Course': 'private_course', 'Weekly Class': 'class' };
  const kind = kinds[category];
  if (kind) {
    const bookings = await db.booking.findMany({ where: { kind }, select: { id: true } });
    const prefix = category === 'Court Rental' ? 'Court rental' : category === 'Private Course' ? 'Private course' : 'Weekly class';
    return { OR: [
      { resourceType: 'booking', resourceId: { in: bookings.map(b => b.id) } },
      ...(kind === 'private_course' ? [{ privateCoursePayment: { is: {} } }] : []),
      { resourceType: null, item: { startsWith: `${prefix} ·` } },
    ] };
  }
  return { OR: [
    { resourceType: { in: ['badminton_package', 'badminton_enrollment'] } },
    { resourceType: null, item: { startsWith: 'Package ·' } },
    { resourceType: null, item: { startsWith: 'Package renewal ·' } },
  ] };
}

export async function presentTransactions<T extends { id: string; resourceType: string | null; resourceId: string | null; item: string; business: string }>(db: PrismaClient, rows: T[]) {
  const ids = rows.filter(r => r.resourceType === 'booking' && r.resourceId).map(r => r.resourceId!);
  const bookings = ids.length ? await db.booking.findMany({ where: { id: { in: ids } }, select: { id: true, kind: true } }) : [];
  const kinds = new Map(bookings.map(b => [b.id, b.kind]));
  const privatePayments = rows.length ? await db.privateCoursePayment.findMany({ where: { transactionId: { in: rows.map(row => row.id) } }, select: { transactionId: true, bookingId: true } }) : [];
  const privateIds = new Map(privatePayments.map(row => [row.transactionId, row.bookingId]));
  return rows.map(row => ({ ...row, category: row.business === 'Badminton' ? transactionCategory(row, privateIds.has(row.id) ? 'private_course' : kinds.get(row.resourceId || '')) : null }));
}

export function transactionOrder(sort: string): Prisma.TransactionOrderByWithRelationInput[] {
  if (sort === 'oldest') return [{ createdAt: 'asc' }, { id: 'asc' }];
  if (sort === 'amount_desc') return [{ finalAmount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
  if (sort === 'amount_asc') return [{ finalAmount: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }];
  return [{ createdAt: 'desc' }, { id: 'desc' }];
}
