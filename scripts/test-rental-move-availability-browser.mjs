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


  const { PrismaClient }=createRequire(new URL('../backend/package.json',import.meta.url))('@prisma/client');
  const db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});page.setDefaultTimeout(15000);
  const day=(value,add)=>{const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+add);return date.toISOString().slice(0,10);};
  const screenshot=async(name)=>page.screenshot({path:join(artifacts,name)});
  try {
    const original=await db.booking.findUniqueOrThrow({where:{id:data.bookingId}}),targetDate=day(data.date,1),closedDate=day(data.date,2),swapDate=day(data.date,4);
    const reserve=async(code,courtId,date,time,status='CONFIRMED')=>db.booking.create({data:{code,userId:data.memberId,kind:'court',title:'Court rental',courtId,date,time,status,paymentStatus:'paid',price:20000,location:'Arena',meta:JSON.stringify({customerName:code.startsWith('SWAP')?'Slot swap':code})}});
    await reserve('OTHER-BOOKING',data.courts[1].id,targetDate,'10:00 AM — 11:00 AM');await reserve('OTHER-PENDING',data.courts[1].id,targetDate,'12:00 PM — 1:00 PM','pending');
    await db.courtDateOverride.create({data:{date:closedDate,type:'closed',title:'Closed day'}});
    const a=await reserve('SWAP-A',data.courts[3].id,swapDate,'6:00 AM — 7:00 AM'),b=await reserve('SWAP-B',data.courts[4].id,swapDate,'6:00 AM — 7:00 AM');
    const beforeLedger=await db.transaction.findMany({orderBy:{id:'asc'}});
    await page.route('**/api/rescheduling/moves/availability',route=>route.fulfill({status:503,json:{message:'Availability temporarily unavailable'}}));await page.goto(`${ui}${bookingPath}/${original.id}/reschedule`);
    const dialog=page.getByRole('dialog',{name:'Move selected bookings',exact:true});await dialog.getByRole('button',{name:'Retry availability',exact:true}).waitFor();const time=dialog.getByLabel('Destination time 1',{exact:true});assert.equal(await time.isDisabled(),true);assert.equal(await time.locator('option[value]:not([value=""])').count(),0,'A failed availability read must never fall back to generated times');await page.unroute('**/api/rescheduling/moves/availability');await dialog.getByRole('button',{name:'Retry availability',exact:true}).click();
    const readyTime=async()=>{await page.waitForFunction(()=>{const field=document.querySelector('select[aria-label="Destination time 1"]');return field&&!field.disabled;});};await readyTime();
    assert.ok(await time.locator('option[value="9:00 AM — 11:00 AM"]').count(),'The selected original is available to itself');assert.equal(await time.locator('option[value="12:00 PM — 2:00 PM"]').count(),0,'A weekly class blocks a two-hour range that overlaps only its last hour');assert.equal(await time.locator('option[value="2:00 PM — 4:00 PM"]').count(),0);await time.selectOption('6:00 AM — 8:00 AM');await dialog.getByLabel('Reason',{exact:true}).selectOption('EVENT');
    await dialog.getByLabel('Destination court 1',{exact:true}).selectOption(data.courts[1].id);assert.equal(await time.inputValue(),'');await readyTime();assert.equal(await time.locator('option[value="6:00 PM — 8:00 PM"]').count(),0,'Maintenance must not be selectable');await dialog.getByLabel('Destination date 1',{exact:true}).fill(targetDate);await readyTime();assert.equal(await time.inputValue(),'');assert.equal(await time.locator('option[value="9:00 AM — 11:00 AM"]').count(),0);assert.equal(await time.locator('option[value="11:00 AM — 1:00 PM"]').count(),0,'Pending reservations also block multi-hour slots');assert.ok(await time.locator('option[value="6:00 AM — 8:00 AM"]').count());
    const labels=await time.locator('option[value]:not([value=""])').allTextContents();const minutes=clock=>{const match=clock.match(/(\d+):(\d+)\s*(AM|PM)/);return (+match[1]%12)*60+(+match[2])+(match[3]==='PM'?720:0);};assert.ok(labels.every(label=>{const [start,end]=label.split(' — ');return minutes(end)-minutes(start)===120;}));
    await time.selectOption('6:00 AM — 8:00 AM');const liveBlock=await reserve('LIVE-BLOCK',data.courts[1].id,targetDate,'7:00 AM — 8:00 AM');await page.evaluate(()=>window.dispatchEvent(new Event('zawana-bookings-changed')));await page.waitForFunction(()=>{const field=document.querySelector('select[aria-label="Destination time 1"]');return field&&!field.disabled&&!field.value&&![...field.options].some(option=>option.value==='6:00 AM — 8:00 AM');});assert.equal(await dialog.getByRole('button',{name:'Review reschedule',exact:true}).isDisabled(),true);await db.booking.update({where:{id:liveBlock.id},data:{status:'CANCELLED'}});
    await dialog.getByLabel('Destination date 1',{exact:true}).fill(closedDate);await dialog.getByText('No available times for this court and date. Choose another court or date.',{exact:true}).waitFor();assert.equal(await time.isDisabled(),true);assert.equal(await dialog.getByRole('alert').count(),0,'A closed day is a successful empty result, not an infrastructure failure');assert.equal(await time.locator('option[value]:not([value=""])').count(),0);
    // A late reply for a previous open day must not populate the current closed day.
    await page.route('**/api/rescheduling/moves/availability',async route=>{if(route.request().postDataJSON().targets.some(target=>target.date===targetDate))await new Promise(resolve=>setTimeout(resolve,450));await route.continue();});await dialog.getByLabel('Destination date 1',{exact:true}).fill(targetDate);await dialog.getByLabel('Destination date 1',{exact:true}).fill(closedDate);await dialog.getByText('No available times for this court and date. Choose another court or date.',{exact:true}).waitFor();await page.waitForTimeout(600);assert.equal(await time.locator('option[value]:not([value=""])').count(),0);await page.unroute('**/api/rescheduling/moves/availability');
    await dialog.getByLabel('Destination date 1',{exact:true}).fill(targetDate);await readyTime();await time.selectOption('6:00 AM — 8:00 AM');for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot(`available-rental-times-${width}.png`);}await dialog.getByRole('button',{name:'Review reschedule',exact:true}).click();await dialog.getByRole('region',{name:'Move preview',exact:true}).waitFor();assert.deepEqual(await db.booking.findUniqueOrThrow({where:{id:original.id}}),original);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.waitForURL(`${ui}${bookingPath}`);

    await page.goto(`${ui}${courtDeskPath}`);await page.getByLabel('Operating day',{exact:true}).fill(swapDate);await page.waitForFunction(()=>document.querySelector('.court-timetable')?.getAttribute('aria-busy')==='false');const events=page.locator('.court-timetable__event').filter({hasText:'Slot swap'});await events.nth(1).waitFor();await events.nth(0).click();await events.nth(1).click();await page.getByRole('button',{name:'Booking Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Reschedule selected sessions',exact:true}).click();await dialog.getByLabel('Destination court 1',{exact:true}).selectOption(data.courts[4].id);await time.selectOption('6:00 AM — 7:00 AM');const second=dialog.getByLabel('Destination time 2',{exact:true});await page.waitForFunction(()=>{const field=document.querySelector('select[aria-label="Destination time 2"]');return field&&!field.disabled;});assert.equal(await second.locator('option[value="6:00 AM — 7:00 AM"]').count(),0,'Selected replacements must not overlap each other');await dialog.getByLabel('Destination court 2',{exact:true}).selectOption(data.courts[3].id);await second.selectOption('6:00 AM — 7:00 AM');await dialog.getByLabel('Reason',{exact:true}).selectOption('MAINTENANCE');const previewResponse=page.waitForResponse(response=>response.url().endsWith('/rescheduling/moves/quote'));await dialog.getByRole('button',{name:'Review reschedule',exact:true}).click();assert.equal((await previewResponse).status(),200,'A complete batch swap remains allowed');await dialog.getByRole('region',{name:'Replacement',exact:true}).nth(1).waitFor();assert.equal(await dialog.getByRole('region',{name:'Replacement',exact:true}).count(),2);await screenshot('available-rental-batch-swap.png');assert.deepEqual(await db.booking.findUniqueOrThrow({where:{id:a.id}}),a);assert.deepEqual(await db.booking.findUniqueOrThrow({where:{id:b.id}}),b);assert.deepEqual(await db.transaction.findMany({orderBy:{id:'asc'}}),beforeLedger);assert.equal(await db.bookingChangeHistory.count(),0);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,checks:['only available duration-preserving times; own original remains available','booked, pending, weekly, maintenance and closed periods omitted','availability failure has no fallback slots and supports retry','court/date changes and live conflicts clear the selected time','late responses cannot populate a different date','batch replacement collisions excluded while full swaps still quote successfully','availability and preview preserve bookings, history and ledger','1440/768/390/320 layouts'],artifacts}));
  }catch(error){await screenshot('available-rental-times-failure.png').catch(()=>{});throw error;}finally{await db.$disconnect();}
}finally{await browser?.close();children.forEach(child=>child.kill());}
