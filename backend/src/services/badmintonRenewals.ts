import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { today } from './courtPolicy.js';
import { packageCategory } from './badmintonCategory.js';
import { bookingFailure as fail } from './courtBooking.js';
import { fingerprint, operationId } from './manualPayments.js';
import { badmintonSaleTotals } from './badmintonSale.js';
type Actor={id:string;name:string;role:string};
type Tx=Prisma.TransactionClient;
export async function deactivateBadmintonEnrollments(db:PrismaClient){
 await db.badmintonEnrollment.updateMany({where:{OR:[{status:{notIn:['active','inactive']}},{status:'active',OR:[{expiryDate:{lt:today()}},{sessionsRemaining:{lte:0}}]}]},data:{status:'inactive'}});
}
async function plan(tx:Tx,actor:Actor,id:string,packageId?:string){
 if(!['member','admin','badminton_fo'].includes(actor.role))throw fail(403,'This account cannot renew packages.');
 const source=await tx.badmintonEnrollment.findUnique({where:{id},include:{renewal:{select:{id:true}}}});
 if(!source||!source.userId||(actor.role==='member'&&source.userId!==actor.id))throw fail(404,'Package not found.');
 if(source.renewal)throw fail(409,'This package has already been renewed. Refresh and renew the latest package.');
 const member=await tx.user.findFirst({where:{id:source.userId,role:'member',active:true,deletedAt:null}});
 if(!member)throw fail(409,'The member account is inactive.');
 const pkg=await tx.badmintonPackage.findFirst({where:{id:packageId||source.packageId,status:'active'},include:{category:true}});
 if(!pkg)throw fail(409,'This package is no longer available to renew.');
 const category=await packageCategory(tx,pkg.id);
 if(!source.categoryCode||source.categoryCode!==category)throw fail(409,'Renewal must keep the same package category.');
 const startDate=today(),end=new Date(`${startDate}T12:00:00Z`);end.setUTCDate(end.getUTCDate()+Math.max(0,pkg.validity-1));
 const carried=source.status==='active'&&source.startDate<=startDate&&source.expiryDate>=startDate?Math.max(0,source.sessionsRemaining):0;
 const total=pkg.sessions+carried;
 if(!Number.isSafeInteger(total)||total<=0||total>2147483647)throw fail(409,'This package balance needs staff review.');
 const data={sourceId:id,packageId:pkg.id,packageName:pkg.title,categoryCode:category,price:pkg.price,newSessions:pkg.sessions,carriedSessions:carried,totalSessions:total,startDate,expiryDate:end.toISOString().slice(0,10)};
 return {source,member,pkg,data,revision:fingerprint({data,status:source.status,remaining:source.sessionsRemaining,expiry:source.expiryDate,renewalCount:source.renewalCount})};
}
export async function quoteBadmintonRenewal(db:PrismaClient,actor:Actor,id:string){return db.$transaction(async tx=>{const p=await plan(tx,actor,id);return {...p.data,revision:p.revision};});}
export const memberRenewalInput=z.object({confirmed:z.literal(true),requestKey:z.string().uuid(),revision:z.string().min(1)}).strict();
export async function renewBadmintonPackage(db:PrismaClient,actor:Actor,id:string,input:{packageId?:string;revision?:string;requestKey:string;requestHash:string;paymentMethod:'Cash'|'Manual (simulated)';discountPercent:number}){
 if(!['member','admin','badminton_fo'].includes(actor.role))throw fail(403,'This account cannot renew packages.');
 const execute=()=>db.$transaction(async tx=>{
  // Match check-in locking order so carry-over is based on the committed balance.
  const original=await tx.badmintonEnrollment.findUnique({where:{id},select:{userId:true}});
  if(!original?.userId)throw fail(404,'Package not found.');
  await tx.$executeRaw`UPDATE "User" SET "active"="active" WHERE "id"=${original.userId}`;
  await tx.$executeRaw`UPDATE "BadmintonEnrollment" SET "status"="status" WHERE "id"=${id}`;
  const receipt=await tx.transaction.findUnique({where:{requestKey:input.requestKey}});
  if(receipt){if(receipt.requestHash!==input.requestHash||receipt.confirmedById!==actor.id)throw fail(409,'Retry key belongs to another payment.');return tx.badmintonEnrollment.findUniqueOrThrow({where:{id:receipt.resourceId!}});}
  const p=await plan(tx,actor,id,input.packageId);
  if(actor.role==='member'&&(!input.revision||input.paymentMethod!=='Manual (simulated)'||input.discountPercent!==0))throw fail(400,'Confirm the reviewed renewal payment.');
  if(input.revision&&p.revision!==input.revision)throw fail(409,'Your balance or package price changed. Review the renewal again.');
  const totals=badmintonSaleTotals(p.pkg.price,input.discountPercent);
  const purchase=await tx.badmintonPackagePurchase.create({data:{code:`BP-R-${operationId(actor.id,input.requestKey).slice(0,20)}`,userId:p.member.id,packageId:p.pkg.id,packageName:p.pkg.title,price:totals.finalAmount,paymentMethod:input.paymentMethod,status:'PAID',paidAt:new Date()}});
  const renewal=await tx.badmintonEnrollment.create({data:{studentId:p.member.id,userId:p.member.id,studentName:p.member.name,phone:p.member.phone||'',packageId:p.pkg.id,packageName:p.pkg.title,categoryCode:p.data.categoryCode,sessionsTotal:p.data.totalSessions,sessionsRemaining:p.data.totalSessions,startDate:p.data.startDate,expiryDate:p.data.expiryDate,status:'active',renewalCount:p.source.renewalCount+1,purchaseId:purchase.id,renewalOfId:id}});
  await tx.badmintonEnrollment.update({where:{id},data:{status:'inactive'}});
  await tx.user.update({where:{id:p.member.id},data:{membership:p.pkg.title}});
  await tx.transaction.create({data:{userId:p.member.id,date:p.data.startDate,customer:p.member.name,business:'Badminton',item:`Package renewal · ${p.pkg.title}`,resourceType:'badminton_enrollment',resourceId:renewal.id,confirmationMode:input.paymentMethod==='Cash'?'MANUAL':'SIMULATED',confirmedById:actor.id,requestKey:input.requestKey,requestHash:input.requestHash,...totals,paymentMethod:input.paymentMethod,staff:actor.name,status:'paid'}});
  await tx.attendanceModification.create({data:{bookingId:`enrollment:${id}`,actorId:actor.id,reason:'Package renewed; unused eligible sessions transferred once. Validity restarts today.',previous:JSON.stringify(p.source),current:JSON.stringify({renewalId:renewal.id,...p.data})}});
  await tx.notification.create({data:{dedupeKey:`package-renewed:${renewal.id}`,userId:p.member.id,audience:'member',title:'Badminton package renewed',body:`${p.data.carriedSessions} sessions carried over + ${p.data.newSessions} new sessions. ${p.data.totalSessions} available through ${p.data.expiryDate}.`,link:'/membership',type:'package',entityType:'package',entityId:p.pkg.id}});
  return renewal;
 },{maxWait:10000,timeout:20000});
 for(let attempt=0;;attempt++){try{return await execute();}catch(error){const e=error as {code?:string;meta?:{message?:string}};if(attempt<2&&(e.code==='P2002'||['P2034','P2028','P1008'].includes(e.code||'')||e.code==='P2010'&&/locked|busy|deadlock|serialization/i.test(e.meta?.message||'')))continue;throw error;}}
}
