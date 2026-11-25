import type { Prisma } from '@prisma/client';

/** Persist delivery in the same transaction as its event; retry by durable event key. */
export async function notifyBadmintonStaff(tx:Prisma.TransactionClient,eventKey:string,title:string,body:string,query='',entityType='reschedule_request',entityId?:string,section?:'private-bookings'){
 for(const audience of ['admin','badminton_fo']){
  const dedupeKey=`badminton:${eventKey}:${audience}`;
  const data={dedupeKey,userId:null,audience,title,body,type:'reschedule',entityType,entityId,link:`/${audience==='admin'?'admin/court-rentals':'badminton-fo/bookings'}${section?`?history=1&kind=private_course${query?`&${query.replace(/^\?/, '')}`:''}`:query}`};
  await tx.notification.upsert({where:{dedupeKey},create:data,update:{}});
 }
}
