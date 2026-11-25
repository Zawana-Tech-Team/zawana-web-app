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
  await context.addInitScript(({ token, origin }) => { if (location.origin === origin) { localStorage.setItem('zawana_access_token', token); localStorage.setItem('zawana_language', 'en'); } }, { token: data.token, origin: ui });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));


  const { PrismaClient }=createRequire(new URL('../backend/package.json',import.meta.url))('@prisma/client');
  const db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
  try{
    for(let i=0;i<23;i++)await db.booking.create({data:{code:`STAFF-HISTORY-${i}`,userId:data.memberId,kind:'court',courtId:data.courts[0].id,title:'Court 1',date:data.date,time:'9:00 AM — 10:00 AM',location:'Arena',price:20000,paymentStatus:'paid',status:'CANCELLED',meta:JSON.stringify({customerName:`History Customer ${i}`})}});
    const privateBooking=await db.booking.create({data:{code:'STAFF-PRIVATE-HISTORY',userId:data.memberId,kind:'private_course',courtId:data.courts[2].id,coachId:data.coachId,title:'Private Fundamentals',date:data.date,time:'6:00 AM — 7:00 AM',location:'Arena',price:65000,paymentStatus:'paid',status:'CONFIRMED'}});
    const bookingsBefore=await db.booking.findMany({orderBy:{id:'asc'}}),ledgerBefore=await db.transaction.findMany({orderBy:{id:'asc'}});
    for(const [role,token,path] of [['admin',data.token,'/admin/court-rentals?history=1'],['fo',data.foToken,'/badminton-fo/bookings']]){
      const staff=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await staff.addInitScript(token=>{localStorage.setItem('zawana_access_token',token);localStorage.setItem('zawana_language','en');},token);const screen=await staff.newPage();screen.on('pageerror',e=>errors.push(e.message));
      await screen.route('**/api/bookings?*',route=>route.fulfill({status:503,json:{message:'History temporarily unavailable'}}));await screen.goto(ui+path);await screen.getByRole('button',{name:'Retry bookings',exact:true}).waitFor();assert.equal(await screen.getByText('No court rentals recorded',{exact:true}).count(),0);await screen.unroute('**/api/bookings?*');await screen.getByRole('button',{name:'Retry bookings',exact:true}).click();
      const records=screen.getByRole('region',{name:'Booking history records',exact:true}),pager=screen.getByRole('navigation',{name:'Staff booking history pagination',exact:true});await records.getByText(/History Customer/).first().waitFor();await pager.getByText('1–20 of 25 records',{exact:true}).waitFor();assert.equal(await records.getByRole('article').count(),20);assert.equal(await screen.locator('.desk-history-advanced').getAttribute('open'),null);assert.equal(await screen.getByRole('region',{name:'Reschedule request management',exact:true}).count(),0);assert.equal(await screen.getByRole('region',{name:'Refund management',exact:true}).count(),0);
      await pager.getByRole('button',{name:'Next',exact:true}).click();await pager.getByText('21–25 of 25 records',{exact:true}).waitFor();await records.getByRole('article').nth(4).waitFor();assert.equal(await records.getByRole('article').count(),5);
      await screen.getByRole('textbox',{name:'Search bookings',exact:true}).fill('No such booking');await screen.getByText('No bookings match these filters',{exact:true}).waitFor();await screen.getByRole('button',{name:'Clear filters',exact:true}).first().click();await pager.getByText('1–20 of 25 records',{exact:true}).waitFor();await records.getByText(/History Customer/).first().waitFor();
      await screen.locator('.desk-history-advanced>summary').click();await screen.getByLabel('From date',{exact:true}).fill(data.date);await records.getByText(/History Customer/).first().waitFor();await screen.getByRole('button',{name:'Clear filters',exact:true}).first().click();await screen.locator('.desk-history-advanced>summary').click();
      for(const category of ['Court Rentals','Private Courses','Weekly Classes']){
        await screen.getByRole('group',{name:'Booking history type',exact:true}).getByRole('button',{name:category,exact:true}).click();
        await records.getByRole('article').first().waitFor();
        assert.equal(await screen.getByRole('group',{name:'Booking history type',exact:true}).getByRole('button',{name:category,exact:true}).getAttribute('aria-pressed'),'true');
        if(category==='Private Courses'){
          const booking=records.getByRole('article').filter({hasText:'Private Fundamentals'});
          assert.equal(await booking.getByText('Private Fundamentals',{exact:true}).count(),1);
          await booking.getByRole('button',{name:'View Details',exact:true}).click();
          const detail=screen.getByRole('dialog',{name:'Booking history details',exact:true});await detail.getByText(privateBooking.code,{exact:true}).waitFor();await detail.getByRole('button',{name:'Close',exact:true}).click();
        }
        if(category==='Weekly Classes'){
          assert.equal(await records.getByText('Junior Academy',{exact:true}).count(),1);
          assert.equal(await screen.getByRole('combobox',{name:'Payment status',exact:true}).count(),0);
          await records.getByRole('button',{name:'View Details',exact:true}).first().click();
          const detail=screen.getByRole('dialog',{name:'Booking history details',exact:true});assert.equal(await detail.getByText('Junior Academy',{exact:true}).count(),1);await detail.getByRole('region',{name:'Booked session',exact:true}).waitFor();await detail.getByRole('button',{name:'Close',exact:true}).click();
        }
        for(const width of [1440,768,390,320]){await screen.setViewportSize({width,height:1000});assert.ok(await screen.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await records.getByRole('button',{name:'View Details',exact:true}).count(),await records.getByRole('article').count(),'One detail action per responsive record');await screen.screenshot({path:join(artifacts,`staff-history-${category.replaceAll(' ','-')}-${role}-${width}.png`),fullPage:true});}
        await screen.setViewportSize({width:1440,height:1000});
      }
      const activity=screen.getByRole('group',{name:role==='admin'?'Court rental view':'Booking activity',exact:true});
      await activity.getByRole('button',{name:'Requests',exact:true}).click();await screen.getByRole('region',{name:'Reschedule request management',exact:true}).getByText('No requests yet',{exact:true}).waitFor();assert.equal(await records.count(),0);assert.equal(await screen.getByRole('textbox',{name:'Search bookings',exact:true}).count(),0);assert.ok(screen.url().includes('activity=requests'));
      await activity.getByRole('button',{name:'Refund requests',exact:true}).click();await screen.getByText('No refund requests yet.',{exact:true}).waitFor();assert.equal(await screen.getByRole('region',{name:'Reschedule request management',exact:true}).count(),0);assert.equal(await records.count(),0);
      await screen.reload();await screen.getByText('No refund requests yet.',{exact:true}).waitFor();assert.equal(await activity.getByRole('button',{name:'Refund requests',exact:true}).getAttribute('aria-pressed'),'true');
      for(const width of [1440,768,390,320]){await screen.setViewportSize({width,height:1000});assert.ok(await screen.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screen.screenshot({path:join(artifacts,`staff-refund-tab-${role}-${width}.png`)});}
      await activity.getByRole('button',{name:'Booking history',exact:true}).click();await records.getByRole('article').first().waitFor();await screen.getByRole('group',{name:'Booking history type',exact:true}).getByRole('button',{name:'Weekly Classes',exact:true}).click();await records.getByText('Junior Academy',{exact:true}).waitFor();
      await screen.getByRole('textbox',{name:'Search bookings',exact:true}).fill('No such class');await screen.getByText('No bookings match these filters',{exact:true}).waitFor();assert.equal(await screen.getByRole('group',{name:'Booking history type',exact:true}).getByRole('button',{name:'Weekly Classes',exact:true}).count(),1);await pager.getByText('0 records',{exact:true}).waitFor();
      await staff.close();
    }
    assert.deepEqual(await db.booking.findMany({orderBy:{id:'asc'}}),bookingsBefore);assert.deepEqual(await db.transaction.findMany({orderBy:{id:'asc'}}),ledgerBefore);assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['Admin and FO court, private-course and weekly-class history with one responsive record each','private/weekly details, no repeated weekly title, and retained empty category controls','read-only history preserves bookings and payments','Admin and FO bookings visible before requests/refunds','real API records and 20-per-page paging','failure and retry without false empty state','search reset and date filters','1440/768/390/320 layouts'],artifacts}));
  }finally{await db.$disconnect();}
}finally{await browser?.close();children.forEach(child=>child.kill());}
