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
const { chromium,firefox,webkit } = require('playwright');
const browserType=({chromium,firefox,webkit})[process.env.QA_BROWSER||'chromium'];
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
  browser = await browserType.launch({headless:true,...((!process.env.QA_BROWSER||process.env.QA_BROWSER==='chromium')&&executablePath?{executablePath}:{})});
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' });
  await context.addInitScript(({ token, origin }) => { if (location.origin === origin) { localStorage.setItem('zawana_access_token', token); localStorage.setItem('zawana_language', 'en'); } }, { token: data.token, origin: ui });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));


  const { PrismaClient }=createRequire(new URL('../backend/package.json',import.meta.url))('@prisma/client');
  const db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
  try {
    const actor=async token=>{const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});if(token)await c.addInitScript(token=>{localStorage.setItem('zawana_access_token',token);localStorage.setItem('zawana_language','en');},token);return c;};
    const loginContext=await actor(),loginPage=await loginContext.newPage();loginPage.on('pageerror',e=>errors.push(e.message));
    let loginCalls=0,failure='credentials';
    await loginPage.route('**/api/auth/login',async route=>{loginCalls++;if(failure==='network')return route.abort('internetdisconnected');await new Promise(resolve=>setTimeout(resolve,250));await route.fulfill({status:failure==='provider'?503:failure==='rate'?429:401,json:{code:failure==='provider'?'AUTH_UNAVAILABLE':failure==='rate'?'RATE_LIMITED':'INVALID_CREDENTIALS',message:'Prisma internal password=secret / user does not exist',requestId:'qa-login-123'}});});
    await loginPage.goto(`${ui}/login`);await loginPage.getByLabel('Username',{exact:true}).fill('unknown');await loginPage.getByLabel('Password',{exact:true}).fill('example-password');
    await loginPage.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    await loginPage.getByRole('button',{name:'Signing in…',exact:true}).waitFor();await loginPage.getByRole('alert').filter({hasText:'email or password was not accepted'}).waitFor();assert.equal(loginCalls,1);
    assert.doesNotMatch(await loginPage.getByRole('alert').innerText(),/Prisma|secret|does not exist/);
    for(const [mode,text] of [['provider','temporarily unavailable'],['rate','Too many attempts'],['network','internet connection']]){failure=mode;await loginPage.getByRole('button',{name:'Sign in',exact:true}).click();await loginPage.getByRole('alert').filter({hasText:text}).waitFor();}
    await loginContext.close();
    const date=new Date(`${data.date}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-2);const today=date.toISOString().slice(0,10);
    const pending=await db.booking.create({data:{code:'PHASES-PENDING',userId:data.memberId,coachId:data.coachId,courtId:data.courts[3].id,kind:'private_course',title:'Pending Fundamentals',location:'Arena',date:data.date,time:'6:00 PM — 7:00 PM',status:'PENDING_COACH_CONFIRMATION',reservationExpiresAt:new Date(Date.now()+86400000),paymentStatus:'pending',price:65000}});
    await db.booking.create({data:{code:'PHASES-TODAY',userId:data.memberId,coachId:data.coachId,courtId:data.courts[6].id,kind:'private_course',title:'Today Fundamentals',location:'Arena',date:today,time:'6:00 AM — 7:00 AM',status:'CONFIRMED',paymentStatus:'paid',price:65000}});
    const other=await db.coach.findFirstOrThrow({where:{name:'Other Coach'}});
    await db.booking.create({data:{code:'PHASES-OTHER',userId:data.memberId,coachId:other.id,courtId:data.courts[7].id,kind:'private_course',title:'Unauthorized course',location:'Arena',date:today,time:'8:00 AM — 9:00 AM',status:'CONFIRMED',paymentStatus:'paid',price:65000}});
    const coachContext=await actor(data.coachToken),coachPage=await coachContext.newPage();coachPage.on('pageerror',e=>errors.push(e.message));
    await coachPage.goto(`${ui}/coach`);await coachPage.getByRole('heading',{name:'Today’s schedule',exact:true}).waitFor();await coachPage.getByText('Today Fundamentals',{exact:false}).waitFor();await coachPage.getByText('1 new booking · 0 replacement proposals',{exact:true}).waitFor();assert.doesNotMatch(await coachPage.locator('main').innerText(),/Unauthorized course/);
    for(const width of [1440,768,390,320]){await coachPage.setViewportSize({width,height:1000});assert.ok(await coachPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await coachPage.screenshot({path:join(artifacts,`coach-${width}.png`),fullPage:true});}
    await coachPage.getByRole('link',{name:'Review booking requests',exact:true}).click();await coachPage.getByRole('button',{name:'Accept booking',exact:true}).click();
    const confirmation=coachPage.getByRole('dialog',{name:'Accept this booking?',exact:true});await confirmation.getByRole('button',{name:'Confirm acceptance',exact:true}).click();await confirmation.waitFor({state:'hidden'});
    assert.equal((await db.booking.findUniqueOrThrow({where:{id:pending.id}})).status,'AWAITING_PAYMENT');
    await coachPage.goto(`${ui}/coach`);await coachPage.getByText('0 new bookings · 0 replacement proposals',{exact:true}).waitFor();
    const owned=await db.booking.create({data:{code:'PHASES-PROPOSAL',userId:data.memberId,coachId:data.coachId,courtId:data.courts[6].id,kind:'private_course',title:'Replacement Fundamentals',location:'Arena',date:data.date,time:'8:00 AM — 9:00 AM',status:'CONFIRMED',paymentStatus:'paid',price:65000}});
    const memberPost=async(path,payload)=>{const response=await context.request.post(`${api}${path}`,{headers:{Authorization:`Bearer ${data.memberToken}`},data:payload});assert.equal(response.status(),200,await response.text());return response.json();};
    const session=await memberPost(`/rescheduling/member/bookings/${owned.id}/session`,{}),target={courtId:data.courts[6].id,date:data.date,time:'9:00 AM — 10:00 AM'};
    const quote=await memberPost(`/rescheduling/requests/${session.id}/quote`,target);await memberPost(`/rescheduling/requests/${session.id}/confirm`,{target,revision:quote.revision});
    const coachNotices=await context.request.get(`${api}/notifications`,{headers:{Authorization:`Bearer ${data.coachToken}`}}),proposalNotice=(await coachNotices.json()).find(row=>row.title==='Reschedule proposal awaiting review');assert.ok(proposalNotice);assert.equal(proposalNotice.entityType,'private_proposal');
    await coachPage.goto(ui+proposalNotice.link);const proposal=coachPage.locator(`#private-proposal-${proposalNotice.entityId}`);await proposal.waitFor();assert.ok(await proposal.evaluate(element=>element===document.activeElement));
    await proposal.getByLabel('Review reason',{exact:true}).fill('Please choose another session');await proposal.getByRole('button',{name:'Keep original time',exact:true}).click();await proposal.getByText('REJECTED',{exact:true}).waitFor();
    const afterDecision=await context.request.get(`${api}/notifications`,{headers:{Authorization:`Bearer ${data.coachToken}`}});assert.ok(!(await afterDecision.json()).some(row=>row.id===proposalNotice.id));
    const scopedFinance=await context.request.get(`${api}/staff/private-courses/finance?booking=${(await db.booking.findUniqueOrThrow({where:{code:'PHASES-OTHER'}})).id}`,{headers:{Authorization:`Bearer ${data.coachToken}`}});assert.equal(scopedFinance.status(),200);assert.equal((await scopedFinance.json()).rows.length,0);
    const notices=await context.request.get(`${api}/notifications`,{headers:{Authorization:`Bearer ${data.token}`}});assert.equal(notices.status(),200);const event=(await notices.json()).find(row=>row.title==='Coach accepted a private course');assert.ok(event);assert.equal(event.link,`/admin/court-rentals?history=1&kind=private_course&booking=${pending.id}`);
    await page.goto(ui+event.link);await page.locator('.desk-history tr').filter({hasText:pending.code}).waitFor();assert.equal(await page.locator('a[href*="course-finance"]').count(),0);
    for(const [token,role,target] of [[data.token,'admin','/admin/court-rentals'],[data.foToken,'badminton-fo','/badminton-fo/bookings'],[data.coachToken,'coach','/coach/bookings']]){const c=await actor(token),p=await c.newPage();await p.goto(`${ui}/${role}/course-finance?booking=${pending.id}`);await p.waitForURL(url=>url.pathname===target);await p.getByText(role==='coach'?pending.title:pending.code,{exact:true}).first().waitFor();await p.getByRole('button',{name:'Show all bookings',exact:true}).click();await p.getByRole('button',{name:'Show all bookings',exact:true}).waitFor({state:'hidden'});assert.equal(await p.locator('a[href*="course-finance"]').count(),0);await c.close();}
    assert.equal((await context.request.get(`${api}/coach/calendar`,{headers:{Authorization:`Bearer ${data.token}`}})).status(),403);
    const memberContext=await actor(data.memberToken),memberPage=await memberContext.newPage();memberPage.on('pageerror',e=>errors.push(e.message));
    await memberPage.goto(`${ui}/member`);const privateNotices=await memberContext.request.get(`${api}/notifications`,{headers:{Authorization:`Bearer ${data.memberToken}`}});assert.ok(!(await privateNotices.json()).some(row=>row.id===event.id));
    const paymentNotice=(await privateNotices.json()).find(row=>row.title==='Coach confirmed your private course');assert.ok(paymentNotice);await memberPage.goto(ui+paymentNotice.link);await memberPage.locator('details.member-booking-row[open]').filter({hasText:pending.code}).waitFor();
    await memberPage.goto(`${ui}/admin`);await memberPage.waitForURL('**/member');
    // A terminal session failure clears client authorization and protected content.
    await memberPage.route('**/api/bookings**',route=>route.fulfill({status:401,json:{code:'SESSION_EXPIRED',message:'Expired'}}));await memberPage.route('**/api/auth/refresh',route=>route.fulfill({status:401,json:{code:'SESSION_EXPIRED',message:'Expired'}}));
    await memberPage.goto(`${ui}/bookings`);await memberPage.waitForURL('**/login');await memberPage.getByRole('alert').filter({hasText:'session has expired'}).waitFor();assert.equal(await memberPage.evaluate(()=>localStorage.getItem('zawana_access_token')),null);
    // Notification recovery and fixed placement remain usable at narrow widths.
    await page.goto(`${ui}/admin`);await page.setViewportSize({width:320,height:740});const bell=page.getByRole('button',{name:/^Notifications/}).first();await bell.click();const panel=page.getByRole('region',{name:'Notifications',exact:true});await panel.waitFor();
    await page.screenshot({path:join(artifacts,'notification-placement-320.png'),fullPage:true});const bounds=await panel.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=320&&bounds.y+bounds.height<=741,JSON.stringify(bounds));await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert.ok(await bell.evaluate(el=>el===document.activeElement));
    await db.notification.create({data:{audience:'admin',title:'Reconnected update',body:'Durable notification after reconnect',type:'system'}});await page.evaluate(()=>window.dispatchEvent(new Event('online')));await bell.click();await panel.getByText('Reconnected update',{exact:true}).waitFor();await page.screenshot({path:join(artifacts,'notifications-320.png'),fullPage:true});
    await memberContext.close();await coachContext.close();assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['safe credentials/provider/network/rate errors','duplicate sign-in prevention','owned coach priorities and direct decisions','Admin private-course deep link','role isolation','expired session clears protected UI','reconnection and narrow notification placement'],artifacts}));
  } finally {await db.$disconnect();}
} finally {await browser?.close();children.forEach(child=>child.kill());}
