import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING_CHANGED, BOOKING_SYNC_INTERVAL, bookingMutation, bookingSnapshot, subscribeBookings } from '../../src/services/bookingSync.ts';

test('only successful booking writes are candidates for availability invalidation', () => {
  for (const path of ['/bookings', '/court-booking/bookings/1/reschedule', '/court-blocks/1', '/holidays/2026-11-18', '/rescheduling/private/proposals/1/decision', '/staff/court-desk/rentals', '/payments/confirm']) assert.equal(bookingMutation(path, 'POST'), true, path);
  for (const path of ['/rescheduling/moves/quote', '/holidays/preview', '/auth/refresh', '/notifications/read']) assert.equal(bookingMutation(path, 'POST'), false, path);
  assert.equal(bookingMutation('/bookings', 'GET'), false);
});

test('one shared poll, coalesced mutations, visibility/reconnect recovery and cleanup', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const win = new EventTarget(), doc = Object.assign(new EventTarget(), { hidden: false });
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  let first = 0, second = 0;
  const off1 = subscribeBookings(() => first++), off2 = subscribeBookings(() => second++);
  try {
    win.dispatchEvent(new Event(BOOKING_CHANGED)); win.dispatchEvent(new Event(BOOKING_CHANGED));
    t.mock.timers.tick(100); assert.equal(first, 1); assert.equal(second, 1);
    t.mock.timers.tick(BOOKING_SYNC_INTERVAL); t.mock.timers.tick(100);
    assert.equal(first, 2); assert.equal(second, 2);
    doc.hidden = true; t.mock.timers.tick(BOOKING_SYNC_INTERVAL + 100); assert.equal(first, 2);
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); win.dispatchEvent(new Event('online'));
    t.mock.timers.tick(100); assert.equal(first, 3);
    off1(); win.dispatchEvent(new Event('focus')); t.mock.timers.tick(100); assert.equal(first, 3); assert.equal(second, 4);
    off2(); const snapshot = bookingSnapshot(); t.mock.timers.tick(BOOKING_SYNC_INTERVAL * 2); assert.equal(bookingSnapshot(), snapshot);
  } finally {
    off1(); off2();
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
