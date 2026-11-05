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
let browser, logs = ''; const children = [], errors = [];
const start = (bin, args, cwd) => { const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child); child.stdout.on('data', d => logs += d); child.stderr.on('data', d => logs += d); return child; };
const ready = async url => { for (let i = 0; i < 150; i++) { if (children.some(c => c.exitCode !== null)) throw new Error(logs); if (await fetch(url).then(r => r.ok).catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(logs); };
try {
  execFileSync(join(root, 'backend/node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  execFileSync(join(root, 'backend/node_modules/.bin/tsx'), ['tests/attendance-browser-fixture.ts'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  const data = JSON.parse(readFileSync(fixture, 'utf8'));
  start(join(root, 'backend/node_modules/.bin/tsx'), ['src/server.ts'], join(root, 'backend'));
  start(join(root, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], root);
  await Promise.all([ready(ui), ready(`${api}/health`)]);
  const chrome = process.env.ATTENDANCE_BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  const fo = data.tokens.find(row => row.role === 'badminton_fo');
  const seed = () => {
    execFileSync(join(root, 'backend/node_modules/.bin/tsx'), ['tests/attendance-browser-fixture.ts', '--notification-qa'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
    return JSON.parse(readFileSync(fixture, 'utf8')).notificationQa;
  };
  const inbox = async () => (await fetch(api + '/notifications', { headers: { Authorization: `Bearer ${fo.token}` } })).json();
  let ids = seed();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(token => localStorage.setItem('zawana_access_token', token), fo.token);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(ui + '/badminton-fo/attendance');
  await page.getByRole('heading', { name: 'Attendance.' }).waitFor();
  await page.getByRole('button', { name: /^Notifications, / }).click();
  const panel = page.getByRole('region', { name: 'Notifications', exact: true });
  await panel.getByText('Viewed notification', { exact: true }).waitFor();
  assert.equal(await panel.getByText('Expired notification', { exact: true }).count(), 0);
  await page.waitForTimeout(1300);
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForFunction(async ({ api, token, id }) => {
    const rows = await (await fetch(api + '/notifications', { headers: { Authorization: `Bearer ${token}` } })).json();
    return !rows.some(row => row.id === id);
  }, { api, token: fo.token, id: ids.topId });
  assert.equal((await inbox()).some(row => row.id === ids.unseenId), true, 'Off-screen notifications stay unread');
  await page.reload();
  await page.getByRole('button', { name: /^Notifications, / }).click();
  await panel.getByText(/^Unread update /).first().waitFor();
  assert.equal(await panel.getByText('Viewed notification', { exact: true }).count(), 0, 'Removal persists after refresh');
  await panel.getByRole('button', { name: 'Close', exact: true }).click();

  ids = seed();
  await page.goto(ui + '/badminton-fo/notifications');
  await page.getByRole('heading', { name: 'Viewed notification', exact: true }).waitFor();
  await page.waitForTimeout(1300);
  // Full navigation exercises pagehide/keepalive, as well as SPA surface cleanup.
  await page.goto(ui + '/badminton-fo/attendance');
  await page.waitForFunction(async ({ api, token, id }) => {
    const rows = await (await fetch(api + '/notifications', { headers: { Authorization: `Bearer ${token}` } })).json();
    return !rows.some(row => row.id === id);
  }, { api, token: fo.token, id: ids.topId });

  ids = seed();
  await page.reload();
  await page.getByRole('button', { name: /^Notifications, / }).click();
  await panel.getByText('Pending notification task', { exact: true }).waitFor();
  execFileSync(join(root, 'backend/node_modules/.bin/tsx'), ['tests/attendance-browser-fixture.ts', '--notification-done'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  assert.equal((await inbox()).some(row => row.id === ids.taskId), false, 'Backend removes the completed task immediately');
  console.log('Task completion verified; browser visibility:', await page.evaluate(() => document.visibilityState));
  // The normal background poll must remove a task completed elsewhere without a user click.
  await panel.getByText('Pending notification task', { exact: true }).waitFor({ state: 'hidden', timeout: 20000 }).catch(async error => { console.error('Browser inbox state', await page.evaluate(() => ({ hidden: document.hidden, text: document.querySelector('#notification-panel')?.textContent })), errors); throw error; });
  assert.equal((await inbox()).some(row => row.id === ids.taskId), false);
  await page.screenshot({ path: join(temp, 'notifications-auto-removed.png') });
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`PASS visible-only viewing cleanup, page-leave persistence, expiry and automatic completed-task removal. Artifacts: ${temp}`);
} finally { await browser?.close(); for (const child of children) child.kill('SIGTERM'); }
