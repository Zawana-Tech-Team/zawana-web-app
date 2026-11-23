import { rentalDestinationPrice } from './rentalPricing.js';
import { affectedBookingMessage, requestMessage, requestScheduleMessage } from '../domain/requestMessages.js';
import { replacementSlots } from './rescheduleAvailability.js';
import { paidRentalAmount } from './rentalPaymentBalance.js';
import type { Booking, BookingRescheduleRequest, Prisma, PrismaClient } from '@prisma/client';
import { bookingFailure as fail } from './courtBooking.js';
import { assertDestination, digest, validateDestination, type Actor } from './deskMoves.js';
import { range } from './courtPolicy.js';
import { rescheduleEligibility, scheduleInstant } from './courtChanges.js';
type Tx = Prisma.TransactionClient;
export const requestSnapshot = (b: Booking) => ({ id: b.id, courtId: b.courtId, coachId: b.coachId, date: b.date, time: b.time, status: b.status, price: b.price, paymentStatus: b.paymentStatus });
const asJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function requestStaffNotice(tx: Tx, id: string, title: string, body: string) {
  await tx.notification.createMany({ data: ['admin','badminton_fo'].map(audience => ({ userId: null, audience, title, body, link: `/${audience === 'admin' ? 'admin/court-rentals' : 'badminton-fo/bookings'}?request=${id}`, entityType: 'reschedule_request', entityId: id, type: 'reschedule' })) });
}
export async function requestEvent(tx: Tx, id: string, actorId: string, status: string, detail: unknown) {
  await tx.rescheduleRequestEvent.create({ data: { requestId:id, actorId,status,detail:asJson(detail) } });
}
export async function staffBookingDetail(db: PrismaClient, actor:Actor,id:string){
  if(!['admin','badminton_fo'].includes(actor.role))throw fail(403,'Only badminton staff may view customer contacts.');
  await listBookingRequests(db,actor,id);
  const b=await db.booking.findUnique({where:{id},include:{user:{select:{id:true,name:true,phone:true,role:true,active:true}},court:{select:{id:true,name:true,floor:true}},coach:{select:{name:true}}}});
  if(!b||!['court','private_course'].includes(b.kind))throw fail(404,'Booking not found.');
  let meta:any={};try{meta=JSON.parse(b.meta||'{}');}catch{}
  const linked=b.user.role==='member';
  return {booking:{id:b.id,code:b.code,kind:b.kind,date:b.date,time:b.time,status:b.status,paymentStatus:b.paymentStatus,price:b.price},customer:{name:meta.customerName||(linked?b.user.name:null),phone:meta.customerPhone||meta.phone||(linked?b.user.phone:null),linked:linked&&b.user.active},court:b.court,coach:b.coach,paidAmount:await paidRentalAmount(db,b),request:await db.bookingRescheduleRequest.findFirst({where:{bookingId:id,activeKey:id}})};
}
function requireRequestStaff(actor: Actor) {
  if (!['admin','badminton_fo'].includes(actor.role)) throw fail(403,'Only badminton staff can send requests.');
}
async function createStaffRequestInTransaction(tx: Tx, actor: Actor, bookingId: string, reason: string, notes = '', notify = true) {
  await tx.$executeRaw`UPDATE "Booking" SET date=date WHERE id=${bookingId}`;
  const b=await tx.booking.findUnique({where:{id:bookingId},include:{court:{select:{name:true}},user:{select:{id:true,role:true,active:true}}}});
  if(!b||!['court','private_course'].includes(b.kind)||!['confirmed','CONFIRMED'].includes(b.status)||b.paymentStatus==='refunded')throw fail(409,'Only confirmed court rentals and private courses can receive requests.');
  if(b.user.role!=='member'||!b.user.active)throw fail(409,'This booking has no linked active member account. Contact the customer directly instead.');
  const existing=await tx.bookingRescheduleRequest.findUnique({where:{activeKey:bookingId}});
  if(existing){
    const changed=Object.entries(requestSnapshot(b)).some(([key,value])=>(existing.oldSchedule as Record<string,unknown>)[key]!==value);
    if(existing.status==='REFUND_REQUESTED'||(!changed&&existing.expiresAt>new Date()&&!(existing.requestedById===existing.customerId&&existing.response==null)))return {request:existing,created:false};
    const status=existing.expiresAt<=new Date()?'EXPIRED':'CANCELLED';
    await tx.bookingRescheduleRequest.update({where:{id:existing.id},data:{status,activeKey:null}});
    if(existing.privateProposalId)await tx.privateRescheduleRequest.updateMany({where:{id:existing.privateProposalId,status:'PENDING'},data:{status:'EXPIRED',pendingKey:null,reviewedAt:new Date(),reviewReason:'Previous staff request closed.'}});
    await requestEvent(tx,existing.id,actor.id,status,{replacedByNewRequest:true});
  }
  const row=await tx.bookingRescheduleRequest.create({data:{bookingId,activeKey:bookingId,customerId:b.userId,requestedById:actor.id,kind:b.kind,reason,oldSchedule:notify?requestSnapshot(b):{...requestSnapshot(b),courtName:b.court?.name||null},oldPaid:await paidRentalAmount(tx,b),expiresAt:new Date(Date.now()+7*86400000)}});
  await requestEvent(tx,row.id,actor.id,row.status,{reason,notes,message:notify?requestMessage(reason):affectedBookingMessage(reason),...(!notify?{messageVersion:'AFFECTED_NOTICE_V1'}:{}),original:requestSnapshot(b)});
  if (notify) await tx.notification.create({data:{userId:b.userId,audience:'member',title:'Reschedule Request',body:`${requestMessage(reason)}\n\n${requestScheduleMessage({court:b.court?.name,date:b.date,time:b.time})}`,link:`/bookings?request=${row.id}`,type:'reschedule',entityType:'reschedule_request',entityId:row.id}});
  return {request:row,created:true};
}
export async function createStaffRequest(db:PrismaClient,actor:Actor,bookingId:string,reason='',notes=''){
 requireRequestStaff(actor);
 return db.$transaction(async tx => (await createStaffRequestInTransaction(tx,actor,bookingId,reason,notes)).request);
}

