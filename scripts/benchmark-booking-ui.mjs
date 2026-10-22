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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(token => localStorage.setItem('zawana_access_token', token), data.token);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const measure = async selector => {
    const samples = [];
    for (let i = 0; i < 15; i++) {
      samples.push(await page.evaluate(async selector => {
        const start = performance.now();
        document.querySelector(selector).click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now() - start;
      }, selector));
    }
    samples.sort((a, b) => a - b);
    return { medianMs: Math.round(samples[7]), p95Ms: Math.round(samples[14]) };
  };
  await page.goto(`${ui}/book/court`);
  await page.getByRole('button', { name: 'Next month' }).waitFor();
  await page.waitForTimeout(1000);
  const court = await measure('button[aria-label="Preferred time 8:00 AM — 9:00 AM"]');
  await page.goto(`${ui}/private-course`);
  await page.getByRole('button', { name: `Select ${data.course.title}`, exact: true }).click();
  await page.getByRole('button', { name: `Select coach ${data.coach.name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Choose a date', exact: true }).click();
  const label = new Date(`${data.dates[0]}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: 'Choose a court', exact: true }).click();
  await page.getByRole('region', { name: '2nd floor', exact: true }).getByRole('button', { name: /Court 1/ }).click();
  await page.getByRole('button', { name: 'Court 1, 8:00 AM — 9:30 AM, Available', exact: true }).waitFor();
  const privateCourse = await measure('button[aria-label^="Court 1, 8:00 AM"]');
  console.log(JSON.stringify({ court, privateCourse, cpuThrottle: 4 }));
} finally {
  await browser?.close();
  for (const child of children) child.kill('SIGTERM');
  rmSync(temp, { recursive: true, force: true });
}
