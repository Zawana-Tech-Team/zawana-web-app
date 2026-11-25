import type { PrismaClient } from '@prisma/client';
import { businessNow, range, today } from './courtPolicy.js';

/** Session completion is independent of payment collection and attendance. */
export async function completeElapsedBookings(db: PrismaClient, now = new Date()) {
 const date=today(now),clock=businessNow(now),minute=clock.hour*60+clock.minute;
 const candidates=await db.booking.findMany({where:{kind:{in:['court','private_course']},status:{in:['confirmed','CONFIRMED']},paymentStatus:{not:'refunded'},date:{lte:date}}});
 let completed=0;
 for(const booking of candidates){
  const session=range(booking.time);
  if(!session||!/^\d{4}-\d{2}-\d{2}$/.test(booking.date)||(booking.date===date&&session.end>minute))continue;
  completed+=await db.$transaction(async tx=>{
   // Match the original schedule so a concurrent move/cancellation cannot be overwritten.
   const changed=await tx.booking.updateMany({where:{id:booking.id,status:booking.status,date:booking.date,time:booking.time,courtId:booking.courtId,coachId:booking.coachId,paymentStatus:{not:'refunded'}},data:{status:'COMPLETED'}});
   if(!changed.count)return 0;
   await tx.bookingChangeHistory.create({data:{bookingId:booking.id,action:'SYSTEM_AUTO_COMPLETED',requestedById:'SYSTEM',previous:JSON.stringify({status:booking.status,date:booking.date,time:booking.time}),current:JSON.stringify({status:'COMPLETED',completedAt:now.toISOString()}),reason:'Scheduled session ended; automatically completed. Payment and attendance unchanged.'}});
   return 1;
  });
 }
 return completed;
}
