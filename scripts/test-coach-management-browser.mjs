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
  try{
    const account=await db.user.create({data:{name:'Available coach account',email:'new-coach@profiles.test',phone:'099999999',role:'coach'}});
    for(let i=0;i<11;i++){const user=await db.user.create({data:{name:`Roster coach ${i}`,email:`roster${i}@profiles.test`,role:'coach'}});await db.coach.create({data:{userId:user.id,name:user.name,email:user.email,phone:'',specialty:'Badminton',department:'Badminton',status:i%2?'inactive':'active'}});}
    const originalBookings=await db.booking.findMany({orderBy:{id:'asc'}}),originalCourses=await db.privateCourse.findMany({orderBy:{id:'asc'}});
    await page.route('**/api/coaches',route=>route.fulfill({status:503,json:{message:'Coach roster unavailable'}}));await page.goto(`${ui}/admin/coaches`);await page.getByRole('button',{name:'Retry coaches',exact:true}).click();await page.unroute('**/api/coaches');await page.getByRole('button',{name:'Retry coaches',exact:true}).click();const pager=page.getByRole('navigation',{name:'Coach management pagination',exact:true});await pager.getByText('1–12 of 13 coaches',{exact:true}).waitFor();assert.equal(await page.locator('.coach-grid article').count(),12);await pager.getByRole('button',{name:'Next',exact:true}).click();await pager.getByText('13–13 of 13 coaches',{exact:true}).waitFor();assert.equal(await page.locator('.coach-grid article').count(),1);assert.equal(await page.getByText('Available for private courses',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Add coach',exact:true}).click();const create=page.getByRole('dialog',{name:'Create coach',exact:true});await create.getByLabel('Coach login account',{exact:true}).selectOption(account.email);assert.equal(await create.getByLabel('Name',{exact:true}).inputValue(),account.name);await create.getByLabel('Name',{exact:true}).fill('Premium coach');await create.locator('input[type=file]').setInputFiles(join(root,'public/facilities/responsive/court-640.webp'));await create.getByRole('button',{name:'Remove image',exact:true}).waitFor();
    await page.route('**/api/coaches',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{message:'Coach save unavailable'}}):route.continue());await create.getByRole('button',{name:'Create coach',exact:true}).click();await create.getByRole('alert').filter({hasText:'Coach save unavailable'}).waitFor();assert.equal(await create.getByLabel('Name',{exact:true}).inputValue(),'Premium coach');await page.unroute('**/api/coaches');await create.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await create.waitFor({state:'hidden'});assert.equal(await db.coach.count({where:{userId:account.id}}),1);let coach=await db.coach.findUniqueOrThrow({where:{userId:account.id}});assert.ok(coach.imageUrl);uploads.push(join(root,'backend/uploads/media',new URL(coach.imageUrl,api).pathname.split('/').at(-1)));
    await page.getByRole('textbox',{name:'Search coaches',exact:true}).fill('Premium coach');const card=page.getByRole('article',{name:'Coach Premium coach',exact:true});await card.waitFor();await card.getByRole('button',{name:'Edit coach Premium coach',exact:true}).click();const edit=page.getByRole('dialog',{name:'Edit coach',exact:true});await edit.getByLabel('Phone Optional',{exact:true}).fill('091111111');await edit.getByLabel('Status',{exact:true}).selectOption('inactive');let changes;await page.route(`**/api/coaches/${coach.id}`,route=>{changes=route.request().postDataJSON();return route.continue();});await edit.getByRole('button',{name:'Save changes',exact:true}).click();await edit.waitFor({state:'hidden'});await page.unroute(`**/api/coaches/${coach.id}`);assert.equal(changes.email,undefined);coach=await db.coach.findUniqueOrThrow({where:{id:coach.id}});assert.equal(coach.status,'inactive');assert.equal(coach.phone,'091111111');assert.ok(coach.imageUrl);
    await page.getByRole('combobox',{name:'Coach status',exact:true}).selectOption('active');await page.getByRole('heading',{name:'No matching coaches',exact:true}).waitFor();await page.getByRole('button',{name:'Clear filters',exact:true}).click();await pager.getByText('1–12 of 14 coaches',{exact:true}).waitFor();
    for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(artifacts,`coach-management-${width}.png`),fullPage:true});await page.getByRole('button',{name:'Add coach',exact:true}).click();await create.waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(artifacts,`create-coach-${width}.png`)});await create.getByRole('button',{name:'Cancel',exact:true}).click();}
    await page.getByRole('textbox',{name:'Search coaches',exact:true}).fill('Premium coach');await card.getByRole('button',{name:'Edit coach Premium coach',exact:true}).click();await edit.getByRole('button',{name:'Remove image',exact:true}).click();await edit.getByRole('button',{name:'Save changes',exact:true}).click();await edit.waitFor({state:'hidden'});assert.equal((await db.coach.findUniqueOrThrow({where:{id:coach.id}})).imageUrl,null);
    await card.getByRole('button',{name:'Delete coach Premium coach',exact:true}).click();let confirm=page.getByRole('dialog',{name:'Delete coach profile?',exact:true});await confirm.getByRole('button',{name:'Cancel',exact:true}).click();assert.ok(await db.coach.findUnique({where:{id:coach.id}}));await card.getByRole('button',{name:'Delete coach Premium coach',exact:true}).click();await confirm.getByRole('button',{name:'Delete coach',exact:true}).click();await confirm.waitFor({state:'hidden'});assert.equal(await db.coach.findUnique({where:{id:coach.id}}),null);assert.ok(await db.user.findUnique({where:{id:account.id}}));assert.deepEqual(await db.booking.findMany({orderBy:{id:'asc'}}),originalBookings);assert.deepEqual(await db.privateCourse.findMany({orderBy:{id:'asc'}}),originalCourses);assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['coach roster loading, retry, search/status and pagination','active account linking, profile creation and duplicate-submit guard','inline save failure retains input','edit contact/status and image preservation/removal','confirmed deletion and retained user account','existing bookings/courses unchanged','1440/768/390/320 layouts'],artifacts}));
  }catch(error){await page.screenshot({path:join(artifacts,'coach-management-failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await db.$disconnect();for(const file of uploads)if(existsSync(file))unlinkSync(file);}
}finally{await browser?.close();children.forEach(child=>child.kill());}
