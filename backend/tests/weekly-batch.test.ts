import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import { removeClassOccurrences } from '../src/services/weeklyRemoval.js';
import { blockOccurs } from '../src/services/blockSchedule.js';
import { createStaffRequests, customerRequestAction, quoteCustomerRequest, confirmCustomerRequest, requestAvailability, listBookingRequests } from '../src/services/bookingRequests.js';
import { today } from '../src/services/courtPolicy.js';
import { addDateKeyDays } from '../src/utils/dateKeys.js';
import { requestBatchProgress } from '../../src/utils/requestBatch.ts';
import { notificationLifecycle } from '../src/services/notificationLifecycle.js';

test('occurrence exceptions and grouped requests retain independent scope and finance', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'weekly-batch-')), file = join(dir, 'db');
  const sql = new DatabaseSync(file), root = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(root).filter(name => /^\d/.test(name)).sort()) sql.exec(readFileSync(new URL(`${name}/migration.sql`, root), 'utf8'));
  sql.close(); const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  try {
    const staff = await db.user.create({ data: { name: 'FO', email: 'fo@group.test', role: 'badminton_fo' } });
    const member = await db.user.create({ data: { name: 'Member', email: 'member@group.test', role: 'member' } });
    const other = await db.user.create({ data: { name: 'Other', email: 'other@group.test', role: 'member' } });
    const courts = await Promise.all([1,2].map(i => db.court.create({ data: { name: `Court ${i}`, type: 'Standard', surface: '', price: 30000, features: [] } })));
    await t.test('Remove Today excludes one occurrence, preserves future recurrence and retries safely', async () => {
      const date = today(), dow = new Date(`${date}T12:00:00Z`).getUTCDay();
      const block = await db.courtBlock.create({ data: { courtId: courts[0].id, date: '', dayOfWeek: dow, type: 'class', title: 'Weekly', start: '09:00', end: '10:00' } });
      const requestKey = randomUUID();
      await assert.rejects(removeClassOccurrences(db, member, [{ id: block.id, date }], randomUUID()), /staff/);
      await removeClassOccurrences(db, staff, [{ id: block.id, date }], requestKey);
      const changed = await db.courtBlock.findUniqueOrThrow({ where: { id: block.id } });
      assert.equal(blockOccurs(changed, date), false); assert.equal(blockOccurs(changed, addDateKeyDays(date, 7)), true);
      assert.equal(changed.effectiveUntil, null);
      await removeClassOccurrences(db, staff, [{ id: block.id, date }], requestKey);
      assert.equal(await db.deskMoveBatch.count({ where: { requestKey } }), 1);
      await assert.rejects(removeClassOccurrences(db, staff, [{ id: block.id, date: addDateKeyDays(date, 7) }], requestKey), /retry key/);
      await assert.rejects(removeClassOccurrences(db, staff, [{ id: block.id, date: addDateKeyDays(date, -7) }], randomUUID()), /Historical/);
    });
    await t.test('one recipient notification; mixed responses and replay do not affect siblings', async () => {
      const date = addDateKeyDays(today(), 4), bookings = [];
      for (const time of ['6:00 AM — 7:00 AM', '7:00 AM — 8:00 AM', '8:00 AM — 9:00 AM']) {
        const row = await db.booking.create({ data: { code: randomUUID(), userId: member.id, kind: 'court', courtId: courts[0].id, date, time, title: 'Rental', location: 'Arena', status: 'CONFIRMED', paymentStatus: 'paid', price: 30000 } });
        bookings.push(row);
        await db.transaction.create({ data: { resourceType: 'booking', resourceId: row.id, userId: member.id, date, customer: member.name, business: 'Badminton', item: 'Rental', amount: 30000, discount: 0, tax: 0, finalAmount: 30000, paymentMethod: 'Cash', staff: staff.name, status: 'paid' } });
      }
      const key = randomUUID(), ids = bookings.map(row => row.id), ledger = await db.transaction.findMany();
      const result = await createStaffRequests(db, staff, ids, 'EVENT', '', key);
      assert.equal(new Set(result.requests.map(row => row.batchId)).size, 1);
      const notices = await db.notification.findMany({ where: { userId: member.id, entityType: 'reschedule_batch' } });
      assert.equal(notices.length, 1); assert.equal(await db.notification.count({ where: { userId: member.id, entityType: 'reschedule_request' } }), 0);
      assert.equal((await listBookingRequests(db, other)).length, 0);
      const [a,b,c] = result.requests;
      await assert.rejects(customerRequestAction(db, other, a.id, 'ACKNOWLEDGED'), /not found/);
      const target = { date, time: bookings.find(row => row.id === a.bookingId)!.time, courtId: courts[1].id };
      await assert.rejects(customerRequestAction(db,member,a.id,'ACKNOWLEDGED'),/requires selecting/);
      await requestAvailability(db,member,a.id,date,courts[1].id);
      const quote=await quoteCustomerRequest(db,member,a.id,target);
      await assert.rejects(confirmCustomerRequest(db,member,a.id,target,'forged',true),/fresh quote/);
      await assert.rejects(customerRequestAction(db,member,a.id,'DECLINED'),/Choose Accept/);
      assert.deepEqual(await db.booking.findUnique({where:{id:a.bookingId}}),bookings.find(row=>row.id===a.bookingId));
      await Promise.all([confirmCustomerRequest(db,member,a.id,target,quote.revision,true),confirmCustomerRequest(db,member,a.id,target,quote.revision,true)]);
      assert.equal(await db.rescheduleRequestEvent.count({where:{requestId:a.id,status:'COMPLETED'}}),1);
      await customerRequestAction(db,member,b.id,'REFUND_REQUESTED');
      await customerRequestAction(db, member, c.id, 'ADMIN_HANDLING');
      await customerRequestAction(db, member, c.id, 'ADMIN_HANDLING');
      assert.equal(await db.rescheduleRequestEvent.count({ where: { requestId: c.id, status: 'ADMIN_HANDLING' } }), 1);
      const children = await db.bookingRescheduleRequest.findMany({ where: { batchId: a.batchId } });
      assert.deepEqual(requestBatchProgress(children), { total: 3, resolved: 1, pending: 0, status: 'In progress' });
      assert.deepEqual(await db.transaction.findMany(), ledger);
      for(const original of bookings)if(original.id!==a.bookingId)assert.deepEqual(await db.booking.findUnique({where:{id:original.id}}),original);
      assert.equal((await db.bookingCancellationRequest.findFirstOrThrow({where:{bookingId:b.bookingId}})).refundStatus,'manual_review');
      assert.equal((await db.booking.findUniqueOrThrow({where:{id:a.bookingId}})).courtId,target.courtId);
      await createStaffRequests(db, staff, ids, 'EVENT', '', key);
      assert.equal(await db.bookingRescheduleRequest.count({ where: { bookingId: { in: ids } } }), 3);
      assert.equal(await db.notification.count({ where: { userId: member.id, entityType: 'reschedule_batch' } }), 1);
      await assert.rejects(createStaffRequests(db, staff, ids, 'MAINTENANCE', '', key), /retry key/);
      await assert.rejects(customerRequestAction(db, member, a.id, 'ADMIN_HANDLING'), /no longer/);
      const inbox = await notificationLifecycle(db, notices); assert.match(inbox[0].body, /0 Requests awaiting response/);
    });
    await t.test('concurrent rescheduling and refund review cannot both resolve one notice',async()=>{
      const date=addDateKeyDays(today(),6),sources=[];
      for(const time of ['10:00 AM — 11:00 AM','11:00 AM — 12:00 PM'])sources.push(await db.booking.create({data:{code:randomUUID(),userId:member.id,kind:'court',courtId:courts[1].id,date,time,title:'Affected rental',location:'Arena',status:'CONFIRMED',paymentStatus:'paid',price:30000}}));
      const batch=await createStaffRequests(db,staff,sources.map(row=>row.id),'MAINTENANCE');
      const row=batch.requests[0],before=await db.transaction.count();
      const source=sources.find(source=>source.id===row.bookingId)!;
      await db.transaction.create({data:{resourceType:'booking',resourceId:source.id,userId:member.id,date,customer:member.name,business:'Badminton',item:'Rental',amount:30000,discount:0,tax:0,finalAmount:30000,paymentMethod:'Cash',staff:staff.name,status:'paid'}});
      const target={date,time:source.time,courtId:courts[0].id};
      const quote=await quoteCustomerRequest(db,member,row.id,target);
      const attempts=await Promise.allSettled([confirmCustomerRequest(db,member,row.id,target,quote.revision,true),customerRequestAction(db,member,row.id,'REFUND_REQUESTED')]);
      assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
      const current=await db.bookingRescheduleRequest.findUniqueOrThrow({where:{id:row.id}});
      assert.ok(['COMPLETED','REFUND_REQUESTED'].includes(current.status));
      assert.equal(await db.rescheduleRequestEvent.count({where:{requestId:row.id,status:{in:['COMPLETED','REFUND_REQUESTED']}}}),1);
      assert.equal(await db.transaction.count(),before+1);
      const after=await db.booking.findUniqueOrThrow({where:{id:row.bookingId}});
      assert.equal(after.courtId,current.status==='COMPLETED'?target.courtId:source.courtId);
    });
  } finally { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
});

