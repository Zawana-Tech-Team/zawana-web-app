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

  const { PrismaClient } = createRequire(new URL('../backend/package.json', import.meta.url))('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yangon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),shift=days=>{const date=new Date(`${today}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
    const social=await db.badmintonPackageCategory.findUniqueOrThrow({where:{code:'SOCIAL'}}),foundation=await db.badmintonPackageCategory.findUniqueOrThrow({where:{code:'FOUNDATION'}});
    const pkg=await db.badmintonPackage.create({data:{title:'Social ten renewal',description:'Ten more sessions for your next visits.',price:50000,sessions:10,validity:30,status:'active',categoryId:social.id,availableDays:['Tue','Thu']}});
    await db.badmintonPackage.create({data:{title:'Foundation eight',description:'Foundation training',price:40000,sessions:8,validity:20,status:'active',categoryId:foundation.id}});
    const make=(name,status,expiry)=>db.badmintonEnrollment.create({data:{studentId:data.memberId,userId:data.memberId,studentName:'Alex Tan',phone:'',packageId:pkg.id,packageName:name,categoryCode:'SOCIAL',sessionsTotal:10,sessionsRemaining:5,startDate:shift(-10),expiryDate:expiry,status}});
    const source=await make(pkg.title,'active',shift(5));await make('Hidden expired history','expired',shift(-1));await make('Hidden inactive history','inactive',shift(5));
    const memberContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await memberContext.addInitScript(token=>{localStorage.setItem('zawana_access_token',token);localStorage.setItem('zawana_language','en');},data.memberToken);const memberPage=await memberContext.newPage();memberPage.on('pageerror',e=>errors.push(e.message));
    await memberPage.goto(`${ui}/membership`);const tabs=memberPage.getByRole('group',{name:'Membership sections',exact:true}),active=memberPage.getByRole('region',{name:'Active packages',exact:true});await active.getByRole('heading',{name:pkg.title,exact:true}).waitFor();assert.equal(await active.locator('article').count(),1);assert.doesNotMatch(await active.innerText(),/Hidden|Expired|Exhausted|purchase history/);
    await tabs.getByRole('button',{name:'Package Store',exact:true}).click();await memberPage.getByRole('region',{name:'Package store',exact:true}).getByRole('heading',{name:'Foundation eight',exact:true}).waitFor();assert.equal(await memberPage.locator('.membership-active-card').count(),0);
    await tabs.getByRole('button',{name:'Active Packages',exact:true}).click();await active.getByRole('button',{name:'Renew package',exact:true}).click();let dialog=memberPage.getByRole('dialog',{name:'Renew package',exact:true});await dialog.getByText('Ready to use',{exact:true}).waitFor();await dialog.getByText('15',{exact:true}).waitFor();assert.ok((await dialog.innerText()).includes('today'));
    for(const width of [1440,768,390,320]){await memberPage.setViewportSize({width,height:900});assert.ok(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const bounds=await dialog.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=901);await memberPage.screenshot({path:join(artifacts,`renewal-${width}.png`),fullPage:true});}
    let savedPayload;await memberPage.route('**/member/badminton-enrollments/*/renew',route=>{savedPayload=route.request().postDataJSON();return route.fulfill({status:503,json:{message:'Temporary payment failure. Try again.'}});});await dialog.getByRole('button',{name:'Confirm renewal',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await db.transaction.count({where:{resourceType:'badminton_enrollment'}}),0);assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({where:{id:source.id}})).status,'active');await memberPage.unroute('**/member/badminton-enrollments/*/renew');
    const committed=memberPage.waitForResponse(response=>response.url().endsWith(`/member/badminton-enrollments/${source.id}/renew`)&&response.request().method()==='POST');await dialog.getByRole('button',{name:'Confirm renewal',exact:true}).click();const response=await committed;assert.equal(response.status(),200);assert.deepEqual(response.request().postDataJSON(),savedPayload);const renewed=await response.json();await dialog.waitFor({state:'hidden'});await memberPage.getByRole('status').filter({hasText:'5 sessions carried over; 15 sessions'}).waitFor();
    assert.equal(renewed.sessionsRemaining,15);assert.equal(renewed.expiryDate,shift(29));assert.equal(renewed.renewalOfId,source.id);assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({where:{id:source.id}})).status,'inactive');assert.equal(await active.locator('article').count(),1);
    const headers={Authorization:`Bearer ${data.memberToken}`};const retry=await context.request.post(`${api}/member/badminton-enrollments/${source.id}/renew`,{headers,data:savedPayload});assert.equal(retry.status(),200);assert.equal((await retry.json()).id,renewed.id);assert.equal(await db.transaction.count({where:{resourceType:'badminton_enrollment',resourceId:renewed.id}}),1);
    const tampered=await context.request.post(`${api}/member/badminton-enrollments/${source.id}/renew`,{headers,data:{...savedPayload,price:1}});assert.equal(tampered.status(),400);const other=await context.request.get(`${api}/member/badminton-enrollments/${renewed.id}/renewal`,{headers:{Authorization:`Bearer ${data.otherCoachToken}`}});assert.equal(other.status(),403);
    await active.getByRole('button',{name:'Renew package',exact:true}).click();dialog=memberPage.getByRole('dialog',{name:'Renew package',exact:true});await dialog.getByText('25',{exact:true}).waitFor();const checkin=await context.request.post(`${api}/badminton/check-ins`,{headers:{Authorization:`Bearer ${data.token}`},data:{enrollmentId:renewed.id}});assert.equal(checkin.status(),201,await checkin.text());await dialog.getByRole('button',{name:'Confirm renewal',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'changed'}).waitFor();assert.equal(await db.transaction.count({where:{resourceType:'badminton_enrollment'}}),1);await dialog.getByRole('button',{name:'Refresh renewal',exact:true}).click();await dialog.getByText('24',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Back to packages',exact:true}).click();
    await tabs.getByRole('button',{name:'Package Store',exact:true}).click();await memberPage.getByRole('button',{name:'View details for Foundation eight',exact:true}).click();const details=memberPage.getByRole('dialog',{name:'Foundation eight details',exact:true});
    const purchasesBefore=await db.badmintonPackagePurchase.count({where:{userId:data.memberId}});
    // A completed payment followed by a failed dashboard refresh must retain its retry key.
    await memberPage.route('**/member/dashboard',route=>route.fulfill({status:503,json:{message:'Dashboard refresh unavailable.'}}));
    const firstPurchase=memberPage.waitForResponse(response=>response.url().includes('/member/badminton-packages/')&&response.url().endsWith('/purchase')&&response.request().method()==='POST');
    await details.getByRole('button',{name:'Activate package',exact:true}).click();const purchaseResponse=await firstPurchase;assert.equal(purchaseResponse.status(),201);await details.getByRole('alert').waitFor();assert.equal(await db.badmintonPackagePurchase.count({where:{userId:data.memberId}}),purchasesBefore+1);
    await memberPage.unroute('**/member/dashboard');const retriedPurchase=memberPage.waitForResponse(response=>response.url()===purchaseResponse.url()&&response.request().method()==='POST');await details.getByRole('button',{name:'Activate package',exact:true}).click();const purchaseRetry=await retriedPurchase;assert.equal(purchaseRetry.status(),201);assert.deepEqual(purchaseRetry.request().postDataJSON(),purchaseResponse.request().postDataJSON());
    await details.waitFor({state:'hidden'});await active.getByRole('heading',{name:'Foundation eight',exact:true}).waitFor();assert.equal(await db.badmintonPackagePurchase.count({where:{userId:data.memberId}}),purchasesBefore+1);assert.equal(await active.locator('article').count(),2);assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({where:{id:renewed.id}})).sessionsRemaining,14);
    for(const width of [1440,768,390,320]){await memberPage.setViewportSize({width,height:900});assert.ok(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await memberPage.screenshot({path:join(artifacts,`membership-active-${width}.png`),fullPage:true});await tabs.getByRole('button',{name:'Package Store',exact:true}).click();await memberPage.screenshot({path:join(artifacts,`membership-store-${width}.png`),fullPage:true});await tabs.getByRole('button',{name:'Active Packages',exact:true}).click();}
    const beforeViewing=await db.transaction.count();await tabs.getByRole('button',{name:'Package Store',exact:true}).click();await memberPage.getByRole('button',{name:'View details for Foundation eight',exact:true}).click();await memberPage.getByRole('dialog').getByRole('button',{name:'View active package',exact:true}).click();await active.getByRole('heading',{name:'Foundation eight',exact:true}).waitFor();assert.equal(await db.transaction.count(),beforeViewing);
    await memberPage.reload();await memberPage.getByRole('region',{name:'Active packages',exact:true}).getByRole('heading',{name:'Foundation eight',exact:true}).waitFor();assert.doesNotMatch(await active.innerText(),/Hidden|Expired|Exhausted/);assert.deepEqual([...new Set((await db.badmintonEnrollment.findMany()).map(row=>row.status))].sort(),['active','inactive']);assert.deepEqual(errors,[]);await memberContext.close();console.log(JSON.stringify({ok:true,checks:['separate active/store tabs','inactive/expired history hidden','early renewal carries sessions and restarts validity','failed payment/retry is idempotent','strict financial inputs and role checks','concurrent check-in invalidates stale renewal quote','normal purchase preserves other category balance','320/390/768/1440 layouts and persistence'],artifacts}));
  } finally { await db.$disconnect(); }
} finally { await browser?.close(); children.forEach(child => child.kill()); }
