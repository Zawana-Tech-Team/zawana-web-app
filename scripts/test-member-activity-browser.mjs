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


  const {PrismaClient}=createRequire(new URL('../backend/package.json',import.meta.url))('@prisma/client');
  const db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
  try {
    const memberContext=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
    await memberContext.addInitScript(token=>localStorage.setItem('zawana_access_token',token),data.memberToken);
    const memberPage=await memberContext.newPage();memberPage.on('pageerror',e=>errors.push(e.message));
    const tab=name=>memberPage.getByRole('group',{name:'Booking management',exact:true}).getByRole('button',{name,exact:true}).click();
    await memberPage.goto(`${ui}/bookings`);await tab('Requests');await memberPage.getByText('You’re all caught up',{exact:true}).waitFor();
    await tab('Refunds');await memberPage.getByText('No completed refunds yet',{exact:true}).waitFor();
    const send=async(path,payload)=>{const r=await context.request.post(`${api}${path}`,{headers:{Authorization:`Bearer ${data.token}`},data:payload});assert.ok(r.ok(),await r.text());return r.json();};
    const rentals=[];
    for(const [i,time] of ['6:00 AM — 7:00 AM','7:00 AM — 8:00 AM','8:00 AM — 9:00 AM'].entries()) rentals.push(await db.booking.create({data:{code:`REQUEST-CARD-${i+1}`,userId:data.memberId,kind:'court',courtId:data.courts[3].id,date:data.date,time,title:'Court rental',location:'Arena',status:'CONFIRMED',paymentStatus:'paid',price:20000}}));
    await send('/rescheduling/requests/batch',{bookingIds:rentals.map(r=>r.id),reason:'MAINTENANCE',requestKey:randomUUID()});
    const privateBooking=await db.booking.create({data:{code:'COACH-CARD',userId:data.memberId,kind:'private_course',courtId:data.courts[6].id,coachId:data.coachId,date:data.date,time:'2:00 PM — 3:00 PM',title:'Private Fundamentals',location:'Arena',status:'CONFIRMED',paymentStatus:'paid',price:65000}});
    await db.privateRescheduleRequest.create({data:{bookingId:privateBooking.id,pendingKey:privateBooking.id,requestedById:data.memberId,originalRevision:'fixture',original:{id:privateBooking.id,courtId:privateBooking.courtId,date:privateBooking.date,time:privateBooking.time},courtId:data.courts[7].id,date:data.date,time:'3:00 PM — 4:00 PM',status:'PENDING',reason:'A later session works better'}});
    const source=await db.booking.create({data:{code:'REFUND-CARD-1',userId:data.memberId,kind:'court',courtId:data.courts[5].id,date:data.date,time:'10:00 AM — 11:00 AM',title:'Court 4 rental',location:'Arena',status:'CONFIRMED',paymentStatus:'paid',price:20000}});
    await db.transaction.create({data:{resourceType:'booking',resourceId:source.id,userId:data.memberId,date:data.date,customer:'Alex Tan',business:'Badminton',item:'Court rental',amount:20000,discount:0,tax:0,finalAmount:20000,paymentMethod:'Cash',staff:'FO',status:'paid'}});
    const preview=await context.request.get(`${api}/rescheduling/refunds/bookings/${source.id}`,{headers:{Authorization:`Bearer ${data.token}`}});assert.equal(preview.status(),200);const detail=await preview.json();
    await send(`/rescheduling/refunds/bookings/${source.id}/complete`,{amount:20000,method:'CASH',employeeName:'Desk QA',notes:'Internal fixture receipt verified',reference:'',confirmed:true,revision:detail.revision,requestKey:randomUUID()});
    const {mkdirSync}=await import('node:fs');const shots='/tmp/zawana-activity-preview';mkdirSync(shots,{recursive:true});
    await tab('Requests');const group=memberPage.getByRole('region',{name:'Request group: 3 bookings',exact:true});await group.waitFor();assert.equal(await memberPage.getByText('Awaiting coach',{exact:true}).count(),0);await tab('Bookings');await memberPage.getByRole('region',{name:'Private course reschedule requests',exact:true}).getByText('Awaiting coach',{exact:true}).waitFor();await tab('Requests');await group.waitFor();
    assert.equal(await group.getByRole('button',{name:'Accept',exact:true}).count(),3);
    assert.equal(await group.getByRole('complementary',{name:'Important Booking Notice',exact:true}).count(),1);await group.getByRole('button',{name:'Accept',exact:true}).first().focus();assert.ok(await group.getByRole('button',{name:'Accept',exact:true}).first().evaluate(el=>el===document.activeElement));
    for(const [name,width,height] of [['desktop',1440,1050],['tablet',768,1024],['mobile',390,844]]){await memberPage.setViewportSize({width,height});assert.ok(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' requests overflow');await memberPage.screenshot({path:`${shots}/requests-${name}.png`,fullPage:true});}
    await tab('Refunds');const refunds=memberPage.getByRole('region',{name:'Refund history',exact:true});await refunds.getByText('REFUND-CARD-1',{exact:true}).waitFor();assert.equal(await refunds.locator('article').count(),1);assert.ok(!(await refunds.innerText()).includes('Internal fixture'));
    for(const [name,width,height] of [['desktop',1440,1050],['tablet',768,1024],['mobile',390,844]]){await memberPage.setViewportSize({width,height});assert.ok(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' refunds overflow');await memberPage.screenshot({path:`${shots}/refunds-${name}.png`,fullPage:true});}
    await memberPage.route('**/api/rescheduling/refunds/mine',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Refund history temporarily unavailable'})}));
    await memberPage.evaluate(()=>window.dispatchEvent(new Event('zawana-bookings-changed')));await refunds.getByRole('alert').waitFor();assert.equal(await refunds.locator('article').count(),1,'Keep recorded refunds visible during refresh errors');
    await memberPage.unroute('**/api/rescheduling/refunds/mine');const recovered=memberPage.waitForResponse(r=>r.url().endsWith('/rescheduling/refunds/mine'));await memberPage.evaluate(()=>window.dispatchEvent(new Event('zawana-bookings-changed')));await recovered;await refunds.getByRole('alert').waitFor({state:'hidden'});
    await refunds.getByRole('button',{name:'View requests',exact:true}).click();await group.waitFor();
    // Separate notices stay separate, including a one-booking staff request.
    const additional=[];
    for(const [i,time] of ['11:00 AM — 12:00 PM','12:00 PM — 1:00 PM','1:00 PM — 2:00 PM'].entries())additional.push(await db.booking.create({data:{code:`SEPARATE-NOTICE-${i}`,userId:data.memberId,kind:'court',courtId:data.courts[0].id,date:data.date,time,title:'Court rental',location:'Arena',status:'CONFIRMED',paymentStatus:'paid',price:20000}}));
    const second=await send('/rescheduling/requests/batch',{bookingIds:additional.slice(0,2).map(row=>row.id),reason:'EVENT',requestKey:randomUUID()});
    const single=await send('/rescheduling/requests',{bookingId:additional[2].id,reason:'MAINTENANCE'});
    await tab('Refunds');await tab('Requests');
    const groups=memberPage.locator('.affected-booking-group');await groups.nth(2).waitFor();assert.equal(await groups.count(),3);
    const eventGroup=memberPage.locator(`#request-group-${second.requests[0].batchId}`),singleGroup=memberPage.locator(`#request-group-${single.id}`);
    await eventGroup.getByRole('heading',{name:'2 Requests',exact:true}).waitFor();await singleGroup.getByRole('heading',{name:'1 Request',exact:true}).waitFor();
    assert.equal(await eventGroup.getByRole('complementary',{name:'Important Booking Notice',exact:true}).count(),1);
    await group.getByRole('button',{name:'Admin Handle',exact:true}).first().click();
    await memberPage.getByRole('dialog',{name:'Request Admin assistance',exact:true}).getByRole('button',{name:'Confirm Admin assistance',exact:true}).click();
    await memberPage.getByRole('status').filter({hasText:'Sent to Admin'}).waitFor();
    await memberPage.getByRole('region',{name:'Request group: 2 bookings',exact:true}).filter({hasText:'scheduled maintenance'}).waitFor();
    assert.equal(await eventGroup.getByRole('button',{name:'Accept',exact:true}).count(),2);assert.equal(await singleGroup.getByRole('button',{name:'Accept',exact:true}).count(),1);
    await memberPage.reload();await tab('Requests');await groups.nth(2).waitFor();assert.equal(await memberPage.getByText('With Admin',{exact:true}).count(),0);assert.equal(await groups.count(),3);
    assert.deepEqual(errors,[]);await memberContext.close();console.log('PASS requests/refunds: responsive cards, A/B/C actions, coach comparisons, keyboard actions, empty states, refund privacy, refresh recovery; screenshots '+shots);
  }finally{await db.$disconnect();}
}finally{await browser?.close();children.forEach(child=>child.kill());}
