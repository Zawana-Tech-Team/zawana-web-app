import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readdirSync,readFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{DatabaseSync}from'node:sqlite';import{randomUUID}from'node:crypto';import{PrismaClient}from'@prisma/client';
import {completeRefundBatch,previewRefundBatch,completeRefund,refundDetails,refundInput,memberRefunds,deliverRefundNotifications,listRefunds} from '../src/services/bookingRefunds.js';
import {createStaffRequest,customerRequestAction} from '../src/services/bookingRequests.js';
import {courtAvailability} from '../src/services/courtAvailability.js';
import {today}from'../src/services/courtPolicy.js';import{addDateKeyDays}from'../src/utils/dateKeys.js';
import {recognizedLedgerRevenue,presentTransactions,categoryWhere} from '../src/services/transactionPresentation.js';

test('audited manual booking refunds, exact availability release and notification retry',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'refund-')),file=join(dir,'qa.db'),sql=new DatabaseSync(file),root=new URL('../prisma/migrations/',import.meta.url);for(const n of readdirSync(root).filter(n=>/^\d/.test(n)).sort())sql.exec(readFileSync(new URL(`${n}/migration.sql`,root),'utf8'));sql.close();const db=new PrismaClient({datasources:{db:{url:`file:${file}`}}});
 try{
 const user=(role:'member'|'admin'|'badminton_fo'|'coach')=>db.user.create({data:{name:role,email:`${randomUUID()}@test.local`,role,phone:'09123456789'}});
 const [member,other,fo,admin,coachUser]=await Promise.all([user('member'),user('member'),user('badminton_fo'),user('admin'),user('coach')]);
 const court=await db.court.create({data:{name:'Court 1',type:'Standard',surface:'Indoor',price:30000,features:[]}}),coach=await db.coach.create({data:{userId:coachUser.id,name:'Coach',department:'Badminton',specialty:'Badminton',phone:'',email:coachUser.email}});
 let counter=0;
 const make=async(kind:'court'|'private_course'='court')=>{
 const b=await db.booking.create({data:{code:randomUUID(),kind,userId:member.id,courtId:court.id,...(kind==='private_course'?{coachId:coach.id}:{}),title:'Refund QA',location:'Arena',date:addDateKeyDays(today(),++counter),time:'9:00 AM — 10:00 AM',price:30000,status:'CONFIRMED',paymentStatus:'paid'}});
 const receipt=await db.transaction.create({data:{resourceType:'booking',resourceId:b.id,userId:member.id,date:b.date,customer:member.name,business:'Badminton',item:`${kind==='court'?'Court rental':'Private course'} · QA`,amount:30000,discount:0,tax:0,finalAmount:30000,paymentMethod:'Cash',staff:fo.name,status:'paid'}});
 if(kind==='private_course')await db.privateCoursePayment.create({data:{bookingId:b.id,transactionId:receipt.id,amount:30000,paymentSource:'BADMINTON_FO',paymentMethod:'CASH',status:'PAID',collectedByUserId:fo.id,receivedAt:new Date()}});
 return {b,receipt};};
 const input=async(id:string,actor=fo,extra:Record<string,unknown>={})=>refundInput.parse({amount:30000,method:'CASH',employeeName:actor.name,notes:'Cash returned to customer and receipt acknowledged',reference:'',confirmed:true,revision:(await refundDetails(db,actor,id)).revision,requestKey:randomUUID(),...extra});
 const slot=async(b:{date:string;courtId:string|null;time:string})=>(await courtAvailability(db,b.date)).slots.find(s=>s.courtId===b.courtId&&s.time===b.time)!;
 await t.test('pending request holds its slot; cash completion preserves receipt and releases exactly this booking',async()=>{
 const {b,receipt}=await make(),request=await createStaffRequest(db,fo,b.id);await customerRequestAction(db,member,request.id,'REFUND_REQUESTED');assert.equal((await slot(b)).available,false);assert.equal(await db.bookingRefund.count(),0);
 assert.ok((await listRefunds(db,admin)).some(d=>d.booking.id===b.id));const otherBooking=await make();const refund=await completeRefund(db,fo,b.id,await input(b.id,fo,{employeeName:'Front desk employee'}));
 assert.equal(refund.employeeUserId,fo.id);assert.equal(refund.employeeName,'Front desk employee');assert.equal(refund.originalTransactionId,receipt.id);assert.equal(refund.refundReference,null);assert.equal(refund.status,'REFUNDED');assert.equal((await slot(b)).available,true);assert.equal((await slot(otherBooking.b)).available,false);
 assert.deepEqual(await db.transaction.findUnique({where:{id:receipt.id}}),receipt);assert.deepEqual(await db.booking.findUnique({where:{id:otherBooking.b.id}}),otherBooking.b);assert.equal((await db.booking.findUniqueOrThrow({where:{id:b.id}})).status,'CANCELLED');assert.equal((await db.bookingRescheduleRequest.findUniqueOrThrow({where:{id:request.id}})).status,'REFUNDED');assert.equal((await db.bookingCancellationRequest.findFirstOrThrow({where:{bookingId:b.id}})).refundStatus,'REFUNDED');
 const negative=await db.transaction.findUniqueOrThrow({where:{id:refund.transactionId}});assert.equal(negative.finalAmount,-30000);assert.equal(negative.confirmedById,fo.id);assert.equal((await presentTransactions(db,[negative]))[0].category,'Court Rental');
 });
 await t.test('required fields, confirmation, placeholder references and over-refunds fail without writes',async()=>{
 const {b}=await make(),valid=await input(b.id),count=await db.transaction.count();
 for(const invalid of [{...valid,notes:' '},{...valid,employeeName:''},{...valid,confirmed:false},{...valid,amount:0},{...valid,method:'ONLINE',reference:'123456'},{...valid,method:'ONLINE',reference:'test-refund-123'},{...valid,employeeUserId:admin.id}])await assert.rejects(completeRefund(db,fo,b.id,invalid as never));
 await assert.rejects(completeRefund(db,fo,b.id,{...valid,amount:30001}),/eligible paid balance/);assert.deepEqual(await db.booking.findUnique({where:{id:b.id}}),b);assert.equal(await db.transaction.count(),count);assert.equal(await db.bookingRefund.count({where:{bookingId:b.id}}),0);
 });
 await t.test('online reference is unique, cannot be an original receipt, and replay is immutable',async()=>{
 const first=await make(),second=await make(),valid=await input(first.b.id,admin,{method:'ONLINE',reference:'BANK-RF-726491'});
 await assert.rejects(completeRefund(db,admin,first.b.id,{...valid,reference:first.receipt.id}),/original payment/);
 const record=await completeRefund(db,admin,first.b.id,valid);assert.equal((await completeRefund(db,admin,first.b.id,valid)).id,record.id);
 await assert.rejects(completeRefund(db,admin,first.b.id,{...valid,notes:'Changed internal refund notes'}),/already completed/);
 await assert.rejects(completeRefund(db,fo,second.b.id,await input(second.b.id,fo,{method:'ONLINE',reference:'bank-rf-726491'})),/already been used/);assert.deepEqual(await db.booking.findUnique({where:{id:second.b.id}}),second.b);
 });
 await t.test('private course closes coach reservation/proposals and retains original payment and adjustment audit',async()=>{
 const {b,receipt}=await make('private_course'),p=await db.privateCoursePayment.findUniqueOrThrow({where:{bookingId:b.id}});
 const proposal=await db.privateRescheduleRequest.create({data:{bookingId:b.id,pendingKey:b.id,requestedById:member.id,originalRevision:'old',original:{},courtId:court.id,date:addDateKeyDays(b.date,1),time:b.time,status:'PENDING',reason:'Move'}});
 const record=await completeRefund(db,fo,b.id,await input(b.id));assert.equal((await db.privateCoursePayment.findUniqueOrThrow({where:{id:p.id}})).status,'REFUNDED');assert.equal((await db.privateCourseAdjustment.findUniqueOrThrow({where:{paymentId:p.id}})).amount,30000);assert.equal((await db.privateRescheduleRequest.findUniqueOrThrow({where:{id:proposal.id}})).status,'WITHDRAWN');assert.equal(await db.booking.count({where:{coachId:coach.id,date:b.date,status:{in:['CONFIRMED','PENDING_COACH_CONFIRMATION','AWAITING_PAYMENT']}}}),0);assert.equal((await slot(b)).available,true);assert.deepEqual(await db.transaction.findUnique({where:{id:receipt.id}}),receipt);assert.equal(record.employeeUserId,fo.id);
 });
 await t.test('weekly blocks still hold the court after a booking refund',async()=>{
 const {b}=await make();const block=await db.courtBlock.create({data:{courtId:court.id,date:b.date,start:'09:00',end:'10:00',title:'Weekly class override',type:'class'}});await completeRefund(db,admin,b.id,await input(b.id,admin));assert.equal((await slot(b)).available,false);assert.deepEqual(await db.courtBlock.findUnique({where:{id:block.id}}),block);
 });
 await t.test('member/coach cannot process, unknown receipts cannot be refunded and stale reviews are rejected',async()=>{
 const {b}=await make(),valid=await input(b.id);await assert.rejects(completeRefund(db,member,b.id,valid),/Only Admin/);await assert.rejects(completeRefund(db,coachUser,b.id,valid),/Only Admin/);await assert.rejects(refundDetails(db,other,b.id),/Only Admin/);
 await db.booking.update({where:{id:b.id},data:{title:'Unrelated display change'}});await db.transaction.update({where:{resourceType_resourceId:{resourceType:'booking',resourceId:b.id}},data:{finalAmount:29000,amount:29000}});await assert.rejects(completeRefund(db,fo,b.id,valid),/balance changed/);
 await db.transaction.delete({where:{resourceType_resourceId:{resourceType:'booking',resourceId:b.id}}});await assert.rejects(completeRefund(db,fo,b.id,await input(b.id)),/Reconcile/);assert.equal(await db.bookingRefund.count({where:{bookingId:b.id}}),0);
 });
 await t.test('concurrent same-booking and same-reference refunds cannot double debit or release another booking',async()=>{
 const {b}=await make(),first=await input(b.id),second={...first,requestKey:randomUUID()};const results=await Promise.allSettled([completeRefund(db,fo,b.id,first),completeRefund(db,fo,b.id,second)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await db.bookingRefund.count({where:{bookingId:b.id}}),1);assert.equal(await db.transaction.count({where:{resourceType:'booking_refund',resourceId:b.id}}),1);
 const a=await make(),c=await make(),ref='BANK-RF-924871';const inputs=await Promise.all([input(a.b.id,fo,{method:'ONLINE',reference:ref}),input(c.b.id,admin,{method:'ONLINE',reference:ref})]);const competing=await Promise.allSettled([completeRefund(db,fo,a.b.id,inputs[0]),completeRefund(db,admin,c.b.id,inputs[1])]);assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.equal(await db.booking.count({where:{id:{in:[a.b.id,c.b.id]},status:'CANCELLED'}}),1);
 });
 await t.test('notification failure preserves refund; member polling retries once without leaking notes',async()=>{
 const {b}=await make(),broken=new Proxy(db,{get(target,key){if(key==='notification')return{upsert:async()=>{throw new Error('Delivery unavailable');}};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 const record=await completeRefund(broken,fo,b.id,await input(b.id,fo,{notes:'Internal employee notes never sent to member'}));assert.equal(record.status,'REFUNDED');assert.equal((await db.booking.findUniqueOrThrow({where:{id:b.id}})).status,'CANCELLED');assert.equal((await db.bookingRefund.findUniqueOrThrow({where:{id:record.id}})).notificationDeliveredAt,null);
 await deliverRefundNotifications(db,undefined,member.id);await deliverRefundNotifications(db,undefined,member.id);const notices=await db.notification.findMany({where:{dedupeKey:`refund-completed:${record.id}`}});assert.equal(notices.length,1);assert.ok(!JSON.stringify(notices).includes(record.notes));assert.equal((await memberRefunds(db,other)).some(r=>r.id===record.id),false);assert.ok(!JSON.stringify(await memberRefunds(db,member)).includes(record.notes));
 });
 await t.test('a database failure after refund writes rolls back the entire financial operation',async()=>{
 const {b,receipt}=await make(),request=await createStaffRequest(db,fo,b.id);await customerRequestAction(db,member,request.id,'REFUND_REQUESTED');const valid=await input(b.id);
 const broken=new Proxy(db,{get(target,key){if(key==='$transaction')return(callback:any,options:any)=>db.$transaction(tx=>callback(new Proxy(tx,{get(inner,property){if(property==='bookingChangeHistory')return new Proxy(inner.bookingChangeHistory,{get(model,method){if(method==='create')return async()=>{throw new Error('Audit storage unavailable');};return Reflect.get(model,method);}});return Reflect.get(inner,property);}})),options);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 await assert.rejects(completeRefund(broken,fo,b.id,valid),/Audit storage/);assert.deepEqual(await db.booking.findUnique({where:{id:b.id}}),b);assert.deepEqual(await db.transaction.findUnique({where:{id:receipt.id}}),receipt);assert.equal(await db.bookingRefund.count({where:{bookingId:b.id}}),0);assert.equal(await db.transaction.count({where:{resourceType:'booking_refund',resourceId:b.id}}),0);assert.equal((await db.bookingRescheduleRequest.findUniqueOrThrow({where:{id:request.id}})).status,'REFUND_REQUESTED');
 });
 await t.test('staff can record manual cash or online refunds for simulated rental and private-course receipts',async()=>{
 for(const kind of ['court','private_course'] as const)for(const method of ['CASH','ONLINE'] as const){
 const {b,receipt}=await make(kind);const original=await db.transaction.update({where:{id:receipt.id},data:{confirmationMode:'SIMULATED'}});
 if(kind==='private_course')await db.privateCoursePayment.update({where:{bookingId:b.id},data:{paymentSource:'SIMULATED'}});
 assert.equal((await refundDetails(db,fo,b.id)).blocked,null);
 const refund=await completeRefund(db,fo,b.id,await input(b.id,fo,{method,reference:method==='ONLINE'?`MANUAL-RF-20261117-${randomUUID()}`:'',notes:'Employee confirms refund was manually returned to customer'}));
 assert.equal(refund.status,'REFUNDED');assert.equal(refund.method,method);assert.equal(refund.employeeUserId,fo.id);assert.equal((await db.booking.findUniqueOrThrow({where:{id:b.id}})).paymentStatus,'refunded');
 assert.deepEqual(await db.transaction.findUnique({where:{id:receipt.id}}),original);assert.equal((await db.transaction.findUniqueOrThrow({where:{id:refund.transactionId}})).confirmationMode,'MANUAL');
 }
 });
 await t.test('signed refund ledger yields correct revenue and supports partial refunds without a second refund',async()=>{
 const {b}=await make(),record=await completeRefund(db,fo,b.id,await input(b.id,fo,{amount:10000}));assert.equal(record.amount,10000);const ledger=await db.transaction.aggregate({where:{AND:[recognizedLedgerRevenue,{OR:[{resourceType:'booking',resourceId:b.id},{resourceType:'booking_refund',resourceId:b.id}]}]},_sum:{finalAmount:true}});assert.equal(ledger._sum.finalAmount,20000);assert.equal((await slot(b)).available,true);await assert.rejects(completeRefund(db,fo,b.id,await input(b.id)),/already completed/);const where=await categoryWhere(db,'Court Rental');assert.equal(await db.transaction.count({where:{AND:[where,{id:record.transactionId}]}}),1);
 });
 await t.test('bulk refunds retain per-booking eligibility, partial failures and durable retries',async()=>{
 const a=await make(),b=await make(),unpaid=await make();await db.transaction.delete({where:{id:unpaid.receipt.id}});
 const preview=await previewRefundBatch(db,fo,[a.b.id,b.b.id,unpaid.b.id]);assert.equal(preview.length,3);assert.match(preview[2].detail!.blocked!,/Reconcile/);
 await assert.rejects(previewRefundBatch(db,member,[a.b.id]),/Admin/);
 const items=[{bookingId:a.b.id,input:await input(a.b.id)},{bookingId:b.b.id,input:{...(await input(b.b.id)),notes:''}},{bookingId:unpaid.b.id,input:{...(await input(unpaid.b.id))}}];
 const result=await completeRefundBatch(db,fo,items);assert.equal(result.completedCount,1);assert.equal(result.failedCount,2);
 assert.equal((await db.booking.findUniqueOrThrow({where:{id:b.b.id}})).paymentStatus,'paid');assert.equal((await slot(b.b)).available,false);
 await completeRefundBatch(db,fo,items);assert.equal(await db.bookingRefund.count({where:{bookingId:a.b.id}}),1);assert.equal(await db.transaction.count({where:{resourceType:'booking_refund',resourceId:a.b.id}}),1);
 await assert.rejects(completeRefundBatch(db,member,items),/Admin/);
 const c=await make(),d=await make(),e=await make();const batch=await completeRefundBatch(db,admin,await Promise.all([c,d,e].map(async row=>({bookingId:row.b.id,input:await input(row.b.id,admin)}))));assert.equal(batch.completedCount,3);assert.equal(batch.failedCount,0);
 for(const row of [c,d,e]){assert.equal((await slot(row.b)).available,true);assert.deepEqual(await db.transaction.findUnique({where:{id:row.receipt.id}}),row.receipt);}
 });
 await t.test('bulk online refunds require unique completed references per booking',async()=>{
 const a=await make(),b=await make();const items=await Promise.all([a,b].map(async row=>({bookingId:row.b.id,input:await input(row.b.id,fo,{method:'ONLINE',reference:'BANK-RF-849275061'})})));
 const result=await completeRefundBatch(db,fo,items);assert.equal(result.completedCount,1);assert.equal(result.failedCount,1);assert.match(result.results[1].message!,/already been used/);assert.equal((await db.booking.findUniqueOrThrow({where:{id:b.b.id}})).status,b.b.status);
 });
 }finally{await db.$disconnect();rmSync(dir,{recursive:true,force:true});}
});
