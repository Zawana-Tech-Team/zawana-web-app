import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
  await context.addInitScript(({ token, origin }) => { if (location.origin === origin) { localStorage.setItem('zawana_access_token', token); localStorage.setItem('zawana_language', 'en'); } }, { token: data.token, origin: ui });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));

  const { PrismaClient } = createRequire(new URL('../backend/package.json', import.meta.url))('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const dow = new Date(`${data.date}T12:00:00Z`).getUTCDay();
    await db.courtBlock.create({ data: { courtId: data.courts[7].id, date: '', dayOfWeek: dow, type: 'class', title: 'Occurrence Scope QA', start: '06:00', end: '07:00' } });
    await page.goto(`${ui}/admin/court-rentals`); await page.getByLabel('Operating day', { exact: true }).fill(data.date);
    await page.locator('.court-timetable__event').filter({ hasText: 'Occurrence Scope QA' }).click();
    await page.getByRole('button', { name: 'Weekly Class Actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Remove Today', exact: true }).click();
    const removal = page.getByRole('dialog', { name: 'Remove weekly class', exact: true });
    await removal.getByRole('button', { name: 'Remove Today', exact: true }).click(); await removal.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.court-timetable__event').filter({ hasText: 'Occurrence Scope QA' }).count(), 0);
    const next = new Date(`${data.date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 7);
    await page.getByLabel('Operating day', { exact: true }).fill(next.toISOString().slice(0, 10));
    await page.locator('.court-timetable__event').filter({ hasText: 'Occurrence Scope QA' }).waitFor();
    const bookings = [];
    for (const time of ['6:00 AM — 7:00 AM', '7:00 AM — 8:00 AM', '8:00 AM — 9:00 AM']) {
      const row = await db.booking.create({ data: { code: randomUUID(), kind: 'court', userId: data.memberId, courtId: data.courts[0].id, date: data.date, time, title: 'Grouped Rental', location: 'Arena', status: 'CONFIRMED', paymentStatus: 'paid', price: 20000 } }); bookings.push(row);
      await db.transaction.create({ data: { resourceType: 'booking', resourceId: row.id, userId: data.memberId, date: data.date, customer: 'Alex', business: 'Badminton', item: 'Rental', amount: 20000, discount: 0, tax: 0, finalAmount: 20000, paymentMethod: 'Cash', staff: 'FO', status: 'paid' } });
    }
    const payload = { bookingIds: bookings.map(row => row.id), reason: 'MAINTENANCE', requestKey: randomUUID() };
    const send = () => context.request.post(`${api}/rescheduling/requests/batch`, { headers: { Authorization: `Bearer ${data.token}` }, data: payload });
    const sent = await send(); assert.equal(sent.status(), 201, await sent.text());
    const notice = await db.notification.findFirstOrThrow({ where: { userId: data.memberId, entityType: 'reschedule_batch' } });
    const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await memberContext.addInitScript(token => localStorage.setItem('zawana_access_token', token), data.memberToken);
    const memberPage = await memberContext.newPage(); memberPage.on('pageerror', e => errors.push(e.message));
    await memberPage.goto(ui + notice.link);
    const group = memberPage.getByRole('region', { name: 'Request group: 3 bookings', exact: true });
    await group.waitFor(); assert.ok(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await group.getByRole('button', { name: 'C. Refund', exact: true }).first().click();
    let dialog = memberPage.getByRole('dialog', { name: 'Reschedule request details', exact: true });
    await dialog.getByRole('button', { name: 'Confirm Request', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: 'No money has been transferred' }).waitFor(); await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await group.getByRole('button', { name: 'B. Let Admin Handle', exact: true }).first().click();
    dialog = memberPage.getByRole('dialog', { name: 'Reschedule request details', exact: true });
    await dialog.getByRole('button', { name: 'Confirm Request', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: 'Zawana staff will contact you' }).waitFor(); await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await group.getByText(/1 awaiting response/).waitFor();
    assert.equal(await group.getByRole('button', { name: 'Review request', exact: true }).count(), 0);
    assert.equal((await group.innerText()).split('Dear Customer').length, 2);
    const pending = await db.bookingRescheduleRequest.findFirstOrThrow({ where: { batchId: notice.entityId, status: 'PENDING_CUSTOMER' }, include: { booking: true } });
    await group.getByRole('button', { name: 'A. Reschedule', exact: true }).click();
    dialog = memberPage.getByRole('dialog', { name: 'Reschedule request details', exact: true });
    await dialog.locator('select[aria-label="Replacement court"]').selectOption(data.courts[1].id, { force: true });
    await dialog.locator('select[aria-label="Available replacement time"]').selectOption(pending.booking.time, { force: true });
    await dialog.getByRole('button', { name: 'Review replacement', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm Replacement', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: 'replacement is confirmed' }).waitFor();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await group.getByText(/0 awaiting response · 1 resolved/).waitFor();

    assert.equal((await send()).status(), 201);
    assert.equal(await db.notification.count({ where: { userId: data.memberId, entityType: 'reschedule_batch' } }), 1);
    assert.equal(await db.bookingRescheduleRequest.count({ where: { bookingId: { in: payload.bookingIds } } }), 3);
    await memberContext.close(); assert.deepEqual(errors, []);
    console.log('PASS occurrence-only removal preserves next week; grouped notification opens mobile items, independent reschedule/refund/admin handling, accurate pending count, duplicate submission safe');
  } finally { await db.$disconnect(); }
} finally { await browser?.close(); children.forEach(child => child.kill()); }
