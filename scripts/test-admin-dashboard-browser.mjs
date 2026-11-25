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
    const current=new Date(`${data.date}T12:00:00Z`);current.setUTCDate(current.getUTCDate()-2);const date=current.toISOString().slice(0,10),previous=new Date(current);previous.setUTCDate(previous.getUTCDate()-1);
    const booking=await db.booking.create({data:{code:'ADMIN-TODAY',userId:data.memberId,kind:'court',courtId:data.courts[3].id,title:'Court rental',date,time:'12:00 AM — 11:59 PM',location:'Arena',status:'CONFIRMED',paymentStatus:'paid',price:100000,meta:JSON.stringify({customerName:'Walk-in Visitor'})}});
    await db.booking.create({data:{code:'ADMIN-CANCELLED',userId:data.memberId,kind:'court',courtId:data.courts[4].id,title:'Cancelled rental',date,time:'12:00 AM — 11:59 PM',location:'Arena',status:'CANCELLED',paymentStatus:'pending',price:10000}});
    const sale=async(id,amount,status,day=date,resourceType=null,resourceId=null)=>db.transaction.create({data:{id,userId:data.memberId,date:day,customer:'Alex Tan',business:'Badminton',item:'Admin overview receipt',amount,discount:0,tax:0,finalAmount:amount,status,paymentMethod:'Cash',staff:'Desk QA',resourceType,resourceId}});
    await sale('ADMIN-TODAY-PAID',100000,'paid',date,'booking',booking.id);await sale('ADMIN-TODAY-REFUND',-10000,'refunded',date,'booking_refund','recorded-refund');await sale('ADMIN-OLD-SALE',900000,'paid',previous.toISOString().slice(0,10));await sale('ADMIN-PENDING',800000,'pending');
    await db.user.create({data:{name:'Inactive member',role:'member',active:false,email:'inactive-admin-dashboard@test.local'}});
    await db.bookingRescheduleRequest.create({data:{bookingId:data.bookingId,activeKey:data.bookingId,customerId:data.memberId,requestedById:(await db.user.findFirstOrThrow({where:{role:'admin'}})).id,kind:'court',status:'ADMIN_HANDLING',oldSchedule:{courtId:data.courts[0].id,date:data.date,time:'9:00 AM — 11:00 AM'},expiresAt:new Date(Date.now()+7*86400000)}});
    const cancellation=await db.bookingCancellationRequest.create({data:{bookingId:booking.id,requestedById:data.memberId,reason:'Please review this cancellation',status:'requested',refundStatus:'manual_review'}});
    const ledgerBefore=await db.transaction.findMany({orderBy:{id:'asc'}}),original=await db.booking.findUniqueOrThrow({where:{id:booking.id}});
    await page.route('**/api/admin/dashboard',route=>route.fulfill({status:503,json:{message:'Overview temporarily unavailable'}}));
    await page.goto(`${ui}/admin`);await page.getByRole('alert').filter({hasText:'Overview temporarily unavailable'}).waitFor();assert.equal(await page.getByRole('region',{name:'Key figures',exact:true}).count(),0);await page.unroute('**/api/admin/dashboard');await page.getByRole('button',{name:'Retry',exact:true}).click();
    const metrics=page.getByRole('region',{name:'Key figures',exact:true});await metrics.getByText('90,000',{exact:true}).waitFor();assert.equal(await metrics.locator('article').count(),3);assert.equal(await page.locator('.workspace-cover').count(),0);await metrics.locator('article').filter({hasText:'Bookings today'}).getByText('1',{exact:true}).waitFor();await metrics.locator('article').filter({hasText:'Active members'}).getByText('1',{exact:true}).waitFor();
    const schedule=page.getByRole('region',{name:"Today's schedule",exact:true}),attention=page.getByRole('region',{name:'Needs attention',exact:true});await schedule.getByText('Walk-in Visitor',{exact:true}).waitFor();assert.equal(await schedule.locator('li').count(),1);await attention.getByRole('link',{name:/Admin assistance/}).waitFor();await attention.getByRole('link',{name:/Cancellations & refunds/}).waitFor();assert.doesNotMatch(await page.locator('main').innerText(),/Live facility map|Capacity pulse|Today’s utilization|Badminton coaches|900,000|990,000|48.5M/);
    for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Admin overview fits viewport');await page.screenshot({path:join(artifacts,`admin-overview-${width}.png`),fullPage:true});}
    await page.setViewportSize({width:1440,height:1000});await schedule.getByRole('link').filter({hasText:'Walk-in Visitor'}).click();await page.waitForURL(url=>url.pathname==='/admin/court-rentals'&&url.searchParams.get('booking')===booking.id);await page.locator('.desk-history tr').filter({hasText:booking.code}).waitFor();
    await page.goto(`${ui}/admin`);await page.getByRole('link',{name:'View finance',exact:true}).click();await page.waitForURL('**/admin/finance');await page.getByRole('heading',{name:'Finance',exact:true}).waitFor();
    await page.goto(`${ui}/admin`);await page.getByRole('link',{name:'Manage users',exact:true}).click();await page.waitForURL('**/admin/users');await page.getByRole('heading',{name:'Users',exact:true}).waitFor();
    await page.goto(`${ui}/admin`);await page.getByRole('link',{name:'Open court desk',exact:true}).click();await page.waitForURL('**/admin/court-rentals');await page.getByRole('group',{name:'Court rental view',exact:true}).waitFor();
    await page.goto(`${ui}/admin`);await attention.getByRole('link',{name:/Cancellations & refunds/}).click();await page.getByRole('region',{name:'Refund management',exact:true}).getByText(booking.code,{exact:false}).waitFor();
    for(const token of [data.memberToken,data.foToken,data.coachToken]){const response=await context.request.get(`${api}/admin/dashboard`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status(),403);assert.doesNotMatch(await response.text(),/revenueToday|Walk-in Visitor/);}
    await page.goto(`${ui}/admin`);await metrics.getByText('90,000',{exact:true}).waitFor();await page.route('**/api/admin/dashboard',route=>route.fulfill({status:503,json:{message:'Refresh unavailable'}}));await page.evaluate(()=>window.dispatchEvent(new Event('zawana-bookings-changed')));await page.getByRole('alert').filter({hasText:'Previously loaded figures'}).waitFor();await metrics.getByText('90,000',{exact:true}).waitFor();await page.unroute('**/api/admin/dashboard');await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('alert').waitFor({state:'hidden'});
    await db.bookingRescheduleRequest.updateMany({where:{bookingId:data.bookingId},data:{activeKey:null,status:'COMPLETED'}});await db.bookingCancellationRequest.update({where:{id:cancellation.id},data:{status:'rejected',refundStatus:'REFUND_REJECTED'}});const refreshed=page.waitForResponse(response=>response.url().endsWith('/api/admin/dashboard'));await page.evaluate(()=>window.dispatchEvent(new Event('zawana-bookings-changed')));await refreshed;await attention.getByText('Nothing needs your review',{exact:true}).waitFor();
    assert.deepEqual(await db.transaction.findMany({orderBy:{id:'asc'}}),ledgerBefore);assert.deepEqual(await db.booking.findUniqueOrThrow({where:{id:booking.id}}),original);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,checks:['accurate daily net revenue and active member counts','one summary per metric with no estimated utilization or duplicated panels','remaining schedule and real customer names','functional court-desk, booking, finance, users and review links','admin-only API and no financial changes','initial failure, retry, refresh preservation and resolved priorities','320/390/768/1440 layouts'],artifacts}));
  }finally{await db.$disconnect();}
}finally{await browser?.close();children.forEach(child=>child.kill());}
