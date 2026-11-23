import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { rentalDestinationPrice } from '../src/services/rentalPricing.js';
import { createStaffRequest, startMemberReschedule, quoteCustomerRequest, confirmCustomerRequest, requestAvailability } from '../src/services/bookingRequests.js';
import { proposePrivateReschedule } from '../src/services/privateRescheduling.js';
import { quoteDeskMoves, confirmDeskMoves } from '../src/services/deskMoves.js';
import { today } from '../src/services/courtPolicy.js';
import { addDateKeyDays } from '../src/utils/dateKeys.js';

test('unified member rescheduling preserves policy, price, payment and concurrency',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'unified-reschedule-')),file=join(dir,'db');
 const sql=new DatabaseSync(file),root=new URL('../prisma/migrations/',import.meta.url);
 for(const name of readdirSync(root).filter(name=>/^\d/.test(name)).sort())sql.exec(readFileSync(new URL(`${name}/migration.sql`,root),'utf8'));
 sql.close();const db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});
 try{
  const member=await db.user.create({data:{name:'Member',email:'member@unified.test',role:'member'}}),other=await db.user.create({data:{name:'Other',email:'other@unified.test',role:'member'}}),staff=await db.user.create({data:{name:'FO',email:'fo@unified.test',role:'badminton_fo'}});
  const courts=await Promise.all([30000,45000].map((price,i)=>db.court.create({data:{name:`Court ${i}`,type:'Standard',surface:'',features:[],price}})));
  const date=addDateKeyDays(today(),4);
  const make=async(price=30000,userId=member.id,day=date,time='8:00 AM — 9:00 AM')=>{
   const booking=await db.booking.create({data:{code:randomUUID(),userId,kind:'court',courtId:courts[0].id,title:'Rental',date:day,time,price,status:'CONFIRMED',paymentStatus:'paid',location:'Arena'}});
   await db.transaction.create({data:{resourceType:'booking',resourceId:booking.id,userId,date:day,customer:'Member',business:'Badminton',item:'Rental',amount:price,discount:0,tax:0,finalAmount:price,paymentMethod:'Cash',staff:staff.name,status:'paid'}});return booking;
  };
  await t.test('higher price requests only the difference; verified staff payment commits once',async()=>{
   const b=await make(),session=await startMemberReschedule(db,member,b.id);
   assert.equal((await startMemberReschedule(db,member,b.id)).id,session.id);
   await assert.rejects(startMemberReschedule(db,other,b.id),/not found/);
   const target={courtId:courts[1].id,date,time:'9:00 AM — 10:00 AM'},q=await quoteCustomerRequest(db,member,session.id,target);
   assert.equal(q.priceDifference,15000);
   await assert.rejects(confirmCustomerRequest(db,member,session.id,target,'tampered',false),/fresh quote/);
   assert.deepEqual(await db.booking.findUnique({where:{id:b.id}}),b);
   const originalReceipts=await db.transaction.count();
   assert.equal((await confirmCustomerRequest(db,member,session.id,target,q.revision,false)).status,'AWAITING_ADDITIONAL_PAYMENT');
   assert.deepEqual(await db.booking.findUnique({where:{id:b.id}}),b);assert.equal(await db.transaction.count(),originalReceipts);
   const input={kind:'court' as const,moves:[{id:b.id,...target}],reason:'EVENT'};
   const review=await quoteDeskMoves(db,staff,input),key=randomUUID();
   await assert.rejects(confirmDeskMoves(db,staff,input,review.revision,key),/payment|received/i);
   assert.deepEqual(await db.booking.findUnique({where:{id:b.id}}),b);
   await confirmDeskMoves(db,staff,input,review.revision,key,{method:'CASH',received:true,reference:''});
   await confirmDeskMoves(db,staff,input,review.revision,key,{method:'CASH',received:true,reference:''});
   assert.equal(await db.transaction.count(),originalReceipts+1);
   assert.equal((await db.booking.findUniqueOrThrow({where:{id:b.id}})).courtId,target.courtId);
   assert.equal((await db.bookingRescheduleRequest.findUniqueOrThrow({where:{id:session.id}})).status,'COMPLETED');
   assert.equal((await db.transaction.findFirstOrThrow({where:{resourceType:'court_reschedule'}})).finalAmount,15000);
  });
  await t.test('rates preserve duration, peak and holiday pricing',()=>{
   assert.equal(rentalDestinationPrice(30000,840,120,null),65000);
   assert.equal(rentalDestinationPrice(30000,840,120,{active:true,price:45000}),90000);
  });
  await t.test('same and lower prices keep receipts; lower price requires explicit acknowledgement',async()=>{
   for(const paid of [30000,45000]){
    const b=await make(paid,member.id,addDateKeyDays(date,paid===30000?1:2));
    const session=await startMemberReschedule(db,member,b.id),target={courtId:courts[0].id,date:b.date,time:'10:00 AM — 11:00 AM'};
    const q=await quoteCustomerRequest(db,member,session.id,target);assert.equal(q.priceDifference,30000-paid);
    const receipts=await db.transaction.findMany();
    if(paid>30000)await assert.rejects(confirmCustomerRequest(db,member,session.id,target,q.revision,false),/non-refundable/);
    await confirmCustomerRequest(db,member,session.id,target,q.revision,true);
    assert.deepEqual(await db.transaction.findMany(),receipts);assert.equal(await db.bookingRefund.count(),0);
   }
  });
  await t.test('cutoff is revalidated for self requests and cannot grant a private staff exception',async()=>{
   const b=await make(30000,member.id,addDateKeyDays(date,3));const session=await startMemberReschedule(db,member,b.id);
   const changed=await db.booking.update({where:{id:b.id},data:{date:today(),time:'8:00 PM — 9:00 PM'}});
   await db.bookingRescheduleRequest.update({where:{id:session.id},data:{oldSchedule:{id:changed.id,courtId:changed.courtId,coachId:changed.coachId,date:changed.date,time:changed.time,status:changed.status,price:changed.price,paymentStatus:changed.paymentStatus}}});
   await assert.rejects(quoteCustomerRequest(db,member,session.id,{courtId:courts[1].id,date,time:b.time}),/24 hours/);
   await assert.rejects(requestAvailability(db,member,session.id,date,courts[1].id),/24 hours/);
   const coachUser=await db.user.create({data:{name:'Coach',email:'coach@unified.test',role:'coach'}});
   const coach=await db.coach.create({data:{name:'Coach',department:'Badminton',userId:coachUser.id,specialty:'Badminton',phone:'',email:''}});
   const p=await make(30000,member.id,addDateKeyDays(date,4));await db.booking.update({where:{id:p.id},data:{kind:'private_course',coachId:coach.id}});
   const privateSession=await startMemberReschedule(db,member,p.id);
   const original=await db.booking.update({where:{id:p.id},data:{date:today(),time:'7:00 PM — 8:00 PM'}});
   await db.bookingRescheduleRequest.update({where:{id:privateSession.id},data:{oldSchedule:{id:original.id,courtId:original.courtId,coachId:original.coachId,date:original.date,time:original.time,status:original.status,price:original.price,paymentStatus:original.paymentStatus}}});
   await assert.rejects(proposePrivateReschedule(db,member,p.id,{staffRequestId:privateSession.id,courtId:courts[1].id,date,time:p.time,reason:'Member change'}),/24 hours|started/);
  });
  await t.test('stale rates, active checkout and abandoned sessions leave the original protected',async()=>{
   const b=await make(30000,member.id,addDateKeyDays(date,5)),session=await startMemberReschedule(db,member,b.id);
   const target={courtId:courts[1].id,date:b.date,time:'10:00 AM — 11:00 AM'},q=await quoteCustomerRequest(db,member,session.id,target);
   await db.holidayRate.create({data:{date:b.date,price:50000,active:true,title:'Rate change'}});
   await assert.rejects(confirmCustomerRequest(db,member,session.id,target,q.revision,false),/fresh quote/);
   const attempt=await db.paymentAttempt.create({data:{reference:randomUUID(),userId:member.id,resourceType:'booking',resourceId:b.id,amount:30000,status:'PENDING',expiresAt:new Date(Date.now()+60000)}});
   await assert.rejects(quoteCustomerRequest(db,member,session.id,target),/existing payment checkout/);
   await db.paymentAttempt.update({where:{id:attempt.id},data:{status:'FAILED'}});
   await db.bookingRescheduleRequest.update({where:{id:session.id},data:{expiresAt:new Date(0)}});
   await assert.rejects(confirmCustomerRequest(db,member,session.id,target,q.revision,false),/no longer/);
   assert.deepEqual(await db.booking.findUnique({where:{id:b.id}}),b);
   const replacement=await startMemberReschedule(db,member,b.id);assert.notEqual(replacement.id,session.id);
   assert.equal((await db.bookingRescheduleRequest.findUniqueOrThrow({where:{id:session.id}})).status,'EXPIRED');
  });
  await t.test('an unsubmitted member draft cannot swallow a new staff notice',async()=>{
   const b=await make(30000,member.id,addDateKeyDays(date,8)),draft=await startMemberReschedule(db,member,b.id);
   const request=await createStaffRequest(db,staff,b.id,'EVENT');assert.notEqual(request.id,draft.id);
   assert.equal(request.requestedById,staff.id);assert.equal(request.reason,'EVENT');
   assert.equal((await db.bookingRescheduleRequest.findUniqueOrThrow({where:{id:draft.id}})).status,'CANCELLED');
   assert.equal(await db.notification.count({where:{userId:member.id,entityId:request.id}}),1);
  });
  await t.test('two owners cannot confirm the same destination',async()=>{
   const day=addDateKeyDays(date,6),a=await make(30000,member.id,day),b=await make(30000,other.id,day,'9:00 AM — 10:00 AM');
   const target={courtId:courts[1].id,date:day,time:'11:00 AM — 12:00 PM'};
   await db.court.update({where:{id:courts[1].id},data:{price:30000}});
   const sessions=await Promise.all([startMemberReschedule(db,member,a.id),startMemberReschedule(db,other,b.id)]);
   const quotes=await Promise.all(sessions.map((s,i)=>quoteCustomerRequest(db,i?other:member,s.id,target)));
   const attempts=await Promise.allSettled(sessions.map((s,i)=>confirmCustomerRequest(db,i?other:member,s.id,target,quotes[i].revision,false)));
   assert.equal(attempts.filter(row=>row.status==='fulfilled').length,1);
   assert.equal(await db.booking.count({where:{courtId:target.courtId,date:day,time:target.time,status:'CONFIRMED'}}),1);
  });
 }finally{await db.$disconnect();rmSync(dir,{recursive:true,force:true});}
});
