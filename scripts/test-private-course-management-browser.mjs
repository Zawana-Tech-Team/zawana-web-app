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
  const uploads=[];
  try {
    const originalBookings=await db.booking.findMany({orderBy:{id:'asc'}});
    const course=await db.privateCourse.findUniqueOrThrow({where:{id:data.courseId}});
    const requests=[];
    for(let index=0;index<12;index++){
      const day=new Date(`${data.date}T12:00:00Z`);day.setUTCDate(day.getUTCDate()+index+10);
      requests.push(await db.booking.create({data:{code:`COURSE-REQUEST-${String(index).padStart(2,'0')}`,userId:data.memberId,kind:'private_course',title:course.title,coachId:data.coachId,courtId:data.courts[4].id,date:day.toISOString().slice(0,10),time:'4:00 PM — 5:00 PM',location:data.courts[4].name,price:course.price,status:'CANCELLED',paymentStatus:'pending',meta:JSON.stringify({courseId:course.id})}}));
    }
    const bookingsBefore=await db.booking.findMany({orderBy:{id:'asc'}});
    await page.route('**/api/private-courses',route=>route.fulfill({status:503,json:{message:'Catalog unavailable'}}));
    await page.goto(`${ui}/admin/private-courses`);await page.getByRole('button',{name:'Retry courses',exact:true}).waitFor();await page.unroute('**/api/private-courses');await page.getByRole('button',{name:'Retry courses',exact:true}).click();await page.getByRole('article',{name:`Course ${course.title}`,exact:true}).waitFor();
    await page.getByRole('button',{name:'New course',exact:true}).click();
    let editor=page.getByRole('dialog',{name:'Create private course',exact:true});
    assert.equal(await editor.getByRole('button',{name:'Create course',exact:true}).isDisabled(),true);
    await editor.getByLabel('Course name',{exact:true}).fill('Premium Private Coaching');
    await editor.getByLabel('Description',{exact:true}).fill('Personal coaching focused on confident footwork and court technique.');
    await editor.getByLabel('Price · MMK',{exact:true}).fill('75000');
    assert.equal(await editor.getByRole('button',{name:'Create course',exact:true}).isDisabled(),true);
    await editor.getByRole('button',{name:'Coach Lin',exact:false}).click();
    await editor.locator('input[type=file]').setInputFiles(join(root,'public/facilities/responsive/court-640.webp'));
    await editor.getByRole('button',{name:'Remove course image',exact:true}).waitFor();
    await page.route('**/api/private-courses',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{message:'Course save unavailable'}}):route.continue());
    await editor.getByRole('button',{name:'Create course',exact:true}).click();await editor.getByRole('alert').filter({hasText:'Course save unavailable'}).waitFor();assert.equal(await editor.getByLabel('Course name',{exact:true}).inputValue(),'Premium Private Coaching');await page.unroute('**/api/private-courses');
    await page.route('**/api/private-courses/*/image',route=>route.fulfill({status:503,json:{message:'Image temporarily unavailable'}}));
    await editor.getByRole('button',{name:'Create course',exact:true}).click();
    editor=page.getByRole('dialog',{name:'Edit private course',exact:true});await editor.getByRole('alert').filter({hasText:'Image temporarily unavailable'}).waitFor();
    assert.equal(await db.privateCourse.count({where:{title:'Premium Private Coaching'}}),1,'A failed image upload must retain the saved course ID');
    await page.unroute('**/api/private-courses/*/image');
    await editor.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await editor.waitFor({state:'hidden'});
    assert.equal(await db.privateCourse.count({where:{title:'Premium Private Coaching'}}),1);
    let created=await db.privateCourse.findFirstOrThrow({where:{title:'Premium Private Coaching'},include:{coaches:true}});
    assert.equal(created.price,75000);assert.deepEqual(created.coaches.map(coach=>coach.id),[data.coachId]);assert.ok(created.imageUrl.includes('/uploads/courses/'));uploads.push(join(root,'backend/uploads/courses',new URL(created.imageUrl,api).pathname.split('/').at(-1)));
    const card=page.getByRole('article',{name:'Course Premium Private Coaching',exact:true});await card.waitFor();assert.equal(await card.locator('img').first().evaluate(image=>image.complete&&image.naturalWidth>0),true);
    let imagePosts=0;await page.route(`**/api/private-courses/${created.id}/image`,route=>{imagePosts++;return route.continue();});
    await card.getByRole('button',{name:'Edit course Premium Private Coaching',exact:true}).click();
    await editor.getByLabel('Duration · minutes',{exact:true}).fill('90');await editor.getByLabel('Price · MMK',{exact:true}).fill('80000');await editor.getByRole('button',{name:'Save changes',exact:true}).click();await editor.waitFor({state:'hidden'});
    const updated=await db.privateCourse.findUniqueOrThrow({where:{id:created.id}});assert.equal(updated.duration,90);assert.equal(updated.price,80000);assert.equal(updated.imageUrl,created.imageUrl);assert.equal(imagePosts,0,'An unchanged image URL must not be reuploaded as base64');
    await page.unroute(`**/api/private-courses/${created.id}/image`);
    await card.getByRole('button',{name:'Deactivate',exact:true}).click();await card.getByRole('button',{name:'Activate',exact:true}).waitFor();assert.equal((await db.privateCourse.findUniqueOrThrow({where:{id:created.id}})).status,'inactive');await card.getByRole('button',{name:'Activate',exact:true}).click();await card.getByRole('button',{name:'Deactivate',exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Search courses',exact:true}).fill('Premium Private');assert.equal(await page.locator('.private-course-catalog-grid>article').count(),1);await page.getByRole('textbox',{name:'Search courses',exact:true}).fill('');
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Catalog overflow at ${width}`);await page.screenshot({path:join(artifacts,`private-course-catalog-${width}.png`),fullPage:true});
      await card.getByRole('button',{name:'Edit course Premium Private Coaching',exact:true}).click();await editor.waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Editor overflow at ${width}`);await editor.getByLabel('Description',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(artifacts,`private-course-editor-${width}.png`)});assert.ok(await editor.getByRole('button',{name:'Save changes',exact:true}).isVisible());await editor.getByRole('button',{name:'Cancel',exact:true}).click();
    }
    await card.getByRole('button',{name:'Edit course Premium Private Coaching',exact:true}).click();await editor.getByRole('button',{name:'Remove course image',exact:true}).click();await editor.getByRole('button',{name:'Save changes',exact:true}).click();await editor.waitFor({state:'hidden'});assert.equal((await db.privateCourse.findUniqueOrThrow({where:{id:created.id}})).imageUrl,null);
    await card.getByRole('button',{name:'Remove course Premium Private Coaching',exact:true}).click();let remove=page.getByRole('dialog',{name:'Remove private course?',exact:true});await remove.getByRole('button',{name:'Cancel',exact:true}).click();assert.ok(await db.privateCourse.findUnique({where:{id:created.id}}));await card.getByRole('button',{name:'Remove course Premium Private Coaching',exact:true}).click();await remove.getByRole('button',{name:'Remove course',exact:true}).click();await remove.waitFor({state:'hidden'});assert.equal(await db.privateCourse.findUnique({where:{id:created.id}}),null);
    assert.deepEqual(await db.booking.findMany({orderBy:{id:'asc'}}),bookingsBefore,'Catalog edits must preserve booking snapshots');
    await page.route('**/api/bookings?*',route=>route.fulfill({status:503,json:{message:'Requests unavailable'}}));
    await page.getByRole('button',{name:'Booking requests',exact:true}).click();await page.getByRole('button',{name:'Retry requests',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'No booking requests yet',exact:true}).count(),0);await page.unroute('**/api/bookings?*');await page.getByRole('button',{name:'Retry requests',exact:true}).click();
    const pager=page.getByRole('navigation',{name:'Private course request pagination',exact:true});await pager.getByText('1–10 of 12 requests',{exact:true}).waitFor();assert.equal(await page.locator('.private-course-request-list>article').count(),10);await pager.getByRole('button',{name:'Next',exact:true}).click();await pager.getByText('11–12 of 12 requests',{exact:true}).waitFor();assert.equal(await page.locator('.private-course-request-list>article').count(),2);
    await page.getByRole('textbox',{name:'Search course requests',exact:true}).fill(requests[0].code);await pager.getByText('1–1 of 1 requests',{exact:true}).waitFor();
    await page.route('**/api/bookings?kind=private_course&booking=*',route=>route.fulfill({status:503,json:{message:'Booking detail unavailable'}}));
    await page.getByRole('button',{name:`View booking ${requests[0].code}`,exact:true}).click();await page.getByRole('button',{name:'Retry details',exact:true}).waitFor();await page.unroute('**/api/bookings?kind=private_course&booking=*');await page.getByRole('button',{name:'Retry details',exact:true}).click();const details=page.getByRole('dialog',{name:'Private course booking details',exact:true});await details.getByText(requests[0].code,{exact:true}).waitFor();assert.ok(await details.getByRole('link',{name:'member@example.test',exact:true}).isVisible());assert.ok(await details.getByRole('link',{name:'Open booking',exact:true}).getAttribute('href').then(href=>href.includes(`history=1&kind=private_course&booking=${requests[0].id}`)));await details.getByRole('button',{name:'Close',exact:true}).click();
    await db.booking.update({where:{id:requests[0].id},data:{status:'CONFIRMED',paymentStatus:'paid'}});await page.evaluate(()=>window.dispatchEvent(new Event('zawana-bookings-changed')));await page.getByRole('article',{name:`Booking ${requests[0].code}`,exact:true}).getByText('Confirmed',{exact:true}).waitFor();
    await page.getByRole('combobox',{name:'Booking status',exact:true}).click();await page.getByRole('option',{name:'Cancelled',exact:true}).click();await page.getByRole('heading',{name:'No matching requests',exact:true}).waitFor();await page.getByRole('button',{name:'Clear filters',exact:true}).click();await pager.getByText('1–10 of 12 requests',{exact:true}).waitFor();
    await page.getByRole('combobox',{name:'Coach',exact:true}).click();await page.getByRole('option',{name:'Other Coach',exact:true}).click();await page.getByRole('heading',{name:'No matching requests',exact:true}).waitFor();await page.getByRole('button',{name:'Clear filters',exact:true}).click();await pager.waitFor();
    await page.getByText('Date range',{exact:true}).click();await page.getByLabel('From date',{exact:true}).fill(requests[0].date);await page.getByLabel('To date',{exact:true}).fill(requests[0].date);await pager.getByText('1–1 of 1 requests',{exact:true}).waitFor();await page.getByRole('button',{name:'Clear filters',exact:true}).click();await pager.getByText('1–10 of 12 requests',{exact:true}).waitFor();
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Requests overflow at ${width}`);await page.screenshot({path:join(artifacts,`private-course-requests-${width}.png`),fullPage:true});
      await page.locator('.private-course-request-list>article').first().getByRole('button').click();await details.locator('.private-course-detail-facts').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Details overflow at ${width}`);await page.screenshot({path:join(artifacts,`private-course-details-${width}.png`)});await details.getByRole('button',{name:'Close',exact:true}).click();
    }
    await page.setViewportSize({width:1440,height:900});await page.locator('.private-course-request-list>article').first().getByRole('button').click();await details.getByRole('link',{name:'Open booking',exact:true}).click();await page.waitForURL('**/admin/court-rentals?history=1&kind=private_course&booking=*');await page.getByRole('region',{name:'Booking history records',exact:true}).getByRole('button',{name:'View Details',exact:true}).click();const historyDetail=page.getByRole('dialog',{name:'Booking history details',exact:true});await historyDetail.getByText(requests[11].code,{exact:true}).waitFor();await historyDetail.getByRole('button',{name:'Close',exact:true}).click();await page.goto(`${ui}/admin/private-courses`);await page.getByRole('article',{name:`Course ${course.title}`,exact:true}).waitFor();
    // A course with bookings follows the existing archive behavior instead of deleting history.
    await page.getByRole('button',{name:'Course catalog',exact:true}).click();const originalCard=page.getByRole('article',{name:`Course ${course.title}`,exact:true});await originalCard.getByRole('button',{name:`Remove course ${course.title}`,exact:true}).click();await remove.getByRole('button',{name:'Remove course',exact:true}).click();await remove.waitFor({state:'hidden'});assert.equal((await db.privateCourse.findUniqueOrThrow({where:{id:course.id}})).status,'inactive');
    for(const original of originalBookings)assert.deepEqual(await db.booking.findUnique({where:{id:original.id}}),original);
    assert.equal(await db.booking.count({where:{kind:'private_course'}}),12);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,checks:['catalog create/edit/status/removal and required fields','image upload/preservation/removal; failed upload retry retains course ID','duplicate-submit protection and inline failure recovery','existing booking snapshots and archive behavior preserved','request search/status/coach/date filters and pagination','live status refresh and booking details/link','1440/768/390/320 catalog, editor, requests and details layouts'],artifacts}));
  }catch(error){await page.screenshot({path:join(artifacts,'private-course-management-failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await db.$disconnect();for(const file of uploads)if(existsSync(file))unlinkSync(file);}
}finally{await browser?.close();children.forEach(child=>child.kill());}
