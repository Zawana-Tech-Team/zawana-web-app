import test from 'node:test';
import assert from 'node:assert/strict';
import { affectedBookingMessage, requestMessage, requestScheduleMessage } from '../src/domain/requestMessages.js';
test('central reason messages distinguish Event/Maintenance and do not invent schedules', () => {
  assert.match(requestMessage('EVENT'), /upcoming event at The Zawana/);
  assert.match(requestMessage('MAINTENANCE'), /necessary maintenance at The Zawana/);
  for (const reason of ['EVENT', 'MAINTENANCE']) { assert.match(requestMessage(reason), /sincerely apologize/); assert.equal(requestMessage(reason).split('Dear Customer').length, 2); }
  assert.equal(requestMessage('Historical reason'), 'Historical reason');
  assert.equal(requestScheduleMessage({}), '');
  assert.equal(requestScheduleMessage({ date: '2026-11-20', time: '4:00 PM', court: 'Court 2' }), 'Original Booking: Court 2, 2026-11-20, 4:00 PM');
});

test('affected notices never refer to alternative or proposed schedules',()=>{
 for(const reason of ['EVENT','MAINTENANCE']) {
   const message=affectedBookingMessage(reason);
   assert.match(message,/Dear Valued Customer/); assert.match(message,/sincerely apologize/);
   assert.doesNotMatch(message,/proposed|requested time|alternative|reschedul/i);
   assert.match(message,reason==='EVENT'?/scheduled event/:/scheduled maintenance/);
 }
});
