import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
const require = createRequire(new URL('../tooling/gym/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = resolve(new URL('..', import.meta.url).pathname);
const temp = mkdtempSync(join(tmpdir(), 'zawana-gym-browser-'));
const artifacts = process.env.GYM_QA_ARTIFACT_DIR || join(temp, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const port = async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const result = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return result;
};
const apiPort = await port(), uiPort = await port();
const ui = `http://127.0.0.1:${uiPort}`, api = `http://127.0.0.1:${apiPort}/api`;
const database = join(temp, 'qa.db'), fixture = join(temp, 'fixture.json');
writeFileSync(database, '');
const env = { ...process.env, DATABASE_URL: `file:${database}`, NODE_ENV: 'test', AUTH_MODE: 'database', JWT_SECRET: 'browser-qa-session-key-more-than-thirty-two-characters', GYM_ALLOW_CASH_PAYMENTS: 'true', GYM_QA_FIXTURE_PATH: fixture, PORT: String(apiPort), CLIENT_URL: ui, VITE_API_URL: api, VITE_AUTH_MODE: 'database' };
const children = [], errors = [];
let logs = '', browser;
const start = (bin, args, cwd) => {
  const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
  children.push(child); return child;
};
const ready = async url => {
  for (let i = 0; i < 100; i++) {
    if (children.some(c => c.exitCode !== null)) throw new Error(logs);
    if (await fetch(url).then(r => r.ok).catch(() => false)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become ready: ${logs}`);
};
try {
  execFileSync(join(root, 'backend/node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  execFileSync(join(root, 'backend/node_modules/.bin/tsx'), ['tests/gym-browser-fixture.ts'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  const data = JSON.parse(readFileSync(fixture, 'utf8'));
  start(join(root, 'backend/node_modules/.bin/tsx'), ['src/server.ts'], join(root, 'backend'));
  start(join(root, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], root);
  await Promise.all([ready(`${api}/health`), ready(ui)]);
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(process.env.GYM_BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.GYM_BROWSER_EXECUTABLE_PATH } : existsSync(chrome) ? { executablePath: chrome } : {}) });
  const contextFor = async (role, viewport = { width: 1440, height: 1000 }) => {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    await context.addInitScript(token => localStorage.setItem('zawana_access_token', token), data.tokens[role]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    return page;
  };
  const choose = async (page, label, option) => {
    const field = page.getByRole('dialog').getByRole('combobox', { name: label, exact: true });
    await field.click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  const admin = await contextFor('admin');
  await admin.goto(`${ui}/admin/gym-packages`);
  await admin.getByRole('button', { name: 'New package', exact: true }).waitFor();
  await admin.getByRole('button', { name: 'New package', exact: true }).click();
  await admin.getByLabel('Package name').fill('Browser verified walk-in');
  await choose(admin, 'Category', 'Walk-in');
  await admin.getByLabel('Total price (MMK)').fill('18000');
  await choose(admin, 'Publication', 'active');
  await admin.getByRole('button', { name: 'Save package', exact: true }).click();
  await admin.getByRole('heading', { name: 'Browser verified walk-in', exact: true }).waitFor();
  await admin.screenshot({ path: join(artifacts, 'admin-desktop.png'), fullPage: true });
  console.log('PASS Admin creates and publishes an integer-priced walk-in package');

  const desk = await contextFor('desk');
  await desk.goto(`${ui}/gym-fo/memberships`);
  await desk.getByRole('button', { name: 'New enrollment', exact: true }).click();
  await desk.getByRole('button').filter({ hasText: 'Couple PT · 5 session(s)' }).click();
  await desk.getByRole('button', { name: 'Continue', exact: true }).click();
  await desk.getByRole('checkbox', { name: /QA Member Alpha/ }).check();
  assert.equal(await desk.getByRole('button', { name: 'Continue', exact: true }).isEnabled(), false);
  await desk.getByRole('checkbox', { name: /QA Member Beta/ }).check();
  await desk.getByRole('button', { name: 'Continue', exact: true }).click();
  await choose(desk, 'Gym coach (required)', 'QA Gym Coach');
  await desk.getByRole('button', { name: 'Continue', exact: true }).click();
  await desk.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await desk.getByRole('heading', { name: 'Payment & activation', exact: true }).waitFor();
  await choose(desk, 'Payment method', 'Cash');
  await desk.getByRole('checkbox', { name: 'I have received the full cash amount.' }).check();
  await desk.getByRole('button', { name: 'Record cash & activate', exact: true }).click();
  await desk.getByRole('heading', { name: 'Payment receipt', exact: true }).waitFor();
  assert.ok(await desk.getByText('300,000 MMK', { exact: true }).count());
  assert.equal(await desk.getByRole('dialog').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)');
  await desk.screenshot({ path: join(artifacts, 'receipt.png'), fullPage: true });
  await desk.getByRole('button', { name: 'Close receipt', exact: true }).click();
  console.log('PASS Couple enrollment enforces two participants, collects authorized cash, activates and renders receipt');

  await desk.getByRole('button', { name: 'New enrollment', exact: true }).click();
  await desk.getByRole('button').filter({ hasText: 'Gym Membership · 1 month(s)' }).click();
  await desk.getByRole('button', { name: 'Continue', exact: true }).click();
  await desk.getByRole('checkbox', { name: /QA Member Beta/ }).check();
  await desk.getByRole('button', { name: 'Continue', exact: true }).click();
  await desk.getByRole('button', { name: 'Continue', exact: true }).click();
  await desk.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await choose(desk, 'Payment method', 'Cash');
  await desk.getByRole('checkbox', { name: 'I have received the full cash amount.' }).check();
  await desk.getByRole('button', { name: 'Record cash & activate', exact: true }).click();
  await desk.getByRole('heading', { name: 'Payment receipt', exact: true }).waitFor();
  assert.ok(await desk.getByRole('dialog').getByText('170,000 MMK', { exact: true }).count());
  await desk.getByRole('button', { name: 'Close receipt', exact: true }).click();
  console.log('PASS Cash gym membership activates access and issues a paid receipt');

  await desk.goto(`${ui}/gym-fo/private-training`);
  await desk.getByRole('button', { name: 'Schedule session', exact: true }).click();
  await desk.getByLabel('Find enrollment').fill(data.pending.code);
  await desk.getByText('No paid PT enrollments found', { exact: true }).waitFor();
  await desk.getByRole('button', { name: 'Open PT enrollments', exact: true }).click();
  await desk.getByRole('heading', { name: 'PT enrollments & renewals', exact: true }).waitFor();
  await desk.getByText('Awaiting payment', { exact: true }).waitFor();
  // Pending purchases are visible here, while access memberships are excluded.
  assert.equal(await desk.getByRole('heading', { name: 'Gym Membership · 1 month(s)', exact: true }).count(), 0);
  await desk.getByRole('button', { name: 'New PT enrollment', exact: true }).click();
  await desk.getByRole('dialog').getByRole('button').filter({ hasText: 'Personal Training · 1 session(s)' }).waitFor();
  assert.equal(await desk.getByRole('dialog').getByRole('button').filter({ hasText: 'Gym Membership' }).count(), 0);
  await desk.getByRole('button', { name: 'Close enrollment', exact: true }).click();
  await desk.getByRole('button', { name: 'Take payment', exact: true }).click();
  await choose(desk, 'Payment method', 'Cash');
  await desk.getByRole('checkbox', { name: 'I have received the full cash amount.' }).check();
  await desk.getByRole('button', { name: 'Record cash & activate', exact: true }).click();
  await desk.getByRole('heading', { name: 'Payment receipt', exact: true }).waitFor();
  await desk.getByRole('button', { name: 'Close receipt', exact: true }).click();
  await desk.getByRole('button', { name: 'Sessions & attendance', exact: true }).click();
  await desk.getByRole('button', { name: 'Schedule session', exact: true }).click();
  await desk.getByLabel('Find enrollment').fill(data.pending.code);
  const pendingChoice = `${data.pending.code} · QA Member Alpha · 1 left`;
  await choose(desk, 'Paid training enrollment', pendingChoice);
  await desk.getByRole('button', { name: 'Close scheduler', exact: true }).click();
  console.log('PASS Pending PT is visible, cash payment activates it, and it appears in the scheduling dropdown');

  await desk.getByRole('button', { name: 'Schedule session', exact: true }).click();
  const enrollmentResponse = await fetch(`${api}/gym/enrollments`, { headers: { Authorization: `Bearer ${data.tokens.desk}` } }).then(r => r.json());
  const enrolled = enrollmentResponse.data.find(e => e.kind === 'COUPLE_PT');
  const enrollmentChoice = `${enrolled.code} · ${enrolled.members.map(m => m.user.name).join(', ')} · 5 left`;
  await choose(desk, 'Paid training enrollment', enrollmentChoice);
  // Assigned coach is selected automatically from the enrollment.
  const tomorrow = new Date(`${enrolled.startDate}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await desk.getByLabel('Session date').fill(tomorrow.toISOString().slice(0, 10));
  await desk.getByRole('button', { name: '10:00', exact: true }).click();
  await desk.getByRole('dialog').getByRole('button', { name: 'Schedule session', exact: true }).click();
  await desk.getByRole('dialog').waitFor({ state: 'hidden' });
  await desk.getByRole('button', { name: 'Upcoming', exact: true }).click();
  await desk.getByText('QA Member Alpha', { exact: true }).waitFor();
  await desk.screenshot({ path: join(artifacts, 'training-desktop.png'), fullPage: true });
  console.log('PASS Coach/participant availability, paid scheduling and group attendance rendering');

  const mobile = await contextFor('desk', { width: 390, height: 844 });
  await mobile.goto(`${ui}/gym-fo/memberships`);
  await mobile.getByRole('heading', { name: 'Enrollments & renewals', exact: true }).waitFor();
  await mobile.getByRole('button', { name: 'Receipt', exact: true }).first().waitFor();
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile enrollment page overflows horizontally');
  await mobile.screenshot({ path: join(artifacts, 'enrollment-mobile.png'), fullPage: true });
  const member = await contextFor('member');
  await member.goto(`${ui}/member/training`);
  await member.getByRole('heading', { name: 'My gym packages', exact: true }).waitFor();
  await member.getByRole('button', { name: 'Receipt', exact: true }).first().click();
  await member.getByRole('heading', { name: 'Payment receipt', exact: true }).waitFor();
  assert.equal(await member.getByRole('button', { name: 'New enrollment', exact: true }).count(), 0);
  const coach = await contextFor('coach');
  await coach.goto(`${ui}/coach/training`);
  await coach.getByRole('button', { name: 'Upcoming', exact: true }).click();
  await coach.getByText('QA Member Beta', { exact: true }).waitFor();
  assert.equal(await coach.getByRole('button', { name: 'Schedule session', exact: true }).count(), 0);
  console.log('PASS Mobile layout, member receipt ownership and coach schedule');
  assert.deepEqual(errors, [], `Browser runtime errors: ${errors.join('; ')}`);
  console.log(`Browser verification passed. Screenshots: ${artifacts}`);
} catch (error) {
  console.error(error);
  if (browser) for (const [i, context] of browser.contexts().entries()) for (const [j, page] of context.pages().entries()) await page.screenshot({ path: join(artifacts, `failure-${i}-${j}.png`), fullPage: true }).catch(() => {});
  console.error(`Screenshots: ${artifacts}`);
  writeFileSync(join(artifacts, 'server.log'), logs);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const child of children) child.kill();
  // Keep screenshots, remove credentials and database after the child processes exit.
  await Promise.all(children.map(child => new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve))));
  for (const file of ['fixture.json', 'qa.db', 'qa.db-journal', 'qa.db-wal', 'qa.db-shm']) rmSync(join(temp, file), { force: true });
}
