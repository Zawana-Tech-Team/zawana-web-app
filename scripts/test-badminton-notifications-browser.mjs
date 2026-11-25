import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
const require = createRequire(new URL('../tooling/gym/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const previewDir = join(tmpdir(), 'zawana-badminton-fo-preview'); mkdirSync(previewDir, { recursive: true });
const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port; await new Promise(resolve => server.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, env: { ...process.env, VITE_AUTH_MODE: 'database', VITE_API_URL: `${origin}/api` }, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 150; i++) { if (await fetch(origin).then(r => r.ok).catch(() => false)) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  for (const role of ['admin', 'badminton_fo']) for (const mobile of [false, true]) {
    const base = role === 'admin' ? '/admin' : '/badminton-fo';
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 640 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference' });
    await context.addInitScript(() => { localStorage.setItem('zawana_access_token', 'isolated-ui-fixture'); localStorage.setItem('zawana_language', 'en'); });
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    context.on('page', popup => { if (popup !== page) errors.push('Unexpected payment popup'); });
    page.on('request', request => { if (request.isNavigationRequest() && !request.url().startsWith(origin)) external.push(request.url()); });
    let rows = ['booking', 'payment', 'membership'].map((type, index) => ({ id: `notice-${index}`, title: `QA ${type} update`, body: `Badminton ${type} details for the front desk.`, type, read: index !== 2 ? false : true, createdAt: '2026-11-14T07:30:00Z', audience: role, link: `${base}/notifications`, actionLabel: 'View details', activeInInbox: true }));
    let failRead = true, failLoad = false, readCalls = 0;
    await context.route(`${origin}/api/**`, async route => {
      const path = new URL(route.request().url()).pathname; let body = [];
      if (path === '/api/auth/me') body = { id: 'fo-1', name: 'QA Front Office', email: 'fo@example.test', role };
      else if (path === '/api/notifications') {
        if (failLoad) return route.fulfill({ status: 503, json: { message: 'QA inbox unavailable' } });
        body = rows;
      } else if (path === '/api/notifications/read') {
        readCalls++; const { ids } = route.request().postDataJSON(); assert.ok(ids.length >= 1 && ids.length <= 6); assert.ok(ids.every(id => rows.some(row => row.id === id)));
        await new Promise(resolve => setTimeout(resolve, 150));
        if (failRead) return route.fulfill({ status: 503, json: { message: 'QA read failed' } });
        rows = rows.filter(row => !ids.includes(row.id)); body = { removedIds: ids };
      } else if (path === '/api/transactions') body = new URL(route.request().url()).searchParams.has('page') ? { data: [], pagination: { total: 0, totalPages: 0 } } : [];
      await route.fulfill({ json: body });
    });
    await page.goto(`${origin}${base}/notifications`);
    await page.getByRole('heading', { name: /QA booking update/ }).waitFor({ timeout: 15000 }).catch(async error => { console.log(JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 1800) })); throw error; });
    const inbox = page.getByRole('region', { name: 'Notification inbox' });
    assert.equal(await inbox.getByRole('listitem').count(), 3);
    const unread = inbox.getByRole('button', { name: /^Unread / });
    await unread.click(); assert.equal(await unread.getAttribute('aria-pressed'), 'true');
    assert.equal(await inbox.getByRole('listitem').count(), 2);
    await unread.click(); assert.equal(await inbox.getByRole('listitem').count(), 3);
    await page.getByLabel('Search notifications').fill('missing');
    await page.getByText('No matching notifications', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    if (mobile) await page.locator('select[aria-label="Notification type"]').selectOption('Payments');
    else { await page.getByRole('combobox', { name: 'Notification type', exact: true }).click(); await page.getByRole('option', { name: 'Payments', exact: true }).click(); }
    assert.equal(await inbox.getByRole('listitem').count(), 1);
    await page.getByLabel('Search notifications').fill('missing');
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    const booking = inbox.getByRole('listitem').filter({ hasText: 'QA booking update' });
    assert.equal(await booking.getByRole('link', { name: 'View details', exact: true }).getAttribute('href'), `${base}/notifications`);
    await booking.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await page.getByText('QA read failed', { exact: true }).waitFor(); assert.equal(readCalls, 1);
    assert.equal(await booking.count(), 1);
    failRead = false; await booking.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await page.getByRole('heading', { name: /QA booking update/ }).waitFor({ state: 'detached' });
    assert.equal(readCalls, 2);
    await page.getByRole('button', { name: /Notifications, 1 unread/ }).waitFor();
    await page.screenshot({ path: `${previewDir}/${role}-notifications-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
    await page.reload(); await page.getByRole('heading', { name: /QA payment update/ }).waitFor();
    assert.equal(await page.getByRole('heading', { name: /QA booking update/ }).count(), 0);
    failLoad = true; await page.getByRole('button', { name: 'Refresh notifications', exact: true }).click();
    await page.getByText('QA inbox unavailable', { exact: true }).waitFor();
    assert.equal(await inbox.getByRole('listitem').count(), 2);
    failLoad = false;
    rows = Array.from({ length: 21 }, (_, i) => ({ id: `paged-${i}`, title: `Paged notice ${i + 1}`, body: 'A booking update with clear details.', type: 'booking', read: false, createdAt: '2026-11-25T07:30:00Z', activeInInbox: true, link: `${base}/notifications` }));
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await inbox.getByRole('heading', { name: /^Paged notice 1\s*Unread$/ }).waitFor();
    assert.equal(await inbox.getByRole('listitem').count(), 20);
    const pagination = inbox.getByRole('navigation', { name: 'Notification pagination' });
    await pagination.getByRole('button', { name: 'Next', exact: true }).click();
    assert.equal(await inbox.getByRole('listitem').count(), 1);
    await inbox.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await inbox.getByRole('heading', { name: /^Paged notice 1\s*Unread$/ }).waitFor();
    assert.equal(await inbox.getByRole('listitem').count(), 20);
    assert.equal(await pagination.getByRole('button', { name: 'Next', exact: true }).isDisabled(), true);
    // Compact preview retains its own scroll area, accessible controls and role-correct inbox link.
    await page.evaluate(() => window.dispatchEvent(new Event('zawana-notifications-refresh')));
    await page.getByRole('button', { name: 'Notifications, 20 unread', exact: true }).waitFor();
    await page.getByRole('button', { name: /^Notifications, / }).click();
    const panel = page.getByRole('region', { name: 'Notifications', exact: true });
    assert.equal(await panel.locator('[data-notification-id]').count(), 6);
    assert.equal(await panel.getByRole('link', { name: 'View all notifications' }).getAttribute('href'), `${base}/notifications`);
    const sound = panel.getByRole('button', { name: 'Turn sound on', exact: true });
    await sound.click(); await panel.getByRole('button', { name: 'Turn sound off', exact: true }).waitFor();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForFunction(() => { const r = document.querySelector('#notification-panel')?.getBoundingClientRect(); return r && r.x >= 0 && r.right <= innerWidth + 1 && r.y >= 0 && r.bottom <= innerHeight; });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (!mobile && (width === 390 || width === 1440)) await page.screenshot({ path: `${previewDir}/${role}-notification-preview-${width}.png` });
    }
    await page.screenshot({ path: `${previewDir}/${role}-notification-preview-${mobile ? 'mobile' : 'desktop'}.png` });
    await page.keyboard.press('Escape'); await panel.waitFor({ state: 'hidden' });
    assert.match(await page.locator(':focus').getAttribute('aria-label'), /^Notifications/);
    rows = []; await page.getByRole('button', { name: 'Refresh notifications', exact: true }).click();
    await page.getByText(role === 'badminton_fo' ? 'New badminton booking, package and payment updates will appear here.' : 'New operational updates will appear here.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(`${mobile ? 'Mobile' : 'Desktop'} ${role} notifications: filters, dismissal failure/retry, pagination, bell synchronization, responsive preview, sound, keyboard focus, reload, loading error and empty state passed.`);
    await context.close();
  }
} finally { await browser?.close(); vite.kill(); }
