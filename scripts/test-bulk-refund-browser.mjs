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
    const other = await db.user.create({ data: { name: 'Different owner', email: `${randomUUID()}@refund.test`, role: 'member' } });
    const bookings = [], originals = [];
    for (const [index,time] of ['6:00 AM — 7:00 AM','7:00 AM — 8:00 AM','8:00 AM — 9:00 AM','12:00 PM — 1:00 PM'].entries()) {
      const row = await db.booking.create({ data: { code: `BULK-UX-${index}`, kind: 'court', userId: index === 1 ? other.id : data.memberId, courtId: data.courts[0].id, date: data.date, time, title: 'Rental', location: 'Arena', status: 'CONFIRMED', paymentStatus: index === 3 ? 'pending' : 'paid', price: 20000, meta: JSON.stringify({customerName:`Bulk Refund ${index}`}) } }); bookings.push(row);
      if (index < 3) originals.push(await db.transaction.create({ data: { resourceType: 'booking', resourceId: row.id, userId: row.userId, date: data.date, customer: `Bulk Refund ${index}`, business: 'Badminton', item: 'Rental', amount: 20000, discount: 0, tax: 0, finalAmount: 20000, paymentMethod: 'Cash', staff: 'FO', status: 'paid' } }));
    }
    await page.goto(`${ui}/admin/court-rentals`); await page.getByLabel('Operating day',{exact:true}).fill(data.date);
    for (let i=0;i<4;i++) await page.getByRole('button',{name:new RegExp(`^Bulk Refund ${i},`)}).click();
    await page.getByRole('button',{name:'Booking Actions',exact:true}).click();
    await page.getByRole('menuitem',{name:'Refund Selected',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Refund selected bookings',exact:true});
    await dialog.getByText(/Not eligible: Reconcile/).waitFor();
    assert.equal(await dialog.getByRole('checkbox').count(),4);
    assert.equal(await dialog.getByRole('checkbox').nth(3).isDisabled(),true);
    assert.equal(await dialog.getByRole('button',{name:'Review Selected Refunds',exact:true}).isDisabled(),true);
    for(let i=0;i<3;i++) await dialog.getByRole('checkbox').nth(i).check();
    await dialog.getByLabel('Refund Notes',{exact:true}).fill('Refunds returned separately to the selected customers');
    await dialog.getByRole('region',{name:'Selected refund total',exact:true}).getByText('60,000 MMK',{exact:true}).waitFor();
    for (const viewport of [{width:1440,height:1000},{width:768,height:1024},{width:390,height:844},{width:320,height:640}]) {
      await page.setViewportSize(viewport); assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    }
    await dialog.getByRole('button',{name:'Review Selected Refunds',exact:true}).click();
    const result=page.waitForResponse(response=>response.url().endsWith('/rescheduling/refunds/complete-batch'));
    await dialog.getByRole('button',{name:'Confirm Selected Refunds',exact:true}).click();
    const response=await result;assert.equal(response.status(),200);assert.equal((await response.json()).completedCount,3);
    await dialog.getByRole('status').filter({hasText:'3 completed · 0 not completed'}).waitFor();
    assert.equal(await db.bookingRefund.count({where:{bookingId:{in:bookings.map(row=>row.id)}}}),3);
    for(const receipt of originals) assert.deepEqual(await db.transaction.findUnique({where:{id:receipt.id}}),receipt);
    assert.equal((await db.booking.findUniqueOrThrow({where:{id:bookings[3].id}})).status,'CONFIRMED');
    await dialog.getByRole('button',{name:'Close',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/^Bulk Refund [012],/}).count(),0);
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:/^Alex Tan, Court 1, 9:00 AM/}).click();
    await page.getByRole('button',{name:'Booking Actions',exact:true}).click();
    await page.getByRole('menuitem').filter({hasText:'Request Reschedule'}).click();
    const requestDialog=page.getByRole('dialog',{name:'Send reschedule request',exact:true});
    await requestDialog.locator('select[aria-label="Reason"]').selectOption('EVENT',{force:true});
    await requestDialog.getByText('Customer notice',{exact:true}).click();await requestDialog.locator('.rental-request-message').filter({hasText:/upcoming event at The Zawana/}).waitFor();
    await requestDialog.locator('select[aria-label="Reason"]').selectOption('MAINTENANCE',{force:true});
    await requestDialog.locator('.rental-request-message').filter({hasText:/necessary maintenance at The Zawana/}).waitFor();
    await requestDialog.getByRole('button',{name:'Send Request',exact:true}).click();await requestDialog.waitFor({state:'hidden'});
    const sent=await db.bookingRescheduleRequest.findFirstOrThrow({where:{bookingId:data.bookingId},include:{events:true}});
    assert.equal(sent.reason,'MAINTENANCE');assert.match(sent.events[0].detail.message,/necessary maintenance/);
    const notice=await db.notification.findFirstOrThrow({where:{entityId:sent.id}});assert.match(notice.body,/Original Booking: Court 1/);
    assert.deepEqual(errors,[]); console.log('PASS mixed-owner multi-court refunds, explicit eligible selection, blocked unpaid item, separate ledger records and responsive modal');
  } finally { await db.$disconnect(); }
} finally { await browser?.close(); children.forEach(child=>child.kill()); }
