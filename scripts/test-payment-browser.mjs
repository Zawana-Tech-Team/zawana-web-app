import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
const require = createRequire(new URL('../tooling/gym/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = new URL('..', import.meta.url).pathname;
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const vite = spawn(root + '/node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root, env: { ...process.env, VITE_AUTH_MODE: 'database', VITE_API_URL: origin + '/api' }, stdio: 'pipe',
});
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (await fetch(origin).then(r => r.ok).catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile });
    await context.addInitScript(() => localStorage.setItem('zawana_access_token', 'test-token'));
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let status = 'PENDING', qrOnly = false, calls = 0, rejectPayment = false, initiating = false;
    const booking = { id: 'booking-1', code: 'ZW-TEST', kind: 'private_course', title: 'Private coaching', date: '2026-12-05', time: '10:00 AM — 11:00 AM', status: 'AWAITING_PAYMENT', paymentStatus: 'pending', price: 50000, location: 'Court 1' };
    const attempt = () => ({ id: 'attempt-1', reference: 'KP-TEST', resourceType: 'private_course', amount: 50000, currency: 'MMK', status, expiresAt: '2026-12-06T12:00:00Z', checkoutUrl: qrOnly ? '' : 'https://provider.example.test/pay', qrCode: qrOnly ? 'provider-qr-reference' : null });
    await context.route('https://provider.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Actual provider payment</h1>' }));
    await context.route(origin + '/api/**', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      let body = [];
      if (path === '/api/auth/me') body = { id: 'member-1', name: 'Payment Tester', email: 'tester@example.test', role: 'member' };
      else if (path === '/api/bookings') body = url.search ? { data: [booking], pagination: { page: 1, totalPages: 1, total: 1 }, dateCounts: { all: 1 } } : [booking];
      else if (path === '/api/member/booking-filters') body = { courts: [], coaches: [] };
      else if (path === '/api/payments/attempt-1') body = attempt();
      else if (path.endsWith('/pay')) {
        calls++;
        await new Promise(resolve => setTimeout(resolve, 300));
        if (rejectPayment) return route.fulfill({ status: 503, json: { message: 'Provider unavailable. No payment verified.' } });
        body = { payment: initiating ? { ...attempt(), status: 'INITIATING', checkoutUrl: '', qrCode: null } : attempt(), booking };
      }
      await route.fulfill({ json: body });
    });
    await page.goto(origin + '/bookings');
    await page.getByRole('button', { name: 'Pay & confirm', exact: true }).click();
    await page.getByRole('button', { name: 'Starting payment…', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Starting payment…', exact: true }).isDisabled(), true);
    await page.waitForURL('https://provider.example.test/pay');
    assert.equal(calls, 1);
    await page.goBack();
    await page.getByRole('heading', { name: 'Awaiting payment verification', exact: true }).waitFor();
    assert.equal(calls, 1, 'Back must not initiate payment again');
    await page.reload();
    await page.getByRole('heading', { name: 'Awaiting payment verification', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Payment successful', exact: true }).count(), 0);
    status = 'SUCCEEDED';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading', { name: 'Payment successful', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Resume payment with KBZPay' }).count(), 0);
    for (const [value, heading] of [['FAILED', 'Payment was not completed'], ['CANCELLED', 'Payment cancelled'], ['EXPIRED', 'Payment window expired']]) {
      status = value;
      await page.reload();
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      assert.equal(await page.getByRole('link', { name: 'Resume payment with KBZPay' }).count(), 0);
    }
    status = 'PENDING'; qrOnly = true;
    await page.goto(origin + '/bookings');
    await page.getByRole('button', { name: 'Pay & confirm', exact: true }).click();
    await page.waitForURL('**/payment/attempt-1');
    await page.getByRole('heading', { name: 'Scan to pay with KBZPay', exact: true }).waitFor();
    await page.getByText('provider-qr-reference', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Continue to KPay/ }).count(), 0);
    // Exercise same-tick calls from separate entry points, before React can disable a button.
    const before = calls;
    await page.evaluate(async () => {
      const { startPayment } = await import('/src/services/paymentFlow.ts');
      const first = startPayment('/member/private-courses/booking-1/pay');
      const second = startPayment('/member/private-courses/booking-1/pay');
      if (first !== second) throw new Error('Payment initialization was not shared');
      await first;
    });
    await page.waitForURL('**/payment/attempt-1');
    assert.equal(calls, before + 1);
    initiating = true; qrOnly = false;
    await page.goto(origin + '/bookings');
    await page.getByRole('button', { name: 'Pay & confirm', exact: true }).click();
    await page.waitForURL('https://provider.example.test/pay');
    initiating = false;
    rejectPayment = true;
    await page.goto(origin + '/bookings');
    await page.getByRole('button', { name: 'Pay & confirm', exact: true }).click();
    await page.getByText('Provider unavailable. No payment verified.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Pay & confirm', exact: true }).isEnabled(), true);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${mobile ? 'mobile' : 'desktop'} direct payment, loading, duplicate suppression, provider return, refresh, verified success, failure/cancellation/expiry, QR-only interface and initialization failure`);
  }
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
