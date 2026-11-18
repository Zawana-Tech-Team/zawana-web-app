import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readdirSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { removeWeeklyClasses, repairTodayWeeklyRemovals } from '../src/services/weeklyRemoval.js';
import { quoteDeskMoves,confirmDeskMoves } from '../src/services/deskMoves.js';
import { blockOccurs } from '../src/services/blockSchedule.js';
import { today } from '../src/services/courtPolicy.js';
import { addDateKeyDays } from '../src/utils/dateKeys.js';

test('weekly removal bounds recurrence while retaining history and linked records',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'weekly-removal-')),file=join(dir,'qa.db');
  const sql=new DatabaseSync(file),root=new URL('../prisma/migrations/',import.meta.url);
  for(const name of readdirSync(root).filter(n=>/^\d/.test(n)).sort())sql.exec(readFileSync(new URL(`${name}/migration.sql`,root),'utf8'));
  sql.close();const db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});
  try {
    const member=await db.user.create({data:{name:'Student',email:'student@test.local',role:'member'}}),fo=await db.user.create({data:{name:'FO',email:'fo@test.local',role:'badminton_fo'}}),admin=await db.user.create({data:{name:'Admin',email:'admin@test.local',role:'admin'}});
    const courts=await Promise.all([1,2,3].map(i=>db.court.create({data:{name:`Court ${i}`,type:'Standard',surface:'Indoor',price:20000,features:[]}})));
    const future=addDateKeyDays(today(),3),past=addDateKeyDays(future,-14),dow=new Date(`${future}T12:00:00Z`).getUTCDay();
    const base=await db.courtBlock.create({data:{courtId:courts[0].id,title:'Academy',date:'',dayOfWeek:dow,effectiveFrom:past,effectiveUntil:addDateKeyDays(future,-1),start:'13:00',end:'14:00',type:'class',note:'Original student/class metadata'}});
    const continuation=await db.courtBlock.create({data:{courtId:courts[1].id,title:base.title,date:'',dayOfWeek:dow,effectiveFrom:future,start:'13:00',end:'14:00',type:'class',note:`Moved from ${base.id} · move-1`}});
    const exception=await db.courtBlock.create({data:{courtId:courts[2].id,title:base.title,date:addDateKeyDays(future,1),start:'12:00',end:'13:00',type:'class',note:`Moved from ${base.id} · move-2`}});
    const unrelated=await db.courtBlock.create({data:{courtId:courts[2].id,title:base.title,date:'',dayOfWeek:dow,start:'16:00',end:'17:00',type:'class'}});
    const booking=await db.booking.create({data:{userId:member.id,code:randomUUID(),courtId:courts[0].id,title:'Completed rental',kind:'court',date:past,time:'8:00 AM — 9:00 AM',location:'Arena',status:'COMPLETED',paymentStatus:'paid',price:20000}});
    await db.booking.create({data:{userId:member.id,code:randomUUID(),courtId:courts[0].id,title:'Private Course',kind:'private_course',date:future,time:'9:00 AM — 10:00 AM',location:'Arena',status:'CONFIRMED',paymentStatus:'paid',price:30000}});
    await db.bookingAttendance.create({data:{bookingId:booking.id,recordedById:fo.id}});
    const enrollment=await db.badmintonEnrollment.create({data:{userId:member.id,studentId:'STUDENT-1',studentName:'Student',phone:'091234567',packageId:'historical-package',packageName:'Weekly academy',sessionsTotal:10,sessionsRemaining:9,startDate:past,expiryDate:addDateKeyDays(future,60)}});
    await db.badmintonCheckIn.create({data:{enrollmentId:enrollment.id,date:past,time:'13:00',sessionsUsed:1}});
    await db.transaction.create({data:{userId:member.id,date:past,customer:'Student',business:'Badminton',item:'Academy payment',amount:20000,discount:0,tax:0,finalAmount:20000,paymentMethod:'Cash',staff:fo.name,status:'paid'}});
    const snapshot=async()=>({bookings:await db.booking.findMany({orderBy:{id:'asc'}}),attendance:await db.bookingAttendance.findMany(),enrollments:await db.badmintonEnrollment.findMany(),checkIns:await db.badmintonCheckIn.findMany(),transactions:await db.transaction.findMany()});
    const original=await snapshot(),move={kind:'weekly' as const,reason:'Stale move after removal',moves:[{id:continuation.id,sourceDate:future,scope:'occurrence' as const,courtId:courts[2].id,date:future,time:'3:00 PM — 4:00 PM'}]},quote=await quoteDeskMoves(db,fo,move);
    const requestKey=randomUUID();let result:unknown;
    await t.test('removal includes linked continuations and exceptions without touching an unrelated same-name class',async()=>{
      result=await removeWeeklyClasses(db,fo,[continuation.id],requestKey);
      assert.equal(await db.courtBlock.count(),4);
      for(const id of [base.id,continuation.id,exception.id]){const row=await db.courtBlock.findUniqueOrThrow({where:{id}});assert.equal(row.active,true);assert.ok(row.effectiveUntil!<today());assert.equal(blockOccurs(row,future),false);assert.equal(blockOccurs(row,addDateKeyDays(future,1)),false);assert.equal(blockOccurs(row,addDateKeyDays(future,7)),false);}
      const historical=await db.courtBlock.findUniqueOrThrow({where:{id:base.id}});assert.equal(blockOccurs(historical,past),true);assert.equal(historical.note,base.note);assert.deepEqual(await db.courtBlock.findUnique({where:{id:unrelated.id}}),unrelated);
    });
    await t.test('attendance, enrollments, completed rentals, private courses and receipts stay identical',async()=>assert.deepEqual(await snapshot(),original));
    await t.test('retry is idempotent and cannot reuse another operation key',async()=>{
      assert.deepEqual(await removeWeeklyClasses(db,fo,[continuation.id],requestKey),result);assert.equal(await db.deskMoveBatch.count(),1);
      await assert.rejects(removeWeeklyClasses(db,fo,[unrelated.id],requestKey),/retry key/);
    });
    await t.test('authorization and late invalid selections roll back without changes',async()=>{
      const before=await db.courtBlock.findMany(),receipts=await db.deskMoveBatch.count();
      await assert.rejects(removeWeeklyClasses(db,member,[unrelated.id],randomUUID()),/Only badminton staff/);
      await assert.rejects(removeWeeklyClasses(db,admin,[unrelated.id,'missing-class'],randomUUID()),/no longer exists/);
      await assert.rejects(removeWeeklyClasses(db,fo,[unrelated.id,unrelated.id],randomUUID()),/different weekly/);
      assert.deepEqual(await db.courtBlock.findMany(),before);assert.equal(await db.deskMoveBatch.count(),receipts);
    });
    await t.test('stale reschedule confirmation cannot resurrect a removed class',async()=>{
      await assert.rejects(confirmDeskMoves(db,fo,move,quote.revision,randomUUID()),/future occurrence/);assert.equal(await db.courtBlock.count(),4);
    });
    await t.test('started occurrences stop blocking today, their historical records remain, and duplicate removals share an audit',async()=>{
      const current=await db.courtBlock.create({data:{courtId:courts[0].id,title:'Started today',date:'',dayOfWeek:new Date(`${today()}T12:00:00Z`).getUTCDay(),effectiveFrom:addDateKeyDays(today(),-7),start:'00:00',end:'00:30',type:'class'}});
      const key=randomUUID(),results=await Promise.all([removeWeeklyClasses(db,admin,[current.id],key),removeWeeklyClasses(db,admin,[current.id],key)]);assert.deepEqual(results[0],results[1]);
      const after=await db.courtBlock.findUniqueOrThrow({where:{id:current.id}});assert.equal(after.effectiveUntil,addDateKeyDays(today(),-1));assert.equal(blockOccurs(after,today()),false);assert.equal(blockOccurs(after,addDateKeyDays(today(),-7)),true);assert.equal(after.title,current.title);assert.equal(after.start,current.start);assert.equal(after.end,current.end);assert.equal(blockOccurs(after,addDateKeyDays(today(),7)),false);assert.equal(await db.deskMoveBatch.count({where:{actorId:admin.id,requestKey:key}}),1);
    });
    await t.test('repair corrects only audited old removals today and never a naturally ending class',async()=>{
      const day=today(),dow=new Date(`${day}T12:00:00Z`).getUTCDay();
      const removed=await db.courtBlock.create({data:{courtId:courts[0].id,title:'Old removal today',date:'',dayOfWeek:dow,effectiveFrom:addDateKeyDays(day,-7),effectiveUntil:day,start:'06:00',end:'07:00',type:'class'}});
      const natural=await db.courtBlock.create({data:{courtId:courts[1].id,title:'Naturally ending today',date:'',dayOfWeek:dow,effectiveUntil:day,start:'07:00',end:'08:00',type:'class'}});
      const receipt=await db.deskMoveBatch.create({data:{actorId:fo.id,requestKey:randomUUID(),payloadHash:randomUUID(),reason:'Weekly class removal',result:{operation:'REMOVE_WEEKLY_CLASS',from:day,removedIds:[removed.id]}}});
      assert.deepEqual((await repairTodayWeeklyRemovals(db)).removedIds,[removed.id]);
      assert.equal((await db.courtBlock.findUniqueOrThrow({where:{id:removed.id}})).effectiveUntil,addDateKeyDays(day,-1));assert.deepEqual(await db.courtBlock.findUnique({where:{id:natural.id}}),natural);assert.deepEqual(await db.deskMoveBatch.findUnique({where:{id:receipt.id}}),receipt);assert.deepEqual(await snapshot(),original);assert.deepEqual((await repairTodayWeeklyRemovals(db)).removedIds,[]);
    });

  } finally {await db.$disconnect();rmSync(dir,{recursive:true,force:true});}
});
