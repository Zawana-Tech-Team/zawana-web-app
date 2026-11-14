import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(new URL('../tooling/gym/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const artifacts = join(tmpdir(), 'zawana-public-navigation-preview'); mkdirSync(artifacts, { recursive: true });
const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port; await new Promise(resolve => server.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, VITE_AUTH_MODE: 'database', VITE_API_URL: `${origin}/api` }, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 150; i++) { if (await fetch(origin).then(r => r.ok).catch(() => false)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 1000 }, { width: 390, height: 844 }, { width: 740, height: 600 }]) {
    const mobile = viewport.width < 1100;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route(`${origin}/api/**`, route => {
      const path = new URL(route.request().url()).pathname;
      const stories = [{ id: 'qa-story', title: 'QA Tournament success', description: 'Our community on court.', category: 'Tournaments', publishDate: '2026-11-01', image: '/facilities/responsive/court-1280.webp' }, { id: 'qa-community', title: 'QA Community day', description: 'Progress together.', category: 'Community', publishDate: '2026-11-02', image: '/facilities/responsive/court-1280.webp' }];
      const body = path === '/api/public/coaches' ? [{ id: 'qa-coach', name: 'QA Badminton Coach', specialty: 'Technique', imageUrl: '' }]
        : path === '/api/achievements' ? stories : path === '/api/achievements/qa-story' ? { ...stories[0], body: 'QA full story body.', status: 'published', kind: 'achievement' } : [];
      return route.fulfill({ json: body });
    });
    await page.goto(`${origin}/coaches`);
    await page.getByRole('heading', { name: 'QA Badminton Coach', exact: true }).waitFor();
    const headerSize = await page.locator('.public-header').evaluate(element => element.getBoundingClientRect().height);
    const navigate = async label => {
      if (!mobile) { await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: label, exact: true }).click(); return; }
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      const menu = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
      const current = menu.locator('a[aria-current="page"]'); assert.equal(await current.count(), 1);
      await menu.getByRole('link', { name: new RegExp(label) }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
    };
    if (!mobile) assert.equal(await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Coaches', exact: true }).getAttribute('aria-current'), 'page');
    await page.getByLabel('Search coaches').fill('missing');
    await page.getByRole('heading', { name: 'No coaches found.', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await page.screenshot({ path: join(artifacts, `coaches-${viewport.width}.png`), fullPage: true });
    await navigate('Achievements');
    await page.getByRole('heading', { name: 'QA Tournament success', exact: true }).waitFor();
    assert.equal(await page.locator('.public-header').evaluate(element => element.getBoundingClientRect().height), headerSize);
    if (!mobile) assert.equal(await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Achievements', exact: true }).getAttribute('aria-current'), 'page');
    const filters = page.getByRole('group', { name: 'Filter achievement stories' });
    await filters.getByRole('button', { name: 'Community', exact: true }).click();
    assert.equal(await filters.getByRole('button', { name: 'Community', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('heading', { name: 'QA Tournament success', exact: true }).count(), 0);
    await filters.getByRole('button', { name: 'All stories', exact: true }).click();
    await page.getByLabel('Search achievements').fill('Tournament');
    await page.getByRole('link', { name: 'Read story: QA Tournament success', exact: true }).click();
    await page.getByRole('heading', { name: 'QA Tournament success', exact: true }).waitFor();
    if (!mobile) assert.equal(await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Achievements', exact: true }).getAttribute('aria-current'), 'page');
    await page.goto(`${origin}/achievements`);
    await page.getByRole('heading', { name: 'QA Community day', exact: true }).waitFor();
    await page.screenshot({ path: join(artifacts, `achievements-${viewport.width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await navigate('Coaches');
    await page.getByRole('heading', { name: 'QA Badminton Coach', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}x${viewport.height}: active navigation, route changes, coach search, achievement filters and articles; no overflow or browser errors.`);
    await context.close();
  }
} finally { await browser?.close(); vite.kill(); }
