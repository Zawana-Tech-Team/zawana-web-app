import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const require = createRequire(new URL('../tooling/gym/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = resolve(new URL('..', import.meta.url).pathname);
const temp = mkdtempSync(join(tmpdir(), 'zawana-court-browser-'));
const artifacts = process.env.COURT_QA_ARTIFACT_DIR || join(temp, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const freePort = async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
};
const apiPort = await freePort(), uiPort = await freePort();
const ui = `http://127.0.0.1:${uiPort}`, api = `http://127.0.0.1:${apiPort}/api`;
const fixture = join(temp, 'fixture.json'), database = join(temp, 'qa.db');
writeFileSync(database, '');
const env = { ...process.env, DATABASE_URL: `file:${database}`, NODE_ENV: 'test', AUTH_MODE: 'database', JWT_SECRET: 'content-qa-session-key-more-than-thirty-two-characters', PORT: String(apiPort), CLIENT_URL: ui, PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`, VITE_API_URL: api, VITE_AUTH_MODE: 'database', COURT_QA_FIXTURE_PATH: fixture };
const children = [], errors = [], uploadedFiles = [];
let logs = '', browser;
const start = (bin, args, cwd) => {
  const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => logs += data); child.stderr.on('data', data => logs += data);
  children.push(child);
};
const ready = async url => {
  for (let i = 0; i < 120; i++) {
    if (children.some(child => child.exitCode !== null)) throw new Error(logs);
    if (await fetch(url).then(response => response.ok).catch(() => false)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become ready: ${logs}`);
};
try {
  execFileSync(join(root, 'backend/node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  execFileSync(join(root, 'backend/node_modules/.bin/tsx'), ['tests/court-browser-fixture.ts'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  const data = JSON.parse(readFileSync(fixture, 'utf8'));
  start(join(root, 'backend/node_modules/.bin/tsx'), ['src/server.ts'], join(root, 'backend'));
  start(join(root, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], root);
  await Promise.all([ready(`${api}/health`), ready(ui)]);
  const request = async (path, { token, body, method = 'GET' } = {}) => fetch(`${api}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {})
  });
  const chrome = process.env.COURT_BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference' });
  await context.addInitScript(token => localStorage.setItem('zawana_access_token', token), data.token);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const label = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const shortLabel = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  await page.goto(`${ui}/book/court`);
  await page.getByRole('heading', { name: 'Make time to play.' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Choose courts', exact: true }).isDisabled(), true);
  for (const day of data.dates) {
    const button = page.getByRole('button', { name: label(day), exact: true });
    if (!await button.count()) await page.getByRole('button', { name: 'Next month' }).click();
    await button.click();
  }
  await page.getByRole('button', { name: 'Preferred time 8:00 AM — 9:00 AM', exact: true }).click();
  await page.getByRole('button', { name: 'Preferred time 9:00 AM — 10:00 AM', exact: true }).click();
  await page.screenshot({ path: join(artifacts, 'court-dates-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Choose courts', exact: true }).click();
  const lower = page.getByRole('region', { name: '2nd floor', exact: true });
  const upper = page.getByRole('region', { name: '6th floor', exact: true });
  await lower.waitFor();
  await page.getByRole('button', { name: shortLabel(data.dates[0]), exact: true }).click();
  assert.equal(await lower.getByRole('button', { expanded: false }).count(), 4);
  assert.equal(await upper.getByRole('button', { expanded: false }).count(), 4);
  assert.equal(await page.getByRole('button', { name: 'Court 1, 8:00 AM — 9:00 AM, Available', exact: true }).count(), 0);
  await lower.getByRole('button', { name: /Court 1/ }).click();
  for (const time of ['8:00 AM — 9:00 AM', '9:00 AM — 10:00 AM']) await page.getByRole('button', { name: `Court 1, ${time}, Available`, exact: true }).click();
  await page.getByRole('button', { name: shortLabel(data.dates[1]), exact: true }).click();
  await upper.getByRole('button', { name: /Court 5/ }).click();
  await page.getByRole('button', { name: 'Court 5, 8:00 AM — 9:00 AM, Available', exact: true }).click();
  await page.screenshot({ path: join(artifacts, 'court-sessions-desktop.png'), fullPage: true });
  assert.equal(await page.locator('#booking-summary').getByText('3 sessions', { exact: true }).count(), 1);
  const response = page.waitForResponse(r => r.url().endsWith('/bookings') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirm all bookings', exact: true }).click();
  const confirmed = await response;
  assert.equal(confirmed.status(), 201, await confirmed.text());
  const payload = confirmed.request().postDataJSON();
  assert.equal(payload.kind, 'court');
  assert.equal(payload.bookings.length, 3);
  assert.deepEqual([...new Set(payload.bookings.map(b => b.date))].sort(), data.dates);
  await page.getByRole('heading', { name: 'Your court time is secured' }).waitFor();
  const bookings = await (await request('/bookings?page=1&limit=20', { token: data.token })).json();
  assert.equal(bookings.data.length, 3);
  console.log('PASS Animated two-step flow → two dates and three times → unchanged booking API → persisted sessions');
  await page.getByRole('button', { name: 'Book more court time', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileDay = page.getByRole('button', { name: label(data.dates[0]), exact: true });
  if (!await mobileDay.count()) await page.getByRole('button', { name: 'Previous month' }).click();
  await mobileDay.click();
  await page.getByRole('button', { name: 'Choose courts', exact: true }).click();
  await page.getByRole('region', { name: '6th floor', exact: true }).getByRole('button', { name: /Court 8/ }).click();
  await page.getByRole('button', { name: 'Court 8, 10:00 AM — 11:00 AM, Available', exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'court-sessions-mobile.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout overflows');
  assert.deepEqual(errors, []);
  console.log('PASS Four courts per floor, hidden times, mobile layout and reduced-motion interactions');
} catch (error) {
  console.error(logs.slice(-5000));
  throw error;
} finally {
  await browser?.close();
  for (const child of children) child.kill('SIGTERM');
  rmSync(temp, { recursive: true, force: true });
}
