import test from 'node:test';
import assert from 'node:assert/strict';
import { courtFloor, timetablePositions } from '../../src/components/court-desk/timetable.js';

test('timetable spans actual durations, clips day edges and omits off-day blocks', () => {
  const positions = timetablePositions([
    { id: 'two-hours', start: 540, end: 660 },
    { id: 'partial-hour', start: 780, end: 930 },
    { id: 'opening-edge', start: 300, end: 390 },
    { id: 'outside', start: 1260, end: 1320 },
  ], 360, 1260);
  assert.equal(positions.length, 3);
  assert.equal(positions.find(p => p.id === 'two-hours')?.height, 120 / 900 * 100);
  assert.equal(positions.find(p => p.id === 'partial-hour')?.height, 150 / 900 * 100);
  assert.equal(positions.find(p => p.id === 'opening-edge')?.top, 0);
  assert.equal(positions.find(p => p.id === 'opening-edge')?.height, 30 / 900 * 100);
});
test('simultaneous records remain accessible and touching intervals use the full column', () => {
  const positions = timetablePositions([
    { id: 'rental', start: 540, end: 660 }, { id: 'block', start: 600, end: 720 },
    { id: 'after', start: 720, end: 780 },
  ], 360, 1260);
  assert.equal(positions[0].lanes, 2); assert.equal(positions[1].lanes, 2);
  assert.notEqual(positions[0].lane, positions[1].lane);
  assert.equal(positions[2].lanes, 1);
});
test('floor labels reuse existing configured naming conventions without assuming a court count', () => {
  assert.equal(courtFloor({ name: 'Court 1' }), '2nd floor');
  assert.equal(courtFloor({ name: 'Court 5' }), '6th floor');
  assert.equal(courtFloor({ name: 'Training Studio' }), 'Other courts');
  assert.equal(courtFloor({ name: 'Court 12' }), 'Other courts');
});
