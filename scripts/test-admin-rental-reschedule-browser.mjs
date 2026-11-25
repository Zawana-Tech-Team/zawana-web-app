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
  const changeDay=(date,amount)=>{const day=new Date(`${date}T12:00:00Z`);day.setUTCDate(day.getUTCDate()+amount);return day.toISOString().slice(0,10);};
  const fit=async(dialog,label)=>assert.ok(await dialog.evaluate(element=>{const box=element.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight+1&&element.scrollWidth<=element.clientWidth+1;}),label);
  try {
    await db.user.update({where:{id:data.memberId},data:{phone:'099123456'}});
    const original=await db.booking.update({where:{id:data.bookingId},data:{paymentStatus:'paid'}});
    const receipt=async(booking)=>db.transaction.create({data:{userId:data.memberId,business:'Badminton',date:booking.date,customer:'Alex Tan',item:booking.title,amount:booking.price,discount:0,tax:0,finalAmount:booking.price,paymentMethod:'Cash',staff:'Desk Preview',status:'paid',resourceType:'booking',resourceId:booking.id}});
    await receipt(original);await db.court.update({where:{id:data.courts[1].id},data:{price:22500}});
    const batchDate=changeDay(data.date,3),targetDate=changeDay(data.date,1),rentals=[];
    for(let i=0;i<2;i++){const booking=await db.booking.create({data:{code:`RENTAL-UI-${i+1}`,kind:'court',userId:data.memberId,courtId:data.courts[6].id,title:data.courts[6].name,date:batchDate,time:i?'7:00 AM — 8:00 AM':'6:00 AM — 7:00 AM',price:20000,status:'confirmed',paymentStatus:'paid',location:'Zawana Badminton Arena'}});rentals.push(booking);await receipt(booking);}
    const bookingsBefore=await db.booking.findMany({orderBy:{id:'asc'}}),ledgerBefore=await db.transaction.findMany({orderBy:{id:'asc'}});
    await page.goto(`${ui}${courtDeskPath}`);await page.getByLabel('Operating day',{exact:true}).fill(batchDate);await page.waitForFunction(()=>document.querySelector('.court-timetable')?.getAttribute('aria-busy')==='false');
    const events=page.locator('.court-timetable__event').filter({hasText:'Alex Tan'});await events.nth(1).waitFor();await events.nth(0).click();await events.nth(1).click();
    const openRequest=async()=>{await page.getByRole('button',{name:'Booking Actions',exact:true}).click();await page.getByRole('menuitem').filter({hasText:'Request Reschedule'}).click();};
    await page.route('**/api/rescheduling/bookings/*/details',route=>route.fulfill({status:503,json:{message:'Selected bookings unavailable'}}));await openRequest();
    const request=page.getByRole('dialog',{name:'Send reschedule request',exact:true});await request.getByRole('button',{name:'Retry booking details',exact:true}).waitFor();await page.unroute('**/api/rescheduling/bookings/*/details');await request.getByRole('button',{name:'Retry booking details',exact:true}).click();await request.getByRole('list',{name:'Rentals to request',exact:true}).getByRole('listitem').nth(1).waitFor();
    assert.equal(await request.getByText('Alex Tan',{exact:true}).count(),1,'Grouped rentals share one customer header');assert.equal(await request.locator('input[type=date]').count(),0);assert.equal(await request.locator('select').count(),1,'A request must not require a replacement court or time');assert.equal(await request.getByRole('button',{name:'Send 2 Requests',exact:true}).isDisabled(),true);
    await request.getByLabel('Reason',{exact:true}).selectOption('MAINTENANCE');await request.getByText('Customer notice',{exact:true}).click();assert.equal(await request.getByText('Dear Valued Customer,',{exact:false}).count(),1);await request.getByText('Customer notice',{exact:true}).click();
    for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});await fit(request,`Request fits ${width}`);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(artifacts,`admin-rental-request-${width}.png`)});}
    await request.getByText('Notes (optional)',{exact:true}).first().click();await request.getByRole('textbox',{name:'Notes (optional)',exact:true}).fill('Please contact the front desk if assistance is needed.');
    await page.route('**/api/rescheduling/requests/batch',route=>route.fulfill({status:503,json:{message:'Request sending unavailable'}}));await request.getByRole('button',{name:'Send 2 Requests',exact:true}).click();await request.getByRole('alert').filter({hasText:'Request sending unavailable'}).waitFor();assert.equal(await request.getByLabel('Reason',{exact:true}).inputValue(),'MAINTENANCE');assert.equal(await request.getByRole('textbox',{name:'Notes (optional)',exact:true}).inputValue(),'Please contact the front desk if assistance is needed.');await page.unroute('**/api/rescheduling/requests/batch');
    await request.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await request.waitFor({state:'hidden'});const sent=await db.bookingRescheduleRequest.findMany({where:{bookingId:{in:rentals.map(row=>row.id)}}});assert.equal(sent.length,2);assert.equal(new Set(sent.map(row=>row.batchId)).size,1);assert.ok(sent[0].batchId);assert.equal(await db.notification.count({where:{userId:data.memberId,entityType:'reschedule_batch',entityId:sent[0].batchId}}),1);assert.deepEqual(await db.booking.findMany({orderBy:{id:'asc'}}),bookingsBefore);assert.deepEqual(await db.transaction.findMany({orderBy:{id:'asc'}}),ledgerBefore);
    await openRequest();await request.getByText('Awaiting Customer Response · No duplicate request will be sent',{exact:true}).first().waitFor();assert.equal(await request.getByRole('button',{name:'Requests already sent',exact:true}).isDisabled(),true);await request.getByRole('button',{name:'Cancel',exact:true}).click();

    await page.goto(`${ui}${courtDeskPath}`);await page.getByLabel('Operating day',{exact:true}).fill(data.date);await page.waitForFunction(()=>document.querySelector('.court-timetable')?.getAttribute('aria-busy')==='false');await page.locator('.court-timetable__event').filter({hasText:'Alex Tan'}).first().click();await openRequest();await request.getByRole('region',{name:'Original booking',exact:true}).waitFor();assert.equal(await request.getByText('Alex Tan',{exact:true}).count(),1);await request.getByLabel('Reason',{exact:true}).selectOption('EVENT');await fit(request,'Single request fits mobile');await request.getByRole('button',{name:'Send Request',exact:true}).click();await request.waitFor({state:'hidden'});assert.equal(await db.bookingRescheduleRequest.count({where:{bookingId:original.id,status:'PENDING_CUSTOMER'}}),1);assert.deepEqual(await db.booking.findMany({orderBy:{id:'asc'}}),bookingsBefore);assert.deepEqual(await db.transaction.findMany({orderBy:{id:'asc'}}),ledgerBefore);

    await page.route(`**/api/court-booking/bookings/${original.id}/changes`,route=>route.fulfill({status:503,json:{message:'Reservation unavailable'}}));await page.goto(`${ui}${bookingPath}/${original.id}/reschedule`);await page.getByRole('button',{name:'Retry reservation',exact:true}).waitFor();await page.unroute(`**/api/court-booking/bookings/${original.id}/changes`);await page.getByRole('button',{name:'Retry reservation',exact:true}).click();
    const move=page.getByRole('dialog',{name:'Move selected bookings',exact:true});await move.getByRole('region',{name:'Original booking',exact:true}).waitFor();await move.getByText('Court 1 (2nd floor)',{exact:true}).first().waitFor();assert.equal(await move.getByRole('list',{name:'Workflow progress',exact:true}).count(),0);assert.equal(await move.getByRole('button',{name:'Review reschedule',exact:true}).isDisabled(),true);
    await move.getByLabel('Destination court 1',{exact:true}).selectOption(data.courts[1].id);await move.getByLabel('Destination time 1',{exact:true}).waitFor({state:'visible'});await move.getByLabel('Reason',{exact:true}).selectOption('EVENT');await page.waitForFunction(()=>{const select=document.querySelector('select[aria-label="Destination time 1"]');return select&&!select.disabled;});assert.equal(await move.locator('select[aria-label="Destination time 1"] option[value="6:00 PM — 8:00 PM"]').count(),0);assert.equal(await move.getByRole('button',{name:'Review reschedule',exact:true}).isDisabled(),true);assert.deepEqual(await db.booking.findUniqueOrThrow({where:{id:original.id}}),original,'A blocked destination must preserve the original booking');
    await move.getByLabel('Destination date 1',{exact:true}).fill(targetDate);await move.getByLabel('Destination court 1',{exact:true}).selectOption(data.courts[3].id);await move.getByLabel('Destination time 1',{exact:true}).selectOption('6:00 AM — 8:00 AM');await move.getByRole('button',{name:'Review reschedule',exact:true}).click();await move.getByText('No payment needed',{exact:true}).waitFor();assert.equal(await move.getByRole('group',{name:'Payment method',exact:true}).count(),0);await move.getByRole('button',{name:'Edit replacement',exact:true}).click();
    await move.getByLabel('Destination court 1',{exact:true}).selectOption(data.courts[1].id);await move.getByLabel('Destination time 1',{exact:true}).selectOption('6:00 AM — 8:00 AM');
    await page.route('**/api/rescheduling/moves/quote',route=>route.fulfill({status:503,json:{message:'Availability check unavailable'}}));await move.getByRole('button',{name:'Review reschedule',exact:true}).click();await move.getByRole('alert').filter({hasText:'Availability check unavailable'}).waitFor();assert.equal(await move.getByLabel('Destination date 1',{exact:true}).inputValue(),targetDate);await page.unroute('**/api/rescheduling/moves/quote');
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:900});await fit(move,`Reschedule form fits ${width}`);await page.screenshot({path:join(artifacts,`admin-rental-reschedule-${width}.png`)});
      await move.getByRole('button',{name:'Review reschedule',exact:true}).click();await move.getByRole('region',{name:'Additional payment',exact:true}).getByText('5,000 MMK',{exact:true}).waitFor();await fit(move,`Reschedule review fits ${width}`);assert.equal(await move.getByRole('button',{name:'Confirm reschedule',exact:true}).isDisabled(),true);assert.equal(await move.getByRole('region',{name:'Original booking',exact:true}).count(),1);assert.equal(await move.getByRole('region',{name:'Replacement',exact:true}).count(),1);await page.screenshot({path:join(artifacts,`admin-rental-reschedule-review-${width}.png`)});
      if(width!==320)await move.getByRole('button',{name:'Edit replacement',exact:true}).click();
    }
    await move.getByRole('button',{name:'Cash',exact:true}).click();await move.getByLabel('I received the full amount in cash.',{exact:true}).check();
    await page.route('**/api/rescheduling/moves/confirm',route=>route.fulfill({status:503,json:{message:'Confirmation temporarily unavailable'}}));await move.getByRole('button',{name:'Confirm reschedule',exact:true}).click();await move.getByRole('alert').filter({hasText:'Confirmation temporarily unavailable'}).waitFor();assert.equal(await move.getByLabel('I received the full amount in cash.',{exact:true}).isChecked(),true);await page.unroute('**/api/rescheduling/moves/confirm');
    await move.getByRole('button',{name:'Confirm reschedule',exact:true}).evaluate(button=>{button.click();button.click();});await move.waitFor({state:'hidden'});const changed=await db.booking.findUniqueOrThrow({where:{id:original.id}});assert.equal(changed.courtId,data.courts[1].id);assert.equal(changed.date,targetDate);assert.equal(changed.time,'6:00 AM — 8:00 AM');assert.equal(changed.price,45000);assert.equal((await db.bookingRescheduleRequest.findFirstOrThrow({where:{bookingId:original.id}})).status,'COMPLETED');assert.equal(await db.bookingChangeHistory.count({where:{bookingId:original.id}}),1);assert.equal(await db.transaction.count(),ledgerBefore.length+1);assert.equal((await db.transaction.findFirstOrThrow({where:{resourceType:'court_reschedule'}})).finalAmount,5000);
    for(const booking of bookingsBefore.filter(row=>row.id!==original.id))assert.deepEqual(await db.booking.findUnique({where:{id:booking.id}}),booking);for(const row of ledgerBefore)assert.deepEqual(await db.transaction.findUnique({where:{id:row.id}}),row);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,checks:['admin grouped request summary and no destination inputs','booking-details retry, notice preview, optional notes and retained draft on error','independent requests, one grouped notification and no duplicate sending','request creation preserves all bookings and ledger rows','direct reschedule entry retry, original/floor details and availability conflicts','zero/additional charge review, payment confirmation and duplicate-submit protection','schedule, surcharge receipt and audit history recorded once; other data preserved','1440/768/390/320 request, replacement and review layouts'],artifacts}));
  }catch(error){await page.screenshot({path:join(artifacts,'admin-rental-reschedule-failure.png')}).catch(()=>{});throw error;}finally{await db.$disconnect();}
}finally{await browser?.close();children.forEach(child=>child.kill());}
