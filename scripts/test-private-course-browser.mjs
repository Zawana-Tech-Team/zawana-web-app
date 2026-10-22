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
const temp = mkdtempSync(join(tmpdir(), 'zawana-private-browser-'));
const artifacts = process.env.PRIVATE_QA_ARTIFACT_DIR || join(temp, 'artifacts');
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
const env = { ...process.env, DATABASE_URL: `file:${database}`, NODE_ENV: 'test', AUTH_MODE: 'database', JWT_SECRET: 'content-qa-session-key-more-than-thirty-two-characters', PORT: String(apiPort), CLIENT_URL: ui, PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`, VITE_API_URL: api, VITE_AUTH_MODE: 'database', PRIVATE_QA_FIXTURE_PATH: fixture };
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
  execFileSync(join(root, 'backend/node_modules/.bin/tsx'), ['tests/private-course-browser-fixture.ts'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  const data = JSON.parse(readFileSync(fixture, 'utf8'));
  start(join(root, 'backend/node_modules/.bin/tsx'), ['src/server.ts'], join(root, 'backend'));
  start(join(root, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], root);
  await Promise.all([ready(`${api}/health`), ready(ui)]);
  const request = async (path, { token, body, method = 'GET' } = {}) => fetch(`${api}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {})
  });
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  await context.addInitScript(token => localStorage.setItem('zawana_access_token', token), data.token);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const availabilityRequests = [];
  page.on('request', request => { if (request.url().includes('/bookings/availability?date=')) availabilityRequests.push(request.url()) });
  const label = value => new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  await page.goto(`${ui}/private-course`);
  assert.equal(await page.getByRole('button', { name: 'Choose a date', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: `Select ${data.course.title}`, exact: true }).click();
  await page.getByRole('button', { name: `Select coach ${data.coach.name}`, exact: true }).click();
  await page.screenshot({ path: join(artifacts, 'private-course-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Choose a date', exact: true }).click();
  await page.getByRole('button', { name: label(data.dates[0]), exact: true }).click();
  await page.getByRole('button', { name: 'Choose a court', exact: true }).click();
  const lower = page.getByRole('region', { name: '2nd floor', exact: true });
  const upper = page.getByRole('region', { name: '6th floor', exact: true });
  await upper.waitFor();
  assert.equal(await lower.getByRole('button', { expanded: false }).count(), 4);
  assert.equal(await upper.getByRole('button', { expanded: false }).count(), 4);
  assert.equal(await page.getByRole('button', { name: 'Court 5, 8:00 AM — 9:30 AM, Available', exact: true }).count(), 0);
  await upper.getByRole('button', { name: /Court 5/ }).click();
  await page.getByRole('button', { name: 'Court 5, 8:00 AM — 9:30 AM, Available', exact: true }).click();
  assert.equal(availabilityRequests.filter(url => url.endsWith(`date=${data.dates[0]}`)).length, 1, 'Moving from dates to courts should reuse the current availability');
  await page.screenshot({ path: join(artifacts, 'private-times-desktop.png'), fullPage: true });
  const response = page.waitForResponse(r => r.url().endsWith('/member/private-courses') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Request private course', exact: true }).click();
  const requested = await response;
  assert.equal(requested.status(), 201, await requested.text());
  assert.deepEqual(requested.request().postDataJSON(), { courseId: data.course.id, courtId: data.courts[4].id, coachId: data.coach.id, date: data.dates[0], time: '8:00 AM — 9:30 AM', expectedPrice: 50000 });
  await page.waitForURL('**/bookings');
  const bookings = await (await request('/bookings?page=1&limit=20', { token: data.token })).json();
  const saved = bookings.data.find(b => b.kind === 'private_course');
  assert.equal(saved.status, 'PENDING_COACH_CONFIRMATION');
  console.log('PASS Course → assigned coach → date → floor-grouped court → duration-aware time → existing request endpoint → coach confirmation pending');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ui}/private-course`);
  await page.getByRole('button', { name: `Select ${data.course.title}`, exact: true }).click();
  await page.getByRole('button', { name: `Select coach ${data.coach.name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Choose a date', exact: true }).click();
  await page.getByRole('button', { name: label(data.dates[0]), exact: true }).click();
  await page.getByRole('button', { name: 'Choose a court', exact: true }).click();
  await page.getByRole('region', { name: '2nd floor', exact: true }).getByRole('button', { name: /Court 1/ }).click();
  await page.getByRole('button', { name: 'Court 1, 8:00 AM — 9:30 AM, Coach unavailable', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Court 1, 8:00 AM — 9:30 AM, Coach unavailable', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Request private course', exact: true }).isDisabled(), true);
  await page.screenshot({ path: join(artifacts, 'private-times-mobile.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout overflows');
  assert.deepEqual(errors, []);
  console.log('PASS Mobile layout, reduced motion and coach conflicts disable overlapping sessions on other courts');
} catch (error) {
  console.error(logs.slice(-5000));
  throw error;
} finally {
  await browser?.close();
  for (const child of children) child.kill('SIGTERM');
  rmSync(temp, { recursive: true, force: true });
}
