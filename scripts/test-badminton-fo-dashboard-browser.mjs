import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const require = createRequire(new URL('../tooling/gym/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'zawana-court-desk-'));
const artifacts = process.env.COURT_DESK_ARTIFACTS || join(temp, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const freePort = async () => { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r)); return port; };
const apiPort = await freePort(), uiPort = await freePort();
const ui = `http://127.0.0.1:${uiPort}`, api = `http://127.0.0.1:${apiPort}/api`;
const fixture = join(temp, 'fixture.json'), database = join(temp, 'qa.db');
writeFileSync(database, '');
const env = { ...process.env, DATABASE_URL: `file:${database.replaceAll('\\', '/')}`, NODE_ENV: 'test', AUTH_MODE: 'database', JWT_SECRET: 'court-desk-isolated-test-secret-more-than-thirty-two-characters', PORT: String(apiPort), CLIENT_URL: ui, PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`, VITE_AUTH_MODE: 'database', VITE_API_URL: api, COURT_DESK_FIXTURE: fixture };
const children = [], errors = [];
let browser;
const start = (args, cwd) => { const child = spawn(process.execPath, args, { cwd, env, stdio: 'ignore' }); children.push(child); };
const ready = async url => { for (let i = 0; i < 160; i++) { if (children.some(c => c.exitCode !== null)) throw new Error('A QA server exited'); if (await fetch(url).then(r => r.ok).catch(() => false)) return; await new Promise(r => setTimeout(r, 125)); } throw new Error('QA server did not start'); };
try {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  execFileSync(process.execPath, ['--import', 'tsx', 'tests/court-desk-browser-fixture.ts'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  const data = JSON.parse(readFileSync(fixture, 'utf8'));
  start(['--import', 'tsx', 'src/server.ts'], join(root, 'backend'));
  start(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], root);
  await Promise.all([ready(`${api}/health`), ready(ui)]);
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' });
  await context.addInitScript(({ token, origin }) => { if (location.origin === origin) { localStorage.setItem('zawana_access_token', token); localStorage.setItem('zawana_language', 'en'); } }, { token: data.foToken, origin: ui });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));


  const { PrismaClient } = createRequire(new URL('../backend/package.json', import.meta.url))('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  page.setDefaultTimeout(15000);
  try {
    const current = new Date(`${data.date}T12:00:00Z`); current.setUTCDate(current.getUTCDate() - 2); const date = current.toISOString().slice(0, 10);
    await context.addInitScript(iso => { const Original = window.Date; const instant = Original.parse(iso); window.Date = class extends Original { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } }; }, `${date}T03:30:00Z`);
    const court = await db.booking.create({ data: { code: 'FO-DESK-TODAY', kind: 'court', userId: data.memberId, courtId: data.courts[3].id, title: 'Court 2', date, time: '12:00 AM — 11:59 PM', status: 'CONFIRMED', paymentStatus: 'paid', price: 50000, location: 'Arena', meta: JSON.stringify({ customerName: 'Walk-in Desk Visitor' }) } });
    const course = await db.booking.create({ data: { code: 'FO-PRIVATE-TODAY', kind: 'private_course', userId: data.memberId, courtId: data.courts[2].id, coachId: data.coachId, title: 'Morning Private Fundamentals', date, time: '12:00 AM — 11:59 PM', status: 'CONFIRMED', paymentStatus: 'paid', price: 65000, location: 'Arena' } });
    const weekly = await db.courtBlock.create({ data: { title: 'Today Foundation Class', courtId: data.courts[6].id, date, start: '00:00', end: '23:59', type: 'class', active: true } });
    for (let i = 0; i < 103; i++) await db.booking.create({ data: { code: `FO-HISTORY-${i}`, kind: 'court', userId: data.memberId, courtId: data.courts[4].id, title: 'Cancelled preview', date, time: '12:00 AM — 11:59 PM', status: 'CANCELLED', paymentStatus: 'pending', price: 20000, location: 'Arena' } });
    const sale = async (id, amount, status, business = 'Badminton', resourceType = null, resourceId = null) => db.transaction.create({ data: { id, userId: data.memberId, date, customer: 'Desk visitor', business, item: 'Desk fixture receipt', amount, discount: 0, tax: 0, finalAmount: amount, status, paymentMethod: 'Cash', staff: 'Desk Cashier', resourceType, resourceId } });
    await sale('FO-DESK-PAID', 50000, 'paid', 'Badminton', 'booking', court.id); await sale('FO-DESK-REFUND', -5000, 'refunded', 'Badminton', 'booking_refund', 'prior-refund-fixture'); await sale('FO-DESK-PENDING', 900000, 'pending'); await sale('FO-CAFE-PAID', 800000, 'paid', 'Cafe');
    const adminHeaders = { Authorization: `Bearer ${data.token}` }, memberHeaders = { Authorization: `Bearer ${data.memberToken}` };
    const created = await context.request.post(`${api}/rescheduling/requests`, { headers: adminHeaders, data: { bookingId: data.bookingId, reason: 'MAINTENANCE' } }); assert.equal(created.status(), 201, await created.text()); const request = await created.json();
    const response = await context.request.post(`${api}/rescheduling/requests/${request.id}/respond`, { headers: memberHeaders, data: { action: 'ADMIN_HANDLING' } }); assert.equal(response.status(), 200, await response.text());
    const cancellation = await db.bookingCancellationRequest.create({ data: { bookingId: court.id, requestedById: data.memberId, reason: 'Manual cancellation requires refund review', status: 'requested', refundStatus: 'manual_review' } });
    const before = await db.booking.findMany({ orderBy: { id: 'asc' } }), ledger = await db.transaction.findMany({ orderBy: { id: 'asc' } });
    await page.route('**/api/dashboard', route => route.fulfill({ status: 503, json: { message: 'Front desk totals unavailable' } }));
    await page.goto(`${ui}/badminton-fo`); await page.getByRole('heading', { name: 'Badminton desk', exact: true }).waitFor(); await page.getByRole('alert').getByText('Front desk totals unavailable', { exact: false }).waitFor();
    const schedule = page.getByRole('region', { name: 'Today’s schedule', exact: true }), metrics = page.getByRole('region', { name: 'Today’s badminton totals', exact: true }), attention = page.getByRole('region', { name: 'Front desk follow-up', exact: true });
    await schedule.getByText('Walk-in Desk Visitor', { exact: true }).waitFor(); await schedule.getByText('Morning Private Fundamentals', { exact: true }).waitFor(); await schedule.getByText('Today Foundation Class', { exact: true }).waitFor(); assert.equal(await schedule.getByRole('listitem').count(), 3, 'Today’s preview reads every booking page and excludes cancelled records');
    assert.equal(await page.getByRole('textbox', { name: 'Search bookings', exact: true }).count(), 0, 'The dashboard does not duplicate the history workspace');assert.equal(await page.locator('.workspace-cover').count(),0);assert.equal(await page.locator('.workspace-page__trail').count(),0);
    await page.unroute('**/api/dashboard'); await page.getByRole('button', { name: 'Retry dashboard', exact: true }).click(); await metrics.getByText('45,000', { exact: true }).waitFor(); assert.equal(await metrics.locator('article').count(), 3); await metrics.locator('article').filter({ hasText: 'Court rentals today' }).getByText('1', { exact: true }).waitFor(); await metrics.locator('article').filter({ hasText: 'Package check-ins today' }).getByText('0', { exact: true }).waitFor();
    await attention.getByRole('link').filter({ hasText: 'Reschedule assistance' }).getByText('1', { exact: true }).waitFor(); await attention.getByRole('link').filter({ hasText: 'Refund requests' }).getByText('1', { exact: true }).waitFor();
    for (const width of [1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `FO dashboard fits ${width}`); await page.screenshot({ path: join(artifacts, `badminton-fo-dashboard-${width}.png`), fullPage: true }); }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const actions = page.getByRole('navigation', { name: 'Front desk actions', exact: true });
    for (const [name, path] of [['Court rental', '/badminton-fo/courts'], ['Package check-in', '/badminton-fo/check-in'], ['Activate package', '/badminton-fo/packages']]) { await actions.getByRole('link').filter({ hasText: name }).click(); await page.waitForURL(url => url.pathname === path); await page.goto(`${ui}/badminton-fo`); await metrics.getByText('45,000', { exact: true }).waitFor(); }
    await schedule.getByRole('link').filter({ hasText: 'Morning Private Fundamentals' }).click(); await page.waitForURL(url => url.pathname === '/badminton-fo/bookings' && url.searchParams.get('booking') === course.id && url.searchParams.get('kind') === 'private_course'); await page.getByRole('region', { name: 'Booking history records', exact: true }).getByRole('button', { name: 'View Details', exact: true }).click(); await page.getByRole('dialog', { name: 'Booking history details', exact: true }).getByText(course.code, { exact: true }).waitFor(); await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.goto(`${ui}/badminton-fo`); await attention.getByRole('link').filter({ hasText: 'Reschedule assistance' }).click(); await page.getByRole('region', { name: 'Reschedule request management', exact: true }).getByRole('button', { name: 'Arrange replacement', exact: true }).waitFor();
    await page.goto(`${ui}/badminton-fo`); await attention.getByRole('link').filter({ hasText: 'Refund requests' }).click(); await page.getByRole('region', { name: 'Refund management', exact: true }).getByText(court.code, { exact: false }).waitFor();
    await page.goto(`${ui}/badminton-fo`); await metrics.getByRole('link', { name: 'Finance', exact: true }).click(); await page.waitForURL('**/badminton-fo/transactions');
    await page.goto(`${ui}/badminton-fo`); await metrics.getByRole('link', { name: 'Attendance history', exact: true }).click(); await page.waitForURL('**/badminton-fo/attendance');
    assert.deepEqual(await db.booking.findMany({ orderBy: { id: 'asc' } }), before); assert.deepEqual(await db.transaction.findMany({ orderBy: { id: 'asc' } }), ledger);
    await page.goto(`${ui}/badminton-fo`); await metrics.getByText('45,000', { exact: true }).waitFor(); await page.route('**/api/dashboard', route => route.fulfill({ status: 503, json: { message: 'Refresh temporarily unavailable' } })); await page.getByRole('button', { name: 'Refresh dashboard', exact: true }).click(); await page.getByRole('alert').getByText('Refresh temporarily unavailable', { exact: false }).waitFor(); await metrics.getByText('45,000', { exact: true }).waitFor(); await page.unroute('**/api/dashboard'); await page.getByRole('button', { name: 'Retry dashboard', exact: true }).click(); await page.getByRole('alert').waitFor({ state: 'hidden' });
    await sale('FO-LIVE-SALE', 1000, 'paid'); await page.evaluate(() => window.dispatchEvent(new Event('zawana-payments-refresh'))); await metrics.getByText('46,000', { exact: true }).waitFor();
    await db.booking.updateMany({ where: { id: { in: [court.id, course.id] } }, data: { status: 'CANCELLED' } }); await db.courtBlock.update({ where: { id: weekly.id }, data: { active: false } }); await db.bookingRescheduleRequest.update({ where: { id: request.id }, data: { activeKey: null, status: 'COMPLETED' } }); await db.bookingCancellationRequest.update({ where: { id: cancellation.id }, data: { status: 'rejected', refundStatus: 'REFUND_REJECTED' } });
    const expected = await db.booking.findMany({ orderBy: { id: 'asc' } }), expectedLedger = await db.transaction.findMany({ orderBy: { id: 'asc' } }); await page.evaluate(() => window.dispatchEvent(new Event('zawana-bookings-changed'))); await schedule.getByText('No more sessions today', { exact: true }).waitFor(); await attention.getByText('No requests need staff action.', { exact: true }).waitFor();
    assert.deepEqual(await db.booking.findMany({ orderBy: { id: 'asc' } }), expected); assert.deepEqual(await db.transaction.findMany({ orderBy: { id: 'asc' } }), expectedLedger); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, checks: ['accurate Badminton-only daily net revenue and rental/check-in totals', 'court/private/weekly preview reads all pages and excludes cancelled/ended sessions', 'quick actions and booking/request/refund/finance/attendance links', 'refund attention includes manual cancellation review without a reschedule request', 'initial and refresh errors, retry and retained figures', 'live payment and booking updates, empty schedule and cleared follow-up', '1440/768/390/320 layouts and no duplicated history workspace', 'browsing preserves bookings and ledger'], artifacts }));
  } catch (error) { await page.screenshot({ path: join(artifacts, 'badminton-fo-dashboard-failure.png') }).catch(() => {}); throw error; }
  finally { await db.$disconnect(); }
} finally { await browser?.close(); children.forEach(child => child.kill()); }
