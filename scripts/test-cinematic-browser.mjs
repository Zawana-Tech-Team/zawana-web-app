import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const require = createRequire(new URL('../tooling/gym/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = resolve(new URL('..', import.meta.url).pathname);
const artifacts = process.env.CINEMATIC_QA_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), 'zawana-cinematic-qa-'));
mkdirSync(artifacts, { recursive: true });
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const url = process.env.CINEMATIC_QA_URL || `http://127.0.0.1:${port}`;
let child, browser, logs = '';
const errors = [], report = [];
const capture = async (page, name) => page.screenshot({ path: join(artifacts, `${name}.png`), animations: 'disabled' });
const progressTo = async (page, progress) => {
  await page.evaluate(value => {
    const track = document.querySelector('.cinematic-journey');
    const top = track.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (track.offsetHeight - innerHeight) * value, behavior: 'instant' });
  }, progress);
  await page.waitForFunction(value => Math.abs(Number(document.querySelector('.journey-pin')?.dataset.progress || 0) - value) < .002, progress);
  await page.waitForTimeout(700);
};
try {
  if (!process.env.CINEMATIC_QA_URL) {
    child = spawn(join(root, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => logs += data); child.stderr.on('data', data => logs += data);
  }
  for (let i = 0; i < 120; i++) {
    if (await fetch(url).then(response => response.ok).catch(() => false)) break;
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...(process.env.CINEMATIC_BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.CINEMATIC_BROWSER_EXECUTABLE_PATH } : existsSync(chrome) ? { executablePath: chrome } : {}) });
  const newPage = async (viewport, reducedMotion = 'no-preference', init) => {
    const context = await browser.newContext({ viewport, reducedMotion });
    if (init) await context.addInitScript(init);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      // Only public content is stubbed. No business writes or booking simulations.
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({ status: path.endsWith('/auth/me') ? 401 : 200, contentType: 'application/json', body: path.endsWith('/auth/me') ? '{"message":"Sign in"}' : '[]' });
    });
    return page;
  };
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['tablet', { width: 820, height: 1180 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await newPage(viewport);
    const assets = []; page.on('response', response => { if (response.url().endsWith('shuttlecock.glb')) assets.push(response.status()); });
    await page.goto(url);
    await page.locator('.journey-pin[data-renderer="webgl"]').waitFor({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    assert.equal(await page.getByRole('heading', { level: 1, name: 'BEYOND THE GAME.', exact: true }).count(), 1);
    assert.ok(await page.locator('.public-header img').evaluate(image => image.src.endsWith('/logo.png') && image.naturalWidth > 0));
    const snapshots = [];
    for (const progress of [0, .2, .3, .4, .65, .85, 1]) {
      await progressTo(page, progress);
      const data = await page.locator('.journey-pin').evaluate(node => ({ ...node.dataset }));
      const expected = progress < .2 ? 'reveal' : progress < .4 ? 'impact' : progress < .65 ? 'arena' : progress < .85 ? 'explore' : 'book';
      assert.equal(data.chapter, expected, `${name} correct chapter at ${progress}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const heading = page.locator('.journey-chapter[aria-hidden="false"] .journey-headline');
      const bounds = await heading.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1, `${name} heading fits at ${progress}`);
      await capture(page, `${name}-${Math.round(progress * 100)}`);
      snapshots.push({ progress, chapter: data.chapter, renderer: data.renderer });
    }
    for (const progress of [.85, .65, .4, .2, 0]) await progressTo(page, progress);
    await capture(page, `${name}-reverse-0`);
    assert.equal(await page.locator('.journey-pin').getAttribute('data-chapter'), 'reveal');
    await page.waitForTimeout(600);
    const beforeIdle = Number(await page.locator('canvas').getAttribute('data-frames'));
    await page.waitForTimeout(700);
    const afterIdle = Number(await page.locator('canvas').getAttribute('data-frames'));
    assert.ok(afterIdle - beforeIdle <= 2, `${name} renderer stops at rest`);
    await page.locator('#ecosystem').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.journey-pin').getAttribute('data-active'), 'false');
    const offscreen = Number(await page.locator('canvas').getAttribute('data-frames'));
    await page.waitForTimeout(400);
    assert.equal(Number(await page.locator('canvas').getAttribute('data-frames')), offscreen);
    for (const name of ['HIGH PERFORMANCE GYM', 'REVIVE CLINIC', 'SPORTS STORE', 'ZAWANA CAFE', 'BADMINTON']) {
      await page.getByRole('tab', { name: new RegExp(name) }).click();
      assert.equal(await page.getByRole('tab', { name: new RegExp(name) }).getAttribute('aria-selected'), 'true');
    }
    await page.getByRole('tab', { name: /BADMINTON/ }).focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.getByRole('tab', { name: /HIGH PERFORMANCE GYM/ }).getAttribute('aria-selected'), 'true');
    if (viewport.width <= 767) assert.ok(await page.getByRole('tab', { name: /HIGH PERFORMANCE GYM/ }).evaluate(button => {
      const item = button.getBoundingClientRect(), menu = button.parentElement.getBoundingClientRect();
      return item.left >= menu.left - 1 && item.right <= menu.right + 1;
    }), 'Selected mobile service tab stays fully visible');
    await capture(page, `${name}-services`);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(500);
    const booking = page.locator('.journey-chapter--reveal').getByRole('link', { name: 'Book a Court', exact: true });
    assert.equal(await booking.getAttribute('href'), '/book/court');
    await booking.click();
    await page.waitForURL('**/login');
    assert.equal(await page.locator('canvas').count(), 0);
    await page.goBack();
    await page.locator('.journey-pin[data-renderer="webgl"]').waitFor();
    await page.waitForTimeout(500);
    if (viewport.width < 1100) {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await page.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('link', { name: /Achievements/ }).click();
    } else await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Achievements', exact: true }).click();
    await page.waitForURL('**/achievements');
    await page.goBack();
    await page.locator('.journey-pin[data-renderer="webgl"]').waitFor();
    assert.ok(assets.includes(200), 'GLB loads successfully');
    report.push({ name, viewport, snapshots, idleFrames: afterIdle - beforeIdle, reversed: true, bookingGuard: 'login', navigation: 'passed' });
    console.log(`PASS ${name}: all chapter boundaries, shuttle pass, reverse scroll, idle/offscreen rendering, services, booking and route return`);
    await page.context().close();
  }
  for (const [name, init, reduced] of [
    ['reduced-motion', undefined, 'reduce'],
    ['data-saving', () => Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }), 'no-preference'],
  ]) {
    const page = await newPage({ width: 390, height: 844 }, reduced, init);
    await page.goto(url);
    await page.locator('.journey-pin[data-renderer="webgl"]').waitFor();
    assert.equal(await page.locator('[data-experience="still"]').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Use still experience' }).count(), 0);
    await progressTo(page, .65); await progressTo(page, 0);
    assert.equal(await page.locator('.journey-pin').getAttribute('data-chapter'), 'reveal');
    console.log(`PASS ${name}: cinematic rendering and reverse scroll remain active`);
    await page.context().close();
  }
  const unavailable = await newPage({ width: 1440, height: 1000 }, 'no-preference', () => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return String(type).includes('webgl') ? null : original.call(this, type, ...args); };
  });
  await unavailable.goto(url);
  await unavailable.locator('[data-experience="fallback"]').waitFor();
  assert.equal(await unavailable.locator('[data-experience="still"]').count(), 0);
  assert.equal(await unavailable.locator('.journey-photo-backdrop').count(), 0);
  for (const width of [1440, 768, 390, 320]) {
    await unavailable.setViewportSize({ width, height: 844 });
    await unavailable.evaluate(() => document.fonts.ready);
    await unavailable.locator('.arena-editorial__photo').evaluate(img => img.decode());
    assert.ok(await unavailable.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const cta = unavailable.locator('.arena-editorial').getByRole('link', { name: 'Book a Court', exact: true });
    assert.equal(await cta.getAttribute('href'), '/book/court');
    await capture(unavailable, `premium-fallback-${width}`);
  }
  await unavailable.locator('.arena-editorial').getByRole('link', { name: 'Book a Court', exact: true }).click();
  await unavailable.waitForURL('**/login');
  await unavailable.context().close();
  const lost = await newPage({ width: 1440, height: 1000 });
  await lost.goto(url);
  await lost.locator('.journey-pin[data-renderer="webgl"]').waitFor();
  await lost.locator('canvas').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await lost.locator('[data-experience="fallback"]').waitFor();
  assert.equal(await lost.locator('[data-experience="still"]').count(), 0);
  await lost.getByRole('button', { name: 'Explore in 3D' }).click();
  await lost.locator('.journey-pin[data-renderer="webgl"]').waitFor();
  console.log('PASS Premium fallback at four widths, booking navigation and recovery after context loss');
  const tiny = await newPage({ width: 320, height: 640 });
  await tiny.goto(url);
  await tiny.locator('.journey-pin[data-renderer="webgl"]').waitFor();
  for (const progress of [0, .65, 1]) { await progressTo(tiny, progress); await capture(tiny, `small-mobile-${Math.round(progress * 100)}`); assert.ok(await tiny.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
  console.log('PASS 320px mobile layout');
  assert.deepEqual(errors, []);
  writeFileSync(join(artifacts, 'report.json'), JSON.stringify({ url, report, runtimeErrors: errors, limits: 'Desktop Chrome with SwiftShader; not a physical Android/iOS performance measurement. Public content API responses use empty fixtures. No backend or booking writes.' }, null, 2));
  console.log(`Screenshots and report: ${artifacts}`);
} catch (error) {
  console.error(logs.slice(-3000));
  throw error;
} finally {
  await browser?.close();
  if (child) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve)); }
}
