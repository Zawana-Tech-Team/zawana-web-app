import test from "node:test";
import assert from "node:assert/strict";
import { bookingClock, bookingHasStarted, normalizeBookingTime } from "../../src/utils/bookingTime.js";

test("booking display repairs legacy corrupted separators", () => {
  assert.equal(normalizeBookingTime("1:00 PM â€” 2:00 PM"), "1:00 PM — 2:00 PM");
});

test("elapsed slots use Myanmar time including midnight and the exact start minute", () => {
  const now = bookingClock(new Date("2026-10-22T06:30:00Z"));
  assert.deepEqual(now, { date: "2026-10-22", minute: 780 });
  assert.equal(bookingHasStarted("2026-10-22", "1:00 PM — 2:00 PM", now), true);
  assert.equal(bookingHasStarted("2026-10-22", "12:00 PM — 1:00 PM", now), true);
  assert.equal(bookingHasStarted("2026-10-22", "2:00 PM — 3:00 PM", now), false);
  assert.equal(bookingHasStarted("2026-10-23", "6:00 AM — 7:00 AM", now), false);
  assert.equal(bookingHasStarted("2026-10-21", "8:00 PM — 9:00 PM", now), true);
  assert.deepEqual(bookingClock(new Date("2026-10-22T18:00:00Z")), { date: "2026-10-23", minute: 30 });
});