test('additive batch migration preserves a populated legacy request and its reason', () => {
  const sql = new DatabaseSync(':memory:'), root = new URL('../prisma/migrations/', import.meta.url);
  try {
    const names = readdirSync(root).filter(name => /^\d/.test(name)).sort();
    const migration = '20261119090000_booking_request_batches';
    for (const name of names.filter(name => name < migration)) sql.exec(readFileSync(new URL(`${name}/migration.sql`, root), 'utf8'));
    sql.exec(`INSERT INTO "User" (id,name,email) VALUES ('legacy-user','Legacy','legacy@migration.test');
      INSERT INTO "Booking" (id,code,"userId",kind,title,date,time,location,price) VALUES ('legacy-booking','LEGACY','legacy-user','court','Rental','2099-01-01','09:00 — 10:00','Arena',20000);
      INSERT INTO "BookingRescheduleRequest" (id,"bookingId","activeKey","customerId","requestedById",kind,reason,"oldSchedule","updatedAt","expiresAt") VALUES ('legacy-request','legacy-booking','legacy-booking','legacy-user','legacy-user','court','Historical operational reason','{}',CURRENT_TIMESTAMP,'2099-01-02');`);
    const before = sql.prepare('SELECT * FROM "BookingRescheduleRequest"').get();
    sql.exec(readFileSync(new URL(`${migration}/migration.sql`, root), 'utf8'));
    const after = sql.prepare('SELECT * FROM "BookingRescheduleRequest"').get()!;
    const { batchId, ...unchanged } = after;
    assert.equal(batchId, null); assert.deepEqual({ ...unchanged }, { ...before });
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM "BookingRequestBatch"').get()!.n, 0);
  } finally { sql.close(); }
});
