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
const temp = mkdtempSync(join(tmpdir(), 'zawana-content-browser-'));
const artifacts = process.env.CONTENT_QA_ARTIFACT_DIR || join(temp, 'artifacts');
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
const env = { ...process.env, DATABASE_URL: `file:${database}`, NODE_ENV: 'test', AUTH_MODE: 'database', JWT_SECRET: 'content-qa-session-key-more-than-thirty-two-characters', PORT: String(apiPort), CLIENT_URL: ui, PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`, VITE_API_URL: api, VITE_AUTH_MODE: 'database', CONTENT_QA_FIXTURE_PATH: fixture };
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
  execFileSync(join(root, 'backend/node_modules/.bin/tsx'), ['tests/content-browser-fixture.ts'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  const data = JSON.parse(readFileSync(fixture, 'utf8'));
  start(join(root, 'backend/node_modules/.bin/tsx'), ['src/server.ts'], join(root, 'backend'));
  start(join(root, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], root);
  await Promise.all([ready(`${api}/health`), ready(ui)]);
  const request = async (path, { token, body, method = 'GET' } = {}) => fetch(`${api}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {})
  });
  const stories = await (await request('/achievements')).json();
  assert.deepEqual(stories.map(story => story.id), [data.live.id]);
  for (const hidden of [data.draft, data.scheduled, data.community])
    assert.equal((await request(`/achievements/${hidden.id}`)).status, 404);
  assert.deepEqual((await (await request('/content')).json()).map(story => story.id), [data.community.id]);
  const coaches = await (await request('/public/coaches')).json();
  assert.deepEqual(coaches.map(coach => coach.name), ['Aye Badminton']);
  assert.ok(coaches.every(coach => !('email' in coach) && !('phone' in coach) && !('user' in coach)));
  assert.equal((await request('/content', { method: 'POST', body: {} })).status, 401);
  assert.equal((await request('/content', { method: 'POST', token: data.tokens.member, body: {} })).status, 403);
  assert.equal((await request('/content', { method: 'POST', token: data.tokens.admin, body: { title: 'Invalid', kind: 'achievement', status: 'published', publishDate: '2026-02-30' } })).status, 400);
  console.log('PASS Public visibility, coach selection, privacy, authorization and validation');

  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(process.env.CONTENT_BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.CONTENT_BROWSER_EXECUTABLE_PATH } : existsSync(chrome) ? { executablePath: chrome } : {}) });
  const newPage = async (token, viewport = { width: 1440, height: 1000 }) => {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    if (token) await context.addInitScript(value => localStorage.setItem('zawana_access_token', value), token);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    return page;
  };
  const admin = await newPage(data.tokens.admin);
  await admin.goto(`${ui}/admin/cms`);
  await admin.getByRole('button', { name: 'New achievement', exact: true }).click();
  await admin.getByLabel('Story title').fill('Training together. Achieving together.');
  await admin.getByLabel('Story summary').fill('A new milestone for the ZAWANA badminton academy.');
  await admin.getByLabel('Full article').fill('Dedication made this achievement possible.\n\nOur players returned to the court with renewed confidence.');
  const upload = admin.waitForResponse(response => response.url().endsWith('/media/images') && response.request().method() === 'POST');
  await admin.locator('input[type=file]').setInputFiles(join(root, 'public/facilities/court.webp'));
  const uploadData = await (await upload).json();
  uploadedFiles.push(join(root, 'backend', uploadData.url));
  await admin.getByRole('button', { name: 'Save story', exact: true }).click();
  await admin.getByRole('dialog').waitFor({ state: 'hidden' });
  const row = admin.getByRole('row').filter({ hasText: 'Training together. Achieving together.' });
  await row.waitFor();
  assert.ok(await row.getByText('Draft', { exact: true }).count());
  const draft = (await (await request('/admin/content', { token: data.tokens.admin })).json()).find(story => story.title === 'Training together. Achieving together.');
  assert.equal((await request(`/achievements/${draft.id}`)).status, 404);
  await row.getByRole('button', { name: 'Publish now', exact: true }).click();
  await row.getByText('Live', { exact: true }).waitFor();
  assert.equal((await request(`/achievements/${draft.id}`)).status, 200);
  console.log('PASS Admin creates a draft with uploaded cover image and publishes a full article');

  const reader = await newPage();
  await reader.goto(`${ui}/achievements`);
  await reader.getByRole('heading', { name: 'Training together. Achieving together.', exact: true }).waitFor();
  await reader.screenshot({ path: join(artifacts, 'achievements-desktop.png'), fullPage: true });
  await reader.getByRole('button', { name: 'Tournaments', exact: true }).click();
  await reader.getByRole('heading', { name: data.live.title, exact: true }).waitFor();
  assert.equal(await reader.getByRole('heading', { name: draft.title, exact: true }).count(), 0);
  await reader.getByRole('button', { name: 'All stories', exact: true }).click();
  await reader.getByLabel('Search achievements').fill('Training together');
  await reader.getByRole('link', { name: `Read story: ${draft.title}` }).click();
  await reader.getByRole('heading', { name: draft.title, exact: true }).waitFor();
  await reader.getByText('Our players returned to the court with renewed confidence.', { exact: true }).waitFor();
  assert.ok(await reader.getByRole('img', { name: draft.title, exact: true }).evaluate(image => image.complete && image.naturalWidth > 0));
  await reader.reload();
  await reader.getByRole('heading', { name: draft.title, exact: true }).waitFor();
  await reader.screenshot({ path: join(artifacts, 'article-desktop.png'), fullPage: true });
  await reader.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Coaches', exact: true }).click();
  await reader.getByRole('heading', { name: 'Aye Badminton', exact: true }).waitFor();
  await reader.getByLabel('Search coaches').fill('not a coach');
  await reader.getByRole('heading', { name: 'No coaches found.', exact: true }).waitFor();
  await reader.getByRole('button', { name: 'Clear search', exact: true }).click();
  await reader.getByRole('heading', { name: 'Aye Badminton', exact: true }).waitFor();
  await reader.screenshot({ path: join(artifacts, 'coaches-desktop.png'), fullPage: true });
  console.log('PASS Anonymous journal browsing, filters, search, full article, image loading, reload and coach directory');

  const mobile = await newPage(null, { width: 390, height: 844 });
  await mobile.goto(`${ui}/achievements`);
  await mobile.getByRole('heading', { name: draft.title, exact: true }).waitFor();
  await mobile.screenshot({ path: join(artifacts, 'achievements-mobile.png'), fullPage: true });
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.getByRole('button', { name: 'Open menu', exact: true }).click();
  await mobile.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('link', { name: /Coaches/ }).click();
  await mobile.getByRole('heading', { name: 'Aye Badminton', exact: true }).waitFor();
  await mobile.getByRole('dialog').waitFor({ state: 'hidden' });
  await mobile.screenshot({ path: join(artifacts, 'coaches-mobile.png'), fullPage: true });
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.getByRole('button', { name: 'Open menu', exact: true }).click();
  await mobile.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('link', { name: /The Arena/ }).click();
  await mobile.locator('#arena').waitFor();
  assert.equal(new URL(mobile.url()).hash, '#arena');
  console.log('PASS Responsive layouts and mobile navigation between pages and back to landing sections');

  await request(`/content/${draft.id}`, { method: 'PATCH', token: data.tokens.admin, body: { status: 'draft' } });
  await reader.goto(`${ui}/achievements/${draft.id}`);
  await reader.getByRole('heading', { name: 'This story is not available.', exact: true }).waitFor();
  await request(`/content/${draft.id}`, { method: 'DELETE', token: data.tokens.admin });
  assert.equal((await request(`/achievements/${draft.id}`)).status, 404);
  await reader.route('**/api/achievements', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await reader.goto(`${ui}/achievements`);
  await reader.getByRole('heading', { name: 'Great stories are on their way.', exact: true }).waitFor();
  await reader.unroute('**/api/achievements');
  await reader.route('**/api/achievements', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Unavailable"}' }));
  await reader.reload();
  await reader.getByRole('heading', { name: 'Temporarily unavailable', exact: true }).waitFor();
  await reader.unroute('**/api/achievements');
  await reader.getByRole('button', { name: 'Try again', exact: true }).click();
  await reader.getByRole('heading', { name: data.live.title, exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS Unpublishing, deletion, empty states, error recovery and no browser runtime errors');
  console.log(`Screenshots: ${artifacts}`);
} catch (error) {
  console.error(logs.slice(-5000));
  throw error;
} finally {
  await browser?.close();
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(children.map(child => child.exitCode !== null ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve))));
  for (const file of uploadedFiles) rmSync(file, { force: true });
  rmSync(database, { force: true });
  rmSync(fixture, { force: true });
}
