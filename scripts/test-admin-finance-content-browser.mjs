import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
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
  page.setDefaultTimeout(15000);
  const choose=async(name,option)=>{const control=page.getByRole('combobox',{name,exact:true});if(await control.evaluate(element=>element.tagName==='SELECT'))await control.selectOption({label:option});else{await control.click();await page.getByRole('option',{name:option,exact:true}).click();}};
  const screenshot=async(name)=>{await page.screenshot({path:join(artifacts,name),fullPage:!(await page.getByRole('dialog').count())});};
  try {
    const receipts=[];
    for(let index=0;index<23;index++)receipts.push(await db.transaction.create({data:{userId:data.memberId,business:index<21?'Badminton':'Gym',date:data.date,customer:`Finance customer ${String(index).padStart(2,'0')}`,item:`Court rental ${index}`,amount:20000,discount:1000,tax:500,finalAmount:19500,status:index===22?'pending':'paid',paymentMethod:index%2?'Cash':'Manual (simulated)',staff:'Desk Preview',confirmationMode:index%2?'MANUAL':'SIMULATED'}}));
    const refund=await db.transaction.create({data:{userId:data.memberId,business:'Badminton',date:data.date,customer:'Refunded member',item:'Refund · Court rental',amount:-5000,discount:0,tax:0,finalAmount:-5000,status:'refunded',paymentMethod:'Cash',staff:'Desk Preview',resourceType:'booking_refund',resourceId:data.bookingId}});
    const beforeTransactions=await db.transaction.findMany({orderBy:{id:'asc'}}),beforeBookings=await db.booking.findMany({orderBy:{id:'asc'}});
    const article={kind:'achievement',category:'Milestones',description:'Focused training and meaningful progress.',body:'A story of dedication.\n\nTogether we achieved a new milestone.',image:'/facilities/court.webp',googleFormLink:'',status:'draft',publishDate:data.date};
    for(let index=0;index<11;index++)await db.contentItem.create({data:{...article,title:`Academy milestone ${String(index).padStart(2,'0')}`,status:index===0?'published':'draft',publishDate:index===0?'2999-01-01':data.date}});
    await db.contentItem.create({data:{...article,kind:'community',title:'Community open day',status:'published',publishDate:'2026-01-01'}});

    await page.route('**/api/transactions?*',route=>route.fulfill({status:503,json:{message:'Finance unavailable'}}));
    await page.goto(`${ui}/admin/finance`);await page.getByRole('button',{name:'Retry finance',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'No transactions yet',exact:true}).count(),0);
    await page.unroute('**/api/transactions?*');await page.getByRole('button',{name:'Retry finance',exact:true}).click();
    const financePager=page.getByRole('navigation',{name:'Finance pagination',exact:true});await financePager.getByText('1–20 of 24 transactions',{exact:true}).waitFor();assert.equal(await page.locator('.admin-finance nav').count(),1,'Finance must have only one pager');assert.equal(await page.locator('.finance-records>article').count(),20);
    const totals=page.getByRole('region',{name:'Filtered transaction totals',exact:true});await totals.getByText('443,500 MMK',{exact:true}).waitFor();await totals.getByText('5,000 MMK',{exact:true}).waitFor();
    await financePager.getByRole('button',{name:'Next',exact:true}).click();await financePager.getByText('21–24 of 24 transactions',{exact:true}).waitFor();assert.equal(await page.locator('.finance-records>article').count(),4);await totals.getByText('443,500 MMK',{exact:true}).waitFor();
    await choose('Finance business','Badminton');await financePager.getByText('1–20 of 22 transactions',{exact:true}).waitFor();await totals.getByText('404,500 MMK',{exact:true}).waitFor();
    await choose('Transaction status','Refunded');await financePager.getByText('1–1 of 1 transactions',{exact:true}).waitFor();await page.getByRole('button',{name:`View transaction ${refund.id}`,exact:true}).click();let receipt=page.getByRole('dialog',{name:'Transaction details',exact:true});await receipt.getByText('-5,000 MMK',{exact:true}).waitFor();await receipt.getByText('Audit details',{exact:true}).click();await receipt.getByText(refund.id,{exact:true}).waitFor();await receipt.getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();await financePager.getByText('1–20 of 24 transactions',{exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Search transactions',exact:true}).fill('Finance customer 00');await financePager.getByText('1–1 of 1 transactions',{exact:true}).waitFor();await page.getByRole('button',{name:`View transaction ${receipts[0].id}`,exact:true}).click();await receipt.getByText('19,500 MMK',{exact:true}).waitFor();await receipt.getByText('20,000 MMK',{exact:true}).waitFor();await receipt.getByText('1,000 MMK',{exact:true}).waitFor();await receipt.getByText('500 MMK',{exact:true}).waitFor();await receipt.getByText('Simulated confirmation · no external charge',{exact:true}).waitFor();await page.keyboard.press('Escape');await receipt.waitFor({state:'hidden'});
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();await financePager.getByText('1–20 of 24 transactions',{exact:true}).waitFor();
    await page.getByText('More filters',{exact:true}).click();await page.getByLabel('From date',{exact:true}).fill(data.date);await page.getByLabel('To date',{exact:true}).fill(data.date);await choose('Payment method','Cash');await financePager.getByText('1–12 of 12 transactions',{exact:true}).waitFor();await choose('Sort transactions','Amount: lowest first');await page.locator('.finance-records>article').first().getByRole('heading',{name:'Refunded member',exact:true}).waitFor();
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();await financePager.getByText('1–20 of 24 transactions',{exact:true}).waitFor();await page.getByText('More filters',{exact:true}).click();
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Finance overflow at ${width}`);await screenshot(`admin-finance-${width}.png`);
      await page.locator('.finance-records>article').first().getByRole('button').click();await receipt.waitFor();assert.ok(await receipt.evaluate(element=>{const bounds=element.getBoundingClientRect();return bounds.top>=0&&bounds.bottom<=innerHeight+1;}),'Receipt fits viewport');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Receipt overflow at ${width}`);await screenshot(`admin-finance-detail-${width}.png`);await receipt.getByRole('button',{name:'Close',exact:true}).click();
    }
    await page.getByText('Refund requests',{exact:true}).first().click();await page.getByText('No refund requests.',{exact:true}).waitFor();
    await page.evaluate(()=>window.dispatchEvent(new Event('zawana-payments-refresh')));await financePager.getByText('1–20 of 24 transactions',{exact:true}).waitFor();
    assert.deepEqual(await db.transaction.findMany({orderBy:{id:'asc'}}),beforeTransactions,'Finance presentation must not mutate ledger entries');assert.deepEqual(await db.booking.findMany({orderBy:{id:'asc'}}),beforeBookings);

    await page.route('**/api/admin/content',route=>route.fulfill({status:503,json:{message:'Content unavailable'}}));await page.goto(`${ui}/admin/cms`);await page.getByRole('button',{name:'Retry content',exact:true}).waitFor();await page.unroute('**/api/admin/content');await page.getByRole('button',{name:'Retry content',exact:true}).click();
    const contentPager=page.getByRole('navigation',{name:'Content pagination',exact:true});await contentPager.getByText('1–9 of 12 stories',{exact:true}).waitFor();assert.equal(await page.locator('.content-grid>article').count(),9);await contentPager.getByRole('button',{name:'Next',exact:true}).click();await contentPager.getByText('10–12 of 12 stories',{exact:true}).waitFor();
    await page.getByRole('group',{name:'Filter content type',exact:true}).getByRole('button',{name:'Community',exact:true}).click();await contentPager.getByText('1–1 of 1 stories',{exact:true}).waitFor();await page.getByRole('article',{name:'Content Community open day',exact:true}).waitFor();await page.getByRole('button',{name:'Clear filters',exact:true}).click();
    await choose('Publication status','Scheduled');await contentPager.getByText('1–1 of 1 stories',{exact:true}).waitFor();await page.getByRole('article',{name:'Content Academy milestone 00',exact:true}).getByText('Scheduled',{exact:true}).waitFor();await page.getByRole('button',{name:'Clear filters',exact:true}).click();
    await page.getByRole('button',{name:'New achievement',exact:true}).click();const create=page.getByRole('dialog',{name:'Create a new story',exact:true});assert.equal(await create.getByRole('button',{name:'Save story',exact:true}).isDisabled(),true);await create.getByLabel('Story title',{exact:true}).fill('A new milestone');await create.getByLabel('Story summary',{exact:true}).fill('Our players are progressing together.');await create.getByLabel('Full article',{exact:true}).fill('Dedicated practice brought our community together.');
    await page.route('**/api/content',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{message:'Story save unavailable'}}):route.continue());await create.getByRole('button',{name:'Save story',exact:true}).click();await create.getByRole('alert').filter({hasText:'Story save unavailable'}).waitFor();assert.equal(await create.getByLabel('Story title',{exact:true}).inputValue(),'A new milestone');await page.unroute('**/api/content');
    await create.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await create.waitFor({state:'hidden'});assert.equal(await db.contentItem.count({where:{title:'A new milestone'}}),1);
    await page.getByRole('textbox',{name:'Search content',exact:true}).fill('A new milestone');await contentPager.getByText('1–1 of 1 stories',{exact:true}).waitFor();let card=page.getByRole('article',{name:'Content A new milestone',exact:true});await card.getByText('Draft',{exact:true}).waitFor();
    await card.getByRole('button',{name:'Edit A new milestone',exact:true}).click();const edit=page.getByRole('dialog',{name:'Edit content',exact:true});await choose('Content status','Published');await edit.getByLabel('Publish date',{exact:true}).fill('2999-01-01');await edit.getByText('Image URL & additional link',{exact:true}).click();await edit.getByLabel('Cover image URL',{exact:true}).fill('/facilities/court.webp');await edit.getByLabel('More information URL',{exact:true}).fill('https://example.com/academy');await edit.getByRole('button',{name:'Save story',exact:true}).click();await edit.waitFor({state:'hidden'});await card.getByText('Scheduled',{exact:true}).waitFor();let saved=await db.contentItem.findFirstOrThrow({where:{title:'A new milestone'}});assert.equal((await fetch(`${api}/achievements/${saved.id}`)).status,404);
    await card.getByRole('button',{name:'Publish now',exact:true}).click();await card.getByText('Live',{exact:true}).waitFor();assert.equal((await fetch(`${api}/achievements/${saved.id}`)).status,200);await card.getByRole('link',{name:'View A new milestone',exact:true}).click();await page.getByRole('heading',{name:'A new milestone',exact:true}).waitFor();await page.goto(`${ui}/admin/cms`);await contentPager.getByText('1–9 of 13 stories',{exact:true}).waitFor();
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Content overflow at ${width}`);await screenshot(`admin-content-${width}.png`);
      await page.getByRole('button',{name:'New achievement',exact:true}).click();await create.waitFor();assert.ok(await create.evaluate(element=>{const bounds=element.getBoundingClientRect();return bounds.top>=0&&bounds.bottom<=innerHeight+1;}),'Content editor fits viewport');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Story editor overflow at ${width}`);await screenshot(`admin-content-editor-${width}.png`);await create.getByRole('button',{name:'Cancel',exact:true}).click();
    }
    await page.getByRole('textbox',{name:'Search content',exact:true}).fill('A new milestone');await contentPager.getByText('1–1 of 1 stories',{exact:true}).waitFor();card=page.getByRole('article',{name:'Content A new milestone',exact:true});await card.getByRole('button',{name:'Edit A new milestone',exact:true}).click();await choose('Content status','Draft');await edit.getByRole('button',{name:'Save story',exact:true}).click();await edit.waitFor({state:'hidden'});assert.equal((await fetch(`${api}/achievements/${saved.id}`)).status,404);
    await card.getByRole('button',{name:'Delete A new milestone',exact:true}).click();const remove=page.getByRole('dialog',{name:'Delete content?',exact:true});await remove.getByRole('button',{name:'Cancel',exact:true}).click();assert.ok(await db.contentItem.findUnique({where:{id:saved.id}}));await card.getByRole('button',{name:'Delete A new milestone',exact:true}).click();await remove.getByRole('button',{name:'Delete content',exact:true}).click();await remove.waitFor({state:'hidden'});assert.equal(await db.contentItem.findUnique({where:{id:saved.id}}),null);
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.getByRole('button',{name:'Community update',exact:true}).click();await create.getByLabel('Story title',{exact:true}).fill('A simple community update');assert.equal(await create.getByLabel('Full article',{exact:true}).count(),0);await create.getByRole('button',{name:'Save story',exact:true}).click();await create.waitFor({state:'hidden'});await page.getByRole('textbox',{name:'Search content',exact:true}).fill('A simple community update');await page.getByRole('article',{name:'Content A simple community update',exact:true}).getByText('Draft',{exact:true}).waitFor();
    assert.deepEqual(await db.transaction.findMany({orderBy:{id:'asc'}}),beforeTransactions);assert.deepEqual(await db.booking.findMany({orderBy:{id:'asc'}}),beforeBookings);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,checks:['finance totals, business/status/search/method/date/sort filters and one server pager','receipt audit, discounts, tax, negative refunds and simulation labels','finance read-only; ledger and booking snapshots unchanged','content cards, search/type/status filters and pagination','draft creation, inline failure recovery, duplicate-submit guard and edit','schedule/publish/unpublish/public visibility and confirmed deletion','community workflow, 1440/768/390/320 views and fixed modal actions'],artifacts}));
  }catch(error){await screenshot('admin-finance-content-failure.png').catch(()=>{});throw error;}finally{await db.$disconnect();}
}finally{await browser?.close();children.forEach(child=>child.kill());}
