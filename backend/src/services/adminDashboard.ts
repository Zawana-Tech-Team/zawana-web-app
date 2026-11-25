import type { Prisma, PrismaClient } from '@prisma/client';
import { businessNow, range, today } from './courtPolicy.js';
import { recognizedLedgerRevenue } from './transactionPresentation.js';

/** Counts are queried from the database, rather than capped workspace lists. */
export async function adminDashboard(db:PrismaClient,now=new Date()){
 const date=today(now),clock=businessNow(now),minute=clock.hour*60+clock.minute;
 const kinds:Prisma.BookingWhereInput={kind:{in:['court','private_course']}};
 const [revenue,members,bookingsToday,bookings,assistance,refunds]=await Promise.all([
  db.transaction.aggregate({where:{...recognizedLedgerRevenue,date},_sum:{finalAmount:true}}),
  db.user.count({where:{role:'member',active:true,deletedAt:null}}),
  db.booking.count({where:{...kinds,date,status:{notIn:['cancelled','CANCELLED','COACH_DECLINED','EXPIRED']}}}),
  db.booking.findMany({where:{...kinds,date,status:{in:['pending','confirmed','CONFIRMED','PENDING_COACH_CONFIRMATION','AWAITING_PAYMENT']}},select:{id:true,code:true,kind:true,title:true,date:true,time:true,status:true,meta:true,user:{select:{name:true}},court:{select:{name:true,floor:true}},coach:{select:{name:true}}}}),
  db.bookingRescheduleRequest.count({where:{activeKey:{not:null},status:'ADMIN_HANDLING',booking:kinds}}),
  db.booking.count({where:{kind:{in:['court','private_course']},paymentStatus:{not:'refunded'},refundRecord:{is:null},OR:[{cancellationRequests:{some:{status:'requested'}}},{cancellationRequests:{some:{status:{not:'rejected'},refundStatus:{in:['manual_review','REFUND_REQUESTED','REFUND_PROCESSING']}}}}]}})
 ]);
 const schedule=bookings.filter(row=>{const span=range(row.time);return span&&span.end>minute;}).sort((a,b)=>range(a.time)!.start-range(b.time)!.start||a.code.localeCompare(b.code)).slice(0,5).map(row=>{
  let customer=row.user.name;try{const meta=JSON.parse(row.meta||'{}');if(typeof meta.customerName==='string'&&meta.customerName.trim())customer=meta.customerName;}catch{/* Original account name remains available. */}
  return {id:row.id,code:row.code,kind:row.kind,title:row.kind==='court'?row.court?.name||row.title:row.title,date:row.date,time:row.time,status:row.status,customer,court:row.court?.name||null,floor:row.court?.floor||null,coach:row.coach?.name||null,href:`/admin/court-rentals?history=1&kind=${row.kind==='private_course'?'private_course':'court'}&booking=${encodeURIComponent(row.id)}`};
 });
 return {date,metrics:{revenueToday:revenue._sum.finalAmount||0,bookingsToday,activeMembers:members},attention:[
  {id:'assistance',label:'Admin assistance',count:assistance,href:'/admin/court-rentals?history=1'},
  {id:'refunds',label:'Cancellations & refunds',count:refunds,href:'/admin/court-rentals?history=1'},
 ].filter(item=>item.count>0),schedule};
}
