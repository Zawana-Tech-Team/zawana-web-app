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
const frontOffice = process.env.COURT_DESK_ROLE === 'badminton_fo';
const courtDeskPath = frontOffice ? '/badminton-fo/courts' : '/admin/court-rentals';
const bookingPath = frontOffice ? '/badminton-fo/bookings' : '/admin/court-rentals';
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
  await context.addInitScript(({ token, origin }) => { if (location.origin === origin) { localStorage.setItem('zawana_access_token', token); localStorage.setItem('zawana_language', 'en'); } }, { token: frontOffice ? data.foToken : data.token, origin: ui });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));


  const { PrismaClient } = createRequire(new URL('../backend/package.json', import.meta.url))('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  page.setDefaultTimeout(15000);
  try {
    const headers = { Authorization: `Bearer ${frontOffice ? data.foToken : data.token}` }, memberHeaders = { Authorization: `Bearer ${data.memberToken}` };
    await db.user.update({ where: { id: data.memberId }, data: { phone: '099123456' } });
    const bookings = [], requests = [];
    for (let i = 0; i < 13; i++) {
      const day = new Date(`${data.date}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + i + 5); const date = day.toISOString().slice(0, 10);
      const booking = await db.booking.create({ data: { code: `ADMIN-REFUND-TAB-${i}`, kind: 'court', userId: data.memberId, courtId: data.courts[0].id, title: 'Court 1', date, time: '6:00 AM — 7:00 AM', price: 20000, status: 'CONFIRMED', paymentStatus: 'paid', location: 'Arena' } }); bookings.push(booking);
      if (i !== 12) await db.transaction.create({ data: { userId: data.memberId, business: 'Badminton', date, customer: 'Alex Tan', item: 'Court rental', amount: 20000, discount: 0, tax: 0, finalAmount: 20000, paymentMethod: 'Cash', staff: 'Desk Preview', status: 'paid', resourceType: 'booking', resourceId: booking.id } });
      const sent = await context.request.post(`${api}/rescheduling/requests`, { headers, data: { bookingId: booking.id, reason: 'MAINTENANCE' } }); assert.equal(sent.status(), 201, await sent.text()); const request = await sent.json(); requests.push(request);
      const response = await context.request.post(`${api}/rescheduling/requests/${request.id}/respond`, { headers: memberHeaders, data: { action: 'REFUND_REQUESTED' } }); assert.equal(response.status(), 200, await response.text());
    }
    const original = await context.request.get(`${api}/rescheduling/refunds/bookings/${bookings[0].id}`, { headers }); assert.equal(original.status(), 200); const detail = await original.json();
    const recorded = await context.request.post(`${api}/rescheduling/refunds/bookings/${bookings[0].id}/complete`, { headers, data: { amount: 5000, method: 'CASH', employeeName: 'Desk Preview', notes: 'Partial payment returned in isolated fixture', reference: '', confirmed: true, revision: detail.revision, requestKey: crypto.randomUUID() } }); assert.equal(recorded.status(), 200, await recorded.text());
    await db.bookingRescheduleRequest.update({ where: { id: requests[1].id }, data: { status: 'REFUND_PROCESSING' } });
    await db.bookingCancellationRequest.updateMany({where:{bookingId:bookings[1].id},data:{refundStatus:'REFUND_PROCESSING'}});
    const before = await db.booking.findMany({ orderBy: { id: 'asc' } }), ledger = await db.transaction.findMany({ orderBy: { id: 'asc' } }), refunds = await db.bookingRefund.findMany({ orderBy: { id: 'asc' } });
    await page.route('**/api/rescheduling/refunds', route => route.fulfill({ status: 503, json: { message: 'Refund list temporarily unavailable' } }));
    await page.goto(`${ui}${courtDeskPath}?activity=refunds`);
    const panel = page.getByRole('region', { name: 'Refund management', exact: true });
    await panel.getByRole('button', { name: 'Retry refunds', exact: true }).waitFor(); assert.equal(await panel.getByText('No refund requests yet.', { exact: true }).count(), 0);
    await page.unroute('**/api/rescheduling/refunds'); await panel.getByRole('button', { name: 'Retry refunds', exact: true }).click();
    const pager = panel.getByRole('navigation', { name: 'Admin refund request pagination', exact: true }); await pager.getByText('1–10 of 13 refunds', { exact: true }).waitFor(); assert.equal(await panel.getByRole('article').count(), 10);
    await pager.getByRole('button', { name: 'Next', exact: true }).click(); await pager.getByText('11–13 of 13 refunds', { exact: true }).waitFor(); assert.equal(await panel.getByRole('article').count(), 3);
    await panel.getByRole('textbox', { name: 'Search refund requests', exact: true }).fill('ADMIN-REFUND-TAB-12'); const blocked = panel.getByRole('article', { name: 'Refund ADMIN-REFUND-TAB-12', exact: true }); await blocked.getByRole('button', { name: 'View Details', exact: true }).waitFor(); await blocked.locator('.admin-refund-blocked').waitFor();
    await blocked.getByRole('button', { name: 'View Details', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Process refund', exact: true }); await dialog.getByRole('region', { name: 'Refund booking summary', exact: true }).waitFor(); assert.equal(await dialog.getByRole('button', { name: 'Review Refund', exact: true }).count(), 0); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await panel.getByRole('button', { name: 'Clear filters', exact: true }).click(); await panel.getByLabel('Refund status', { exact: true }).selectOption('refunded');
    const completed = panel.getByRole('article', { name: 'Refund ADMIN-REFUND-TAB-0', exact: true }); await completed.getByText('5,000 MMK', { exact: true }).waitFor(); assert.equal(await completed.getByText('20,000 MMK', { exact: true }).count(), 0);
    await completed.getByRole('button', { name: 'View Refund', exact: true }).click(); await dialog.getByRole('region', { name: 'Recorded refund', exact: true }).waitFor(); assert.equal(await dialog.locator('input,select,textarea').count(), 0); await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await panel.getByLabel('Refund status', { exact: true }).selectOption('processing'); await panel.getByRole('article', { name: 'Refund ADMIN-REFUND-TAB-1', exact: true }).waitFor(); assert.equal(await panel.getByRole('article').count(), 1);
    await panel.getByRole('textbox', { name: 'Search refund requests', exact: true }).fill('Not a refund'); await panel.getByText('No matching refunds', { exact: true }).waitFor(); await panel.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await panel.getByRole('textbox', { name: 'Search refund requests', exact: true }).fill('099123456'); await pager.getByText('1–10 of 13 refunds', { exact: true }).waitFor(); await panel.getByRole('button', { name: 'Clear filters', exact: true }).click();
    for (const width of [1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Refund list fits ${width}`); await panel.getByRole('article').first().screenshot({ path: join(artifacts, `admin-refund-card-${width}.png`) }); await page.screenshot({ path: join(artifacts, `admin-refund-tab-${width}.png`) }); }
    await page.getByRole('button', { name: 'Requests', exact: true }).click(); const requestPanel = page.getByRole('region', { name: 'Reschedule request management', exact: true }); await requestPanel.getByLabel('Request status', { exact: true }).selectOption('needs-action'); await requestPanel.getByRole('button', { name: 'Process refund', exact: true }).first().waitFor(); assert.equal(await requestPanel.getByRole('heading', { name: /^Requests/ }).count(), 0, 'The page heading is not repeated'); await requestPanel.getByRole('button', { name: 'Clear request filters', exact: true }).click();
    for (const width of [1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Requests fit ${width}`); await page.screenshot({ path: join(artifacts, `admin-request-tab-${width}.png`) }); }
    assert.deepEqual(await db.booking.findMany({ orderBy: { id: 'asc' } }), before); assert.deepEqual(await db.transaction.findMany({ orderBy: { id: 'asc' } }), ledger); assert.deepEqual(await db.bookingRefund.findMany({ orderBy: { id: 'asc' } }), refunds); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, checks: ['admin request/refund layouts and exclusive tabs', 'refund search by reference and phone, statuses, empty results and 10-row pagination', 'loading failure, explicit retry and blocked-record detail access', 'actual partial refund amount and read-only recorded refund', 'needs-staff-action request filter and no repeated section heading', '1440/768/390/320 layouts', 'all browsing preserves bookings, refunds and ledger'], artifacts }));
  } catch (error) { await page.screenshot({ path: join(artifacts, 'admin-request-tabs-failure.png') }).catch(() => {}); throw error; }
  finally { await db.$disconnect(); }
} finally { await browser?.close(); children.forEach(child => child.kill()); }
