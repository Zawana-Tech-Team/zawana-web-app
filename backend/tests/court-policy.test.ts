import test from "node:test";
import assert from "node:assert/strict";
import { overlaps, range, toMinute } from "../src/services/courtPolicy.js";

test("court policy reads both stored 24-hour block times and display AM/PM times", () => {
  for (const [input, expected] of [
    ["00:00", 0],
    ["06:00", 360],
    ["12:00", 720],
    ["18:30", 1110],
    ["23:59", 1439],
    ["12:00 AM", 0],
    ["6:00 AM", 360],
    ["12:00 PM", 720],
    ["6:30 PM", 1110],
  ] as const)
    assert.equal(toMinute(input), expected, input);
  assert.deepEqual(range("18:00 — 19:00"), { start: 1080, end: 1140 });
});

test("mixed-format court blocks overlap correctly without blocking adjacent sessions", () => {
  assert.ok(overlaps("18:00 — 19:00", "6:00 PM — 7:00 PM"));
  assert.ok(overlaps("06:30 - 08:00", "6:00 AM — 7:00 AM"));
  assert.ok(overlaps("06:30 - 08:00", "7:00 AM — 8:00 AM"));
  assert.equal(overlaps("18:00 — 19:00", "5:00 PM — 6:00 PM"), false);
  assert.equal(overlaps("18:00 — 19:00", "7:00 PM — 8:00 PM"), false);
});

test("clock parsing still rejects malformed and ambiguous ranges", () => {
  for (const input of [
    "24:00",
    "25:00",
    "18:60",
    "9:99 AM",
    "0:00 AM",
    "13:00 PM",
    "18:00 PM",
    "-1:00",
    "6:0",
    "6",
  ])
    assert.ok(Number.isNaN(toMinute(input)), input);
  assert.equal(range("19:00 — 18:00"), null);
  assert.equal(range("18:00 — 18:00"), null);
});
