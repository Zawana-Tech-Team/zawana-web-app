import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const require = createRequire(new URL('../tooling/gym/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = resolve(new URL('..', import.meta.url).pathname);
const artifacts = mkdtempSync(join(tmpdir(), 'zawana-responsive-qa-'));
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const url = process.env.RESPONSIVE_QA_URL || `http://127.0.0.1:${port}`;
const errors = [], results = [];
let browser, child;
const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
const ready = page => page.waitForFunction(() => document.querySelector('.journey-pin[data-renderer="webgl"]') || document.querySelector('.journey-still[data-reason="compact-viewport"]'));
const chapterTo = async (page, value) => {
  await page.evaluate(value => {
    const track = document.querySelector('.cinematic-journey');
    scrollTo({ top: track.getBoundingClientRect().top + scrollY + (track.offsetHeight - innerHeight) * value, behavior: 'instant' });
  }, value);
  await page.waitForFunction(value => Math.abs(Number(document.querySelector('.journey-pin').dataset.progress || 0) - value) < .002, value);
  await page.waitForTimeout(650);
};
try {
  if (!process.env.RESPONSIVE_QA_URL) child = spawn(join(root, 'node_modules/.bin/vite'), ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    if (await fetch(url).then(response => response.ok).catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...(process.env.RESPONSIVE_BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.RESPONSIVE_BROWSER_EXECUTABLE_PATH } : existsSync(chrome) ? { executablePath: chrome } : {}) });
  const createPage = async (width, height) => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const content = [{ id: 'qa-story', title: 'QA community story with a longer headline that needs to wrap', description: 'Browser-only content used to check the responsive story layout.', image: '/facilities/court.webp', googleFormLink: '', status: 'published', publishDate: '2026-10-19' }];
      return route.fulfill({ status: path.endsWith('/auth/me') ? 401 : 200, contentType: 'application/json', body: JSON.stringify(path.endsWith('/content') ? content : []) });
    });
    return page;
  };
  for (const [width, height] of [[320,568],[320,640],[360,640],[375,667],[390,844],[414,736],[480,640],[600,650],[600,800],[767,701],[768,650],[768,1024],[1024,700],[1024,701],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080],[844,390],[915,412]]) {
    const page = await createPage(width, height);
    await page.goto(url); await ready(page); await page.evaluate(() => document.fonts.ready);
    const cinematic = Boolean(await page.locator('.journey-pin').count());
    const measurements = [];
    if (cinematic) {
      for (const progress of [0,.23,.43,.68,.9]) {
        await chapterTo(page, progress);
        const metrics = await page.evaluate(() => {
          const content = document.querySelector('.journey-chapter[aria-hidden="false"] .journey-chapter__inner');
          const box = content.getBoundingClientRect(), header = document.querySelector('.public-header').getBoundingClientRect(), controls = document.querySelector('.journey-controls').getBoundingClientRect();
          return { chapter: document.querySelector('.journey-pin').dataset.chapter, top: box.top, bottom: box.bottom, header: header.bottom, controls: controls.top,
            clipped: [...content.querySelectorAll('.journey-text-mask')].some(mask => mask.firstElementChild.getBoundingClientRect().right > mask.getBoundingClientRect().right + 1),
            linksFit: [...content.querySelectorAll('a')].every(link => { const rect = link.getBoundingClientRect(); return rect.left >= -1 && rect.right <= innerWidth + 1 && rect.bottom < controls.top; }) };
        });
        assert.ok(metrics.top >= metrics.header + 8, `${width}×${height} ${metrics.chapter}: content clears fixed header`);
        assert.ok(metrics.bottom <= metrics.controls - 8, `${width}×${height} ${metrics.chapter}: content clears chapter controls`);
        assert.ok(!metrics.clipped && metrics.linksFit, `${width}×${height}: headlines and actions fit`);
        measurements.push(metrics);
        if (progress === 0 || progress === .9) await page.screenshot({ path: join(artifacts, `${width}-${height}-${progress === 0 ? 'hero' : 'booking'}.png`) });
      }
    } else {
      assert.ok(height <= 600 || (width >= 480 && height <= 700));
      assert.equal(await page.locator('.journey-chapter[aria-hidden="false"]').count(), 5);
      if (width >= 600) await page.locator('.public-header').getByRole('link', { name: /Book a court/i }).waitFor({ state: 'visible' });
      await page.screenshot({ path: join(artifacts, `${width}-${height}-still.png`) });
    }
    await noOverflow(page);
    await page.locator('#ecosystem').scrollIntoViewIfNeeded();
    await page.getByRole('tab', { name: /ZAWANA CAFE/ }).click();
    if (width <= 767) {
      await page.waitForFunction(() => {
        const button = document.querySelector('.campaign-services__menu [aria-selected="true"]'), menu = button.parentElement.getBoundingClientRect(), rect = button.getBoundingClientRect();
        return rect.left >= menu.left - 1 && rect.right <= menu.right + 1;
      });
    }
    const sectionColors = await page.evaluate(() => ({ arena: getComputedStyle(document.querySelector('.campaign-arena')).backgroundColor, accent: getComputedStyle(document.querySelector('.campaign-arena__heading h2 span')).color }));
    assert.deepEqual(sectionColors, { arena: 'rgb(22, 24, 25)', accent: 'rgb(198, 163, 74)' });
    const serviceImage = page.locator('.campaign-service-panel__image img');
    await serviceImage.scrollIntoViewIfNeeded();
    await serviceImage.evaluate(image => image.decode());
    assert.ok(await serviceImage.evaluate(image => image.naturalWidth > 0), 'Selected facility photograph loads');
    await page.screenshot({ path: join(artifacts, `${width}-${height}-services.png`) });
    await page.locator('.public-footer').scrollIntoViewIfNeeded(); await noOverflow(page);
    if (width < 1100) {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      const menu = page.getByRole('dialog');
      await menu.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const close = await menu.getByRole('button', { name: 'Close menu', exact: true }).boundingBox();
      assert.ok(close.y >= 0 && close.y + close.height <= height, 'Menu close remains visible while scrolling');
      await page.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' });
    }
    results.push({ width, height, cinematic, measurements });
    console.log(`PASS ${width}×${height}: chapter fit, controls, services, menu, footer and gold theme`);
    await page.context().close();
  }
  const rotation = await createPage(390, 844);
  await rotation.goto(url); await ready(rotation);
  await rotation.getByRole('tab', { name: /ZAWANA CAFE/ }).click();
  for (const viewport of [{ width: 600, height: 800 }, { width: 1024, height: 768 }, { width: 360, height: 640 }]) {
    await rotation.setViewportSize(viewport);
    await rotation.waitForTimeout(200);
    await rotation.getByRole('tab', { name: /ZAWANA CAFE/ }).waitFor();
    if (viewport.width < 768) assert.ok(await rotation.getByRole('tab', { name: /ZAWANA CAFE/ }).evaluate(button => { const box = button.getBoundingClientRect(), menu = button.parentElement.getBoundingClientRect(); return box.left >= menu.left - 1 && box.right <= menu.right + 1; }));
  }
  await rotation.setViewportSize({ width: 844, height: 390 });
  await rotation.locator('.journey-still[data-reason="compact-viewport"]').waitFor();
  await rotation.setViewportSize({ width: 390, height: 844 }); await ready(rotation);
  await rotation.locator('canvas').waitFor();
  console.log('PASS Orientation changes and selected service preservation');
  assert.deepEqual(errors, []);
  writeFileSync(join(artifacts, 'report.json'), JSON.stringify({ results, errors, limits: 'Desktop Chrome viewport emulation; public API content uses browser-only fixtures.' }, null, 2));
  console.log(`Screenshots and report: ${artifacts}`);
} finally {
  await browser?.close();
  if (child) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve)); }
}
