import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { quoteDeskMoves, confirmDeskMoves, type MoveInput } from '../src/services/deskMoves.js';
import { invitePrivateReschedule, proposePrivateReschedule, decidePrivateReschedule, listPrivateReschedules } from '../src/services/privateRescheduling.js';
import { courtAvailability } from '../src/services/courtAvailability.js';
import { createCourtBooking } from '../src/services/courtBooking.js';
import { businessNow, today } from '../src/services/courtPolicy.js';
import { rescheduleEligibility } from '../src/services/courtChanges.js';
import { reserveWeeklySelections } from '../src/services/deskWeekly.js';
import { addDateKeyDays } from '../src/utils/dateKeys.js';
test('reviewed rescheduling: atomic surcharges, swaps, recurrence and coach decisions', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'reviewed-')), file = join(dir, 'qa.db');
  const sqlite = new DatabaseSync(file), root = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(root).filter(n => /^\d/.test(n)).sort()) sqlite.exec(readFileSync(new URL(`${name}/migration.sql`, root), 'utf8'));
  sqlite.close(); const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  try {
    const user = (role: 'member' | 'admin' | 'badminton_fo' | 'coach') => db.user.create({ data: { name: role, email: `${randomUUID()}@test.local`, role } });
    const [admin, fo, member, stranger, coachUser, wrongCoach] = await Promise.all([user('admin'), user('badminton_fo'), user('member'), user('member'), user('coach'), user('coach')]);
    const coach = await db.coach.create({ data: { userId: coachUser.id, name: 'Coach', specialty: 'Badminton', department: 'Badminton', email: coachUser.email, phone: '' } });
    const courts = await Promise.all([25000,30000,20000].map((price,i) => db.court.create({ data: { name: `Court ${i}`, type: 'Standard', surface: '', price, features: [] } })));
    const date = addDateKeyDays(today(), 3), next = addDateKeyDays(date, 7), dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const make = (courtId: string, time: string, price: number, kind: 'court' | 'private_course' = 'court') => db.booking.create({ data: { code: randomUUID(), userId: member.id, courtId, date, time, price, kind, title: 'Session', location: 'Arena', status: 'CONFIRMED', paymentStatus: 'paid', ...(kind === 'private_course' ? { coachId: coach.id } : {}) } });
    const [a,b] = await Promise.all([make(courts[0].id,'9:00 AM — 10:00 AM',25000), make(courts[1].id,'10:00 AM — 11:00 AM',30000)]);
    const input: MoveInput = { kind: 'court', reason: 'Customer requested new sessions', moves: [{ id: a.id, courtId: courts[1].id, date, time: a.time }, { id: b.id, courtId: courts[0].id, date, time: b.time }] };
    await t.test('extra payment is not offset by cheaper moves; missing payment rolls back; retries do not duplicate', async () => {
      await assert.rejects(quoteDeskMoves(db, member, input), /Only/);
      const quote = await quoteDeskMoves(db, fo, input), key = randomUUID(); assert.equal(quote.surcharge,5000);
      await assert.rejects(confirmDeskMoves(db,fo,input,quote.revision,key),/payment/);
      assert.equal((await db.booking.findUniqueOrThrow({where:{id:a.id}})).courtId,a.courtId); assert.equal(await db.transaction.count(),0);
      const payment = {method:'CASH' as const,received:true as const};
      const result=await confirmDeskMoves(db,fo,input,quote.revision,key,payment);
      assert.deepEqual(await confirmDeskMoves(db,fo,input,quote.revision,key,payment),result);
      assert.equal(await db.transaction.count(),1); assert.equal((await db.transaction.findFirstOrThrow()).finalAmount,5000);
      assert.equal((await db.booking.findUniqueOrThrow({where:{id:b.id}})).price,30000);
      await assert.rejects(confirmDeskMoves(db,fo,{...input,reason:'Different input'},quote.revision,key,payment),/Retry key/);
    });
    await t.test('same-batch swaps work; late conflicts preserve the original',async()=>{
      const move: MoveInput={...input,moves:[{id:a.id,courtId:courts[0].id,date,time:b.time},{id:b.id,courtId:courts[1].id,date,time:a.time}]};
      const quote=await quoteDeskMoves(db,admin,move); await confirmDeskMoves(db,admin,move,quote.revision,randomUUID());
      const target:MoveInput={...input,moves:[{id:a.id,courtId:courts[2].id,date,time:'11:00 AM — 12:00 PM'}]};
      const q=await quoteDeskMoves(db,fo,target);await make(courts[2].id,target.moves[0].time,20000);
      await assert.rejects(confirmDeskMoves(db,fo,target,q.revision,randomUUID()),/conflict/);
      assert.equal((await db.booking.findUniqueOrThrow({where:{id:a.id}})).time,b.time);
    });
    await t.test('weekly occurrence exceptions and future series preserve prior schedule',async()=>{
      const block=await db.courtBlock.create({data:{courtId:courts[0].id,date:'',dayOfWeek:dow,start:'13:00',end:'14:00',title:'Class',type:'class',effectiveFrom:addDateKeyDays(date,-7)}});
      const input:MoveInput={kind:'weekly',reason:'Move one class',moves:[{id:block.id,sourceDate:date,scope:'occurrence',courtId:courts[1].id,date,time:'1:00 PM — 2:00 PM'}]};
      const q=await quoteDeskMoves(db,fo,input);await confirmDeskMoves(db,fo,input,q.revision,randomUUID());
      const available=async(date:string,id:string)=>(await courtAvailability(db,date)).slots.find(s=>s.courtId===id&&s.startMinute===780)!.available;
      assert.equal(await available(date,courts[0].id),true);assert.equal(await available(date,courts[1].id),false);assert.equal(await available(next,courts[0].id),false);
      await createCourtBooking(db,member,{courtId:courts[0].id,date,time:'1:00 PM — 2:00 PM'},randomUUID());
      const future:MoveInput={...input,moves:[{...input.moves[0],sourceDate:next,scope:'future',courtId:courts[2].id,date:next,time:'2:00 PM — 3:00 PM'}]};
      const preview=await quoteDeskMoves(db,fo,future);await confirmDeskMoves(db,fo,future,preview.revision,randomUUID());
      assert.equal((await db.courtBlock.findUniqueOrThrow({where:{id:block.id}})).effectiveUntil,addDateKeyDays(next,-1));
      assert.equal((await courtAvailability(db,addDateKeyDays(next,7))).slots.find(s=>s.courtId===courts[2].id&&s.startMinute===840)!.available,false);
    });
    await t.test('stale revisions and concurrent rental writers cannot partially move a batch', async () => {
      const target: MoveInput = { ...input, moves: [{ id: a.id, courtId: courts[2].id, date, time: '5:00 PM — 6:00 PM' }] };
      let quote = await quoteDeskMoves(db, fo, target);
      await db.bookingChangeHistory.create({ data: { bookingId: a.id, action: 'EXTERNAL_REVIEW', requestedById: admin.id, reason: 'Concurrent change', previous: '', current: '' } });
      await assert.rejects(confirmDeskMoves(db, fo, target, quote.revision, randomUUID()), /changed/);
      quote = await quoteDeskMoves(db, fo, target);
      const race = await Promise.allSettled([confirmDeskMoves(db, fo, target, quote.revision, randomUUID()), createCourtBooking(db, member, { courtId: courts[2].id, date, time: target.moves[0].time }, randomUUID())]);
      assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(await db.booking.count({ where: { courtId: courts[2].id, date, time: target.moves[0].time, status: { in: ['CONFIRMED', 'confirmed'] } } }), 1);
    });
    await t.test('weekly creation accepts different rows and columns and rolls back conflicting sets', async () => {
      const selections = [{ courtId: courts[0].id, date: next, time: '6:00 AM — 7:00 AM' }, { courtId: courts[1].id, date: addDateKeyDays(next, 1), time: '7:00 AM — 8:00 AM' }];
      const request = { selections, title: 'Mixed weekly selections', requestKey: randomUUID() };
      await reserveWeeklySelections(db, fo.id, request);
      const count = await db.courtBlock.count(); await reserveWeeklySelections(db, fo.id, request); assert.equal(await db.courtBlock.count(), count);
      await assert.rejects(reserveWeeklySelections(db, fo.id, { ...request, selections: [{ courtId: courts[2].id, date: next, time: '6:00 AM — 7:00 AM' }, selections[0]], requestKey: randomUUID() }), /conflicting/);
      assert.equal(await db.courtBlock.count(), count);
    });
    await t.test('desk roles are exempt within 24 hours, while private customer requests are blocked', async () => {
      const clock = businessNow(); const hour = clock.hour < 5 ? 6 : clock.hour < 19 ? clock.hour + 1 : 6;
      const soonDate = clock.hour < 19 ? today() : addDateKeyDays(today(), 1);
      const display = (h: number) => `${h % 12 || 12}:00 ${h >= 12 ? 'PM' : 'AM'}`;
      const time = `${display(hour)} — ${display(hour + 1)}`, targetTime = `${display(hour + 1)} — ${display(hour + 2)}`;
      const soon = await db.booking.create({ data: { code: randomUUID(), userId: member.id, courtId: courts[0].id, date: soonDate, time, kind: 'court', title: 'Soon rental', location: 'Arena', status: 'CONFIRMED', price: 30000, paymentStatus: 'paid' } });
      assert.equal(rescheduleEligibility(soon).eligible, false);
      for (const actor of [admin, fo]) assert.equal((await quoteDeskMoves(db, actor, { kind: 'court', reason: 'Staff change inside window', moves: [{ id: soon.id, courtId: courts[1].id, date: soonDate, time: targetTime }] })).rows.length, 1);
      const soonPrivate = await db.booking.create({ data: { code: randomUUID(), userId: member.id, courtId: courts[2].id, coachId: coach.id, date: soonDate, time, kind: 'private_course', title: 'Soon course', location: 'Arena', status: 'CONFIRMED', price: 65000, paymentStatus: 'paid' } });
      await assert.rejects(proposePrivateReschedule(db, member, soonPrivate.id, { courtId: courts[1].id, date: soonDate, time: targetTime, reason: 'Too late a request' }), /24 hours/);
    });
    const course=await make(courts[0].id,'3:00 PM — 4:00 PM',65000,'private_course');
    await t.test('private proposals are customer-owned and coach-reviewed; rejection keeps original',async()=>{
      await invitePrivateReschedule(db,fo,course.id,'Please choose another time');
      const target={courtId:courts[1].id,date,time:'4:00 PM — 5:00 PM',reason:'Prefer afternoon'};
      await assert.rejects(proposePrivateReschedule(db,fo,course.id,target),/Only the customer/);
      await assert.rejects(proposePrivateReschedule(db,stranger,course.id,target),/not assigned/);
      const request=await proposePrivateReschedule(db,member,course.id,target);
      assert.equal((await db.booking.findUniqueOrThrow({where:{id:course.id}})).time,course.time);
      await assert.rejects(proposePrivateReschedule(db,member,course.id,target),/existing proposal/);
      await assert.rejects(decidePrivateReschedule(db,wrongCoach,request.id,'approve','Agree'),/not assigned/);
      await assert.rejects(decidePrivateReschedule(db,fo,request.id,'approve','Agree'),/assigned coach/);
      await decidePrivateReschedule(db,coachUser,request.id,'reject','Coach unavailable');
      assert.equal((await db.booking.findUniqueOrThrow({where:{id:course.id}})).time,course.time);assert.equal((await listPrivateReschedules(db,stranger)).length,0);
    });
    await t.test('approval rechecks destination; withdrawal and approval retain payment without duplicates',async()=>{
      const target={courtId:courts[1].id,date,time:'5:00 PM — 6:00 PM',reason:'A later proposal'};
      let request=await proposePrivateReschedule(db,member,course.id,target);await make(courts[1].id,target.time,30000);
      assert.equal((await decidePrivateReschedule(db,coachUser,request.id,'approve','Agree')).status,'CONFLICTED');
      assert.equal((await db.booking.findUniqueOrThrow({where:{id:course.id}})).time,course.time);
      request=await proposePrivateReschedule(db,member,course.id,{...target,time:'6:00 PM — 7:00 PM'});await decidePrivateReschedule(db,member,request.id,'withdraw','Change proposal');
      request=await proposePrivateReschedule(db,member,course.id,{...target,time:'7:00 PM — 8:00 PM'});const receipts=await db.transaction.count();
      assert.equal((await decidePrivateReschedule(db,coachUser,request.id,'approve','Agree')).status,'APPROVED');
      const changed=await db.booking.findUniqueOrThrow({where:{id:course.id}});assert.equal(changed.time,'7:00 PM — 8:00 PM');assert.equal(changed.price,65000);assert.equal(changed.paymentStatus,'paid');assert.equal(changed.coachId,coach.id);
      await decidePrivateReschedule(db,coachUser,request.id,'approve','Repeated click');assert.equal(await db.transaction.count(),receipts);
    });
    await t.test('expired proposals release pending keys without changing the booking', async () => {
      const request = await proposePrivateReschedule(db, member, course.id, { courtId: courts[0].id, date: next, time: '6:00 PM — 7:00 PM', reason: 'Pending change before expiry' });
      await db.booking.update({ where: { id: course.id }, data: { date: addDateKeyDays(today(), -1) } });
      await listPrivateReschedules(db, member);
      const expired = await db.privateRescheduleRequest.findUniqueOrThrow({ where: { id: request.id } });
      assert.equal(expired.status, 'EXPIRED'); assert.equal(expired.pendingKey, null);
      assert.equal((await db.booking.findUniqueOrThrow({ where: { id: course.id } })).date, addDateKeyDays(today(), -1));
    });
  }finally{await db.$disconnect();rmSync(dir,{recursive:true,force:true});}
});
