import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,readdirSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { quoteBadmintonRenewal,renewBadmintonPackage,deactivateBadmintonEnrollments } from '../src/services/badmintonRenewals.js';
import { createBadmintonVisit,correctBadmintonVisit } from '../src/services/badmintonAttendance.js';
import { checkInTransaction } from '../src/services/badmintonCategory.js';
import { today } from '../src/services/courtPolicy.js';
import { addDateKeyDays } from '../src/utils/dateKeys.js';

test('package renewal carries eligible sessions exactly once and restarts validity',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'badminton-renewals-')),file=join(dir,'db'),sql=new DatabaseSync(file),root=new URL('../prisma/migrations/',import.meta.url);
 for(const name of readdirSync(root).filter(name=>/^\d/.test(name)).sort())sql.exec(readFileSync(new URL(`${name}/migration.sql`,root),'utf8'));sql.close();
 const db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});
 try{
  const member=await db.user.create({data:{name:'Member',email:'renewal@test.local',role:'member'}}),other=await db.user.create({data:{name:'Other',email:'other-renewal@test.local',role:'member'}}),staff=await db.user.create({data:{name:'FO',email:'renewal-fo@test.local',role:'badminton_fo'}});
  const category=await db.badmintonPackageCategory.findUniqueOrThrow({where:{code:'SOCIAL'}}),foundation=await db.badmintonPackageCategory.findUniqueOrThrow({where:{code:'FOUNDATION'}});
  const pkg=await db.badmintonPackage.create({data:{title:'Social ten',description:'',price:100000,sessions:10,validity:30,categoryId:category.id}});
  const make=()=>db.badmintonEnrollment.create({data:{studentId:member.id,userId:member.id,studentName:member.name,phone:'',packageId:pkg.id,packageName:pkg.title,categoryCode:'SOCIAL',sessionsTotal:10,sessionsRemaining:7,startDate:today(),expiryDate:'2099-01-01',status:'active'}});
  const options=(revision:string,key=randomUUID())=>({revision,requestKey:key,requestHash:key,paymentMethod:'Manual (simulated)' as const,discountPercent:0});
  await t.test('active balance is carried, the source is inactive and history remains intact',async()=>{
   const source=await make(),q=await quoteBadmintonRenewal(db,member,source.id);assert.equal(q.carriedSessions,7);assert.equal(q.totalSessions,17);assert.equal(q.expiryDate,addDateKeyDays(today(),29));
   const input=options(q.revision),row=await renewBadmintonPackage(db,member,source.id,input);assert.equal(row.sessionsRemaining,17);assert.equal(row.renewalOfId,source.id);assert.equal(row.startDate,today());assert.equal(row.expiryDate,q.expiryDate);
   const old=await db.badmintonEnrollment.findUniqueOrThrow({where:{id:source.id}});assert.equal(old.status,'inactive');assert.equal(old.sessionsRemaining,7);
   assert.equal((await renewBadmintonPackage(db,member,source.id,input)).id,row.id);assert.equal(await db.transaction.count({where:{resourceId:row.id}}),1);
   const payment=await db.transaction.findFirstOrThrow({where:{resourceId:row.id}});assert.equal(payment.finalAmount,100000);assert.equal(payment.confirmationMode,'SIMULATED');
   await assert.rejects(renewBadmintonPackage(db,member,source.id,options(q.revision)),/already been renewed/);
  });
  await t.test('inactive and expired balances never roll over',async()=>{
   for(const update of [{status:'inactive'},{expiryDate:addDateKeyDays(today(),-1)}]){const source=await make();await db.badmintonEnrollment.update({where:{id:source.id},data:update});const q=await quoteBadmintonRenewal(db,member,source.id);assert.equal(q.carriedSessions,0);assert.equal((await renewBadmintonPackage(db,member,source.id,options(q.revision))).sessionsRemaining,10);}
  });
  await t.test('ownership, role, category and stale quotes are checked before money is recorded',async()=>{
   const source=await make(),q=await quoteBadmintonRenewal(db,member,source.id),before=await db.transaction.count();
   await assert.rejects(quoteBadmintonRenewal(db,other,source.id),/not found/);await assert.rejects(quoteBadmintonRenewal(db,{...member,role:'coach'},source.id),/cannot renew/);
   const otherPackage=await db.badmintonPackage.create({data:{title:'Foundation',description:'',price:100,sessions:2,validity:30,categoryId:foundation.id}});
   await assert.rejects(renewBadmintonPackage(db,staff,source.id,{...options(q.revision),packageId:otherPackage.id}),/same package category/);
   await db.badmintonEnrollment.update({where:{id:source.id},data:{sessionsRemaining:6}});await assert.rejects(renewBadmintonPackage(db,member,source.id,options(q.revision)),/changed/);
   assert.equal(await db.transaction.count(),before);assert.equal(await db.badmintonEnrollment.count({where:{renewalOfId:source.id}}),0);
  });
  await t.test('competing retry keys cannot renew one source twice',async()=>{
   const source=await make(),q=await quoteBadmintonRenewal(db,member,source.id),count=await db.transaction.count();
   const result=await Promise.allSettled([renewBadmintonPackage(db,member,source.id,options(q.revision)),renewBadmintonPackage(db,member,source.id,options(q.revision))]);assert.equal(result.filter(row=>row.status==='fulfilled').length,1);assert.equal(await db.transaction.count(),count+1);assert.equal(await db.badmintonEnrollment.count({where:{renewalOfId:source.id}}),1);
  });
  await t.test('check-in balances and historical correction guards remain valid',async()=>{
   await db.badmintonEnrollment.updateMany({data:{status:'inactive'}});const source=await make();
   const visit=await checkInTransaction(db,tx=>createBadmintonVisit(tx,source.id,staff.id));const q=await quoteBadmintonRenewal(db,member,source.id);assert.equal(q.carriedSessions,6);const renewed=await renewBadmintonPackage(db,member,source.id,options(q.revision));assert.equal(renewed.sessionsRemaining,16);
   await assert.rejects(db.$transaction(tx=>correctBadmintonVisit(tx,visit.checkInId,staff.id,'excused','Review old cycle')),/renewed/);
   assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({where:{id:renewed.id}})).sessionsRemaining,16);await assert.rejects(checkInTransaction(db,tx=>createBadmintonVisit(tx,renewed.id,staff.id)),/already checked in/);
  });
  await t.test('lifecycle stores active/inactive without deleting balances or history',async()=>{
   const expired=await make(),empty=await make();await db.badmintonEnrollment.update({where:{id:expired.id},data:{status:'expired'}});await db.badmintonEnrollment.update({where:{id:empty.id},data:{sessionsRemaining:0}});await deactivateBadmintonEnrollments(db);
   assert.deepEqual([...new Set((await db.badmintonEnrollment.findMany()).map(row=>row.status))].sort(),['active','inactive']);assert.equal((await db.badmintonEnrollment.findUniqueOrThrow({where:{id:expired.id}})).sessionsRemaining,7);
  });
 }finally{await db.$disconnect();rmSync(dir,{recursive:true,force:true});}
});
