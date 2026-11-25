import { deskRescheduleEligibility } from '../../utils/deskRescheduleEligibility';
import { useBookingClock } from '../../hooks/useBookingClock';
import './affected-booking-notice.css';
import { useRef, useState } from 'react';
import { CalendarDays, Clock3, Info } from 'lucide-react';
import { affectedBookingMessage } from '../../../backend/src/domain/requestMessages';
import { formatBookingDate } from '../../utils/bookingDates';
import { normalizeBookingTime } from '../../utils/bookingTime';
import { useLanguage } from '../../context/LanguageContext';
import { post } from '../../api';
import { Button } from '../UI';
import { DeskDialog } from '../court-desk/DeskDialog';
type NoticeItem = {
 id: string; bookingId: string; status: string; originalCourtName?: string | null;
 oldSchedule: { courtId: string; date: string; time: string; courtName?: string | null };
 booking: { code: string };
};
type Choice = 'REFUND_REQUESTED' | 'ADMIN_HANDLING';
const statusLabel = (status: string) => ({PENDING_CUSTOMER:'Awaiting response',ACKNOWLEDGED:'Accepted',REFUND_REQUESTED:'Refund under review',REFUND_PROCESSING:'Refund processing',REFUNDED:'Refunded',REFUND_REJECTED:'Refund not approved',ADMIN_HANDLING:'With Admin',COMPLETED:'Completed',CANCELLED:'Closed',EXPIRED:'Expired',DECLINED:'Closed',CUSTOMER_SELECTING:'Staff reviewing',AWAITING_ADDITIONAL_PAYMENT:'Staff reviewing'} as Record<string,string>)[status] || status.replaceAll('_',' ').toLowerCase();
export function AffectedBookingGroup({id,reason,items,courts,staff=false,onChanged,onRefund,onAccept,onArrange,onResponse}:{
 id:string;reason:string;items:NoticeItem[];courts:{id:string;name:string}[];staff?:boolean;onChanged:()=>Promise<void>;onRefund:(bookingId:string)=>void;onAccept:(requestId:string)=>void;onArrange:(requestId:string)=>void;onResponse?:(message:string)=>void;
}) {
 const {locale}=useLanguage();useBookingClock();
 const [confirmation,setConfirmation]=useState<{item:NoticeItem;choice:Choice}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const lock=useRef(false);
 const originalCourt=(item:NoticeItem)=>item.originalCourtName || item.oldSchedule.courtName || courts.find(court=>court.id===item.oldSchedule.courtId)?.name || 'Court details unavailable';
 const dateLabel=(date:string)=>{try{return formatBookingDate(date,{weekday:'short',day:'numeric',month:'short',year:'numeric'},locale);}catch{return 'Date unavailable';}};
 const submit=async()=>{
   if(!confirmation||lock.current)return;
   lock.current=true;setBusy(true);setError('');setSuccess('');
   try {
     await post(`/rescheduling/requests/${confirmation.item.id}/respond`,{action:confirmation.choice});
     const savedMessage=confirmation.choice==='REFUND_REQUESTED'?'Refund requested. Staff will review the payment records before completing a refund.':'Sent to Admin. The team has been notified to assist you.';
     onResponse?.(savedMessage);
     try{await onChanged();}catch{setError('Your response was saved. The list could not refresh; it will update when the connection returns.');}
     setConfirmation(null);if(!onResponse)setSuccess(savedMessage);
   }catch(error){setError(error instanceof Error?error.message:'Could not save your response. Please try again.');}
   finally{lock.current=false;setBusy(false);}
 };
 const paragraphs=affectedBookingMessage(reason).split('\n\n');
 return <section id={`request-group-${id}`} tabIndex={-1} className="affected-booking-group" aria-label={`Request group: ${items.length} bookings`}>
   <header className="affected-booking-heading"><h2>{items.length} {items.length===1?'Request':'Requests'}</h2>{staff&&<p aria-live="polite">{items.filter(item=>item.status==='PENDING_CUSTOMER').length} awaiting response</p>}</header>
   <aside className="affected-booking-notice" aria-label="Important Booking Notice"><div className="affected-booking-notice-title"><Info size={20} strokeWidth={1.5} aria-hidden="true"/><h3>Important Booking Notice</h3></div><div>{paragraphs.map((paragraph,index)=>index===0||index===paragraphs.length-1?<p key={index}><strong>{paragraph}</strong></p>:<p key={index}>{paragraph}</p>)}</div></aside>
   {success&&<p role="status" className="affected-booking-feedback">{success}</p>}
   {error&&!confirmation&&<p role="alert" className="history-error">{error}</p>}
   <ul className="affected-booking-list">{items.map(item=><li key={item.id} className="affected-booking-card" aria-label={`Affected booking ${item.booking.code}`}>
     <div className="affected-booking-card-heading"><h3>{originalCourt(item)}</h3><span className="booking-history-status" data-tone={item.status==='PENDING_CUSTOMER'?'pending':item.status==='ACKNOWLEDGED'?'confirmed':'muted'}>{statusLabel(item.status)}</span></div>
     <dl className="affected-booking-facts"><div><dt><CalendarDays size={15} aria-hidden="true"/><span className="sr-only">Original booking date</span></dt><dd>{dateLabel(item.oldSchedule.date)}</dd></div><div><dt><Clock3 size={15} aria-hidden="true"/><span className="sr-only">Original booking time</span></dt><dd>{item.oldSchedule.time?normalizeBookingTime(item.oldSchedule.time):'Time unavailable'}</dd></div></dl>
     {!staff&&item.status==='PENDING_CUSTOMER'&&<div className="affected-booking-actions" aria-label={`Actions for ${item.booking.code}`}><Button disabled={busy||!deskRescheduleEligibility('member',item.oldSchedule.date,item.oldSchedule.time).eligible} title={deskRescheduleEligibility('member',item.oldSchedule.date,item.oldSchedule.time).message} onClick={()=>{setError('');onAccept(item.id);}}>Accept</Button><Button disabled={busy} variant="secondary" onClick={()=>{setError('');setConfirmation({item,choice:'REFUND_REQUESTED'});}}>Refund</Button><Button disabled={busy} variant="secondary" onClick={()=>{setError('');setConfirmation({item,choice:'ADMIN_HANDLING'});}}>Admin Handle</Button></div>}
     {staff&&['ADMIN_HANDLING','AWAITING_ADDITIONAL_PAYMENT'].includes(item.status)&&<Button onClick={()=>onArrange(item.id)}>Arrange & confirm replacement</Button>}
     {staff&&['REFUND_REQUESTED','REFUND_PROCESSING','REFUNDED'].includes(item.status)&&<Button variant="secondary" onClick={()=>onRefund(item.bookingId)}>{item.status==='REFUNDED'?'View refund':'Process refund'}</Button>}
   </li>)}</ul>
   {confirmation&&<DeskDialog title={confirmation.choice==='REFUND_REQUESTED'?'Request a refund review':'Request Admin assistance'} size="compact" busy={busy} onClose={()=>setConfirmation(null)} actions={<Button disabled={busy} loading={busy} onClick={()=>void submit()}>{confirmation.choice==='REFUND_REQUESTED'?'Confirm refund request':'Confirm Admin assistance'}</Button>}>
     <p className="text-sm leading-relaxed">{confirmation.choice==='REFUND_REQUESTED'?'Send this booking for refund review. Authorized staff must validate the paid amount and record any completed refund. No money is transferred and your booking is not cancelled by this request.':'Ask Admin to assist with this booking. The team will be notified. Your original booking and payment stay unchanged.'}</p>{error&&<p role="alert" className="history-error">{error}</p>}
   </DeskDialog>}
 </section>;
}
