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
  const uploadedFiles=[];
  const headers={Authorization:`Bearer ${data.token}`};
  const account=name=>page.getByRole('article',{name:`Account ${name}`,exact:true});
  const pager=page.getByRole('navigation',{name:'User management pagination'});
  const query=async text=>{const response=page.waitForResponse(response=>response.url().includes('/api/users?')&&new URL(response.url()).searchParams.get('search')===text);await page.getByRole('searchbox',{name:'Search users'}).fill(text);await page.getByRole('searchbox',{name:'Search users'}).press('Enter');await response;await page.getByRole('status').filter({hasText:'Loading accounts'}).waitFor({state:'hidden'});};
  const dialog=name=>page.getByRole('dialog',{name,exact:true});
  const submit=async(name='Create account')=>{await dialog(name).getByRole('button',{name:name==='Create account'?'Create account':'Save changes',exact:true}).click();await dialog(name).waitFor({state:'hidden'});};
  const fillCreate=async(name,email)=>{await page.getByRole('button',{name:'Create account',exact:true}).click();const form=dialog('Create account');await form.getByRole('textbox',{name:'Name',exact:true}).fill(name);await form.getByRole('textbox',{name:'Email',exact:true}).fill(email);await form.getByLabel('Temporary password',{exact:true}).fill('Secure-password-123!');return form;};
  try{
    const tied=new Date('2020-02-02T00:00:00Z');
    for(let i=0;i<20;i++)await db.user.create({data:{id:`user-paging-${String(i).padStart(2,'0')}`,name:`User Page ${String(i).padStart(2,'0')}`,email:`page-${i}@example.test`,role:'member',active:i%4!==0,createdAt:tied,phone:'09123456789'}});
    for(let i=0;i<12;i++)await db.booking.create({data:{code:`USER-ACTIVITY-${i}`,userId:data.memberId,kind:'court',title:`Historic rental ${i}`,courtId:data.courts[0].id,date:'2020-02-03',time:'9:00 AM — 10:00 AM',location:'Zawana',status:'CANCELLED',paymentStatus:'paid',price:20000,createdAt:tied}});
    await db.transaction.create({data:{id:'USER-RECENT-PAYMENT',userId:data.memberId,date:'2026-11-24',customer:'Alex Tan',business:'Badminton',item:'Most recent member payment',amount:20000,discount:0,tax:0,finalAmount:20000,status:'paid',paymentMethod:'Cash',staff:'QA'}});
    const ledger=await db.transaction.findMany({orderBy:{id:'asc'}}),bookings=await db.booking.findMany({where:{userId:data.memberId},orderBy:{id:'asc'}});
    await page.route('**/api/users?*',route=>route.fulfill({status:503,json:{message:'Accounts temporarily unavailable'}}));
    await page.goto(`${ui}/admin/users`);await page.getByRole('alert').filter({hasText:'Accounts temporarily unavailable'}).waitFor();assert.equal(await pager.count(),0);await page.unroute('**/api/users?*');await page.getByRole('button',{name:'Retry',exact:true}).click();await pager.getByText('1–10 of 25 accounts',{exact:true}).waitFor();assert.equal(await page.locator('.users-row').count(),10);
    const names=[];
    for(let p=1;p<=3;p++){
      if(p>1){await pager.getByRole('button',{name:'Next',exact:true}).click();await pager.getByRole('status').filter({hasText:`Page ${p} of 3`}).waitFor();}
      names.push(...await page.locator('.users-row').evaluateAll(rows=>rows.map(row=>row.getAttribute('aria-label'))));
    }
    assert.equal(names.length,25);assert.equal(new Set(names).size,25);assert.equal(await pager.getByRole('button',{name:'Next',exact:true}).isDisabled(),true);
    const first=await (await context.request.get(`${api}/users?page=1&limit=100`,{headers})).json();const order=first.data.filter(row=>row.id.startsWith('user-paging-')).map(row=>row.id);assert.deepEqual(order,[...order].sort().reverse());
    await page.getByRole('combobox',{name:'Account role',exact:true}).selectOption('coach');await account('Coach Lin').waitFor();assert.equal(await page.locator('.users-row').count(),2);await pager.getByText('1–2 of 2 accounts',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();await pager.getByText('1–10 of 25 accounts',{exact:true}).waitFor();await query('User Page 00');await account('User Page 00').waitFor();assert.equal(await page.locator('.users-row').count(),1);
    const more=account('User Page 00').getByRole('button',{name:'More actions for User Page 00'});await more.click();await page.getByRole('menu',{name:'Actions for User Page 00'}).waitFor();await page.keyboard.press('Escape');assert.equal(await more.evaluate(node=>node===document.activeElement),true);
    await more.click();await page.getByRole('menuitem',{name:'Activate account',exact:true}).click();await account('User Page 00').getByText('Active',{exact:true}).waitFor();assert.equal((await db.user.findUniqueOrThrow({where:{id:'user-paging-00'}})).active,true);
    await more.click();await page.getByRole('menuitem',{name:'Deactivate account',exact:true}).click();await account('User Page 00').getByText('Inactive',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();await pager.getByText('1–10 of 25 accounts',{exact:true}).waitFor();

    // Validation, inline failures, busy guards and save/refresh separation use real account mutations.
    let form=await fillCreate('New Premium Member','premium-member@example.test');await form.getByLabel('Temporary password',{exact:true}).fill('short');assert.equal(await form.getByRole('button',{name:'Create account',exact:true}).isDisabled(),true);await form.getByLabel('Temporary password',{exact:true}).fill('Secure-password-123!');await form.getByRole('button',{name:'Show password',exact:true}).click();assert.equal(await form.getByLabel('Temporary password',{exact:true}).getAttribute('type'),'text');
    await page.route('**/api/users',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{message:'Account creation temporarily unavailable'}}):route.continue());await form.getByRole('button',{name:'Create account',exact:true}).click();await form.getByRole('alert').filter({hasText:'Account creation temporarily unavailable'}).waitFor();assert.equal(await form.getByRole('textbox',{name:'Name',exact:true}).inputValue(),'New Premium Member');await page.unroute('**/api/users');
    let createCalls=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/users'&&request.method()==='POST')createCalls++;});
    let releaseSave;const saveGate=new Promise(resolve=>{releaseSave=resolve;});await page.route('**/api/users',async route=>{if(route.request().method()==='POST'){await saveGate;await route.continue();}else await route.continue();});
    await page.route('**/api/users?*',route=>route.fulfill({status:503,json:{message:'Read unavailable after save'}}));
    await form.getByRole('button',{name:'Create account',exact:true}).click();await form.getByRole('button',{name:'Close account form',exact:true}).waitFor();assert.equal(await form.getByRole('button',{name:'Close account form'}).isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await form.count(),1);await form.locator('form').evaluate(node=>{node.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});releaseSave();await form.waitFor({state:'hidden'});await page.getByRole('alert').filter({hasText:'account was saved, but the list could not refresh'}).waitFor();assert.equal(createCalls,1);assert.equal(await db.user.count({where:{email:'premium-member@example.test'}}),1);
    await page.unroute('**/api/users');await page.unroute('**/api/users?*');await page.getByRole('button',{name:'Retry',exact:true}).click();await account('New Premium Member').waitFor();assert.equal(createCalls,1);const created=await db.user.findUniqueOrThrow({where:{email:'premium-member@example.test'}});
    await account(created.name).getByRole('button',{name:`Edit account ${created.name}`,exact:true}).click();form=dialog('Edit account');assert.equal(await form.getByRole('textbox',{name:'Email',exact:true}).isDisabled(),true);await form.getByRole('textbox',{name:'Name',exact:true}).fill('Updated Premium Member');await form.getByRole('textbox',{name:/Phone/}).fill('09999999999');let patchBody;await page.route(`**/api/users/${created.id}`,route=>{patchBody=route.request().postDataJSON();return route.continue();});await submit('Edit account');await account('Updated Premium Member').waitFor();assert.equal(patchBody.active,undefined);assert.equal(patchBody.password,undefined);assert.equal(patchBody.email,undefined);await page.unroute(`**/api/users/${created.id}`);let saved=await db.user.findUniqueOrThrow({where:{id:created.id}});assert.equal(saved.passwordHash,created.passwordHash);assert.equal(saved.phone,'09999999999');
    await account(saved.name).getByRole('button',{name:`Edit account ${saved.name}`,exact:true}).click();form=dialog('Edit account');await form.getByRole('button',{name:'Set a new password',exact:true}).click();await form.getByLabel('New password (optional)',{exact:true}).fill('Replacement-password-456!');await submit('Edit account');saved=await db.user.findUniqueOrThrow({where:{id:created.id}});assert.notEqual(saved.passwordHash,created.passwordHash);

    // Changing an existing member into a coach preserves the linked profile and photo controls.
    await account(saved.name).getByRole('button',{name:`Edit account ${saved.name}`,exact:true}).click();form=dialog('Edit account');await form.getByRole('combobox',{name:'Role',exact:true}).click();await page.getByRole('listbox',{name:'Role',exact:true}).getByRole('option',{name:'Coach',exact:true}).click();await form.getByRole('combobox',{name:'Coach department',exact:true}).click();await page.getByRole('listbox',{name:'Coach department',exact:true}).getByRole('option',{name:'Gym',exact:true}).click();await form.locator('summary').filter({hasText:'Coach profile image'}).click();await form.locator('input[type=file]').setInputFiles(join(root,'public/facilities/responsive/court-640.webp'));await form.getByRole('button',{name:'Remove image',exact:true}).waitFor();await submit('Edit account');await account(saved.name).locator('.users-role').filter({hasText:'Coach'}).waitFor();let profile=await db.coach.findUniqueOrThrow({where:{userId:created.id}});assert.equal(profile.department,'Gym');assert.match(profile.imageUrl,/uploads\/media\//);uploadedFiles.push(join(root,'backend/uploads/media',new URL(profile.imageUrl,api).pathname.split('/').at(-1)));
    await account(saved.name).getByRole('button',{name:`Edit account ${saved.name}`,exact:true}).click();form=dialog('Edit account');await form.locator('summary').filter({hasText:'Coach profile image'}).click();await form.getByRole('button',{name:'Remove image',exact:true}).click();await submit('Edit account');profile=await db.coach.findUniqueOrThrow({where:{userId:created.id}});assert.equal(profile.imageUrl,null);

    await query('Alex Tan');await account('Alex Tan').waitFor();await page.route(`**/api/users/${data.memberId}/activity`,route=>route.fulfill({status:503,json:{message:'Activity unavailable'}}));await account('Alex Tan').getByRole('button',{name:'View account Alex Tan'}).click();await dialog('Account details').getByRole('alert').filter({hasText:'Activity unavailable'}).waitFor();await page.unroute(`**/api/users/${data.memberId}/activity`);await dialog('Account details').getByRole('button',{name:'Retry activity'}).click();await dialog('Account details').getByRole('heading',{name:'Most recent member payment',exact:true}).waitFor();assert.equal(await dialog('Account details').locator('.users-activity li').count(),10);await dialog('Account details').getByRole('button',{name:'Show more activity'}).click();assert.equal(await dialog('Account details').locator('.users-activity li').count(),15);
    for(const width of [1440,1024,900,768,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const bounds=await dialog('Account details').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);await page.screenshot({path:join(artifacts,`user-details-${width}.png`),fullPage:true});}
    await dialog('Account details').getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Clear filters',exact:true}).click();await account('Updated Premium Member').waitFor();
    for(const width of [1440,1024,900,768,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(artifacts,`user-management-${width}.png`),fullPage:true});await page.getByRole('button',{name:'Create account',exact:true}).click();await dialog('Create account').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(artifacts,`user-create-${width}.png`),fullPage:true});await page.keyboard.press('Escape');await dialog('Create account').waitFor({state:'hidden'});}
    await page.setViewportSize({width:1440,height:1000});await query('Desk Preview');await account('Desk Preview').getByRole('button',{name:'More actions for Desk Preview'}).click();assert.equal(await page.getByRole('menuitem',{name:'Delete account',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('menuitem',{name:'Deactivate account',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');

    await query('Alex Tan');await account('Alex Tan').getByRole('button',{name:'More actions for Alex Tan'}).click();await page.getByRole('menuitem',{name:'Delete account',exact:true}).click();form=dialog('Delete account?');assert.equal(await form.getByRole('button',{name:'Delete account',exact:true}).isDisabled(),true);await form.getByRole('textbox',{name:'Type the full name to confirm'}).fill('wrong');assert.equal(await form.getByRole('button',{name:'Delete account',exact:true}).isDisabled(),true);await form.getByRole('textbox',{name:'Type the full name to confirm'}).fill('Alex Tan');await form.getByRole('button',{name:'Delete account',exact:true}).click();await form.waitFor({state:'hidden'});await page.getByText('No users found',{exact:true}).waitFor();const deleted=await db.user.findUniqueOrThrow({where:{id:data.memberId}});assert.ok(deleted.deletedAt);assert.equal(deleted.active,false);
    await page.getByRole('combobox',{name:'Account status',exact:true}).selectOption('deleted');await account('Alex Tan').waitFor();await account('Alex Tan').getByRole('button',{name:'Release email',exact:true}).click();form=dialog('Release email?');await form.getByRole('textbox',{name:'Type the full name to confirm'}).fill('Alex Tan');await form.getByRole('button',{name:'Release email',exact:true}).click();await form.waitFor({state:'hidden'});await account('Alex Tan').getByText('Email released',{exact:true}).waitFor();assert.equal(await account('Alex Tan').getByRole('button',{name:'Release email',exact:true}).isDisabled(),true);assert.equal((await db.user.findUniqueOrThrow({where:{id:data.memberId}})).email,`deleted-${data.memberId}@accounts.invalid`);
    assert.deepEqual(await db.transaction.findMany({orderBy:{id:'asc'}}),ledger);assert.deepEqual(await db.booking.findMany({where:{userId:data.memberId},orderBy:{id:'asc'}}),bookings);
    for(const token of [data.foToken,data.coachToken]){const response=await context.request.get(`${api}/users?page=1&limit=10`,{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status(),403);}
    assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['stable server pagination, range counts and filters','create validation, inline failure and busy guards','successful saves survive refresh failure without duplicate accounts','edit contact, optional password, roles and coach photo controls','chronological activity and retry','typed delete, archived email release and retained bookings/payments','self-protection and role access','1440/1024/900/768/390/320 layouts and dialogs'],artifacts}));
  }catch(error){await page.screenshot({path:join(artifacts,'user-management-failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await db.$disconnect();for(const file of uploadedFiles)if(existsSync(file))unlinkSync(file);}
}finally{await browser?.close();children.forEach(child=>child.kill());}
