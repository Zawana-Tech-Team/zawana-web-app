import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,readdirSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { adminDashboard } from '../src/services/adminDashboard.js';

test('admin overview uses daily financial records and actionable operational data',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'zawana-admin-dashboard-')),file=join(directory,'qa.db'),sql=new DatabaseSync(file),migrations=new URL('../prisma/migrations/',import.meta.url);
 for(const name of readdirSync(migrations).filter(name=>/^\d/.test(name)).sort())sql.exec(readFileSync(new URL(`${name}/migration.sql`,migrations),'utf8'));sql.close();
 const db=new PrismaClient({datasources:{db:{url:`file:${file}`}}}),now=new Date('2026-11-24T03:30:00Z'),date='2026-11-24';
 try{
  const member=await db.user.create({data:{name:'Member',role:'member',email:'admin-overview-member@test.local'}}),staff=await db.user.create({data:{name:'Admin',role:'admin',email:'admin-overview-staff@test.local'}});
  await db.user.createMany({data:[{name:'Inactive member',email:'admin-overview-inactive@test.local',role:'member',active:false},{name:'Deleted member',email:'admin-overview-deleted@test.local',role:'member',deletedAt:now}]});
  const sale=(id:string,amount:number,status:string,day=date,resourceType:string|null=null)=>db.transaction.create({data:{id,date:day,userId:member.id,customer:member.name,business:'Badminton',item:'Overview receipt',amount,discount:0,tax:0,finalAmount:amount,status,paymentMethod:'Cash',staff:staff.name,resourceType,resourceId:resourceType?id:null}});
  await sale('today-paid',100000,'paid');await sale('today-refund',-10000,'refunded',date,'booking_refund');await sale('old-sale',900000,'paid','2026-11-23');await sale('today-pending',80000,'pending');await sale('today-failed',70000,'failed');await sale('old-refund-label',60000,'refunded');
  const booking=async(code:string,time:string,status='CONFIRMED',kind:'court'|'private_course'='court',day=date)=>{
   const court=await db.court.create({data:{name:code,type:'Standard',surface:'Indoor',price:20000,status:'available',features:[],floor:'Ground'}});
   return db.booking.create({data:{code,userId:member.id,kind,courtId:court.id,title:kind==='court'?'Court rental':'Private Fundamentals',date:day,time,location:'Arena',status,paymentStatus:'paid',price:20000}});
  };
  const past=await booking('PAST','6:00 AM — 7:00 AM'),inProgress=await booking('IN-PROGRESS','9:00 AM — 11:00 AM'),later=await booking('LATER','12:00 PM — 1:00 PM','CONFIRMED','private_course');
  await db.booking.update({where:{id:inProgress.id},data:{meta:JSON.stringify({customerName:'Walk-in Visitor'})}});
  await booking('CANCELLED','1:00 PM — 2:00 PM','CANCELLED');await booking('EXPIRED','2:00 PM — 3:00 PM','EXPIRED');await booking('TOMORROW','3:00 PM — 4:00 PM','CONFIRMED','court','2026-11-25');
  await db.booking.create({data:{code:'LEGACY-GYM',userId:member.id,kind:'pt',title:'Historical training',date,time:'10:00 AM — 11:00 AM',location:'Gym',status:'confirmed',price:50000}});
  await t.test('today revenue excludes old/pending/failed sales and deducts recorded refunds',async()=>{const data=await adminDashboard(db,now);assert.equal(data.date,date);assert.equal(data.metrics.revenueToday,90000);assert.equal(data.metrics.activeMembers,1);assert.equal(data.metrics.bookingsToday,3);});
  await t.test('numeric time ordering preserves in-progress sessions, original court and walk-in name',async()=>{const data=await adminDashboard(db,now);assert.deepEqual(data.schedule.map(row=>row.id),[inProgress.id,later.id]);assert.equal(data.schedule[0].customer,'Walk-in Visitor');assert.equal(data.schedule[0].title,'IN-PROGRESS');assert.equal(data.schedule[0].floor,'Ground');assert.match(data.schedule[1].href,/kind=private_course/);assert.doesNotMatch(JSON.stringify(data.schedule),/PAST|CANCELLED|EXPIRED|TOMORROW|LEGACY-GYM/);});
  await t.test('reviews count bookings once and exclude rejected or already-refunded items',async()=>{
   await db.bookingRescheduleRequest.create({data:{bookingId:later.id,activeKey:later.id,customerId:member.id,requestedById:staff.id,kind:'private_course',status:'ADMIN_HANDLING',oldSchedule:{courtId:later.courtId,date,time:later.time},expiresAt:new Date('2027-01-01T00:00:00Z')}});
   for(let i=0;i<2;i++)await db.bookingCancellationRequest.create({data:{bookingId:past.id,requestedById:member.id,reason:'Review cancellation',status:'requested',refundStatus:'manual_review'}});
   await db.bookingCancellationRequest.create({data:{bookingId:inProgress.id,requestedById:member.id,reason:'Already rejected',status:'rejected',refundStatus:'manual_review'}});
   const refunded=await booking('REFUNDED','5:00 PM — 6:00 PM','CANCELLED');await db.booking.update({where:{id:refunded.id},data:{paymentStatus:'refunded'}});await db.bookingCancellationRequest.create({data:{bookingId:refunded.id,requestedById:member.id,reason:'Historical completed refund',status:'requested',refundStatus:'REFUNDED'}});
   const data=await adminDashboard(db,now);assert.deepEqual(data.attention.map(item=>[item.id,item.count]),[['assistance',1],['refunds',1]]);
  });
  await t.test('schedule is bounded, counts are complete and reads do not rewrite source records',async()=>{
   for(let i=0;i<6;i++)await booking(`AFTERNOON-${i}`,'2:00 PM — 3:00 PM');
   const transactions=await db.transaction.findMany({orderBy:{id:'asc'}}),bookings=await db.booking.findMany({orderBy:{id:'asc'}}),data=await adminDashboard(db,now);
   assert.equal(data.metrics.bookingsToday,9);assert.equal(data.schedule.length,5);assert.equal(data.schedule[0].id,inProgress.id);assert.deepEqual(await db.transaction.findMany({orderBy:{id:'asc'}}),transactions);assert.deepEqual(await db.booking.findMany({orderBy:{id:'asc'}}),bookings);
  });
 }finally{await db.$disconnect();rmSync(directory,{recursive:true,force:true});}
});
