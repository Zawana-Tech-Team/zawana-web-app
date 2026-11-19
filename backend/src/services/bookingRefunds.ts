import { createHash } from 'node:crypto';
import type { Booking, BookingRefund, Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { bookingFailure as fail } from './courtBooking.js';
import { digest, type Actor } from './deskMoves.js';
import { paidRentalAmount } from './rentalPaymentBalance.js';
import { today } from './courtPolicy.js';
type Tx = Prisma.TransactionClient;
const staff = (actor: Actor) => { if (!['admin','badminton_fo'].includes(actor.role)) throw fail(403,'Only Admin or Badminton FO may process refunds.'); };
export const refundInput = z.object({
  amount:z.number().int().positive().max(2147483647), method:z.enum(['CASH','ONLINE']),
  employeeName:z.string().trim().min(2).max(120), notes:z.string().trim().min(3,'Refund Notes are required.').max(2000),
  reference:z.string().trim().max(200).default(''), confirmed:z.literal(true),
  revision:z.string().min(1),requestKey:z.string().uuid(),
}).strict().superRefine((v,ctx)=>{
  if(v.method==='ONLINE' && (v.reference.length<6 || !/\d/.test(v.reference) || /\s/.test(v.reference) || /^(?:test.*|dummy.*|sample.*|placeholder.*|pending|none|null|n\/?a|tbd|refund[-_]?\d{0,3}|123456(?:7(?:8(?:90?)?)?)?|987654(?:3(?:2(?:10?)?)?)?|(\d)\1+)$/i.test(v.reference)))
    ctx.addIssue({code:'custom',path:['reference'],message:'Enter the actual completed refund Transaction ID; placeholders are not accepted.'});
  if(v.method==='CASH' && v.reference)ctx.addIssue({code:'custom',path:['reference'],message:'Cash refunds do not use a Transaction ID.'});
});
export type RefundInput = z.infer<typeof refundInput>;
const json = (value:unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
async function load(tx:Tx,bookingId:string) {
  const b=await tx.booking.findUnique({where:{id:bookingId},include:{user:{select:{id:true,name:true,phone:true,role:true}},court:{select:{id:true,name:true,floor:true}},coach:{select:{id:true,name:true}},privateCoursePayment:true,refundRecord:true}});
  if(!b||!['court','private_course'].includes(b.kind))throw fail(404,'Court rental or private course not found.');
  const sales=await tx.transaction.findMany({where:{status:'paid',OR:[{resourceType:'booking',resourceId:b.id},...(b.privateCoursePayment?.transactionId?[{id:b.privateCoursePayment.transactionId}]:[])]},orderBy:{createdAt:'asc'}});
  const payments=sales.filter(s=>s.finalAmount>0).map(s=>({id:s.id,amount:s.finalAmount,method:s.paymentMethod}));
  const seen=new Set<string>();
  for(const h of await tx.bookingChangeHistory.findMany({where:{bookingId:b.id,action:'DESK_BATCH_RESCHEDULED'}})){
    try{const data=JSON.parse(h.current);if(data.surcharge>0&&data.batchId&&!seen.has(data.batchId)){const receipt=await tx.transaction.findFirst({where:{resourceType:'court_reschedule',resourceId:data.batchId,status:'paid'}});if(receipt){seen.add(data.batchId);payments.push({id:receipt.id,amount:Math.min(data.surcharge,receipt.finalAmount),method:receipt.paymentMethod});}}}catch{/* Unattributed historical amounts need reconciliation. */}
  }
  const paid=await paidRentalAmount(tx,b),receiptTotal=payments.reduce((n,p)=>n+p.amount,0);
  const pending=await tx.paymentAttempt.count({where:{resourceId:b.id,status:{in:['INITIATING','PENDING']}}});
  const adjustment=b.privateCoursePayment?await tx.privateCourseAdjustment.findUnique({where:{paymentId:b.privateCoursePayment.id}}):null;
  const blocked=b.refundRecord?'Refund already completed.':b.paymentStatus==='refunded'||adjustment?'A historical refund is already recorded.':pending?'Resolve the pending payment checkout before refunding.':!payments.length||paid==null||paid<=0||paid!==receiptTotal?'Reconcile the original paid receipts before refunding.':b.privateCoursePayment&&b.privateCoursePayment.status!=='PAID'?'The original course payment is not refundable.':null;
  let meta:any={};try{meta=JSON.parse(b.meta||'{}')||{};}catch{}
  const request=await tx.bookingCancellationRequest.findFirst({where:{bookingId:b.id,refundStatus:{not:'not_applicable'}},orderBy:{createdAt:'desc'}});
  const customer={id:b.user.role==='member'?b.userId:null,name:meta.customerName||(b.user.role==='member'?b.user.name:'Walk-in customer'),phone:meta.customerPhone||meta.phone||(b.user.role==='member'?b.user.phone:null)};
  const revision=digest({booking:{id:b.id,status:b.status,paymentStatus:b.paymentStatus,date:b.date,time:b.time,courtId:b.courtId},payments,paid,request:request?.id,requestStatus:request?.refundStatus,refund:b.refundRecord?.id});
  return {b,payments,paid,blocked,request,customer,revision};
}
export async function refundDetails(db:PrismaClient,actor:Actor,id:string){
  staff(actor);const d=await load(db,id);
  return {booking:{id:d.b.id,code:d.b.code,kind:d.b.kind,title:d.b.title,date:d.b.date,time:d.b.time,status:d.b.status,paymentStatus:d.b.paymentStatus},customer:d.customer,court:d.b.court,coach:d.b.coach,paidAmount:d.b.refundRecord?.paidAmount??d.paid,payments:d.payments,request:d.request?{id:d.request.id,reason:d.request.reason,status:d.request.status==='rejected'?'REFUND_REJECTED':d.request.refundStatus}:null,refund:d.b.refundRecord,blocked:d.blocked,revision:d.revision};
}
export async function listRefunds(db:PrismaClient,actor:Actor){
  staff(actor);
  const rows=await db.booking.findMany({where:{kind:{in:['court','private_course']},OR:[{cancellationRequests:{some:{refundStatus:{in:['manual_review','REFUND_REQUESTED','REFUND_PROCESSING','REFUNDED','REFUND_REJECTED']}}}},{refundRecord:{is:{}}}]},select:{id:true},orderBy:{createdAt:'desc'}});
  return Promise.all(rows.map(row=>refundDetails(db,actor,row.id)));
}
export async function memberRefunds(db:PrismaClient,actor:Actor){
  if(actor.role!=='member')throw fail(403,'Member history only.');
  return db.bookingRefund.findMany({where:{customerId:actor.id},select:{id:true,bookingId:true,amount:true,method:true,status:true,processedAt:true,booking:{select:{code:true,title:true,kind:true,date:true,time:true}}},orderBy:{processedAt:'desc'}});
}

/** Notification delivery is retriable from the committed refund, separate from the money ledger. */
export async function deliverRefundNotifications(db:PrismaClient,id?:string,customerId?:string){
  const rows=await db.bookingRefund.findMany({where:{...(id?{id}:{}),...(customerId?{customerId}:{customerId:{not:null}}),notificationDeliveredAt:null},take:50});
  for(const row of rows){
    try{
      await db.notification.upsert({where:{dedupeKey:`refund-completed:${row.id}`},update:{},create:{dedupeKey:`refund-completed:${row.id}`,userId:row.customerId,audience:'member',title:'Refund completed',body:`Staff confirmed that ${row.amount.toLocaleString()} MMK was returned by ${row.method==='CASH'?'cash':'online payment'}. Your reservation has been cancelled.`,link:`/bookings?refund=${row.id}#refunds`,entityType:'booking_refund',entityId:row.id,type:'payment'}});
      await db.bookingRefund.update({where:{id:row.id},data:{notificationDeliveredAt:new Date()}});
    }catch{/* The committed refund remains a durable retry source; no false rollback of returned funds. */}
  }
}
export async function completeRefund(db:PrismaClient,actor:Actor,bookingId:string,raw:RefundInput){
  staff(actor);const input=refundInput.parse(raw),payloadHash=digest({bookingId,...input}),referenceKey=input.method==='ONLINE'?input.reference.toUpperCase():null;
  let result:BookingRefund;
  try{result=await db.$transaction(async tx=>{
    // Court first matches reservations/rescheduling; booking lock serializes every refund and coach decision.
    const location=await tx.booking.findUnique({where:{id:bookingId},select:{courtId:true}});
    if(location?.courtId)await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${location.courtId}`;
    await tx.$executeRaw`UPDATE "Booking" SET date=date WHERE id=${bookingId}`;
    const employee=await tx.user.findUnique({where:{id:actor.id},select:{active:true,role:true}});
    if(!employee?.active||!['admin','badminton_fo'].includes(employee.role))throw fail(403,'An active authorized staff account is required.');
    const existing=await tx.bookingRefund.findUnique({where:{bookingId}});
    if(existing){if(existing.employeeUserId===actor.id&&existing.requestKey===input.requestKey&&existing.payloadHash===payloadHash)return existing;throw fail(409,'Refund already completed. It cannot be edited or repeated.');}
    const d=await load(tx,bookingId);
    if(d.b.courtId!==location?.courtId)throw fail(409,'The booking moved. Refresh the refund review.');
    if(d.blocked)throw fail(409,d.blocked);
    if(input.revision!==d.revision)throw fail(409,'The booking or paid balance changed. Review the refund again.');
    if(input.amount>d.paid!)throw fail(400,'Refund Amount exceeds the eligible paid balance.');
    if(d.b.privateCoursePayment)await tx.$executeRaw`UPDATE "PrivateCoursePayment" SET id=id WHERE id=${d.b.privateCoursePayment.id}`;
    if(referenceKey){
      if(await tx.bookingRefund.findUnique({where:{referenceKey}}))throw fail(409,'This refund Transaction ID has already been used.');
      const originals=[...d.payments.map(p=>p.id),d.b.privateCoursePayment?.providerReference,d.b.privateCoursePayment?.externalReceiptReference,...(await tx.paymentAttempt.findMany({where:{resourceId:bookingId},select:{reference:true,providerReference:true}})).flatMap(p=>[p.reference,p.providerReference])];
      if(originals.some(ref=>ref?.trim().toUpperCase()===referenceKey)||await tx.transaction.findUnique({where:{id:input.reference}})||await tx.transaction.findUnique({where:{id:`desk-online-${createHash('sha256').update(input.reference.toLowerCase()).digest('hex')}`}}))throw fail(400,'Use the actual refund Transaction ID, not an original payment reference.');
      if(await tx.paymentAttempt.findFirst({where:{OR:[{reference:input.reference},{providerReference:input.reference}]}})||await tx.privateCoursePayment.findFirst({where:{OR:[{providerReference:input.reference},{externalReceiptReference:input.reference}]}}))throw fail(400,'This Transaction ID belongs to an original payment, not a refund.');
      const legacy=await tx.privateCourseAdjustment.findMany({select:{reference:true}});
      if(legacy.some(row=>row.reference.trim().toUpperCase()===referenceKey))throw fail(409,'This Transaction ID already belongs to a completed historical refund.');
    }
    const sale=d.payments[0];
    const ledger=await tx.transaction.create({data:{userId:d.customer.id,date:today(),customer:d.customer.name,business:'Badminton',item:`Refund · ${d.b.kind==='court'?'Court rental':'Private course'} · ${d.b.code}`,amount:-input.amount,discount:0,tax:0,finalAmount:-input.amount,paymentMethod:input.method==='CASH'?'Cash':'Online Payment',staff:input.employeeName,status:'refunded',resourceType:'booking_refund',resourceId:bookingId,confirmationMode:'MANUAL',confirmedById:actor.id}});
    const record=await tx.bookingRefund.create({data:{bookingId,cancellationRequestId:d.request?.id,originalTransactionId:sale.id,transactionId:ledger.id,customerId:d.customer.id,customerName:d.customer.name,amount:input.amount,paidAmount:d.paid!,method:input.method,employeeName:input.employeeName,employeeUserId:actor.id,notes:input.notes,refundReference:input.method==='ONLINE'?input.reference:null,referenceKey,requestKey:input.requestKey,payloadHash,sourcePayments:json(d.payments)}});
    await tx.booking.update({where:{id:bookingId},data:{status:'CANCELLED',paymentStatus:'refunded',reservationExpiresAt:null,paymentExpiresAt:null}});
    if(d.b.privateCoursePayment){
      await tx.privateCoursePayment.update({where:{id:d.b.privateCoursePayment.id},data:{status:'REFUNDED'}});
      await tx.privateCourseAdjustment.create({data:{paymentId:d.b.privateCoursePayment.id,actorId:actor.id,amount:input.amount,reason:input.notes,evidence:`Manual ${input.method} refund confirmed by ${input.employeeName}; refund record ${record.id}`,reference:input.reference||record.id}});
    }
    await tx.privateRescheduleRequest.updateMany({where:{bookingId,status:'PENDING'},data:{status:'WITHDRAWN',pendingKey:null,reviewedById:actor.id,reviewedAt:new Date(),reviewReason:'Refund completed; reservation cancelled.'}});
    const requests=await tx.bookingRescheduleRequest.findMany({where:{bookingId,activeKey:bookingId}});
    for(const request of requests){await tx.bookingRescheduleRequest.update({where:{id:request.id},data:{status:'REFUNDED',activeKey:null,completedAt:new Date(),response:'REFUNDED'}});await tx.rescheduleRequestEvent.create({data:{requestId:request.id,actorId:actor.id,status:'REFUNDED',detail:{refundId:record.id,amount:record.amount,method:record.method}}});}
    await tx.bookingCancellationRequest.updateMany({where:{bookingId,refundStatus:{not:'not_applicable'}},data:{status:'completed',refundStatus:'REFUNDED',reviewedById:actor.id,reviewedAt:new Date(),reviewReason:'Refund completed by authorized staff'}});
    await tx.bookingChangeHistory.create({data:{bookingId,requestedById:actor.id,approvedById:actor.id,action:'REFUND_COMPLETED',previous:JSON.stringify({status:d.b.status,paymentStatus:d.b.paymentStatus}),current:JSON.stringify({status:'CANCELLED',paymentStatus:'refunded',refundId:record.id,amount:record.amount,method:record.method,employeeUserId:actor.id}),reason:'Staff confirmed refund already issued',policyException:false}});
    return record;
  },{maxWait:10000,timeout:20000});}catch(error){if(['P2002','P2034'].includes((error as {code?:string}).code||''))throw fail(409,'A refund or refund Transaction ID was already recorded. Refresh before retrying.');throw error;}
  await deliverRefundNotifications(db,result.id).catch(()=>undefined);
  return result;
}

/** Separate transactions/receipts per booking; a failed item never masks a committed refund. */
export async function previewRefundBatch(db: PrismaClient, actor: Actor, bookingIds: string[]) {
  staff(actor);
  if (!bookingIds.length || bookingIds.length > 30 || new Set(bookingIds).size !== bookingIds.length) throw fail(400, 'Select between 1 and 30 different bookings.');
  const rows = [];
  for (const bookingId of bookingIds) {
    try { rows.push({ bookingId, detail: await refundDetails(db, actor, bookingId), error: null }); }
    catch (error) { if ((error as { statusCode?: number }).statusCode !== 404) throw error; rows.push({ bookingId, detail: null, error: 'Booking not found.' }); }
  }
  return rows;
}
export async function completeRefundBatch(db: PrismaClient, actor: Actor, items: { bookingId: string; input: unknown }[]) {
  staff(actor);
  if (!items.length || items.length > 30 || new Set(items.map(item => item.bookingId)).size !== items.length) throw fail(400, 'Select between 1 and 30 different bookings.');
  const results = [];
  for (const item of items) {
    const parsed = refundInput.safeParse(item.input);
    if (!parsed.success) { results.push({ bookingId: item.bookingId, status: 'failed' as const, message: parsed.error.issues.map(issue => issue.message).join(' ') }); continue; }
    try {
      const refund = await completeRefund(db, actor, item.bookingId, parsed.data);
      results.push({ bookingId: item.bookingId, status: 'completed' as const, refundId: refund.id, amount: refund.amount });
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode;
      results.push({ bookingId: item.bookingId, status: 'failed' as const, message: code && code < 500 && error instanceof Error ? error.message : 'This refund could not be recorded. Retry with the same details or ask an administrator to check it.' });
    }
  }
  return { results, completedCount: results.filter(row => row.status === 'completed').length, failedCount: results.filter(row => row.status === 'failed').length };
}
