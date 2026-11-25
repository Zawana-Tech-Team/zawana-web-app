import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
const require = createRequire(new URL('../tooling/gym/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = resolve(new URL('..', import.meta.url).pathname);
const temp = mkdtempSync(join(tmpdir(), 'zawana-attendance-browser-'));
const freePort = async () => { const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise(r => server.close(r)); return port; };
const apiPort = await freePort(), uiPort = await freePort();
const api = `http://127.0.0.1:${apiPort}/api`, ui = `http://127.0.0.1:${uiPort}`;
const fixture = join(temp, 'fixture.json');
writeFileSync(join(temp, 'qa.db'), '');
const env = { ...process.env, DATABASE_URL: `file:${join(temp, 'qa.db')}`, AUTH_MODE: 'database', NODE_ENV: 'test', JWT_SECRET: 'attendance-test-only-key-over-thirty-two-characters', CLIENT_URL: ui, PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`, PORT: String(apiPort), VITE_API_URL: api, VITE_AUTH_MODE: 'database', ATTENDANCE_QA_FIXTURE_PATH: fixture };
let browser, apiProcess, logs = ''; const children = [], errors = [], keyWarnings = [];
const start = (bin, args, cwd) => { const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child); child.stdout.on('data', d => logs += d); child.stderr.on('data', d => logs += d); return child; };
const ready = async url => { for (let i = 0; i < 150; i++) { if (children.some(c => c.exitCode !== null)) throw new Error(logs); if (await fetch(url).then(r => r.ok).catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(logs); };
try {
  execFileSync(join(root, 'backend/node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  execFileSync(join(root, 'backend/node_modules/.bin/tsx'), ['tests/attendance-browser-fixture.ts'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  const data = JSON.parse(readFileSync(fixture, 'utf8'));
  apiProcess = start(join(root, 'backend/node_modules/.bin/tsx'), ['src/server.ts'], join(root, 'backend'));
  start(join(root, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], root);
  await Promise.all([ready(ui), ready(`${api}/health`)]);
  const chrome = process.env.ATTENDANCE_BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  const {PrismaClient}=createRequire(new URL('../backend/package.json',import.meta.url))('@prisma/client');const db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
  try{
    const admin=await db.user.findFirstOrThrow({where:{role:'admin'}}),course=await db.booking.findUniqueOrThrow({where:{code:'ATTENDANCE-QA'}}),enrollment=await db.badmintonEnrollment.findFirstOrThrow({where:{userId:data.memberId,categoryCode:'SOCIAL'}});
    await db.bookingAttendance.create({data:{bookingId:course.id,recordedById:admin.id,status:'present'}});
    const staffToken=data.tokens.find(row=>row.role==='admin').token;
    const checkIn=async enrollmentId=>{const response=await fetch(`${api}/badminton/check-ins`,{method:'POST',headers:{Authorization:`Bearer ${staffToken}`,'Content-Type':'application/json'},body:JSON.stringify({enrollmentId})});assert.equal(response.status,201);return response.json();};
    const socialVisit=await checkIn(enrollment.id);await checkIn((await db.badmintonEnrollment.findFirstOrThrow({where:{userId:data.memberId,categoryCode:'FOUNDATION'}})).id);
    const snapshot=JSON.stringify({enrollments:await db.badmintonEnrollment.findMany(),visits:await db.badmintonCheckIn.findMany(),attendance:await db.bookingAttendance.findMany()});
    const member=data.tokens.find(row=>row.role==='member');const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await c.addInitScript(token=>localStorage.setItem('zawana_access_token',token),member.token);const page=await c.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(ui+'/attendance');await page.getByRole('heading',{name:'Check-in history',exact:true}).waitFor();await page.getByText('2 check-ins',{exact:true}).waitFor();
    assert.equal(await page.locator('.member-attendance-visit').count(),2);assert.doesNotMatch(await page.locator('main').innerText(),/Footwork foundations|Private course/);await page.getByRole('region',{name:'Attendance calendar',exact:true}).waitFor();const todayButton=page.locator(`#visit-day-${data.date}`);assert.equal(await todayButton.getAttribute('aria-pressed'),'true');if(Number(data.date.slice(-2))>1){await todayButton.focus();await page.keyboard.press('ArrowLeft');await page.getByText('No check-ins this day',{exact:true}).waitFor();await page.keyboard.press('ArrowRight');await page.locator('.member-attendance-visit').nth(1).waitFor();}assert.equal(await todayButton.getAttribute('aria-pressed'),'true');await page.locator('.member-attendance-visit').filter({hasText:'Ten court visits'}).getByText(socialVisit.checkIn.time,{exact:true}).waitFor();assert.equal(await page.getByText('People present',{exact:true}).count(),0);assert.equal(await page.locator('.attendance-calendar,.attendance-agenda,.attendance-list-panel').count(),0);assert.equal(await page.getByRole('button',{name:'Check in student',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Filters',exact:true}).count(),0);
    for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(temp,`member-history-${width}.png`),fullPage:true});}
    await page.getByRole('button',{name:'Previous month',exact:true}).click();await page.getByText('No check-ins this month',{exact:true}).waitFor();await page.getByRole('button',{name:'Next month',exact:true}).click();await page.getByText('2 check-ins',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Next month',exact:true}).isDisabled(),true);
    await page.route('**/api/attendance?*',route=>route.fulfill({status:503,json:{message:'Internal fixture failure'}}));await page.getByRole('button',{name:'Refresh check-in history',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('.member-attendance-visit').count(),2);assert.doesNotMatch(await page.locator('main').innerText(),/Footwork foundations|Private course/);await page.unroute('**/api/attendance?*');await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('alert').waitFor({state:'hidden'});
    assert.equal(JSON.stringify({enrollments:await db.badmintonEnrollment.findMany(),visits:await db.badmintonCheckIn.findMany(),attendance:await db.bookingAttendance.findMany()}),snapshot);
    await c.close();const other=await browser.newContext();await other.addInitScript(token=>localStorage.setItem('zawana_access_token',token),data.secondaryMember.token);const otherPage=await other.newPage();await otherPage.goto(ui+'/attendance');await otherPage.getByText('No check-ins this month',{exact:true}).waitFor();assert.equal(await otherPage.locator('.member-attendance-visit').count(),0);await other.close();
    const staff=await browser.newContext();await staff.addInitScript(token=>localStorage.setItem('zawana_access_token',token),data.tokens.find(row=>row.role==='admin').token);const staffPage=await staff.newPage();await staffPage.goto(ui+'/admin/attendance');await staffPage.getByRole('group',{name:'Attendance view',exact:true}).waitFor();await staffPage.getByRole('region',{name:'Attendance calendar',exact:true}).waitFor();assert.equal(await staffPage.getByText('People present',{exact:true}).count(),0);await staff.close();assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['personal check-in calendar with keyboard date selection','no member management UI','month navigation and empty state','refresh failure retains visits and retries','other member isolation','staff calendar access preserved','1440/768/390/320 layouts','no balance or record writes'],artifacts:temp}));
  }finally{await db.$disconnect();}
}finally{await browser?.close();children.forEach(child=>child.kill());}
