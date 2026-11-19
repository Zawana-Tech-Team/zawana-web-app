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


  const { PrismaClient }=createRequire(new URL('../backend/package.json',import.meta.url))('@prisma/client');
  const db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
  try {
    const past=new Date(`${data.date}T12:00:00Z`);past.setUTCDate(past.getUTCDate()-20);
    for(const [code,status,kind] of [['HISTORY-PAST','COMPLETED','court'],['HISTORY-CANCEL','CANCELLED','court'],['HISTORY-COACH','PENDING_COACH_CONFIRMATION','private_course']]) await db.booking.create({data:{code,userId:data.memberId,kind,courtId:data.courts[3].id,coachId:kind==='private_course'?data.coachId:null,title:kind==='private_course'?'Private Fundamentals':'Court rental',date:kind==='court'?past.toISOString().slice(0,10):data.date,time:'4:00 PM — 5:00 PM',location:'Zawana Arena',status,paymentStatus:status==='CANCELLED'?'refunded':status==='COMPLETED'?'paid':'pending',price:kind==='court'?20000:65000}});
    const memberContext=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
    await memberContext.addInitScript(token=>localStorage.setItem('zawana_access_token',token),data.memberToken);
    const memberPage=await memberContext.newPage();memberPage.on('pageerror',e=>errors.push(e.message));
    await memberPage.goto(`${ui}/bookings`);
    await memberPage.locator('details.member-booking-row').nth(4).waitFor();
    const {mkdirSync}=await import('node:fs');const shots='/tmp/zawana-booking-history-preview';mkdirSync(shots,{recursive:true});
    for(const [name,width,height] of [['desktop',1440,1050],['tablet',768,1024],['mobile',390,844]]) {
      await memberPage.setViewportSize({width,height});
      assert.ok(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} overflow`);
      await memberPage.screenshot({path:`${shots}/${name}.png`,fullPage:true});
    }
    const card=memberPage.locator('details.member-booking-row').first();await card.locator('summary').focus();await memberPage.keyboard.press('Enter');assert.equal(await card.getAttribute('open'),'');
    const refreshed=memberPage.waitForResponse(r=>r.url().includes('/api/bookings?'));
    await memberPage.evaluate(()=>window.dispatchEvent(new Event('zawana-bookings-changed')));await refreshed;
    assert.equal(await card.getAttribute('open'),'','Background refresh retains expanded card');
    await memberPage.getByLabel('Search bookings',{exact:true}).fill('HISTORY-CANCEL');
    await memberPage.waitForResponse(r=>r.url().includes('q=HISTORY-CANCEL'));
    await memberPage.locator('details.member-booking-row').filter({hasText:'Cancelled'}).waitFor();
    assert.equal(await memberPage.locator('details.member-booking-row').count(),1);
    await memberPage.getByLabel('Search bookings',{exact:true}).fill('no-booking-matches');await memberPage.getByText('No bookings match these filters',{exact:true}).waitFor();
    await memberPage.getByLabel('Search bookings',{exact:true}).fill('');await memberPage.locator('details.member-booking-row').nth(4).waitFor();
    await memberPage.getByRole('group',{name:'Booking management',exact:true}).getByRole('button',{name:'Requests',exact:true}).click();
    assert.equal(await memberPage.locator('details.member-booking-row').count(),0);
    await memberPage.getByRole('group',{name:'Booking management',exact:true}).getByRole('button',{name:'Bookings',exact:true}).click();await card.waitFor();
    assert.deepEqual(errors,[]);await memberContext.close();console.log('PASS responsive booking cards, keyboard disclosure, background refresh preservation, search, empty state and management tabs; screenshots '+shots);
  } finally {await db.$disconnect();}
} finally {await browser?.close();children.forEach(child=>child.kill());}
