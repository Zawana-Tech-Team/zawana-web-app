import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
const require = createRequire(new URL('../tooling/gym/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
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
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    await context.addInitScript(() => { localStorage.setItem('zawana_access_token', 'isolated-ui-fixture'); localStorage.setItem('zawana_language', 'en'); });
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    context.on('page', popup => { if (popup !== page) errors.push('Unexpected payment popup'); });
    page.on('request', request => { if (request.isNavigationRequest() && !request.url().startsWith(origin)) external.push(request.url()); });
    let rejectPayment = true, calls = 0;
    const booking = { id: 'booking-1', code: 'ZW-TEST', kind: 'private_course', title: 'Private coaching', date: '2026-12-05', time: '10:00 AM — 11:00 AM', status: 'AWAITING_PAYMENT', paymentStatus: 'pending', price: 50000, location: 'Court 1' };
    const receipt = { id: 'manual-receipt-1', userId: 'member-1', business: 'Badminton', date: '2026-11-13', item: 'Private coaching', finalAmount: 50000, amount: 50000, paymentMethod: 'Manual (simulated)', status: 'paid', confirmationMode: 'SIMULATED' };
    await context.route(`${origin}/api/**`, async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      let body = [];
      if (path === '/api/auth/me') body = { id: 'member-1', name: 'Payment Tester', email: 'tester@example.test', role: 'member' };
      else if (path === '/api/bookings') body = url.search ? { data: [booking], pagination: { page: 1, totalPages: 1, total: 1 }, dateCounts: { all: 1 } } : [booking];
      else if (path === '/api/member/booking-filters') body = { courts: [], coaches: [] };
      else if (path === '/api/transactions') body = { data: booking.paymentStatus === 'paid' ? [receipt] : [], pagination: { total: 1, totalPages: 1 } };
      else if (path === '/api/payments/confirm') {
        calls++; assert.equal(route.request().postDataJSON().confirmed, true);
        await new Promise(resolve => setTimeout(resolve, 150));
        if (rejectPayment) return route.fulfill({ status: 503, json: { message: 'Database unavailable. Payment was not confirmed.' } });
        booking.status = 'CONFIRMED'; booking.paymentStatus = 'paid'; body = { transaction: receipt, message: 'Simulated payment confirmed. No external charge was made.' };
      }
      await route.fulfill({ json: body });
    });
    await page.goto(`${origin}/bookings`);
    await page.locator('details.member-booking-row summary').click();
    await page.getByRole('button', { name: 'Confirm manual payment', exact: true }).click();
    await page.getByRole('dialog', { name: 'Confirm manual payment', exact: true }).getByRole('button', { name: 'Confirm payment', exact: true }).click();
    await page.getByRole('dialog').getByText('Database unavailable. Payment was not confirmed.', { exact: true }).waitFor();
    assert.equal(booking.paymentStatus, 'pending'); assert.equal(page.url(), `${origin}/bookings`);
    rejectPayment = false;
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm payment', exact: true }).click();
    await page.getByText('Manual/simulated payment confirmed. No external charge was made.', { exact: true }).waitFor();
    assert.equal(booking.paymentStatus, 'paid'); assert.equal(calls, 2);
    await page.reload(); assert.equal(await page.getByRole('button', { name: 'Confirm manual payment', exact: true }).count(), 0);
    await page.goto(`${origin}/payments`); await page.getByText('manual-receipt-1 · Manual (simulated)', { exact: true }).waitFor();
    const before = calls;
    await page.evaluate(async () => {
      const { startPayment } = await import('/src/services/paymentFlow.ts');
      const first = startPayment('/payments/confirm', { resourceType: 'booking', resourceId: 'same' });
      const retry = startPayment('/payments/confirm', { resourceType: 'booking', resourceId: 'same' });
      const separate = startPayment('/payments/confirm', { resourceType: 'booking', resourceId: 'different' });
      if (first !== retry || first === separate) throw new Error('Payment deduplication must be scoped to the selected resource');
      await Promise.all([first, retry, separate]);
    });
    assert.equal(calls, before + 2); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${mobile ? 'mobile' : 'desktop'} manual payment, failure recovery, refresh/history, duplicate clicks and zero gateway navigation`);
  }
} finally { await browser?.close(); vite.kill(); }
