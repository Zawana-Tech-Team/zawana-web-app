import QRCode from 'qrcode';
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
let browser, logs = ''; const children = [], errors = [], keyWarnings = [];
const start = (bin, args, cwd) => { const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child); child.stdout.on('data', d => logs += d); child.stderr.on('data', d => logs += d); };
const ready = async url => { for (let i = 0; i < 150; i++) { if (children.some(c => c.exitCode !== null)) throw new Error(logs); if (await fetch(url).then(r => r.ok).catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(logs); };
try {
  execFileSync(join(root, 'backend/node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  execFileSync(join(root, 'backend/node_modules/.bin/tsx'), ['tests/attendance-browser-fixture.ts'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  const data = JSON.parse(readFileSync(fixture, 'utf8'));
  start(join(root, 'backend/node_modules/.bin/tsx'), ['src/server.ts'], join(root, 'backend'));
  start(join(root, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], root);
  await Promise.all([ready(ui), ready(`${api}/health`)]);
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  for (const { role, token } of data.tokens) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript(token => localStorage.setItem('zawana_access_token', token), token);
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (/Each child in a list|unique.*key.*prop/.test(message.text())) keyWarnings.push(message.text()); });
    const path = role === 'member' ? '/attendance' : `/${role === 'badminton_fo' ? 'badminton-fo' : role}/attendance`;
    await page.goto(ui + path);
    await page.getByRole('heading', { name: 'Attendance.' }).waitFor();
    await page.getByRole('heading', { name: 'Aye Student' }).waitFor();
    if (role === 'admin') {
      await page.getByRole('button', { name: 'Check in student' }).click();
      await page.getByText('Recorded by Attendance Admin').waitFor();
      await page.reload(); await page.getByText('Recorded by Attendance Admin').waitFor();
    } else {
      await page.getByText('Recorded by Attendance Admin').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Check in student' }).count(), 0);
    }
    await page.getByRole('button', { name: 'Previous month' }).click(); await page.getByText('A clear day').waitFor();
    await page.getByRole('button', { name: 'Today', exact: true }).click(); await page.getByRole('heading', { name: 'Aye Student' }).waitFor();
    await page.getByRole('textbox', { name: 'Search attendance' }).fill('no-match'); await page.getByText('A clear day').waitFor();
    await page.getByRole('textbox', { name: 'Search attendance' }).fill(''); await page.getByRole('heading', { name: 'Aye Student' }).waitFor();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${role} ${width}: no overflow`);
      await page.screenshot({ path: join(temp, `${role}-${width}.png`), fullPage: true });
    }
    if (role === 'badminton_fo') {
      await page.goto(ui + '/badminton-fo/check-in');
      await page.getByRole('button', { name: 'Generate check-in QR', exact: true }).click();
      await page.getByRole('img', { name: 'Badminton member check-in QR code' }).waitFor();
      await page.screenshot({ path: join(temp, 'qr-desk-mobile.png'), fullPage: true });
      await page.getByRole('button', { name: 'Revoke code', exact: true }).click();
      await page.getByText('Your check-in QR will appear here').waitFor();
    }
    if (role === 'admin') {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(ui + '/admin/users'); await page.getByLabel('Search users').waitFor();
      await page.getByRole('combobox', { name: 'Account role' }).selectOption('member');
      await page.getByText('Aye Student', { exact: true }).waitFor();
      await page.screenshot({ path: join(temp, 'users-desktop.png'), fullPage: true });
    }
    if (role === 'member') {
      await page.goto(ui + '/member');
      await page.locator('.workspace-cover').waitFor();
      await page.getByRole('button', { name: /Scan to check in/ }).waitFor();
      await page.goto(ui + '/membership'); await page.getByRole('button', { name: 'Scan to check in' }).waitFor();
      await page.screenshot({ path: join(temp, 'packages-mobile.png'), fullPage: true });
    }
    await context.close();
  }
  const fo = data.tokens.find(t => t.role === 'badminton_fo');
  const member = data.tokens.find(t => t.role === 'member');
  const apiRequest = (path, token, body) => fetch(api + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await apiRequest('/check-in/qr', member.token, {})).status, 403);
  const generatedAt = Date.now();
  const issued = await (await apiRequest('/check-in/qr', fo.token, {})).json();
  assert.ok(new Date(issued.expiresAt).getTime() - generatedAt > 3590000);
  const png = join(temp, 'entry-qr.png');
  await QRCode.toFile(png, `${ui}/check-in#${issued.token}`);
  const qrContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await qrContext.addInitScript(token => localStorage.setItem('zawana_access_token', token), member.token);
  const scan = await qrContext.newPage();
  await scan.goto(ui + '/check-in');
  await scan.getByLabel('Upload QR photo').setInputFiles(png);
  await scan.getByRole('button', { name: 'Confirm check-in' }).click();
  await scan.getByText('One session used · 9 remaining.').waitFor();
  await scan.screenshot({ path: join(temp, 'qr-success-mobile.png'), fullPage: true });
  const duplicate = await apiRequest('/check-in/scan', member.token, { token: issued.token });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, 'ALREADY_CHECKED_IN');
  const replacement = await (await apiRequest('/check-in/qr', fo.token, {})).json();
  assert.equal((await apiRequest('/check-in/scan', member.token, { token: issued.token })).status, 409);
  assert.equal((await apiRequest('/check-in/scan', member.token, { token: replacement.token })).status, 409);
  await qrContext.close();
  console.log('PASS one-hour QR, camera-library image decoding, session deduction, duplicate protection and rotation');
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  publicPage.on('console', message => { if (/Each child in a list|unique.*key.*prop/.test(message.text())) keyWarnings.push(message.text()); });
  for (const path of ['/', '/login']) {
    await publicPage.goto(ui + path);
    await publicPage.getByRole('button', { name: 'Switch to Burmese', exact: true }).first().click();
    await publicPage.waitForFunction(() => document.documentElement.lang === 'my');
    await publicPage.getByRole('button', { name: 'အင်္ဂလိပ်ဘာသာသို့ ပြောင်းရန်', exact: true }).first().click();
    await publicPage.waitForFunction(() => document.documentElement.lang === 'en');
  }
  await publicContext.close();
  assert.deepEqual(keyWarnings, [], 'No React key warnings across workspace, public, login and translated trees');
  assert.deepEqual(errors, []); console.log(`Attendance browser flow passed for four roles at three widths. Screenshots: ${temp}`);
} finally { await browser?.close(); for (const child of children) child.kill('SIGTERM'); }