/** Batch delivery reuses the per-booking lifecycle and commits every notification together. */
export async function createStaffRequests(db: PrismaClient, actor: Actor, bookingIds: string[], reason = '', notes = '', requestKey?: string) {
  requireRequestStaff(actor);
  if (!bookingIds.length || bookingIds.length > 30 || new Set(bookingIds).size !== bookingIds.length)
    throw fail(400, 'Select between 1 and 30 different rental bookings.');
  return db.$transaction(async tx => {
    const payloadHash = digest({ operation: 'REQUEST_BATCH', ids: [...bookingIds].sort(), reason, notes });
    if (requestKey) {
      const prior = await tx.deskMoveBatch.findUnique({ where: { actorId_requestKey: { actorId: actor.id, requestKey } } });
      if (prior) {
        if (prior.payloadHash !== payloadHash) throw fail(409, 'This retry key belongs to another submission.');
        return prior.result as unknown as { requests: BookingRescheduleRequest[]; createdCount: number; existingCount: number };
      }
      await tx.deskMoveBatch.create({ data: { actorId: actor.id, requestKey, payloadHash, reason: 'Grouped booking requests', result: {} } });
    }
    const ids = [...bookingIds].sort();
    for (const id of ids) await tx.$executeRaw`UPDATE "Booking" SET date=date WHERE id=${id}`;
    const bookings = await tx.booking.findMany({where:{id:{in:ids}},include:{user:{select:{id:true,name:true,role:true,active:true}}}});
    if (bookings.length !== ids.length || bookings.some(b => b.kind !== 'court'))
      throw fail(409, 'Select existing Court Rental bookings only.');
    const name = (b: typeof bookings[number]) => {
      let meta: {customerName?:string} = {}; try { meta = JSON.parse(b.meta || '{}'); } catch {}
      const value = meta.customerName || (b.user.role === 'member' ? b.user.name : '');
      return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase() : '';
    };
    for (let i = 0; i < bookings.length; i++) {
      const b = bookings[i];
      if (b.user.role !== 'member' || !b.user.active)
        throw fail(409, `${b.code} has no linked active member account. Contact the customer directly or remove this rental.`);
      if (bookings.slice(0,i).some(other => other.userId !== b.userId && (!name(b) || name(b) !== name(other))))
        throw fail(409, 'Selected rentals must share the same customer name or member account.');
    }
    const results = [];
    for (const id of ids) results.push(await createStaffRequestInTransaction(tx,actor,id,reason,notes,false));
    const fresh = results.filter(result => result.created).map(result => result.request);
    for (const recipientId of [...new Set(fresh.map(row => row.customerId))]) {
      const children = fresh.filter(row => row.customerId === recipientId);
      const id = `batch-${digest({ actor: actor.id, recipientId, requests: children.map(row => row.id).sort() })}`;
      await tx.bookingRequestBatch.create({ data: { id, senderId: actor.id, recipientId, reason } });
      await tx.bookingRescheduleRequest.updateMany({ where: { id: { in: children.map(row => row.id) } }, data: { batchId: id } });
      for (const child of children) child.batchId = id;
      await tx.notification.create({ data: { userId: recipientId, audience: 'member', title: `${children.length} ${children.length===1?'Request':'Requests'}`, body: affectedBookingMessage(reason), link: `/bookings?batch=${id}`, type: 'reschedule', entityType: 'reschedule_batch', entityId: id } });
    }
    const createdCount = results.filter(result => result.created).length;
    const result = {requests:results.map(result => result.request),createdCount,existingCount:results.length-createdCount};
    if (requestKey) await tx.deskMoveBatch.update({ where: { actorId_requestKey: { actorId: actor.id, requestKey } }, data: { result: asJson(result) } });
    return result;
  }, {maxWait:5000,timeout:15000});
}

