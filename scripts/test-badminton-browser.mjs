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
const temp = mkdtempSync(join(tmpdir(), 'zawana-badminton-browser-'));
const artifacts = process.env.BADMINTON_QA_ARTIFACT_DIR || join(temp, 'artifacts');
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
const env = { ...process.env, DATABASE_URL: `file:${database}`, NODE_ENV: 'test', AUTH_MODE: 'database', JWT_SECRET: 'content-qa-session-key-more-than-thirty-two-characters', PORT: String(apiPort), CLIENT_URL: ui, PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`, VITE_API_URL: api, VITE_AUTH_MODE: 'database', BADMINTON_QA_FIXTURE_PATH: fixture };
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
  execFileSync(join(root, 'backend/node_modules/.bin/tsx'), ['tests/badminton-browser-fixture.ts'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
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
  await page.goto(`${ui}/badminton-fo/pos`);
  await page.waitForURL('**/badminton-fo/active-packages');
  await page.getByRole('heading', { name: 'Active Packages', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'POS', exact: true }).count(), 0);
  await page.getByRole('textbox', { name: 'Search member accounts' }).fill('Aye');
  await page.getByRole('button', { name: `Select ${data.member.name}`, exact: true }).click();
  await page.getByRole('button', { name: `Select ${data.pkg.title}`, exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Check in', exact: true }).count(), 0);
  assert.equal(await page.getByText('Check-in desk', { exact: true }).count(), 0);
  await page.getByRole('spinbutton', { name: 'Discount (%)' }).fill('10');
  await page.getByRole('button', { name: 'KPay', exact: true }).click();
  await page.getByText('Total due · KPay', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'activation-desktop.png'), fullPage: true });
  const activation = page.waitForResponse(r => r.url().endsWith('/badminton/enrollments') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Activate package', exact: true }).last().click();
  const activated = await activation;
  assert.equal(activated.status(), 201, await activated.text());
  const enrollment = await activated.json();
  await page.getByText(`${data.member.name} package activated.`, { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Check in', exact: true }).count(), 0);
  const transactions = await (await request('/transactions', { token: data.token })).json();
  const sale = transactions.find(t => t.customer === data.member.name);
  assert.equal(sale.paymentMethod, 'KPay');
  assert.equal(sale.amount, 150000);
  assert.equal(sale.discount, 15000);
  assert.equal(sale.finalAmount, 135000);
  console.log('PASS Browser member search → KPay activation with 10% discount → persisted finance transaction');
  const renewed = await request(`/badminton/enrollments/${enrollment.id}/renew`, { token: data.token, method: 'POST', body: { packageId: data.pkg.id, paymentMethod: 'Cash', discountPercent: 20 } });
  assert.equal(renewed.status, 200, await renewed.text());
  const afterRenew = await (await request('/transactions', { token: data.token })).json();
  const renewal = afterRenew.find(t => t.item.startsWith('Package renewal'));
  assert.equal(renewal.paymentMethod, 'Cash');
  assert.equal(renewal.discount, 30000);
  assert.equal(renewal.finalAmount, 120000);
  const invalid = await request('/badminton/enrollments', { token: data.token, method: 'POST', body: { userId: data.member.id, packageId: data.pkg.id, paymentMethod: 'KPay', discountPercent: 101 } });
  assert.equal(invalid.status, 400);
  await page.goto(`${ui}/badminton-fo/check-in`);
  await page.getByRole('textbox', { name: 'Search package holders' }).fill('Aye');
  await page.getByRole('button', { name: /Aye Package Member/ }).first().waitFor();
  await page.getByRole('button', { name: /Aye Package Member/ }).first().click();
  await page.getByRole('button', { name: 'Check in', exact: true }).waitFor();
  await page.goto(`${ui}/badminton-fo/active-packages`);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.getByRole('button', { name: 'Check in', exact: true }).count(), 0);
  await page.getByRole('spinbutton', { name: 'Discount (%)' }).waitFor();
  await page.screenshot({ path: join(artifacts, 'activation-mobile.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile layout overflows');
  assert.deepEqual(errors, []);
  console.log('PASS Cash renewal, invalid discount rejection, separate check-in page and mobile activation controls');
} catch (error) {
  console.error(logs.slice(-5000));
  throw error;
} finally {
  await browser?.close();
  for (const child of children) child.kill('SIGTERM');
  rmSync(temp, { recursive: true, force: true });
}
