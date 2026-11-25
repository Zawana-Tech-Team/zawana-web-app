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
    const headers={Authorization:`Bearer ${data.token}`},ids=[];
    for(let i=0;i<8;i++){
      const day=new Date(`${data.date}T12:00:00Z`);day.setUTCDate(day.getUTCDate()+i);const date=day.toISOString().slice(0,10);
      const booking=await db.booking.create({data:{code:`STAFF-REQUEST-${i}`,userId:data.memberId,kind:'court',courtId:data.courts[0].id,title:'Court 1',date,time:'4:00 PM — 5:00 PM',location:'Arena',price:20000,paymentStatus:'paid',status:'CONFIRMED'}});ids.push(booking.id);
      await db.transaction.create({data:{resourceType:'booking',resourceId:booking.id,userId:data.memberId,date,customer:'Alex Tan',business:'Badminton',item:'Court rental',amount:20000,discount:0,tax:0,finalAmount:20000,status:'paid',paymentMethod:'Cash',staff:'QA'}});
      if(i>=2){const response=await context.request.post(`${api}/rescheduling/requests`,{headers,data:{bookingId:booking.id,reason:'MAINTENANCE'}});assert.equal(response.status(),201,await response.text());}
    }
    const sent=await context.request.post(`${api}/rescheduling/requests/batch`,{headers,data:{bookingIds:ids.slice(0,2),reason:'MAINTENANCE',requestKey:crypto.randomUUID()}});assert.equal(sent.status(),201,await sent.text());
    const privateBooking=await db.booking.create({data:{code:'STAFF-PRIVATE-REQUEST',userId:data.memberId,kind:'private_course',courtId:data.courts[2].id,coachId:data.coachId,title:'Private Fundamentals',date:data.date,time:'6:00 AM — 7:00 AM',location:'Arena',price:65000,paymentStatus:'paid',status:'CONFIRMED'}});
    await db.transaction.create({data:{resourceType:'booking',resourceId:privateBooking.id,userId:data.memberId,date:data.date,customer:'Alex Tan',business:'Badminton',item:'Private Fundamentals',amount:65000,discount:0,tax:0,finalAmount:65000,status:'paid',paymentMethod:'Cash',staff:'QA'}});
    const privateRequest=await context.request.post(`${api}/rescheduling/requests`,{headers,data:{bookingId:privateBooking.id,reason:'MAINTENANCE'}});assert.equal(privateRequest.status(),201,await privateRequest.text());
    const handled=await db.bookingRescheduleRequest.findFirstOrThrow({where:{bookingId:ids[2]}});
    const response=await context.request.post(`${api}/rescheduling/requests/${handled.id}/respond`,{headers:{Authorization:`Bearer ${data.memberToken}`},data:{action:'ADMIN_HANDLING'}});assert.equal(response.status(),200,await response.text());
    const refundRequest=await db.bookingRescheduleRequest.findFirstOrThrow({where:{bookingId:ids[3]}});const refundResponse=await context.request.post(`${api}/rescheduling/requests/${refundRequest.id}/respond`,{headers:{Authorization:`Bearer ${data.memberToken}`},data:{action:'REFUND_REQUESTED'}});assert.equal(refundResponse.status(),200,await refundResponse.text());
    const batch=await db.bookingRescheduleRequest.findFirstOrThrow({where:{bookingId:ids[0]}}),ledger=await db.transaction.findMany({orderBy:{id:'asc'}}),bookings=await db.booking.findMany({orderBy:{id:'asc'}});
    for(const [role,token,path] of [['admin',data.token,'/admin/court-rentals?history=1'],['fo',data.foToken,'/badminton-fo/bookings']]){
      const staff=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await staff.addInitScript(token=>{localStorage.setItem('zawana_access_token',token);localStorage.setItem('zawana_language','en');},token);const screen=await staff.newPage();screen.on('pageerror',e=>errors.push(e.message));
      await screen.route('**/api/rescheduling/requests',route=>route.fulfill({status:503,json:{message:'Requests temporarily unavailable'}}));await screen.goto(ui+path);await screen.getByRole('button',{name:'Requests',exact:true}).click();const panel=screen.getByRole('region',{name:'Reschedule request management',exact:true});await panel.getByRole('button',{name:'Retry requests',exact:true}).waitFor();await screen.unroute('**/api/rescheduling/requests');await panel.getByRole('button',{name:'Retry requests',exact:true}).click();await panel.locator('.staff-request-group').nth(4).waitFor();assert.equal(await panel.locator('.staff-request-group').count(),5);assert.equal(await panel.getByRole('complementary',{name:'Important Booking Notice'}).count(),0);
      const pager=panel.getByRole('navigation',{name:'Staff request pagination'});await pager.getByText('1–5 of 8 groups',{exact:true}).waitFor();await pager.getByRole('button',{name:'Next',exact:true}).click();await pager.getByText('6–8 of 8 groups',{exact:true}).waitFor();assert.equal(await panel.locator('.staff-request-group').count(),3);
      await panel.getByRole('textbox',{name:'Search reschedule requests'}).fill('No request matches');await panel.getByText('No matching requests',{exact:true}).waitFor();await panel.getByRole('button',{name:'Clear request filters'}).click();await pager.getByText('1–5 of 8 groups',{exact:true}).waitFor();
      await panel.getByRole('textbox',{name:'Search reschedule requests'}).fill('STAFF-REQUEST-0');const group=panel.getByRole('region',{name:'Request group: 1 bookings',exact:true});await group.getByRole('button',{name:'View Details',exact:true}).click();const detail=screen.getByRole('dialog',{name:'Reschedule request details'});await detail.waitFor();await detail.getByRole('button',{name:'Done',exact:true}).click();await panel.getByRole('button',{name:'Clear request filters'}).click();
      await panel.getByRole('textbox',{name:'Search reschedule requests'}).fill(privateBooking.code);const privateRow=panel.getByRole('listitem',{name:`Affected booking ${privateBooking.code}`,exact:true});await privateRow.getByText('Private Fundamentals',{exact:true}).waitFor();assert.equal(await privateRow.getByText(privateBooking.code,{exact:true}).count(),0,'Reference remains in details, not repeated in the list');await privateRow.getByRole('button',{name:'View Details',exact:true}).click();await detail.getByRole('heading',{name:'Private Course request',exact:true}).waitFor();await detail.getByRole('button',{name:'Done',exact:true}).click();await panel.getByRole('button',{name:'Clear request filters'}).click();
      await panel.getByRole('textbox',{name:'Search reschedule requests'}).fill('STAFF-REQUEST-2');await panel.getByRole('button',{name:'Arrange replacement',exact:true}).click();const move=screen.getByRole('dialog',{name:'Move selected bookings',exact:true});await move.waitFor();await move.getByRole('button',{name:'Cancel',exact:true}).click();await panel.getByRole('button',{name:'Clear request filters'}).click();
      await screen.goto(ui+path+(path.includes('?')?'&':'?')+`batch=${batch.batchId}`);await screen.locator(`#request-group-${batch.batchId}`).waitFor();assert.equal(await screen.locator(`#request-group-${batch.batchId} li`).count(),2);assert.equal(await screen.getByRole('button',{name:'Requests',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await screen.getByRole('region',{name:'Booking history records',exact:true}).count(),0);await screen.reload();await screen.locator(`#request-group-${batch.batchId} li`).nth(1).waitFor();
      for(const width of [1440,768,390,320]){await screen.setViewportSize({width,height:1000});assert.ok(await screen.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screen.screenshot({path:join(artifacts,`staff-requests-${role}-${width}.png`),fullPage:true});}
      await screen.getByRole('button',{name:'Refund requests',exact:true}).click();
      const refunds=screen.getByRole('region',{name:'Refund management',exact:true});const refundRow=refunds.getByRole('article').filter({hasText:'STAFF-REQUEST-3'});await refundRow.getByRole('button',{name:'Process Refund',exact:true}).waitFor();assert.equal(await panel.count(),0);assert.equal(await screen.getByRole('region',{name:'Booking history records',exact:true}).count(),0);
      await refundRow.getByRole('button',{name:'Process Refund',exact:true}).click();const refundDialog=screen.getByRole('dialog',{name:'Process refund',exact:true});await refundDialog.getByLabel('Refund Notes',{exact:true}).waitFor();await refundDialog.getByRole('button',{name:'Cancel',exact:true}).click();await screen.reload();await refunds.getByText('STAFF-REQUEST-3',{exact:false}).waitFor();assert.equal(await screen.getByRole('button',{name:'Refund requests',exact:true}).getAttribute('aria-pressed'),'true');
      for(const width of [1440,768,390,320]){await screen.setViewportSize({width,height:1000});assert.ok(await screen.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screen.screenshot({path:join(artifacts,`staff-refund-requests-${role}-${width}.png`),fullPage:true});}
      await staff.close();
    }
    assert.deepEqual(await db.transaction.findMany({orderBy:{id:'asc'}}),ledger);assert.deepEqual(await db.booking.findMany({orderBy:{id:'asc'}}),bookings);assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['Admin and FO grouped court/private-course request lists','manual assistance opens the existing replacement workflow without mutation','Admin and FO grouped request lists','five groups per page without splitting batches','initial failure, retry, search and clear','individual and grouped detail access','batch deep links','1440/768/390/320 layouts','bookings and payments unchanged'],artifacts}));
  }finally{await db.$disconnect();}
}finally{await browser?.close();children.forEach(child=>child.kill());}
