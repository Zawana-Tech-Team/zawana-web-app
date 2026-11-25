import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient, type BookingStatus, type PaymentStatus } from '@prisma/client';
import { completeElapsedBookings } from '../src/services/bookingCompletion.js';

test('elapsed court and private sessions complete automatically without financial or attendance changes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'booking-completion-')),file=join(dir,'db');
 const sql=new DatabaseSync(file),root=new URL('../prisma/migrations/',import.meta.url);
 for(const name of readdirSync(root).filter(name=>/^\d/.test(name)).sort())sql.exec(readFileSync(new URL(`${name}/migration.sql`,root),'utf8'));
 sql.close();const db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});
 try{
  const user=await db.user.create({data:{name:'Completion member',email:'completion@test.local',role:'member'}});
  const make=async(code:string,status:BookingStatus='CONFIRMED',date='2026-11-24',time='8:00 AM — 9:00 AM',kind='court',paymentStatus:PaymentStatus='paid')=>{
   const court=await db.court.create({data:{name:code,type:'Standard',surface:'',features:[],price:30000}});
   return db.booking.create({data:{code,userId:user.id,courtId:court.id,title:code,location:'Arena',kind,status,date,time,price:30000,paymentStatus}});
  };
  const ended=await make('ENDED'),ongoing=await make('ONGOING','CONFIRMED','2026-11-24','9:00 AM — 10:00 AM');
  const course=await make('PRIVATE','CONFIRMED','2026-11-23','8:00 AM — 9:00 AM','private_course');
  const unpaid=await make('UNPAID','confirmed','2026-11-23','8:00 AM — 9:00 AM','court','pending');
  const untouched=await Promise.all([
   make('CANCELLED','CANCELLED'),make('LOWER-CANCELLED','cancelled'),make('EXPIRED','EXPIRED'),make('DECLINED','COACH_DECLINED'),
   make('FUTURE','CONFIRMED','2026-11-25'),make('AWAITING-COACH','PENDING_COACH_CONFIRMATION'),make('AWAITING-PAYMENT','AWAITING_PAYMENT'),
   make('PENDING','pending'),make('REFUNDED','CONFIRMED','2026-11-24','8:00 AM — 9:00 AM','court','refunded'),
   make('WEEKLY','CONFIRMED','2026-11-24','8:00 AM — 9:00 AM','class'),make('PT','confirmed','2026-11-24','8:00 AM — 9:00 AM','pt'),
   make('INVALID-TIME','CONFIRMED','2026-11-23','invalid'),
  ]);
  await db.transaction.create({data:{resourceType:'booking',resourceId:ended.id,userId:user.id,date:ended.date,customer:user.name,business:'Badminton',item:ended.title,amount:30000,discount:0,tax:0,finalAmount:30000,paymentMethod:'Cash',staff:'FO',status:'paid'}});
  const receipts=await db.transaction.findMany(),attendance=await db.bookingAttendance.findMany();
  // 02:30 UTC is exactly 09:00 in Yangon. The end boundary is inclusive.
  const now=new Date('2026-11-24T02:30:00Z');
  assert.equal(await completeElapsedBookings(db,new Date(now.getTime()-1)),2);
  assert.equal((await db.booking.findUniqueOrThrow({where:{id:ended.id}})).status,'CONFIRMED');
  assert.equal(await completeElapsedBookings(db,now),1);
  for(const original of [ended,course,unpaid])assert.deepEqual(await db.booking.findUnique({where:{id:original.id}}),{...original,status:'COMPLETED'});
  for(const original of [...untouched,ongoing])assert.deepEqual(await db.booking.findUnique({where:{id:original.id}}),original);
  assert.equal(await completeElapsedBookings(db,now),0);
  assert.equal(await db.bookingChangeHistory.count({where:{action:'SYSTEM_AUTO_COMPLETED'}}),3);
  assert.deepEqual(await db.transaction.findMany(),receipts);assert.deepEqual(await db.bookingAttendance.findMany(),attendance);
  assert.equal(await db.bookingRefund.count(),0);
 }finally{await db.$disconnect();rmSync(dir,{recursive:true,force:true});}
});
