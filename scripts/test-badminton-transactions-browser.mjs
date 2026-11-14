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
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 640 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference' });
    await context.addInitScript(() => { localStorage.setItem('zawana_access_token', 'isolated-ui-fixture'); localStorage.setItem('zawana_language', 'en'); });
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    context.on('page', popup => { if (popup !== page) errors.push('Unexpected payment popup'); });
    page.on('request', request => { if (request.isNavigationRequest() && !request.url().startsWith(origin)) external.push(request.url()); });
    const receipts = ['Court Rental', 'Private Course', 'Badminton Package', 'Weekly Class'].map((category, index) => ({ id: `receipt-${index}`, customer: `QA Customer ${index}`, category, item: `${category} / QA service`, finalAmount: 20000 + index * 1000, amount: 20000 + index * 1000, discount: 0, tax: 0, paymentMethod: index % 2 ? 'Manual (simulated)' : 'Cash', status: 'paid', date: '2026-11-14', createdAt: '2026-11-14T07:30:00Z', staff: 'QA Staff', confirmationMode: index % 2 ? 'SIMULATED' : 'MANUAL', resourceType: 'booking', resourceId: `booking-${index}` }));
    let reject = false, empty = false, lastParams;
    await context.route(`${origin}/api/**`, async route => {
      const url = new URL(route.request().url()); let body = [];
      if (url.pathname === '/api/auth/me') body = { id: 'fo-1', name: 'QA Front Office', email: 'fo@example.test', role: 'badminton_fo' };
      else if (url.pathname === '/api/transactions') {
        if (!url.searchParams.has('page')) return route.fulfill({ json: receipts });
        lastParams = url.searchParams;
        if (reject) return route.fulfill({ status: 503, json: { message: 'QA ledger unavailable' } });
        const data = empty ? [] : receipts.filter(row => !url.searchParams.get('category') || row.category === url.searchParams.get('category'));
        body = { data, pagination: { total: data.length, totalPages: data.length ? 1 : 0 } };
      }
      await route.fulfill({ json: body });
    });
    await page.goto(`${origin}/badminton-fo/transactions`);
    await page.getByRole('button', { name: /QA Customer 0/ }).waitFor({ timeout: 15000 }).catch(async error => { console.log(JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 1800) })); throw error; });
    assert.equal(await page.getByRole('link', { name: 'Court Bookings', exact: true }).count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Course Bookings & Finance', exact: true }).count(), 0);
    await page.getByRole('link', { name: 'Course operations', exact: true }).waitFor();
    const detailTrigger = page.getByRole('button', { name: /QA Customer 1/ });
    await detailTrigger.focus();
    await detailTrigger.click();
    await page.getByRole('dialog', { name: 'Transaction details' }).waitFor();
    await page.getByRole('dialog').getByText(/Simulated confirmation.*no external charge/).waitFor();
    const dialog = page.getByRole('dialog', { name: 'Transaction details' });
    await page.waitForTimeout(300);
    const appearance = await dialog.evaluate(element => { const box = element.getBoundingClientRect(), style = getComputedStyle(element); return { background: style.backgroundColor, overflow: style.overflowY, top: box.top, bottom: box.bottom, viewport: window.innerHeight }; });
    await page.screenshot({ path: `${previewDir}/transaction-dialog-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
    console.log(JSON.stringify({ mobile, appearance }));
    assert.notEqual(appearance.background, 'rgba(0, 0, 0, 0)', 'Receipt dialog must have an opaque surface');
    assert.ok(['auto', 'scroll'].includes(appearance.overflow), 'Long receipt must be scrollable');
    assert.ok(appearance.top >= 8 && appearance.bottom <= appearance.viewport - 8, 'Receipt must remain inside the viewport');
    await dialog.getByRole('link', { name: 'Open course operations' }).scrollIntoViewIfNeeded();
    assert.ok(await dialog.getByRole('link', { name: 'Open course operations' }).isVisible());
    await page.getByRole('button', { name: 'Close transaction details' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.ok(await detailTrigger.evaluate(element => document.activeElement === element), 'Closing restores trigger focus');
    if (mobile) await detailTrigger.click();
    else await page.getByRole('row').filter({ hasText: 'QA Customer 1' }).getByRole('cell').nth(1).click();
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await detailTrigger.click(); await dialog.waitFor();
    await page.locator('.premium-dialog-backdrop').click({ position: { x: 2, y: 2 } });
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');

    async function select(label, value, option) {
      if (mobile) await page.locator(`select[aria-label="${label}"]`).selectOption(value);
      else { await page.getByRole('combobox', { name: label, exact: true }).click(); await page.getByRole('option', { name: option, exact: true }).click(); }
    }
    await select('Transaction category', 'Weekly Class', 'Weekly Class');
    await page.getByRole('button', { name: /QA Customer 3/ }).waitFor();
    assert.equal(lastParams.get('category'), 'Weekly Class');
    assert.equal(await page.getByRole('button', { name: /QA Customer 0/ }).count(), 0);
    await select('Payment method', 'Online Payment', 'Online Payment');
    await page.getByRole('button', { name: /QA Customer 3/ }).waitFor();
    await select('Payment status', 'failed', 'Failed');
    await page.getByRole('button', { name: /QA Customer 3/ }).waitFor();
    await page.getByLabel('From date').fill('2026-11-01');
    await page.getByLabel('To date').fill('2026-11-30');
    await select('Sort transactions', 'amount_desc', 'Amount: highest first');
    await page.getByLabel('Search transactions').fill('QA service');
    await page.getByRole('button', { name: /QA Customer 3/ }).waitFor();
    assert.equal(lastParams.get('paymentMethod'), 'Online Payment');
    assert.equal(lastParams.get('status'), 'failed'); assert.equal(lastParams.get('sort'), 'amount_desc');
    assert.equal(lastParams.get('from'), '2026-11-01'); assert.equal(lastParams.get('to'), '2026-11-30');
    await page.waitForTimeout(350); assert.equal(lastParams.get('q'), 'QA service');
    reject = true; await page.getByRole('button', { name: 'Reset filters' }).click();
    await page.getByText('QA ledger unavailable', { exact: true }).waitFor();
    reject = false; empty = true; await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('No matching transactions', { exact: true }).waitFor();
    empty = false; await page.reload(); await page.getByRole('button', { name: /QA Customer 0/ }).waitFor({ timeout: 15000 }).catch(async error => { console.log(JSON.stringify({ stage: 'reload', mobile, errors, body: (await page.locator('body').innerText()).slice(0, 1800) })); throw error; });
    await page.screenshot({ path: `${previewDir}/badminton-transactions-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(`${mobile ? 'Mobile' : 'Desktop'} badminton transactions: navigation, details, filters, errors and reload passed.`);
    await context.close();
  }
} finally { await browser?.close(); vite.kill(); }
