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
const fixedNow='2026-11-17T02:30:00.000Z'; // 09:00 in Myanmar; real timers keep network/UI behavior intact.
const clockModule=join(temp,'clock.mjs');
writeFileSync(clockModule,`const NativeDate=globalThis.Date;const instant=NativeDate.parse('${fixedNow}');globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};`);
env.NODE_OPTIONS=`${process.env.NODE_OPTIONS||''} --import ${clockModule}`.trim();
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
  await context.addInitScript(iso=>{const NativeDate=window.Date;const instant=NativeDate.parse(iso);window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};},fixedNow);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));

  page.setDefaultTimeout(15000);
  const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
  const { PrismaClient } = backendRequire('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const date='2026-11-17',previous='2026-11-10',nextWeek='2026-11-24',dayOfWeek=2;
    const original=await db.courtBlock.create({data:{courtId:data.courts[0].id,title:'Today removal QA',date:'',dayOfWeek,effectiveFrom:previous,start:'08:00',end:'11:00',type:'class',note:'Class history must remain'}});
    const exception=await db.courtBlock.create({data:{courtId:data.courts[1].id,title:'Today moved occurrence',date,start:'16:00',end:'17:00',type:'class',note:`Moved from ${original.id} · qa-move`}});
    const unrelated=await db.courtBlock.create({data:{courtId:data.courts[1].id,title:'Unrelated weekly class',date:'',dayOfWeek,start:'12:00',end:'13:00',type:'class'}});
    const privateBooking=await db.booking.create({data:{code:randomUUID(),kind:'private_course',userId:data.memberId,coachId:data.coachId,courtId:data.courts[2].id,title:'Unrelated private',date,time:'2:00 PM — 3:00 PM',location:'Arena',price:30000,paymentStatus:'paid',status:'CONFIRMED'}});
    const rental=await db.booking.create({data:{code:randomUUID(),kind:'court',userId:data.memberId,courtId:data.courts[3].id,title:'Unrelated rental',date,time:'12:00 PM — 1:00 PM',location:'Arena',price:20000,paymentStatus:'pending',status:'confirmed'}});
    const enrollment=await db.badmintonEnrollment.create({data:{userId:data.memberId,studentId:'TODAY-STUDENT',studentName:'Alex Tan',phone:'091234567',packageId:'historic-package',packageName:'Weekly academy',sessionsTotal:10,sessionsRemaining:9,startDate:previous,expiryDate:nextWeek}});
    await db.badmintonCheckIn.create({data:{enrollmentId:enrollment.id,date,time:'08:15',sessionsUsed:1}});
    await db.transaction.create({data:{userId:data.memberId,date,customer:'Alex Tan',business:'Badminton',item:'Weekly class · Academy',amount:30000,discount:0,tax:0,finalAmount:30000,paymentMethod:'Cash',staff:'Desk Preview',status:'paid'}});
    const snapshot=async()=>({bookings:await db.booking.findMany({orderBy:{id:'asc'}}),enrollments:await db.badmintonEnrollment.findMany(),attendance:await db.badmintonCheckIn.findMany(),transactions:await db.transaction.findMany()});
    const preserved=await snapshot(),headers={Authorization:`Bearer ${data.token}`};
    const calendar=async day=>{const r=await context.request.get(`${api}/court-booking/availability?date=${day}`,{headers});assert.equal(r.status(),200);return r.json();};
    const isOpen=async(day,courtId,time)=>(await calendar(day)).slots.find(s=>s.courtId===courtId&&s.time===time).available;
    assert.equal(await isOpen(date,data.courts[0].id,'10:00 AM — 11:00 AM'),false);
    await page.goto(`${ui}/admin/court-rentals`);await page.getByLabel('Operating day',{exact:true}).fill(date);
    await page.locator('.court-timetable__event').filter({hasText:'Today removal QA'}).click();await page.getByRole('button',{name:'Weekly Class Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Remove Weekly',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Remove weekly class',exact:true});await dialog.getByText('Today’s active occurrence and all future occurrences, including rescheduled sessions, will be removed.',{exact:false}).waitFor();
    await page.setViewportSize({width:390,height:844});assert.ok(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth+1;}));await page.screenshot({path:join(artifacts,'remove-today-mobile.png')});
    await dialog.getByRole('button',{name:'Remove Weekly',exact:true}).click();await dialog.waitFor({state:'hidden'});
    await page.getByRole('button',{name:`Court 1, ${date}, 10:00 AM — 11:00 AM, Available`,exact:true}).waitFor();
    assert.equal(await page.locator('.court-timetable__event').filter({hasText:'Today removal QA'}).count(),0);assert.equal(await page.locator('.court-timetable__event').filter({hasText:'Today moved occurrence'}).count(),0);
    assert.equal(await isOpen(date,data.courts[0].id,'10:00 AM — 11:00 AM'),true);assert.equal(await isOpen(date,data.courts[1].id,'4:00 PM — 5:00 PM'),true);assert.equal(await isOpen(nextWeek,data.courts[0].id,'10:00 AM — 11:00 AM'),true);
    assert.equal(await isOpen(date,privateBooking.courtId,privateBooking.time),false);assert.equal(await isOpen(date,rental.courtId,rental.time),false);assert.deepEqual(await snapshot(),preserved);assert.deepEqual(await db.courtBlock.findUnique({where:{id:unrelated.id}}),unrelated);
    const stored=await db.courtBlock.findUniqueOrThrow({where:{id:original.id}});assert.equal(stored.effectiveUntil,'2026-11-16');assert.equal(stored.note,original.note);assert.ok(await db.courtBlock.findUnique({where:{id:exception.id}}));
    const past=await context.request.get(`${api}/court-blocks?date=${previous}`);assert.ok((await past.json()).some(b=>b.id===original.id));
    const today=await context.request.get(`${api}/court-blocks?date=${date}`);assert.ok(!(await today.json()).some(b=>[original.id,exception.id].includes(b.id)));
    await page.reload();await page.getByRole('button',{name:`Court 1, ${date}, 10:00 AM — 11:00 AM, Available`,exact:true}).waitFor();
    const created=await context.request.post(`${api}/staff/court-desk/rentals`,{headers,data:{courtId:data.courts[0].id,date,time:'10:00 AM — 11:00 AM',customer:'Released slot customer',expectedPrice:20000,requestKey:randomUUID(),payment:{method:'CASH'}}});assert.equal(created.status(),201);assert.equal(await isOpen(date,data.courts[0].id,'10:00 AM — 11:00 AM'),false);
    await page.getByRole('button',{name:'Refresh availability',exact:true}).click();await page.locator('.court-timetable__event').filter({hasText:'Released slot customer'}).waitFor();await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:join(artifacts,'desk-after-today-removal-desktop.png')});
    // Inspect new shared dialog structure at tablet width without mutating a booking.
    await page.setViewportSize({width:768,height:1024});await page.locator('.court-timetable__event').filter({hasText:'Released slot customer'}).click();await page.getByRole('button',{name:'Booking Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Reschedule',exact:true}).click();const move=page.getByRole('dialog',{name:'Move selected bookings',exact:true});await move.locator('select[aria-label="Reason"]').selectOption('EVENT',{force:true});assert.equal(await move.locator('.desk-dialog__actions').getByRole('button',{name:'Cancel',exact:true}).count(),1);assert.ok(await move.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:join(artifacts,'reschedule-tablet.png')});await move.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Booking history',exact:true}).click();await page.getByRole('textbox',{name:'Search bookings',exact:true}).fill('Released slot customer');await page.getByRole('row').filter({hasText:'Released slot customer'}).getByRole('button',{name:'Details & history',exact:true}).click();const history=page.getByRole('dialog',{name:'Court booking details',exact:true});await history.getByRole('region',{name:'Current reservation',exact:true}).waitFor();await history.getByText('Released slot customer',{exact:true}).waitFor();assert.equal(await history.locator('.desk-dialog__actions').getByRole('button',{name:'Done',exact:true}).count(),1);await page.screenshot({path:join(artifacts,'court-history-desktop.png')});await history.getByRole('button',{name:'Done',exact:true}).click();
    assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['Myanmar today at 09:00; already-started class removed','linked occurrence removed today and recurring schedule ended','authoritative availability and daily block API exclude removed classes','reload persists removal and new paid rental can reuse remaining slot','historical attendance, enrollment, receipts, unrelated rental/private/class preserved','mobile confirmation, desktop desk and tablet reschedule layout'],artifacts},null,2));
  }finally{await db.$disconnect();}
}finally{await browser?.close();children.forEach(child=>child.kill());}
