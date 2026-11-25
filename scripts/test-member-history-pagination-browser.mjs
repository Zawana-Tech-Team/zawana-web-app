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
  try {
    const commonTime=new Date('2026-11-24T18:00:00Z');
    for(let i=0;i<23;i++){const date=new Date(`${data.date}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+i+1);await db.booking.create({data:{code:`PAGING-BOOKING-${String(i).padStart(2,'0')}`,userId:data.memberId,kind:'court',courtId:data.courts[0].id,title:'Pagination rental',date:date.toISOString().slice(0,10),time:'2:00 PM — 3:00 PM',location:'Arena',status:'CONFIRMED',paymentStatus:'paid',price:20000,createdAt:commonTime}});}
    const states=['paid','pending','refunded','failed','paid'];
    for(let i=0;i<25;i++)await db.transaction.create({data:{id:`PAGING-RECEIPT-${String(i).padStart(2,'0')}`,userId:data.memberId,date:i===0?'2026-11-01':'2026-11-25',createdAt:new Date(commonTime.getTime()+i*60000),customer:'Alex Tan',staff:'Desk QA',business:'Badminton',item:`Payment record ${String(i).padStart(2,'0')}`,amount:5000+i*1000,discount:0,tax:0,finalAmount:states[i%5]==='refunded'?-(5000+i*1000):5000+i*1000,status:states[i%5],paymentMethod:i%2?'Cash':'Manual (simulated)',confirmationMode:i%2?'MANUAL':'SIMULATED'}});
    const foreign=await db.user.create({data:{name:'Other member',role:'member',email:'other-history@test.local'}});
    await db.transaction.create({data:{userId:foreign.id,date:'2026-11-25',customer:'Other member',staff:'Desk QA',business:'Badminton',item:'Foreign private receipt',amount:999999,discount:0,tax:0,finalAmount:999999,paymentMethod:'Cash',status:'paid'}});
    const before=await db.transaction.findMany({orderBy:{id:'asc'}});
    const memberContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await memberContext.addInitScript(token=>{localStorage.setItem('zawana_access_token',token);localStorage.setItem('zawana_language','en');},data.memberToken);
    const member=await memberContext.newPage();member.setDefaultTimeout(12000);member.on('pageerror',error=>errors.push(error.message));
    const responseFor=(path,predicate=()=>true)=>member.waitForResponse(r=>new URL(r.url()).pathname===`/api/${path}`&&predicate(new URL(r.url()).searchParams));
    const noOverflow=async()=>assert.ok(await member.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
    const bookingNav=()=>member.getByRole('navigation',{name:'Booking history pagination',exact:true});
    const paymentNav=()=>member.getByRole('navigation',{name:'Payment history pagination',exact:true});
    await member.goto(`${ui}/bookings`);await bookingNav().getByText('1–10 of 25 bookings',{exact:true}).waitFor();assert.equal(await member.locator('details.member-booking-row').count(),10);assert.ok(await bookingNav().getByRole('button',{name:'Previous',exact:true}).isDisabled());
    const bookingIds=[];
    const collectBookings=async()=>bookingIds.push(...await member.locator('details.member-booking-row').evaluateAll(rows=>rows.map(row=>row.id)));
    await collectBookings();
    for(const expectedPage of [2,3]){const fetched=responseFor('bookings',params=>params.get('page')===String(expectedPage));await bookingNav().getByRole('button',{name:'Next',exact:true}).click();assert.equal((await fetched).status(),200);await bookingNav().getByRole('status').filter({hasText:`Page ${expectedPage} of 3`}).waitFor();await collectBookings();}
    assert.equal(bookingIds.length,25);assert.equal(new Set(bookingIds).size,25);assert.ok(await bookingNav().getByRole('button',{name:'Next',exact:true}).isDisabled());assert.equal(await member.locator('details.member-booking-row').count(),5);
    await member.getByLabel('Search bookings',{exact:true}).fill('PAGING-BOOKING-07');await bookingNav().getByText('1–1 of 1 booking',{exact:true}).waitFor();assert.equal(await member.locator('details.member-booking-row').count(),1);assert.ok(await bookingNav().getByRole('button',{name:'Next',exact:true}).isDisabled());
    await member.getByLabel('Search bookings',{exact:true}).fill('');await bookingNav().getByText('1–10 of 25 bookings',{exact:true}).waitFor();
    for(const width of [1440,768,390,320]){await member.setViewportSize({width,height:900});await noOverflow();await member.screenshot({path:join(artifacts,`bookings-page-${width}.png`),fullPage:true});}
    await member.setViewportSize({width:1440,height:1000});await member.goto(`${ui}/payments`);await paymentNav().getByText('1–10 of 25 payments',{exact:true}).waitFor();assert.equal(await member.locator('.payment-history-card').count(),10);assert.doesNotMatch(await member.locator('.payment-history').innerText(),/Foreign private receipt|999,999|connected to your Zawana account/);
    const first=member.locator('.payment-history-card').first();await first.getByRole('heading',{name:'Payment record 24',exact:true}).waitFor();assert.match(await first.locator('.payment-history-time').innerText(),/12:54 AM/);assert.match(await first.locator('.payment-history-value').innerText(),/29,000/);await first.getByRole('img',{name:'Receipt date November 25, 2026',exact:true}).waitFor();assert.equal(await first.getByText('PAGING-RECEIPT-24',{exact:true}).isVisible(),false);await first.locator('summary').focus();await member.keyboard.press('Enter');await first.getByText('PAGING-RECEIPT-24',{exact:true}).waitFor();await first.getByText('· No external charge',{exact:true}).waitFor();
    for(const width of [1440,768,390,320]){await member.setViewportSize({width,height:900});await noOverflow();await member.screenshot({path:join(artifacts,`payments-page-${width}.png`),fullPage:true});const pager=await paymentNav().boundingBox();assert.ok(pager&&pager.x>=0&&pager.x+pager.width<=width+1);}
    const receiptIds=[];const collectPayments=async()=>receiptIds.push(...await member.locator('.payment-history-details dd').allTextContents());await collectPayments();
    for(const expectedPage of [2,3]){const fetched=responseFor('transactions',params=>params.get('page')===String(expectedPage));await paymentNav().getByRole('button',{name:'Next',exact:true}).click();assert.equal((await fetched).status(),200);await paymentNav().getByRole('status').filter({hasText:`Page ${expectedPage} of 3`}).waitFor();await collectPayments();}
    assert.equal(receiptIds.length,25);assert.equal(new Set(receiptIds).size,25);assert.equal(await member.locator('.payment-history-card').count(),5);assert.ok(await paymentNav().getByRole('button',{name:'Next',exact:true}).isDisabled());
    await member.getByLabel('Search payments',{exact:true}).fill('Payment record 07');await paymentNav().getByText('1–1 of 1 payment',{exact:true}).waitFor();assert.equal(await member.locator('.payment-history-card').count(),1);assert.match(await member.locator('.payment-history-value').innerText(),/-12,000/);await member.getByLabel('Search payments',{exact:true}).fill('nothing matches');await member.getByText('No payment history found',{exact:true}).waitFor();assert.ok(await paymentNav().getByRole('button',{name:'Previous',exact:true}).isDisabled());
    await member.getByLabel('Search payments',{exact:true}).fill('');await paymentNav().getByText('1–10 of 25 payments',{exact:true}).waitFor();await member.setViewportSize({width:1440,height:1000});await member.locator('.payment-history-filters>summary').click();await member.getByRole('combobox',{name:'Filter payment status',exact:true}).click();const refunded=responseFor('transactions',params=>params.get('status')==='refunded');await member.getByRole('option',{name:'Refunded',exact:true}).click();await refunded;await paymentNav().getByText('1–5 of 5 payments',{exact:true}).waitFor();assert.equal(await member.locator('.payment-history-card[data-status="refunded"]').count(),5);
    await member.getByLabel('From date',{exact:true}).fill('2026-11-25');await member.getByLabel('To date',{exact:true}).fill('2026-11-25');await paymentNav().getByText('1–5 of 5 payments',{exact:true}).waitFor();await member.getByRole('button',{name:'Clear filters',exact:true}).click();await paymentNav().getByText('1–10 of 25 payments',{exact:true}).waitFor();
    await member.route('**/api/transactions?*',route=>route.fulfill({status:503,json:{message:'History temporarily unavailable'}}));await member.evaluate(()=>window.dispatchEvent(new Event('zawana-payments-refresh')));await member.getByRole('alert').filter({hasText:'History temporarily unavailable'}).waitFor();assert.equal(await member.locator('.payment-history-card').count(),10);await member.unroute('**/api/transactions?*');await member.getByRole('button',{name:'Retry',exact:true}).click();await member.getByRole('alert').waitFor({state:'hidden'});
    // If records disappear while viewing the last page, return to the final valid page.
    for(let next=2;next<=3;next++){await paymentNav().getByRole('button',{name:'Next',exact:true}).click();await paymentNav().getByRole('status').filter({hasText:`Page ${next} of 3`}).waitFor();}
    await db.transaction.updateMany({where:{userId:data.memberId,id:{startsWith:'PAGING-RECEIPT-'}},data:{userId:null}});await member.evaluate(()=>window.dispatchEvent(new Event('zawana-payments-refresh')));await paymentNav().getByText('0 payments',{exact:true}).waitFor();await paymentNav().getByRole('status').filter({hasText:'Page 1 of 1'}).waitFor();
    await db.transaction.updateMany({where:{id:{startsWith:'PAGING-RECEIPT-'}},data:{userId:data.memberId}});assert.deepEqual(await db.transaction.findMany({orderBy:{id:'asc'}}),before);assert.deepEqual(errors,[]);await memberContext.close();
    console.log(JSON.stringify({ok:true,checks:['10 bookings/payments per page with visible previous/next controls','three real API pages, no gaps or duplicates including tied booking timestamps','search/status/date filters reset and retain pagination','Yangon recorded time and unchanged signed amounts','receipt disclosure, simulated labels, member ownership and privacy','refresh failure/retry preserves records and shrinking result sets clamp pages','320/390/768/1440 layouts','all original transactions unchanged'],artifacts}));
  }finally{await db.$disconnect();}
}finally{await browser?.close();children.forEach(child=>child.kill());}