export async function listBookingRequests(db:PrismaClient,actor:Actor,bookingId?:string){
 if(!['member','admin','badminton_fo'].includes(actor.role))throw fail(403,'Not allowed.');
 const scope={...(actor.role==='member'?{customerId:actor.id}:{}),...(bookingId?{bookingId}:{})};
 const pending=await db.bookingRescheduleRequest.findMany({where:{...scope,activeKey:{not:null},status:{not:'REFUND_REQUESTED'}},include:{booking:true}});
 for(const candidate of pending.filter(row=>row.expiresAt<=new Date()||Object.entries(requestSnapshot(row.booking)).some(([key,value])=>(row.oldSchedule as Record<string,unknown>)[key]!==value)))await db.$transaction(async tx=>{
  await tx.$executeRaw`UPDATE "Booking" SET date=date WHERE id=${candidate.bookingId}`;
  const row=await tx.bookingRescheduleRequest.findUniqueOrThrow({where:{id:candidate.id},include:{booking:true}});
  if(!row.activeKey||row.status==='REFUND_REQUESTED')return;
  const expired=row.expiresAt<=new Date(), changed=Object.entries(requestSnapshot(row.booking)).some(([key,value])=>(row.oldSchedule as Record<string,unknown>)[key]!==value);
  if(!expired&&!changed)return;
  const status=expired?'EXPIRED':'CANCELLED';await tx.bookingRescheduleRequest.update({where:{id:row.id},data:{status,activeKey:null}});
  if(row.privateProposalId)await tx.privateRescheduleRequest.updateMany({where:{id:row.privateProposalId,status:'PENDING'},data:{status:'EXPIRED',pendingKey:null,reviewedAt:new Date(),reviewReason:expired?'Staff request expired.':'Original booking changed.'}});
  await requestEvent(tx,row.id,row.requestedById,status,{origin:'system',reason:expired?'Request lifetime ended':'Original booking changed'});
 });
 const rows = await db.bookingRescheduleRequest.findMany({where:scope,include:{batch:true,booking:{select:{code:true,title:true,date:true,time:true,courtId:true,kind:true,status:true,paymentStatus:true,court:{select:{id:true,name:true,floor:true}},coach:{select:{name:true}},user:{select:{name:true,...(actor.role==='member'?{}:{phone:true})}}}},events:{orderBy:{createdAt:'asc'}}},orderBy:{updatedAt:'desc'}});
 const originalCourtIds = [...new Set(rows.filter(row => row.batchId).map(row => (row.oldSchedule as {courtId?:string}).courtId).filter((id):id is string=>!!id))];
 const names = new Map((originalCourtIds.length ? await db.court.findMany({where:{id:{in:originalCourtIds}},select:{id:true,name:true}}) : []).map(court=>[court.id,court.name]));
 // Opening a member flow creates an auditable draft, not an incoming staff request.
 return rows.filter(row=>row.requestedById!==row.customerId||row.response!=null).map(row=>{
   const original = row.oldSchedule as {courtId?:string;courtName?:string};
   return {...row,originalCourtName:row.batchId?(original.courtName||names.get(original.courtId||'')||null):null};
 });
}
/** Member entry points reuse the request lifecycle, without granting staff timing exceptions. */
export async function startMemberReschedule(db:PrismaClient,actor:Actor,bookingId:string,requestId?:string){
 if(actor.role!=='member')throw fail(403,'Only members may open self-rescheduling.');
 await listBookingRequests(db,actor,bookingId);
 return db.$transaction(async tx=>{
  await tx.$executeRaw`UPDATE "Booking" SET date=date WHERE id=${bookingId}`;
  const booking=await tx.booking.findUnique({where:{id:bookingId},include:{court:{select:{name:true}},coach:{select:{name:true}}}});
  if(!booking||booking.userId!==actor.id||!['court','private_course'].includes(booking.kind))throw fail(404,'Booking not found.');
  let row=await tx.bookingRescheduleRequest.findUnique({where:requestId?{id:requestId}:{activeKey:bookingId}});
  if(requestId&&(!row||row.bookingId!==bookingId||row.customerId!==actor.id))throw fail(404,'Request not found.');
  if(row)await own(tx,actor,row.id);
  else{
   const policy=rescheduleEligibility(booking);
   if(!policy.eligible)throw fail(409,policy.message);
   if(booking.paymentStatus==='refunded')throw fail(409,'Refunded bookings cannot be rescheduled.');
   row=await tx.bookingRescheduleRequest.create({data:{bookingId,activeKey:bookingId,customerId:actor.id,requestedById:actor.id,kind:booking.kind,reason:'Member self-reschedule',oldSchedule:{...requestSnapshot(booking),courtName:booking.court?.name||null},oldPaid:await paidRentalAmount(tx,booking),expiresAt:new Date(Math.min(Date.now()+7*86400000,scheduleInstant(booking.date,booking.time).getTime()))}});
   await requestEvent(tx,row.id,actor.id,row.status,{origin:'member',bookingUnchanged:true});
  }
  enforceMemberTiming(row,booking);
  if(booking.kind==='private_course'&&await tx.privateRescheduleRequest.findFirst({where:{pendingKey:bookingId}}))throw fail(409,'A proposal is already awaiting your coach. Withdraw it from Requests before choosing another session.');
  return {id:row.id,bookingId,kind:row.kind,reason:row.reason,status:row.status,original:row.oldSchedule,booking:{code:booking.code,title:booking.title,price:booking.price,courtName:booking.court?.name,coachName:booking.coach?.name},staffRequested:row.requestedById!==actor.id};
 });
}
function enforceMemberTiming(row:{requestedById:string;customerId:string},booking:Booking){
 if(row.requestedById===row.customerId){const policy=rescheduleEligibility(booking);if(!policy.eligible)throw fail(409,policy.message);}
}
async function own(tx:Tx,actor:Actor,id:string){
 const row=await tx.bookingRescheduleRequest.findUnique({where:{id},include:{booking:true}});
 if(!row||row.customerId!==actor.id||actor.role!=='member')throw fail(404,'Request not found.');
 if(!row.activeKey||row.expiresAt<=new Date()||!['PENDING_CUSTOMER','CUSTOMER_SELECTING','ADMIN_HANDLING','AWAITING_ADDITIONAL_PAYMENT'].includes(row.status))throw fail(409,'This request no longer accepts a response.');
 if(!['confirmed','CONFIRMED'].includes(row.booking.status))throw fail(409,'This booking is no longer confirmed.');
 if(Object.entries(requestSnapshot(row.booking)).some(([key,value])=>(row.oldSchedule as Record<string,unknown>)[key]!==value))throw fail(409,'The original booking changed. Ask staff to review the request.');
 return row;
}
export async function customerRequestAction(db:PrismaClient,actor:Actor,id:string,action:'ADMIN_HANDLING'|'REFUND_REQUESTED'|'DECLINED'|'ACKNOWLEDGED'){
 return db.$transaction(async tx=>{
  const initial=await tx.bookingRescheduleRequest.findUnique({where:{id},select:{bookingId:true}});
  if(!initial)throw fail(404,'Request not found.');
  await tx.$executeRaw`UPDATE "Booking" SET date=date WHERE id=${initial.bookingId}`;
  await tx.$executeRaw`UPDATE "BookingRescheduleRequest" SET status=status WHERE id=${id}`;
  const acknowledged = await tx.bookingRescheduleRequest.findUnique({where:{id}});
  if (action === 'ACKNOWLEDGED' && acknowledged?.status === 'ACKNOWLEDGED') {
    if (actor.role !== 'member' || acknowledged.customerId !== actor.id) throw fail(404,'Request not found.');
    return acknowledged;
  }
  const row=await own(tx,actor,id);
  if (action === 'ACKNOWLEDGED') throw fail(400,'Accept requires selecting and confirming a replacement session.');
  if (row.batchId && action === 'DECLINED') throw fail(400,'Choose Accept, Refund or Admin Handle for this notice.');
  if (row.status === action) return row;
  if (action === 'DECLINED') {
    if (row.privateProposalId) await tx.privateRescheduleRequest.updateMany({ where: { id: row.privateProposalId, status: 'PENDING' }, data: { status: 'WITHDRAWN', pendingKey: null, reviewedAt: new Date(), reviewedById: actor.id, reviewReason: 'Customer declined the staff request.' } });
    const result = await tx.bookingRescheduleRequest.update({ where: { id }, data: { status: 'DECLINED', response: 'DECLINED', activeKey: null, completedAt: new Date() } });
    await requestEvent(tx, id, actor.id, 'DECLINED', { bookingUnchanged: true });
    await requestStaffNotice(tx, id, 'Customer declined reschedule request', `${row.booking.code} · Original booking and payment remain unchanged.`);
    return result;
  }
  if(row.kind==='private_course'&&action==='ADMIN_HANDLING')throw fail(400,'Private courses offer Reschedule or Refund only.');
  if(row.privateProposalId&&action==='REFUND_REQUESTED') {
    const withdrawn=await tx.privateRescheduleRequest.updateMany({where:{id:row.privateProposalId,status:'PENDING'},data:{status:'WITHDRAWN',pendingKey:null,reviewedById:actor.id,reviewedAt:new Date(),reviewReason:'Customer requested refund review instead.'}});
    if(withdrawn.count) { const coach=await tx.coach.findUnique({where:{id:row.booking.coachId||''},select:{userId:true}});if(coach?.userId)await tx.notification.create({data:{userId:coach.userId,title:'Reschedule proposal withdrawn',body:'Customer requested refund review. Do not change the original session.',link:'/coach/bookings',entityType:'private_reschedule',entityId:row.bookingId,type:'reschedule'}}); }
  }
  if(action==='REFUND_REQUESTED'&&!await tx.bookingCancellationRequest.findFirst({where:{bookingId:row.bookingId,status:'requested'}}))await tx.bookingCancellationRequest.create({data:{bookingId:row.bookingId,requestedById:actor.id,reason:row.reason||'Customer requested refund after staff reschedule request',status:'requested',refundStatus:'manual_review'}});
  const result=await tx.bookingRescheduleRequest.update({where:{id},data:{status:action,response:action}});
  await requestEvent(tx,id,actor.id,action,{bookingUnchanged:true});await requestStaffNotice(tx,id,action==='ADMIN_HANDLING'?'Customer requested staff assistance':'Refund Requested',`${row.booking.code} · No booking or payment was changed.`);
  return result;
 });
}
export type CustomerTarget={courtId:string;date:string;time:string};
async function quote(tx:Tx,actor:Actor,id:string,target:CustomerTarget){
 const row=await own(tx,actor,id);
 enforceMemberTiming(row,row.booking);
 if(row.booking.paymentStatus==='refunded')throw fail(409,'Refunded bookings cannot be rescheduled.');
 if(await tx.paymentAttempt.findFirst({where:{resourceId:row.bookingId,status:{in:['INITIATING','PENDING']}}}))throw fail(409,'Resolve the existing payment checkout before rescheduling.');
 const b=row.booking,span=range(b.time)!;validateDestination(target,span.end-span.start);
 if(scheduleInstant(b.date,b.time)<=new Date())throw fail(409,'This session has started. Please request staff assistance or refund review.');
 if(b.courtId===target.courtId&&b.date===target.date&&b.time===target.time)throw fail(400,'Choose a different session.');
 const court=await assertDestination(tx,target,[b.id],b.kind==='private_course'?b.coachId||undefined:undefined);
 const holiday=await tx.holidayRate.findUnique({where:{date:target.date}});
 const paid=await paidRentalAmount(tx,b);
 const newPrice=b.kind==='private_course'?b.price:rentalDestinationPrice(court.price,range(target.time)!.start,span.end-span.start,holiday);
 const difference=b.kind==='private_course'?0:paid==null||b.paymentStatus!=='paid'?null:newPrice-paid;
 return {row,booking:b,target,newPrice,paidAmount:paid,priceDifference:difference,revision:digest({original:requestSnapshot(b),target,newPrice,paid,status:row.status,updatedAt:row.updatedAt,history:await tx.bookingChangeHistory.count({where:{bookingId:b.id}})}),courtName:court.name};
}
export async function quoteCustomerRequest(db:PrismaClient,actor:Actor,id:string,target:CustomerTarget){return db.$transaction(async tx=>{const q=await quote(tx,actor,id,target);return {revision:q.revision,newPrice:q.newPrice,paidAmount:q.paidAmount,priceDifference:q.priceDifference,courtName:q.courtName};});}
export async function requestAvailability(db:PrismaClient,actor:Actor,id:string,date:string,courtId:string){
 return db.$transaction(async tx => { const row = await own(tx, actor, id); enforceMemberTiming(row,row.booking); return replacementSlots(tx, row.booking, date, courtId); });
}
export async function confirmCustomerRequest(db:PrismaClient,actor:Actor,id:string,target:CustomerTarget,revision:string,acknowledged:boolean){
 return db.$transaction(async tx=>{
  const initial=await tx.bookingRescheduleRequest.findUnique({where:{id},include:{booking:true}});if(!initial||initial.customerId!==actor.id||actor.role!=='member')throw fail(404,'Request not found.');
  for(const courtId of [...new Set([initial.booking.courtId,target.courtId].filter((x):x is string=>!!x))].sort())await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${courtId}`;
  await tx.$executeRaw`UPDATE "Booking" SET date=date WHERE id=${initial.bookingId}`;await tx.$executeRaw`UPDATE "BookingRescheduleRequest" SET status=status WHERE id=${id}`;
  const current=await tx.bookingRescheduleRequest.findUniqueOrThrow({where:{id}});if(current.status==='COMPLETED')return current;
  const q=await quote(tx,actor,id,target);
  if(q.revision!==revision)throw fail(409,'The price or request changed. Review a fresh quote.');
  if(q.row.kind!=='court')throw fail(400,'Private course replacements require coach approval.');
  if(q.priceDifference!=null&&q.priceDifference<0&&!acknowledged)throw fail(400,'Acknowledge that the price difference is non-refundable.');
  const needsStaff=q.priceDifference==null||q.priceDifference>0;
  const status=needsStaff?q.priceDifference==null?'ADMIN_HANDLING':'AWAITING_ADDITIONAL_PAYMENT':'COMPLETED';
  if(!needsStaff){await tx.booking.update({where:{id:q.booking.id},data:{courtId:target.courtId,date:target.date,time:target.time,title:q.courtName,price:Math.max(q.booking.price,q.paidAmount||0)}});await tx.bookingChangeHistory.create({data:{bookingId:q.booking.id,action:'CUSTOMER_REQUEST_RESCHEDULED',requestedById:actor.id,previous:JSON.stringify(requestSnapshot(q.booking)),current:JSON.stringify({target,priceAcknowledged:acknowledged,priceDifference:q.priceDifference}),reason:q.row.reason||'Customer accepted staff reschedule request'}});}
  const result=await tx.bookingRescheduleRequest.update({where:{id},data:{status,response:'RESCHEDULE',proposed:target,newPrice:q.newPrice,priceDifference:q.priceDifference,oldPaid:q.paidAmount,priceAcknowledged:acknowledged,...(!needsStaff?{activeKey:null,completedAt:new Date()}:{})}});
  await requestEvent(tx,id,actor.id,status,{target,paid:q.paidAmount,newPrice:q.newPrice,difference:q.priceDifference,acknowledged});if(!needsStaff)await tx.notification.create({data:{userId:actor.id,title:'Booking rescheduled',body:`${q.courtName} · ${target.date} · ${target.time}`,link:'/bookings',type:'booking',entityType:'booking',entityId:q.booking.id}});await requestStaffNotice(tx,id,status==='COMPLETED'?'Customer rescheduled booking':'Reschedule needs payment assistance',`${q.booking.code} · ${target.date} · ${target.time}`);
  return result;
 },{maxWait:10000,timeout:20000});
}

export async function cancelStaffRequest(db:PrismaClient,actor:Actor,id:string){
 if(!['admin','badminton_fo'].includes(actor.role))throw fail(403,'Only staff can close a request.');
 return db.$transaction(async tx=>{
 const initial=await tx.bookingRescheduleRequest.findUnique({where:{id}});if(!initial)throw fail(404,'Request not found.');
 await tx.$executeRaw`UPDATE "Booking" SET date=date WHERE id=${initial.bookingId}`;
 await tx.$executeRaw`UPDATE "BookingRescheduleRequest" SET status=status WHERE id=${id}`;
 const row=await tx.bookingRescheduleRequest.findUniqueOrThrow({where:{id}});
 if(!row.activeKey)return row;if(row.status==='REFUND_REQUESTED')throw fail(409,'Resolve this refund request through the finance review workflow.');
 if(row.privateProposalId)await tx.privateRescheduleRequest.updateMany({where:{id:row.privateProposalId,status:'PENDING'},data:{status:'WITHDRAWN',pendingKey:null,reviewedById:actor.id,reviewedAt:new Date(),reviewReason:'Staff closed the reschedule request.'}});
 const result=await tx.bookingRescheduleRequest.update({where:{id},data:{status:'CANCELLED',activeKey:null}});await requestEvent(tx,id,actor.id,'CANCELLED',{bookingUnchanged:true});
 await tx.notification.create({data:{userId:row.customerId,title:'Reschedule request closed',body:'Your original booking and payment remain unchanged.',link:`/bookings?request=${id}`,type:'reschedule',entityType:'reschedule_request',entityId:id}});return result;
 });
}
