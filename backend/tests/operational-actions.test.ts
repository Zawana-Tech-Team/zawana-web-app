import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { operationalActions } from '../src/services/operationalActions.js';
import { createStaffRequests, createStaffRequest, customerRequestAction, startMemberReschedule, quoteCustomerRequest, confirmCustomerRequest, requestCalendar, requestAvailability, cancelStaffRequest } from '../src/services/bookingRequests.js';
import { proposePrivateReschedule, decidePrivateReschedule } from '../src/services/privateRescheduling.js';
import { refundDetails, completeRefund } from '../src/services/bookingRefunds.js';
import { rescheduleEligibility, scheduleInstant } from '../src/services/courtChanges.js';
import { today } from '../src/services/courtPolicy.js';
import { addDateKeyDays } from '../src/utils/dateKeys.js';
import { createReschedulingRouter } from '../src/routes/rescheduling.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

test('operational actions project unresolved domain work independently of notification reads', async t => {
 const dir=mkdtempSync(join(tmpdir(),'operational-actions-')),file=join(dir,'qa.db');
 const sql=new DatabaseSync(file),migrations=new URL('../prisma/migrations/',import.meta.url);
 for(const name of readdirSync(migrations).filter(name=>/^\d/.test(name)).sort())sql.exec(readFileSync(new URL(`${name}/migration.sql`,migrations),'utf8'));
 sql.close();const db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});let server:ReturnType<express.Express['listen']>|undefined;
 try {
  const member=await db.user.create({data:{name:'Member',email:'member@actions.test',role:'member'}}),admin=await db.user.create({data:{name:'Admin',email:'admin@actions.test',role:'admin'}}),fo=await db.user.create({data:{name:'FO',email:'fo@actions.test',role:'badminton_fo'}}),coach=await db.user.create({data:{name:'Coach',email:'coach@actions.test',role:'coach'}}),otherCoach=await db.user.create({data:{name:'Other',email:'other@actions.test',role:'coach'}});
  const profile=await db.coach.create({data:{name:coach.name,userId:coach.id,department:'Badminton',specialty:'Badminton',email:coach.email,phone:''}}),court=await db.court.create({data:{name:'Action court',type:'Standard',surface:'',price:20000,features:[]}});
  let sequence=0;
  const make=async(kind:'court'|'private_course'='court',date=addDateKeyDays(today(),++sequence+4))=>{
   const row=await db.booking.create({data:{code:randomUUID(),userId:member.id,kind,coachId:kind==='private_course'?profile.id:null,courtId:court.id,title:'Action booking',location:'Arena',date,time:'8:00 AM — 9:00 AM',price:20000,status:'CONFIRMED',paymentStatus:'paid'}});
   await db.transaction.create({data:{resourceType:'booking',resourceId:row.id,userId:member.id,business:'Badminton',date,customer:member.name,item:'Booking',amount:20000,discount:0,tax:0,finalAmount:20000,paymentMethod:'Cash',staff:admin.name,status:'paid'}});return row;
  };
  const actors={admin,fo,coach,otherCoach,member},app=express();app.use(express.json());app.use('/rescheduling',createReschedulingRouter(db,(req,_res,next)=>{req.user=actors[(req.headers['x-actor']||'member') as keyof typeof actors];next();}));app.use(errorHandler);
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
  const read=(actor:string)=>fetch(`http://127.0.0.1:${address.port}/rescheduling/actions`,{headers:{'x-actor':actor}});
  await t.test('API rejects members, disables caching and never creates notifications',async()=>{
   assert.equal((await read('member')).status,403);const response=await read('admin');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).counts.total,0);assert.equal(await db.notification.count(),0);
  });
  const rentals=[await make(),await make(),await make()],group=await createStaffRequests(db,admin,rentals.map(row=>row.id),'MAINTENANCE','',randomUUID());
  const request=(id:string)=>group.requests.find(row=>row.bookingId===id)!;
  await t.test('grouped refund, assistance and completed self-reschedule remain independent',async()=>{
   assert.equal((await operationalActions(db,admin)).counts.total,0);
   await customerRequestAction(db,member,request(rentals[0].id).id,'REFUND_REQUESTED');await customerRequestAction(db,member,request(rentals[1].id).id,'ADMIN_HANDLING');
   const target={courtId:court.id,date:rentals[2].date,time:'9:00 AM — 10:00 AM'},quote=await quoteCustomerRequest(db,member,request(rentals[2].id).id,target);await confirmCustomerRequest(db,member,request(rentals[2].id).id,target,quote.revision,false);
   const result=await operationalActions(db,admin);assert.equal(result.counts.total,2);assert.equal(result.counts.court,2);assert.equal(result.counts.refunds,1);assert.equal(result.counts.requests,2);
   assert.equal(result.items.find(row=>row.bookingId===rentals[0].id)?.label,'Refund Required');assert.equal(result.items.find(row=>row.bookingId===rentals[1].id)?.label,'Admin Action Required');assert.equal(result.items.find(row=>row.bookingId===rentals[2].id)?.required,false);
   assert.deepEqual((await operationalActions(db,fo)).counts,result.counts);assert.deepEqual(await db.booking.findUnique({where:{id:rentals[1].id}}),rentals[1]);assert.ok(!JSON.stringify(result).includes(member.email));
  });
  await t.test('reading all staff notifications cannot clear unresolved counters or duplicate notices',async()=>{
   const before=(await operationalActions(db,admin)).counts,notices=await db.notification.findMany();
   for(const notice of notices)await db.notificationRead.upsert({where:{notificationId_userId:{notificationId:notice.id,userId:admin.id}},update:{},create:{notificationId:notice.id,userId:admin.id}});
   assert.deepEqual((await operationalActions(db,admin)).counts,before);await operationalActions(db,fo);assert.equal(await db.notification.count(),notices.length);
  });
  await t.test('refund completion clears only its action for both staff, preserves receipts and prevents duplicates',async()=>{
   const b=rentals[0],original=await db.transaction.findFirstOrThrow({where:{resourceType:'booking',resourceId:b.id}}),detail=await refundDetails(db,admin,b.id);
   const input={amount:20000,method:'CASH' as const,employeeName:admin.name,notes:'Cash returned and verified',reference:'',confirmed:true as const,revision:detail.revision,requestKey:randomUUID()};
   await completeRefund(db,admin,b.id,input);await completeRefund(db,admin,b.id,input);await assert.rejects(completeRefund(db,fo,b.id,{...input,employeeName:fo.name,requestKey:randomUUID()}),/already completed/i);
   assert.equal((await operationalActions(db,admin)).counts.total,1);assert.equal((await operationalActions(db,fo)).counts.refunds,0);assert.equal(await db.bookingRefund.count({where:{bookingId:b.id}}),1);assert.deepEqual(await db.transaction.findUnique({where:{id:original.id}}),original);
   await cancelStaffRequest(db,fo,request(rentals[1].id).id);assert.equal((await operationalActions(db,admin)).counts.total,0);
  });
  await t.test('private proposals count only for the assigned coach; approval removes the action',async()=>{
   const b=await make('private_course'),proposal=await proposePrivateReschedule(db,member,b.id,{courtId:court.id,date:b.date,time:'10:00 AM — 11:00 AM',reason:'Member schedule change'});
   assert.equal((await operationalActions(db,coach)).counts.coachRequests,1);assert.equal((await operationalActions(db,otherCoach)).counts.total,0);assert.equal((await operationalActions(db,admin)).items.find(row=>row.bookingId===b.id)?.required,false);assert.equal((await operationalActions(db,admin)).counts.total,0);
   await decidePrivateReschedule(db,coach,proposal.id,'approve','Approved by assigned coach');assert.equal((await operationalActions(db,coach)).counts.total,0);assert.equal((await db.booking.findUniqueOrThrow({where:{id:b.id}})).time,'10:00 AM — 11:00 AM');
   const pending=await db.booking.create({data:{code:randomUUID(),userId:member.id,kind:'private_course',coachId:profile.id,courtId:court.id,title:'New booking',location:'Arena',date:addDateKeyDays(b.date,1),time:b.time,price:20000,status:'PENDING_COACH_CONFIRMATION'}});
   assert.equal((await operationalActions(db,coach)).items.find(row=>row.bookingId===pending.id)?.action,'coach-booking');await db.booking.update({where:{id:pending.id},data:{status:'COACH_DECLINED'}});assert.equal((await operationalActions(db,coach)).counts.total,0);
  });
  await t.test('exactly 24 hours is blocked across quotes, calendars, confirmations and private invitations',async()=>{
   const b=await make(),deadline=scheduleInstant(b.date,b.time).getTime()-86400000;
   assert.equal(rescheduleEligibility(b,new Date(deadline-1)).eligible,true);assert.equal(rescheduleEligibility(b,new Date(deadline)).eligible,false);assert.equal(rescheduleEligibility(b,new Date(deadline+1)).eligible,false);
   t.mock.timers.enable({apis:['Date'],now:deadline-1000});
   try{const invited=await createStaffRequest(db,admin,b.id,'EVENT');
    const target={courtId:court.id,date:addDateKeyDays(b.date,1),time:b.time},quote=await quoteCustomerRequest(db,member,invited.id,target);t.mock.timers.tick(1000);
    await assert.rejects(startMemberReschedule(db,member,b.id,invited.id),/24 hours/);await assert.rejects(quoteCustomerRequest(db,member,invited.id,target),/24 hours/);await assert.rejects(requestCalendar(db,member,invited.id,b.date.slice(0,7)),/24 hours/);await assert.rejects(requestAvailability(db,member,invited.id,target.date,court.id),/24 hours/);await assert.rejects(confirmCustomerRequest(db,member,invited.id,target,quote.revision,false),/24 hours/);
    const p=await make('private_course',b.date),invite=await createStaffRequest(db,admin,p.id,'EVENT');await assert.rejects(proposePrivateReschedule(db,member,p.id,{...target,reason:'Invited',staffRequestId:invite.id}),/24 hours/);assert.deepEqual(await db.booking.findUnique({where:{id:b.id}}),b);
   }finally{t.mock.timers.reset();}
  });
 }finally{await new Promise<void>(resolve=>server?server.close(()=>resolve()):resolve());await db.$disconnect();rmSync(dir,{recursive:true,force:true});}
});
