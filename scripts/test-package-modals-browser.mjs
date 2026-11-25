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
    const bcrypt=createRequire(new URL('../backend/package.json',import.meta.url))('bcryptjs'),admin=await db.user.findFirstOrThrow({where:{role:'admin'}});await db.user.update({where:{id:admin.id},data:{passwordHash:await bcrypt.hash('package-form-test-password',4)}});
    const category=await db.badmintonPackageCategory.findUniqueOrThrow({where:{code:'FOUNDATION'}});
    await page.goto(`${ui}/admin/badminton-packages`);await page.getByRole('button',{name:'New package',exact:true}).click();const create=page.getByRole('dialog',{name:'Create badminton package',exact:true});await create.waitFor();assert.equal(await create.getByRole('button',{name:'Create package',exact:true}).isDisabled(),true);await create.getByLabel('Package title',{exact:true}).fill('Club package');await create.getByRole('combobox',{name:'Badminton category',exact:true}).selectOption(category.id);await create.getByLabel('Price MMK',{exact:true}).fill('40000');await create.getByLabel('Sessions',{exact:true}).fill('6');await create.getByLabel('Validity days',{exact:true}).fill('30');await create.getByRole('checkbox',{name:'Mon',exact:true}).check();
    await create.getByLabel('Description',{exact:true}).fill('Focused training sessions');await create.locator('summary').filter({hasText:'Schedule & court rules'}).click();await create.getByLabel('Available from',{exact:true}).fill('09:00');await create.getByLabel('Available until',{exact:true}).fill('11:00');await create.getByLabel('Schedule notes',{exact:true}).fill('Morning classes');await create.getByLabel('Court rules',{exact:true}).fill('Indoor shoes');
    const verification=page.getByRole('dialog',{name:'Confirm package changes',exact:true});
    await page.route('**/api/packages/badminton',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{message:'Package save temporarily unavailable'}}):route.continue());await create.getByRole('button',{name:'Create package',exact:true}).click();await verification.getByLabel('Current password').fill('package-form-test-password');await verification.getByRole('button',{name:'Verify and save',exact:true}).click();await create.getByRole('alert').filter({hasText:'Package save temporarily unavailable'}).waitFor();assert.equal(await create.getByLabel('Package title',{exact:true}).inputValue(),'Club package');await page.unroute('**/api/packages/badminton');
    await create.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await verification.getByLabel('Current password').fill('package-form-test-password');await verification.getByRole('button',{name:'Verify and save',exact:true}).click();await create.waitFor({state:'hidden'});await page.getByRole('heading',{name:'Club package',exact:true}).waitFor();assert.equal(await db.badmintonPackage.count({where:{title:'Club package'}}),1);let pkg=await db.badmintonPackage.findFirstOrThrow({where:{title:'Club package'}});assert.equal(pkg.price,40000);assert.equal(pkg.sessions,6);assert.equal(pkg.validity,30);assert.deepEqual(pkg.availableDays,['Mon']);assert.equal(pkg.availableFrom,'09:00');assert.equal(pkg.scheduleNotes,'Morning classes');assert.equal(pkg.courtRules,'Indoor shoes');
    await page.getByRole('button',{name:'Edit Club package',exact:true}).click();const edit=page.getByRole('dialog',{name:'Edit badminton package',exact:true});await edit.getByLabel('Package title',{exact:true}).waitFor();assert.equal(await edit.getByLabel('Price MMK',{exact:true}).inputValue(),'40000');assert.equal(await edit.getByRole('checkbox',{name:'Mon',exact:true}).isChecked(),true);await edit.getByLabel('Sessions',{exact:true}).fill('0');assert.equal(await edit.getByRole('button',{name:'Save changes',exact:true}).isDisabled(),true);await edit.getByLabel('Sessions',{exact:true}).fill('8');await edit.getByLabel('Validity days',{exact:true}).fill('45');await edit.getByLabel('Price MMK',{exact:true}).fill('50000');
    for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await edit.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);await page.screenshot({path:join(artifacts,`edit-package-${width}.png`)});}
    await edit.getByRole('button',{name:'Save changes',exact:true}).click();await verification.getByLabel('Current password').fill('package-form-test-password');await verification.getByRole('button',{name:'Verify and save',exact:true}).click();await edit.waitFor({state:'hidden'});pkg=await db.badmintonPackage.findUniqueOrThrow({where:{id:pkg.id}});assert.equal(pkg.price,50000);assert.equal(pkg.sessions,8);assert.equal(pkg.validity,45);assert.equal(pkg.description,'Focused training sessions');assert.equal(pkg.availableFrom,'09:00');assert.equal(await db.badmintonEnrollment.count({where:{packageId:pkg.id}}),0);
    for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'New package',exact:true}).click();await create.waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(artifacts,`new-package-${width}.png`)});await create.getByRole('button',{name:'Cancel',exact:true}).click();await create.waitFor({state:'hidden'});}
    assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['shared New/Edit package forms with essential fields','required values and positive whole-number validation','inline save failure preserves input','verified creation, duplicate-submit guard and verified edit','optional description, schedule and court rules retained','1440/768/390/320 modal layouts','no enrollment or financial changes'],artifacts}));
  }finally{await db.$disconnect();}
}finally{await browser?.close();children.forEach(child=>child.kill());}
