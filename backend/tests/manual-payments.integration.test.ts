import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { PrismaClient, type Role } from '@prisma/client';
import { createSessionService } from '../src/services/authSession.js';
import { today } from '../src/services/courtPolicy.js';

test('manual confirmations across services commit one linked receipt and never call a gateway', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-manual-payment-qa-'));
  const url = process.env.MANUAL_QA_DATABASE_URL || `file:${join(dir, 'qa.db').replaceAll('\\', '/')}`;
  if (!url.startsWith('file:') && !new URL(url).pathname.startsWith('/manual_qa_')) throw new Error('Use an isolated manual_qa_ database.');
  if (url.startsWith('file:')) writeFileSync(url.slice(5), '');
  const pg = !url.startsWith('file:'), root = fileURLToPath(new URL('..', import.meta.url));
  const schema = pg ? 'prisma/postgresql/schema.prisma' : 'prisma/schema.prisma';
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, AUTH_MODE: pg ? 'firebase' : 'database', NODE_ENV: 'test', JWT_SECRET: 'isolated-manual-payment-regression-secret-32-characters', KPAY_CHECKOUT_ADAPTER_URL: '', KPAY_WEBHOOK_SECRET: '', KPAY_ADAPTER_API_KEY: '' };
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', schema], { cwd: root, env, stdio: 'pipe' });
  const db = new PrismaClient({ datasources: { db: { url } } });
  const tokens = new Map<string, string>();
  const sessions = createSessionService(db);
  const user = async (role: Role, name = role) => { const row = await db.user.create({ data: { role, name, email: `${randomUUID()}@manual.test` } }); tokens.set(row.id, (await sessions.issue(db, row, 'database_password', [])).accessToken); return row; };
  const admin = await user('admin'), member = await user('member'), other = await user('member'), cashier = await user('cafe_fo'), store = await user('store_fo'), clinic = await user('clinic_fo'), gym = await user('gym_fo');
  const net = createServer(); await new Promise<void>(resolve => net.listen(0, '127.0.0.1', resolve)); const port = (net.address() as {port:number}).port; await new Promise<void>(resolve => net.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { cwd: root, env: { ...env, PORT: String(port), CLIENT_URL: `http://127.0.0.1:${port}` }, stdio: 'ignore' });
  t.after(async () => { child.kill(); await new Promise(resolve => child.once('exit', resolve)); await db.$disconnect(); });
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 200; i++) { if (child.exitCode !== null) throw new Error('QA backend exited.'); if (await fetch(`${base}/health`).then(r => r.ok).catch(() => false)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  const request = async (path: string, body?: unknown, actor = admin.id, expected = 200, key?: string, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${tokens.get(actor)}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); assert.equal(response.status, expected, `${path}: ${data.message || 'unexpected response'}`); return data;
  };
  const confirm = (resourceType: string, resourceId: string, actor = member.id, expected = 200) => request('/payments/confirm', { resourceType, resourceId, confirmed: true }, actor, expected);
  const future = new Date(`${today()}T12:00:00Z`); future.setUTCDate(future.getUTCDate() + 4); const date = future.toISOString().slice(0, 10);
  const court = await db.court.create({ data: { name: 'QA Court', price: 20000, type: 'Standard', surface: 'Indoor', features: [] } });
  const booking = await db.booking.create({ data: { userId: member.id, courtId: court.id, code: randomUUID(), kind: 'court', title: court.name, date, time: '7:00 AM â€” 8:00 AM', price: 20000, location: 'Arena', status: 'CONFIRMED' } });
  await t.test('court reservation saves payment atomically, with no second confirmation', async () => {
    const body = { kind: 'court', courtId: court.id, date, time: '6:00 AM â€” 7:00 AM' }, key = randomUUID();
    const first = await request('/bookings', body, member.id, 201, key);
    assert.equal(first.booking.paymentStatus, 'paid');
    const retry = await request('/bookings', body, member.id, 201, key);
    assert.equal(retry.booking.id, first.booking.id);
    assert.equal(await db.transaction.count({ where: { resourceType: 'booking', resourceId: first.booking.id, status: 'paid' } }), 1);
    assert.equal(await db.paymentAttempt.count(), 0);
  });
  await t.test('ownership, explicit intent, authoritative amount and concurrent retries', async () => {
    await confirm('booking', booking.id, other.id, 403);
    await request('/payments/confirm', { resourceType: 'booking', resourceId: booking.id }, member.id, 400);
    await request('/payments/confirm', { resourceType: 'booking', resourceId: booking.id, confirmed: true, amount: 1 }, member.id, 400);
    assert.equal((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus, 'pending');
    const results = await Promise.all(Array.from({ length: 4 }, () => confirm('booking', booking.id)));
    assert.equal(new Set(results.map(result => result.transaction.id)).size, 1);
    assert.equal(results[0].transaction.amount, 20000); assert.equal(results[0].transaction.confirmationMode, 'SIMULATED');
    assert.equal((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).paymentStatus, 'paid');
    assert.equal(await db.transaction.count({ where: { resourceType: 'booking', resourceId: booking.id } }), 1);
    await db.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'refunded' } });
    await confirm('booking', booking.id, member.id, 409);
    await db.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'paid' } });

  });
  await t.test('database failure rolls back both ledger and booking; retry recovers', async () => {
    const row = await db.booking.create({ data: { ...Object.fromEntries(Object.entries(booking).filter(([key]) => !['id', 'createdAt', 'updatedAt', 'code'].includes(key))), code: randomUUID(), time: '8:00 AM â€” 9:00 AM', paymentStatus: 'pending' } as typeof booking });
    if (pg) {
      await db.$executeRawUnsafe(`CREATE FUNCTION manual_qa_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Injected QA ledger failure'; END; $$ LANGUAGE plpgsql`);
      await db.$executeRawUnsafe(`CREATE TRIGGER manual_qa_fail BEFORE INSERT ON "Transaction" FOR EACH ROW EXECUTE FUNCTION manual_qa_fail()`);
    } else await db.$executeRawUnsafe(`CREATE TRIGGER manual_qa_fail BEFORE INSERT ON "Transaction" BEGIN SELECT RAISE(ABORT, 'Injected QA ledger failure'); END`);
    const failedBody = { kind: 'court', courtId: court.id, date, time: '6:00 PM - 7:00 PM' }, failedKey = randomUUID();
    try {
      await confirm('booking', row.id, member.id, pg ? 500 : 409);
      await request('/bookings', failedBody, member.id, pg ? 500 : 409, failedKey);
      assert.equal(await db.booking.count({ where: { courtId: court.id, date, time: '6:00 PM \u2014 7:00 PM' } }), 0);
    }
    finally { await db.$executeRawUnsafe(pg ? 'DROP TRIGGER manual_qa_fail ON "Transaction"' : 'DROP TRIGGER manual_qa_fail'); if (pg) await db.$executeRawUnsafe('DROP FUNCTION manual_qa_fail()'); }
    assert.equal((await db.booking.findUniqueOrThrow({ where: { id: row.id } })).paymentStatus, 'pending');
    assert.equal(await db.transaction.count({ where: { resourceId: row.id } }), 0);
    await confirm('booking', row.id);
  });
  await t.test('private courses preserve coach approval and finance source', async () => {
    const row = await db.booking.create({ data: { userId: member.id, code: randomUUID(), kind: 'private_course', title: 'QA coaching', date, time: '10:00 AM â€” 11:00 AM', price: 50000, location: 'Arena', status: 'PENDING_COACH_CONFIRMATION' } });
    await confirm('booking', row.id, member.id, 409);
    await db.booking.update({ where: { id: row.id }, data: { status: 'AWAITING_PAYMENT', coachAcceptedAt: new Date(), paymentExpiresAt: new Date(Date.now() + 86400000) } });
    await confirm('booking', row.id); await confirm('booking', row.id);
    const paid = await db.privateCoursePayment.findUniqueOrThrow({ where: { bookingId: row.id } });
    assert.equal(paid.paymentSource, 'SIMULATED'); assert.equal(paid.verifiedAt, null);
    assert.equal((await db.booking.findUniqueOrThrow({ where: { id: row.id } })).status, 'CONFIRMED');
  });
  await t.test('gym membership and training activate only after confirmation', async () => {
    for (const kind of ['MEMBERSHIP', 'PT']) {
      const pkg = await db.gymPackage.create({ data: { description: "QA", title: `QA ${kind}`, price: 100000, duration: 30, rate: 100000, benefits: [], status: 'active', kind, months: kind === 'MEMBERSHIP' ? 1 : 0, sessions: kind === 'PT' ? 5 : 0, validityDays: 30 } });
      const result = await request('/gym/enrollments', { packageId: pkg.id, packageVersion: pkg.version, memberIds: [member.id], startDate: today(), requestKey: randomUUID() }, gym.id, 201);
      assert.equal(result.status, 'PENDING_PAYMENT'); assert.equal(result.transactionId, null);
      const paid = await confirm('gym_enrollment', result.id); await confirm('gym_enrollment', result.id);
      assert.equal(paid.enrollment.status, 'ACTIVE'); assert.equal(paid.transaction.confirmationMode, 'SIMULATED');
      if (kind === 'MEMBERSHIP') assert.equal(await db.membership.count({ where: { enrollmentId: result.id } }), 1);
    }
  });
  await t.test('badminton package requests are unpaid; explicit purchase and retry post once', async () => {
    const category = await db.badmintonPackageCategory.findUniqueOrThrow({ where: { code: 'FOUNDATION' } });
    const pkg = await db.badmintonPackage.create({ data: { title: 'QA Foundation', description: 'QA', sessions: 5, validity: 30, price: 80000, categoryId: category.id } });
    const key = randomUUID(); const pending = await request(`/member/badminton-packages/${pkg.id}/purchase`, { requestKey: key }, member.id, 201);
    assert.equal(pending.purchase.status, 'PENDING'); assert.equal(pending.enrollment, null);
    const paid = await request(`/member/badminton-packages/${pkg.id}/purchase`, { requestKey: key, confirmed: true }, member.id, 201);
    const retry = await request(`/member/badminton-packages/${pkg.id}/purchase`, { requestKey: key, confirmed: true }, member.id, 201);
    assert.equal(paid.purchase.status, 'PAID'); assert.equal(paid.enrollment.id, retry.enrollment.id); assert.equal(paid.transaction.id, retry.transaction.id);
  });
  await t.test('staff badminton sales and renewals keep discount rules and idempotent ledger links', async () => {
    const category = await db.badmintonPackageCategory.findUniqueOrThrow({ where: { code: 'FOUNDATION' } });
    const pkg = await db.badmintonPackage.create({ data: { title: 'Desk QA', description: '', sessions: 3, validity: 30, price: 60000, categoryId: category.id } });
    const input = { userId: member.id, packageId: pkg.id, paymentMethod: 'Manual (simulated)', discountPercent: 10 };
    const key = randomUUID(); const first = await request('/badminton/enrollments', input, admin.id, 201, key);
    const retry = await request('/badminton/enrollments', input, admin.id, 201, key); assert.equal(retry.id, first.id);
    const sale = await db.transaction.findUniqueOrThrow({ where: { resourceType_resourceId: { resourceType: 'badminton_enrollment', resourceId: first.id } } });
    assert.equal(sale.finalAmount, 54000); assert.equal(sale.confirmationMode, 'SIMULATED');
    await request('/badminton/enrollments', { ...input, discountPercent: 0 }, admin.id, 409, key);
    const renewalKey = randomUUID(), renewalInput = { packageId: pkg.id, paymentMethod: 'Cash' };
    const renewal = await request(`/badminton/enrollments/${first.id}/renew`, renewalInput, admin.id, 200, renewalKey);
    assert.equal((await request(`/badminton/enrollments/${first.id}/renew`, renewalInput, admin.id, 201, renewalKey)).id, renewal.id);
    assert.equal(await db.transaction.count({ where: { resourceType: 'badminton_enrollment', resourceId: renewal.id } }), 1);
  });
  await t.test('clinic price, permission and paid status use a linked ledger receipt', async () => {
    const row = await db.appointment.create({ data: { userId: member.id, patient: member.name, doctor: 'QA', date, time: '10:00', type: 'Physiotherapy', price: 45000 } });
    await request(`/payments/appointments/${row.id}/price`, { price: 47000 }, clinic.id, 200, undefined, 'PATCH');
    await confirm('appointment', row.id, cashier.id, 403); await confirm('appointment', row.id, clinic.id); await confirm('appointment', row.id, member.id);
    assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: row.id } })).paymentStatus, 'paid');
  });
  await t.test('store stock/tax and cafe orders remain unpaid on creation; explicit POS confirmations are deduplicated', async () => {
    const product = await db.product.create({ data: { description: 'QA', barcode: randomUUID(), name: 'QA Racket', price: 10000, tax: 5, stock: 10, category: 'Rackets', sku: randomUUID(), status: 'active' } });
    const input = { customer: 'Walk-in QA', items: [{ productId: product.id, quantity: 1 }], paymentMethod: 'Pay Online' };
    const pending = await request('/store/orders', input, store.id, 201, randomUUID());
    assert.equal(pending.status, 'pending'); assert.equal(pending.paid, 0);
    await confirm('store_order', pending.id, store.id);
    const key = randomUUID(); const paid = await request('/store/orders', { ...input, confirmed: true }, store.id, 201, key);
    const retry = await request('/store/orders', { ...input, confirmed: true }, store.id, 201, key);
    assert.equal(paid.id, retry.id); assert.equal(paid.paid, 10500); assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock, 8);
    const menu = await db.cafeMenuItem.create({ data: { name: 'QA Coffee', category: 'Drinks', price: 3000 } });
    const cafeInput = { location: 'Cafe', items: [{ id: menu.id, quantity: 2 }], paymentMethod: 'ONLINE' };
    const order = await request('/cafe/orders', cafeInput, member.id, 201, randomUUID()); assert.equal(order.order.paymentStatus, 'pending');
    await confirm('cafe_order', order.order.id); await confirm('cafe_order', order.order.id);
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: order.order.transactionId } })).status, 'paid');
    const cashKey = randomUUID(); const cash = await request('/cafe/orders', { ...cafeInput, paymentMethod: 'CASH', confirmed: true }, cashier.id, 201, cashKey);
    assert.equal(cash.order.paymentStatus, 'paid'); assert.equal((await request('/cafe/orders', { ...cafeInput, paymentMethod: 'CASH', confirmed: true }, cashier.id, 201, cashKey)).order.id, cash.order.id);
  });
  await t.test('Badminton FO ledger filters all categories, preserves legacy methods and scopes records', async () => {
    const fo = await user('badminton_fo');
    const weekly = await db.booking.create({ data: { userId: member.id, code: randomUUID(), kind: 'class', title: 'QA Weekly', date, time: '3:00 PM — 4:00 PM', price: 12000, location: 'Arena', status: 'CONFIRMED' } });
    await confirm('booking', weekly.id, fo.id);
    const weeklyReceipt = await db.transaction.findUniqueOrThrow({ where: { resourceType_resourceId: { resourceType: 'booking', resourceId: weekly.id } } });
    const legacy = await db.transaction.create({ data: { customer: 'QA historical online', date, business: 'Badminton', item: 'Package · QA historical', amount: 3000, discount: 0, tax: 0, finalAmount: 3000, paymentMethod: 'KPay', staff: 'Historical cashier', status: 'refunded' } });
    await db.transaction.create({ data: { customer: 'QA failed', date, business: 'Badminton', item: 'Package · QA failed', amount: 1000, discount: 0, tax: 0, finalAmount: 1000, paymentMethod: 'Cash', staff: 'QA', status: 'failed' } });
    for (const category of ['Court Rental', 'Private Course', 'Badminton Package', 'Weekly Class']) {
      const result = await request(`/transactions?business=Badminton&page=1&category=${encodeURIComponent(category)}`, undefined, fo.id);
      assert.ok(result.data.length > 0, category);
      assert.ok(result.data.every((row: { category: string }) => row.category === category));
      if (category === 'Weekly Class') assert.ok(result.data.some((row: { id: string }) => row.id === weeklyReceipt.id));
    }
    const history = await request(`/transactions?page=1&paymentMethod=Online%20Payment&status=refunded&from=${date}&to=${date}&q=historical`, undefined, fo.id);
    assert.equal(history.data.length, 1); assert.equal(history.data[0].id, legacy.id); assert.equal(history.data[0].paymentMethod, 'KPay');
    const failed = await request('/transactions?page=1&status=failed&paymentMethod=Cash', undefined, fo.id);
    assert.equal(failed.data.length, 1); assert.equal(failed.data[0].customer, 'QA failed');
    for (const sort of ['amount_asc', 'amount_desc']) {
      const result = await request(`/transactions?page=1&sort=${sort}`, undefined, fo.id);
      const amounts = result.data.map((row: { finalAmount: number }) => row.finalAmount);
      assert.deepEqual(amounts, [...amounts].sort((a, b) => sort === 'amount_asc' ? a - b : b - a));
      assert.ok(result.data.every((row: { business: string }) => row.business === 'Badminton'));
    }
    await request('/transactions?page=1&business=Gym', undefined, fo.id, 403);
    await request('/transactions?page=1&category=unknown', undefined, fo.id, 400);
    await request('/transactions?page=1&from=2027-02-01&to=2026-01-01', undefined, fo.id, 400);
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: legacy.id } })).paymentMethod, 'KPay');
  });
  await t.test('gateway retired, histories and session re-login retain confirmed payments', async () => {
    await request('/payments/kpay/webhook', { status: 'PAID' }, member.id, 410);
    assert.equal(await db.paymentAttempt.count(), 0);
    const notifications = await request('/notifications', undefined, member.id); assert.ok(Array.isArray(notifications)); assert.ok(notifications.some((item: { title: string }) => item.title === 'Manual payment confirmed'));

    const receipts = await request('/transactions?status=paid', undefined, member.id);
    assert.ok(receipts.length >= 5); assert.ok(receipts.every((row: {userId:string}) => row.userId === member.id));
    tokens.set(member.id, (await sessions.issue(db, member, 'database_password', [])).accessToken);
    const refreshed = await request(`/payments/${receipts[0].id}`, undefined, member.id);
    assert.equal(refreshed.status, 'PAID'); assert.equal(refreshed.checkoutUrl, null);
    assert.ok((await request('/transactions?status=paid', undefined, admin.id)).length > receipts.length);
  });
});
