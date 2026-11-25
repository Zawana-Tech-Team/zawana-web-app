import {chooseRentalReplacement,reviewRentalReplacement} from './helpers/member-rescheduling.mjs';
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
    const memberContext=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await memberContext.addInitScript(token=>{localStorage.setItem('zawana_access_token',token);localStorage.setItem('zawana_language','en');},data.memberToken);
    const memberPage=await memberContext.newPage();memberPage.setDefaultTimeout(15000);memberPage.on('pageerror',e=>errors.push(e.message));
    await db.court.update({where:{id:data.courts[0].id},data:{price:30000}});
    await db.court.update({where:{id:data.courts[3].id},data:{price:35000}});
    for(const [index,paid] of [30000,30000,35000,60000].entries()){
      const d=new Date(`${data.date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+10+index);const date=d.toISOString().slice(0,10);
      const original=await db.booking.create({data:{code:randomUUID(),userId:data.memberId,kind:'court',courtId:data.courts[0].id,date,time:index===3?'8:00 AM — 10:00 AM':'8:00 AM — 9:00 AM',title:'Unified rental',location:'Arena',status:'CONFIRMED',paymentStatus:'paid',price:paid}});
      await db.transaction.create({data:{resourceType:'booking',resourceId:original.id,userId:data.memberId,date,customer:'Alex Tan',business:'Badminton',item:'Rental',amount:paid,discount:0,tax:0,finalAmount:paid,paymentMethod:'Cash',staff:'Desk Preview',status:'paid'}});
      const receipts=await db.transaction.count();
      await memberPage.goto(`${ui}/bookings/${original.id}/reschedule`);
      const time=index===3?'10:00 AM — 12:00 PM':'10:00 AM — 11:00 AM',courtName=data.courts[index===0?3:0].name;
      await chooseRentalReplacement(memberPage,{date,courtName,time});
      const summary=memberPage.getByRole('region',{name:'Reschedule Summary',exact:true});
      const difference=index===0?'+5,000 MMK':index===2?'−5,000 MMK':'0 MMK';
      await summary.getByText(difference,{exact:true}).waitFor();
      await reviewRentalReplacement(memberPage);
      await summary.getByText(difference,{exact:true}).waitFor();
      await memberPage.getByRole('button',{name:'Edit replacement',exact:true}).click();
      assert.equal(await memberPage.getByRole('button',{name:`${courtName}, ${time}, Selected`,exact:true}).getAttribute('aria-pressed'),'true');
      await reviewRentalReplacement(memberPage);
      await summary.getByText(difference,{exact:true}).waitFor();
      if(index===2){
        assert.equal(await memberPage.getByRole('button',{name:'Continue — I Understand',exact:true}).isDisabled(),true);
        await memberPage.getByLabel('I agree to lose 5,000 MMK with no refund or credit.',{exact:true}).check();
      }
      assert.ok(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await memberPage.screenshot({path:join(artifacts,`price-${index}-mobile.png`),fullPage:true});
      if(index===0||index===1){
        // An unverified/failed confirmation must not move the booking or add a receipt.
        await memberPage.route('**/requests/*/confirm',route=>route.fulfill({status:503,json:{message:'Payment service unavailable. Your original booking stays reserved.'}}));
        await memberPage.getByRole('button',{name:index===0?'Pay 5,000 MMK & Reschedule':'Confirm Replacement',exact:true}).click();
        await memberPage.getByRole('alert').filter({hasText:'Payment service unavailable'}).waitFor();
        assert.deepEqual(await db.booking.findUnique({where:{id:original.id}}),original);
        assert.equal(await db.transaction.count(),receipts);
        await memberPage.unroute('**/requests/*/confirm');
        await memberPage.getByRole('button',{name:'Edit replacement',exact:true}).click();
        await reviewRentalReplacement(memberPage);
      }
      const name=index===0?'Pay 5,000 MMK & Reschedule':index===2?'Continue — I Understand':'Confirm Replacement';
      await memberPage.getByRole('button',{name,exact:true}).click();
      await memberPage.getByRole('status').filter({hasText:'Your replacement is confirmed.'}).waitFor();
      assert.equal((await db.booking.findUniqueOrThrow({where:{id:original.id}})).time,time);
      assert.equal(await db.transaction.count(),receipts+(index===0?1:0));assert.equal(await db.bookingRefund.count(),0);
      if(index===0){const receipt=await db.transaction.findFirstOrThrow({where:{resourceType:'member_reschedule',userId:data.memberId}});assert.equal(receipt.finalAmount,5000);assert.equal(receipt.confirmationMode,'SIMULATED');}
      await memberPage.getByRole('button',{name:'Back to bookings',exact:true}).click();
    }
    await memberContext.close();assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,checks:['direct rentals reuse the normal booking calendar and court cards','multi-hour duration preserved','automatic authoritative +5,000 / 0 / -5,000 MMK summaries','back preserves selections','higher price records only the extra member payment and confirms immediately','lower price requires acknowledgement without refund','failed confirmation retains original and receipts; retry succeeds','mobile layout'],artifacts}));
  } finally { await db.$disconnect(); }
} finally { await browser?.close(); children.forEach(child => child.kill()); }
