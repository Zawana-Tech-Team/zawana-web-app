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
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(token => localStorage.setItem('zawana_access_token', token), data.token);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${ui}/profile`);
  await page.getByRole('heading', { name: 'Personal details', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'My Gym Training', exact: true }).count(), 0);
  const save = page.getByRole('button', { name: 'Save changes', exact: true });
  assert.equal(await save.isDisabled(), true);
  assert.equal(await page.getByRole('textbox', { name: 'Email address', exact: true }).getAttribute('readonly'), '');
  await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Discard Me');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Full name', exact: true }).inputValue(), 'Court QA Member');
  await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Aye Member');
  await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('+959123456789');
  const response = page.waitForResponse(r => r.url().endsWith('/profile') && r.request().method() === 'PATCH');
  await save.click();
  const saved = await response;
  assert.equal(saved.status(), 200, await saved.text());
  await page.getByRole('status').filter({ hasText: 'Your profile was saved.' }).waitFor();
  const profile = await (await request('/profile', { token: data.token })).json();
  assert.equal(profile.name, 'Aye Member');
  assert.equal(profile.phone, '+959123456789');
  assert.equal(await save.isDisabled(), true);
  await page.screenshot({ path: join(artifacts, 'profile-desktop.png'), fullPage: true });
  await page.getByLabel('Upload profile photo', { exact: true }).setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64') });
  await page.getByRole('button', { name: 'Undo photo change', exact: true }).waitFor();
  assert.equal(await page.getByRole('img', { name: 'Your profile photo' }).count(), 1);
  await page.getByRole('button', { name: 'Undo photo change', exact: true }).click();
  assert.equal(await save.isDisabled(), true);
  await page.getByLabel('Upload profile photo', { exact: true }).setInputFiles({ name: 'file.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid image') });
  await page.getByRole('alert').filter({ hasText: 'Choose a PNG, JPG, or WebP image.' }).waitFor();
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('heading', { name: 'Personal details', exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'profile-mobile.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout overflows');
  await page.getByRole('link', { name: /Security & settings.*Manage how you sign in/ }).click();
  await page.waitForURL('**/settings');
  assert.deepEqual(errors, []);
  console.log('PASS Member navigation hides Gym Training; profile edit, discard, save persistence, email lock, photo preview/undo, file validation, security navigation and mobile layout');
} catch (error) {
  console.error(logs.slice(-5000));
  throw error;
} finally {
  await browser?.close();
  for (const child of children) child.kill('SIGTERM');
  rmSync(temp, { recursive: true, force: true });
}
