import QRCode from 'qrcode';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
const require = createRequire(new URL('../tooling/gym/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = resolve(new URL('..', import.meta.url).pathname);
const temp = mkdtempSync(join(tmpdir(), 'zawana-attendance-browser-'));
const freePort = async () => { const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise(r => server.close(r)); return port; };
const apiPort = await freePort(), uiPort = await freePort();
const api = `http://127.0.0.1:${apiPort}/api`, ui = `http://127.0.0.1:${uiPort}`;
const fixture = join(temp, 'fixture.json');
writeFileSync(join(temp, 'qa.db'), '');
const env = { ...process.env, DATABASE_URL: `file:${join(temp, 'qa.db')}`, AUTH_MODE: 'database', NODE_ENV: 'test', JWT_SECRET: 'attendance-test-only-key-over-thirty-two-characters', CLIENT_URL: ui, PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`, PORT: String(apiPort), VITE_API_URL: api, VITE_AUTH_MODE: 'database', ATTENDANCE_QA_FIXTURE_PATH: fixture };
let browser, apiProcess, logs = ''; const children = [], errors = [], keyWarnings = [];
const start = (bin, args, cwd) => { const child = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child); child.stdout.on('data', d => logs += d); child.stderr.on('data', d => logs += d); return child; };
const ready = async url => { for (let i = 0; i < 150; i++) { if (children.some(c => c.exitCode !== null)) throw new Error(logs); if (await fetch(url).then(r => r.ok).catch(() => false)) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(logs); };
try {
  execFileSync(join(root, 'backend/node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  execFileSync(join(root, 'backend/node_modules/.bin/tsx'), ['tests/attendance-browser-fixture.ts'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  const data = JSON.parse(readFileSync(fixture, 'utf8'));
  apiProcess = start(join(root, 'backend/node_modules/.bin/tsx'), ['src/server.ts'], join(root, 'backend'));
  start(join(root, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], root);
  await Promise.all([ready(ui), ready(`${api}/health`)]);
  const chrome = process.env.ATTENDANCE_BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  for (const { role, token } of data.tokens) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript(token => localStorage.setItem('zawana_access_token', token), token);
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (/Each child in a list|unique.*key.*prop/.test(message.text())) keyWarnings.push(message.text()); });
    const path = role === 'member' ? '/attendance' : `/${role === 'badminton_fo' ? 'badminton-fo' : role}/attendance`;
    await page.goto(ui + path);
    await page.getByRole('heading', { name: 'Attendance.' }).waitFor();
    await page.getByRole('heading', { name: 'Aye Student' }).waitFor();
    if (role === 'admin') {
      await page.getByRole('button', { name: 'Check in student' }).click();
      await page.getByText('Recorded by Attendance Admin').waitFor();
      await page.reload(); await page.getByText('Recorded by Attendance Admin').waitFor();
    } else {
      await page.getByText('Recorded by Attendance Admin').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Check in student' }).count(), 0);
    }
    await page.locator('.attendance-record h3 button').first().click();
    const attendanceDialog = page.getByRole('dialog', { name: 'Participant attendance' });
    await attendanceDialog.getByRole('heading', { name: 'Attendance history', exact: true }).waitFor();
    assert.ok(await attendanceDialog.evaluate(el => {
      const luminance = color => { const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
      const css = getComputedStyle(el), a = luminance(css.color), b = luminance(css.backgroundColor);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5;
    }), 'Dialog body text meets normal-text contrast');

    await attendanceDialog.getByText('Independently purchased private course.', { exact: false }).waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => {
        const box = document.querySelector('dialog[open]')?.getBoundingClientRect();
        return box && box.x >= -1 && box.y >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
      });
      const box = await attendanceDialog.boundingBox();
      assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= 901, 'Attendance dialog stays inside viewport');
      await page.screenshot({ path: join(temp, `attendance-detail-${role}-${width}.png`) });
    }

    if (role === 'admin') {
      await attendanceDialog.getByRole('button', { name: 'Correct attendance', exact: true }).click();
      await attendanceDialog.getByLabel('Status', { exact: true }).selectOption('late');
      await attendanceDialog.getByLabel('Correction reason (required)').fill('Arrival was recorded after warmup');
      await attendanceDialog.getByRole('button', { name: 'Save attendance' }).click();
      await attendanceDialog.getByText('Attendance saved.', { exact: true }).waitFor();
      await attendanceDialog.getByText('Arrival was recorded after warmup', { exact: true }).waitFor();
    }
    await attendanceDialog.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByRole('button', { name: 'Previous month' }).click(); await page.getByText('A clear day').waitFor();
    await page.getByRole('button', { name: 'Today', exact: true }).click(); await page.getByRole('heading', { name: 'Aye Student' }).waitFor();
    await page.getByRole('textbox', { name: 'Search attendance' }).fill('no-match'); await page.getByText('A clear day').waitFor();
    await page.getByRole('textbox', { name: 'Search attendance' }).fill(''); await page.getByRole('heading', { name: 'Aye Student' }).waitFor();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${role} ${width}: no overflow`);
      await page.screenshot({ path: join(temp, `${role}-${width}.png`), fullPage: true });
      await page.locator('.attendance-list-panel').screenshot({ path: join(temp, `attendance-list-${role}-${width}.png`) });
    }
    if (role === 'member' || role === 'badminton_fo') {
      const bookingsPath = role === 'member' ? '/bookings' : '/badminton-fo/bookings';
      await page.goto(ui + bookingsPath);
      if (role === 'member') {
        await page.getByRole('button', { name: 'Change Date / Time', exact: true }).first().click();
        await page.getByRole('heading', { name: 'Reschedule your court', exact: true }).waitFor();
        assert.ok(page.url().endsWith(`/bookings/${data.bookingId}/reschedule`));
        assert.equal(await page.getByRole('dialog').count(), 0, 'Rescheduling must be a page, not a modal');
        const dateLabel = new Date(`${data.targetDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        await page.getByRole('button', { name: dateLabel, exact: true }).click();
        await page.screenshot({ path: join(temp, 'reschedule-dates-mobile.png'), fullPage: true });
        await page.getByRole('button', { name: 'Choose courts', exact: true }).click();
        await page.getByRole('button', { name: /2F SOP Court/, expanded: false }).click();
        await page.getByRole('button', { name: '2F SOP Court, 6:00 AM — 7:00 AM, Available', exact: true }).click();
        await page.getByRole('button', { name: '2F SOP Court, 7:00 AM — 8:00 AM, Available', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: '2F SOP Court, 6:00 AM — 7:00 AM, Selected', exact: true }).count(), 0, 'One replacement session only');
        await page.getByRole('button', { name: '2F SOP Court, 3:00 PM — 4:00 PM, Available', exact: true }).click();
        await page.getByRole('button', { name: 'Review selected reschedule', exact: true }).click();
        await page.getByText('Price difference: 5,000 MMK', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Confirm reschedule', exact: true }).isDisabled(), true);
        const unchanged = await (await fetch(`${api}/court-booking/bookings/${data.bookingId}/changes`, { headers: { Authorization: `Bearer ${token}` } })).json();
        assert.equal(unchanged.booking.time, '8:00 AM — 9:00 AM', 'Reviewing a price adjustment must preserve the original booking');
        await page.getByRole('button', { name: 'Edit court selection', exact: true }).click();
        await page.getByRole('button', { name: '2F SOP Court, 6:00 AM — 7:00 AM, Available', exact: true }).click();
        await page.screenshot({ path: join(temp, 'reschedule-courts-mobile.png'), fullPage: true });
        await page.locator('#reschedule-summary').getByRole('button', { name: 'Review change', exact: true }).click();
        await page.getByRole('heading', { name: 'Review your change', exact: true }).waitFor();
        assert.equal(await page.getByRole('dialog').count(), 0);
        await page.getByLabel('Reason', { exact: true }).fill('Customer requests morning training');
        await page.screenshot({ path: join(temp, 'reschedule-review-mobile.png'), fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.screenshot({ path: join(temp, 'reschedule-review-desktop.png'), fullPage: true });
        await page.getByRole('button', { name: 'Confirm reschedule', exact: true }).click();
        await page.getByRole('heading', { name: 'Court booking rescheduled', exact: true }).waitFor();
        await page.getByText('Booking rescheduled successfully.', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Back to bookings', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Reschedule', exact: true }).first().click();
        await page.getByRole('heading', { name: 'Reschedule your court', exact: true }).waitFor();
        assert.ok(page.url().includes('/badminton-fo/bookings/'));
        assert.equal(await page.getByRole('dialog').count(), 0);
        await page.getByRole('link', { name: 'Back to bookings', exact: true }).first().click();
      }
      await page.getByRole('button', { name: 'Details & history', exact: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Court booking details' });
      await dialog.getByRole('heading', { name: 'Booking history', exact: true }).waitFor();
      if (role === 'member') {
        await dialog.getByText('Customer requests morning training', { exact: true }).waitFor();
        await dialog.getByRole('button', { name: 'Cancel Booking', exact: true }).click();
        await dialog.getByLabel('Cancellation reason').fill('Customer cannot attend the new date');
        await dialog.getByRole('button', { name: 'Submit cancellation request', exact: true }).click();
        await dialog.getByText('Cancellation submitted for staff review. The reservation remains active.', { exact: true }).waitFor();
      } else {
        await dialog.getByText('Customer cannot attend the new date', { exact: true }).first().waitFor();
        await dialog.getByLabel('Review reason', { exact: true }).fill('Verified cancellation with customer');
        await dialog.getByRole('button', { name: 'Approve cancellation', exact: true }).click();
        await dialog.getByText('Cancellation approved. Financial review remains separate.', { exact: true }).waitFor();
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Booking dialog fits mobile viewport');
      await page.screenshot({ path: join(temp, `court-changes-${role}.png`) });
      await dialog.getByRole('button', { name: 'Close dialog' }).click();
    }
    if (role === 'coach' || role === 'badminton_fo') {
      await page.goto(ui + (role === 'coach' ? '/coach/attendance' : '/badminton-fo/attendance'));
      await page.locator('.attendance-workspace[aria-busy="false"]').waitFor();
      assert.equal(await page.getByRole('region', { name: 'Badminton attendance QR generation', exact: true }).count(), 0, 'Attendance has no QR desk');
    }
    if (role === 'badminton_fo') {
      await page.goto(ui + '/badminton-fo/check-in');
      let desk = page.getByRole('region', { name: 'Badminton attendance QR generation', exact: true });
      const first = desk.getByRole('article', { name: 'QR slot 1', exact: true });
      const second = desk.getByRole('article', { name: 'QR slot 2', exact: true });
      assert.equal(await desk.getByLabel('QR member', { exact: true }).count(), 0, 'Category generation never asks for a member');
      if (role === 'badminton_fo') {
        await first.getByLabel('QR slot 1 category').selectOption('SOCIAL');
        await first.getByRole('button', { name: 'Generate / restore QR', exact: true }).click();
        await first.getByRole('img', { name: 'Social attendance QR code' }).waitFor();
        const originalImage = await first.getByRole('img').getAttribute('src');
        await second.getByLabel('QR slot 2 category').selectOption('PATHWAY');
        await second.getByRole('button', { name: 'Generate / restore QR', exact: true }).click();
        await second.getByRole('img', { name: 'Pathway attendance QR code' }).waitFor();
        assert.equal(await first.getByRole('img').getAttribute('src'), originalImage);
      }
      await first.getByRole('img', { name: 'Social attendance QR code' }).waitFor();
      await second.getByRole('img', { name: 'Pathway attendance QR code' }).waitFor();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await desk.screenshot({ path: join(temp, `category-qr-${role}-desktop.png`) });
      await page.reload();
      desk = page.getByRole('region', { name: 'Badminton attendance QR generation', exact: true });
      await desk.getByRole('img', { name: 'Social attendance QR code' }).waitFor();
      await desk.getByRole('img', { name: 'Pathway attendance QR code' }).waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await desk.getByRole('article', { name: 'QR slot 2', exact: true }).getByRole('img').scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(temp, `category-qr-${role}-mobile.png`) });
      if (role === 'badminton_fo') {
        await desk.getByRole('article', { name: 'QR slot 2', exact: true }).getByRole('button', { name: 'Revoke', exact: true }).click();
        await desk.getByText('REVOKED', { exact: true }).waitFor();
        await desk.getByRole('img', { name: 'Social attendance QR code' }).waitFor();
        await desk.getByRole('button', { name: 'Generate new QR', exact: true }).click();
        await desk.getByRole('img', { name: 'Pathway attendance QR code' }).waitFor();
      }
    }
    if (role === 'admin') {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${ui}/admin/court-rentals/${data.bookingId}/reschedule`);
      await page.getByRole('heading', { name: 'Reschedule your court', exact: true }).waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.getByRole('heading', { name: 'Make time to play.', exact: true }).waitFor();
      await page.screenshot({ path: join(temp, 'reschedule-dates-admin-desktop.png'), fullPage: true });
      await page.goto(ui + '/admin/badminton-packages');
      await page.getByRole('button', { name: 'Edit Legacy review package', exact: true }).click();
      const categoryDialog = page.getByRole('dialog', { name: 'Edit badminton package' });
      await categoryDialog.getByLabel('Badminton category', { exact: true }).selectOption({ label: 'Social · SOCIAL' });
      await categoryDialog.getByRole('checkbox', { name: /I reviewed this package/ }).check();
      await categoryDialog.getByRole('button', { name: 'Save changes', exact: true }).click();
      for (let attempt = 0; attempt < 2; attempt++) {
        const verification = page.getByRole('dialog', { name: 'Confirm package changes', exact: true });
        await verification.getByLabel('Current password', { exact: true }).fill('attendance-package-password');
        await page.screenshot({ path: join(temp, `package-verification-${attempt}.png`) });
        await verification.getByRole('button', { name: 'Verify and save', exact: true }).click();
        await verification.waitFor({ state: 'hidden' });
      }
      await categoryDialog.waitFor({ state: 'hidden' });
      const reviewed = await (await fetch(api + '/badminton/enrollments', { headers: { Authorization: `Bearer ${token}` } })).json();
      const legacy = reviewed.find(row => row.studentId === 'WALKIN-REVIEW');
      assert.equal(legacy.categoryCode, 'SOCIAL'); assert.equal(legacy.sessionsRemaining, 7);
      const legacyHistory = await (await fetch(`${api}/badminton/enrollments/${legacy.id}/check-ins`, { headers: { Authorization: `Bearer ${token}` } })).json();
      assert.equal(legacyHistory[0].categoryCode, 'SOCIAL'); assert.equal(legacyHistory.length, 1);
      await page.screenshot({ path: join(temp, 'category-review-admin-desktop.png'), fullPage: true });
      await page.goto(ui + '/admin/users'); await page.getByLabel('Search users').waitFor();
      await page.getByRole('combobox', { name: 'Account role' }).selectOption('member');
      await page.getByText('Aye Student', { exact: true }).waitFor();
      await page.screenshot({ path: join(temp, 'users-desktop.png'), fullPage: true });
    }
    if (role === 'member') {
      await page.goto(ui + '/member');
      await page.locator('.workspace-cover').waitFor();
      await page.getByRole('button', { name: /Scan to check in/ }).waitFor();
      await page.goto(ui + '/membership', { waitUntil: 'domcontentloaded' }); await page.getByRole('link', { name: 'Scan to check in' }).first().waitFor();
      await page.getByRole('heading', { name: 'Foundation twelve' }).first().waitFor();
      await page.getByRole('heading', { name: 'Ten court visits' }).first().waitFor();
      await page.screenshot({ path: join(temp, 'packages-mobile.png'), fullPage: true });
    }
    await context.close();
    // Full navigations and StrictMode across four roles exceed the production profile-read IP budget.
    // Clear only that counter in this disposable database; keep credential/replay limits intact.
    execFileSync(join(root, 'backend/node_modules/.bin/tsx'), ['tests/attendance-browser-fixture.ts', '--reset-profile-rate'], { cwd: join(root, 'backend'), env, stdio: 'pipe' });
  }
  const fo = data.tokens.find(t => t.role === 'badminton_fo');
  const member = data.tokens.find(t => t.role === 'member');
  const apiRequest = (path, token, body) => fetch(api + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await apiRequest('/check-in/qr', member.token, {})).status, 403);
  const generatedAt = Date.now();
  const issued = await (await apiRequest('/check-in/qr', fo.token, { categoryCode: 'SOCIAL', slot: 1 })).json();
  assert.equal(new Date(issued.expiresAt).getTime() - new Date(issued.createdAt).getTime(), 7200000);
  assert.ok(new Date(issued.expiresAt).getTime() > generatedAt);
  const oldApi = apiProcess;
  await new Promise(resolve => { oldApi.once('exit', resolve); oldApi.kill('SIGTERM'); });
  children.splice(children.indexOf(oldApi), 1);
  apiProcess = start(join(root, 'backend/node_modules/.bin/tsx'), ['src/server.ts'], join(root, 'backend'));
  await ready(`${api}/health`);
  const restored = await (await fetch(`${api}/check-in/qr`, { headers: { Authorization: `Bearer ${fo.token}` } })).json();
  const restoredSocial = restored.slots.find(row => row.slot === 1).qr;
  assert.equal(restoredSocial.id, issued.id, 'QR identity persists across API process restart');
  assert.equal(restoredSocial.token, issued.token, 'QR redisplay survives API restart');
  assert.equal(restoredSocial.expiresAt, issued.expiresAt, 'Restart cannot extend QR validity');
  assert.equal(restored.slots.length, 2);
  assert.equal(restored.slots.find(row => row.slot === 2).qr.categoryCode, 'PATHWAY');
  const watchContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await watchContext.addInitScript(token => localStorage.setItem('zawana_access_token', token), fo.token);
  const watch = await watchContext.newPage(); watch.on('pageerror', e => errors.push(e.message));
  await watch.goto(ui + '/badminton-fo/attendance');
  const liveSocial = watch.getByRole('region', { name: 'Badminton attendance QR generation', exact: true }).getByRole('article', { name: 'QR slot 1', exact: true });
  await liveSocial.getByText('0 check-ins', { exact: true }).waitFor();
  const png = join(temp, 'entry-qr.png');
  await QRCode.toFile(png, `${ui}/check-in#${issued.token}`);
  const qrContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await qrContext.addInitScript(token => localStorage.setItem('zawana_access_token', token), member.token);
  const scan = await qrContext.newPage();
  scan.on('pageerror', e => errors.push(e.message));
  scan.on('response', async response => {
    if (response.status() >= 400 && response.url().startsWith(api)) console.error('Scan API response', response.url().replace(/#.*/, ''), response.status(), (await response.json().catch(() => ({}))).code);
  });
  await scan.goto(ui + '/check-in');
  await scan.getByLabel('Upload QR photo').setInputFiles(png);
  assert.equal(await scan.getByLabel('Check-in category', { exact: true }).count(), 0, 'The QR fixes the attendance category');
  await scan.getByRole('heading', { name: 'Ten court visits', exact: true }).waitFor();
  await scan.getByText('9 remaining', { exact: true }).waitFor();
  assert.equal(await scan.getByText('Foundation twelve', { exact: true }).count(), 0);
  await scan.screenshot({ path: join(temp, 'qr-preview-mobile.png'), fullPage: true });
  await scan.getByRole('button', { name: 'Confirm check-in' }).click();
  await scan.getByText('One session used · 9 remaining.').waitFor();
  await scan.screenshot({ path: join(temp, 'qr-success-mobile.png'), fullPage: true });
  const duplicate = await apiRequest('/check-in/scan', member.token, { token: issued.token });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, 'QR_ALREADY_REDEEMED');
  const otherMember = await apiRequest('/check-in/scan', data.secondaryMember.token, { token: issued.token });
  assert.equal(otherMember.status, 201, 'Another member can use the same category QR');
  const sharedStatus = await (await fetch(`${api}/check-in/qr/${issued.id}`, { headers: { Authorization: `Bearer ${fo.token}` } })).json();
  assert.equal(sharedStatus.status, 'ACTIVE'); assert.equal(sharedStatus.checkInCount, 2);
  await liveSocial.getByText('2 check-ins', { exact: true }).waitFor();
  await liveSocial.getByRole('img', { name: 'Social attendance QR code' }).waitFor();
  await liveSocial.getByText('Attendance history', { exact: true }).click();
  await liveSocial.getByText('Aye Student', { exact: true }).waitFor();
  await liveSocial.getByText('Ko Second Member', { exact: true }).waitFor();
  await watch.screenshot({ path: join(temp, 'category-qr-live-count-history.png') });
  await watchContext.close();
  const foundation = await (await apiRequest('/check-in/qr', fo.token, { categoryCode: 'FOUNDATION', slot: 2, regenerate: true })).json();
  const foundationVisit = await apiRequest('/check-in/scan', member.token, { token: foundation.token });
  assert.equal(foundationVisit.status, 201); assert.equal((await foundationVisit.json()).enrollment.sessionsRemaining, 11);
  const profile = await fetch(api + '/auth/me', { headers: { Authorization: `Bearer ${member.token}` } });
  assert.equal(profile.status, 200, 'Member session remains valid after QR redemption');
  await scan.goto(ui + '/attendance');
  await scan.getByRole('heading', { name: /^Attendance list/ }).waitFor().catch(async error => {
    await scan.screenshot({ path: join(temp, 'qr-attendance-failure.png'), fullPage: true });
    console.error({ url: scan.url(), body: await scan.locator('body').innerText(), errors, artifacts: temp }); throw error;
  });
  await scan.locator('.attendance-list-mobile').getByText('Ten court visits', { exact: true }).waitFor();
  await scan.locator('.attendance-list-panel').screenshot({ path: join(temp, 'attendance-list-package-mobile.png') });
  await scan.getByRole('button', { name: 'Filters', exact: true }).click();
  await scan.locator('.attendance-extra-filters').screenshot({ path: join(temp, 'attendance-filters-mobile.png') });
  await scan.setViewportSize({ width: 1440, height: 1000 });
  await scan.locator('.attendance-list-panel').screenshot({ path: join(temp, 'attendance-list-package-desktop.png') });
  await qrContext.close();
  console.log('PASS two independent category QR slots across refresh/API restart, shared member scans, per-member duplicate protection, exact-category deduction and package reauthentication');
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  publicPage.on('console', message => { if (/Each child in a list|unique.*key.*prop/.test(message.text())) keyWarnings.push(message.text()); });
  for (const path of ['/', '/login']) {
    await publicPage.goto(ui + path);
    await publicPage.getByRole('button', { name: 'Switch to Burmese', exact: true }).first().click();
    await publicPage.waitForFunction(() => document.documentElement.lang === 'my');
    await publicPage.getByRole('button', { name: 'အင်္ဂလိပ်ဘာသာသို့ ပြောင်းရန်', exact: true }).first().click();
    await publicPage.waitForFunction(() => document.documentElement.lang === 'en');
  }
  await publicContext.close();
  assert.deepEqual(keyWarnings, [], 'No React key warnings across workspace, public, login and translated trees');
  assert.deepEqual(errors, []); console.log(`Attendance browser flow passed for four roles at three widths. Screenshots: ${temp}`);
} finally { await browser?.close(); for (const child of children) child.kill('SIGTERM'); }
