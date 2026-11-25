import type { Booking, Prisma } from '@prisma/client';
type Tx = Prisma.TransactionClient;
export async function paidRentalAmount(tx: Tx, b: Booking) {
  if (b.paymentStatus === 'refunded') return 0;
  const [sales, privatePayment, history, memberRequests] = await Promise.all([
    tx.transaction.aggregate({ where:{resourceType:'booking',resourceId:b.id,status:'paid'}, _sum:{finalAmount:true} }),
    tx.privateCoursePayment.findUnique({where:{bookingId:b.id}}),
    tx.bookingChangeHistory.findMany({where:{bookingId:b.id,action:'DESK_BATCH_RESCHEDULED'}}),
    tx.bookingRescheduleRequest.findMany({where:{bookingId:b.id,status:'COMPLETED'},select:{id:true}}),
  ]);
  let amount=Math.max(sales._sum.finalAmount||0,privatePayment?.status==='PAID'?privatePayment.amount:0);
  if(memberRequests.length){const additional=await tx.transaction.aggregate({where:{resourceType:'member_reschedule',resourceId:{in:memberRequests.map(row=>row.id)},status:'paid'},_sum:{finalAmount:true}});amount+=additional._sum.finalAmount||0;}
  const seen=new Set<string>();
  for(const h of history){try{const data=JSON.parse(h.current);if(data.surcharge>0&&data.batchId&&!seen.has(data.batchId)){const receipt=await tx.transaction.findFirst({where:{resourceType:'court_reschedule',resourceId:data.batchId,status:'paid'}});if(receipt){seen.add(data.batchId);amount+=Math.min(data.surcharge,receipt.finalAmount);}}}catch{/* Historical non-JSON entries have no attributable credit. */}}
  return amount>0?amount:b.paymentStatus!=='paid'||b.price===0?0:null;
}
