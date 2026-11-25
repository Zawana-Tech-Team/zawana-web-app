import { deskRescheduleEligibility } from '../utils/deskRescheduleEligibility';
import { useBookingClock } from '../hooks/useBookingClock';
import { CourtBooking } from '../pages/CourtBooking';
import { PrivateCourse } from '../pages/PrivateCourse';
import { useCallback, useEffect, useRef, useState } from 'react';
import { post } from '../api';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { Button, Card, Page } from './UI';
import { DeskSchedule } from './court-desk/DeskDialog';
import { type ReplacementTarget } from './ReplacementSessionFields';
import './shared-reschedule.css';

type Session = {
 id:string; bookingId:string; kind:string; status:string; staffRequested:boolean;
 original:ReplacementTarget & {courtName?:string};
 booking:{id:string;code:string;title:string;date:string;time:string;status:string;paymentStatus:string;price:number;courtId:string|null;courtName?:string;coachName?:string;coach:{id:string;name:string;status:string;user:{active:boolean;role:string}|null}|null};
 eligibility:{eligible:boolean;message:string};
};
type Quote = {revision:string;newPrice:number;paidAmount:number|null;priceDifference:number|null;courtName:string};
export function PriceDifferenceSummary({originalPrice,quote,privateCourse=false}:{originalPrice:number;quote:Quote;privateCourse?:boolean}) {
 const difference=quote.priceDifference;
 const label=difference==null?'Payment review required':difference>0?'Additional Payment Required':difference<0?'Amount you will lose':'No Additional Payment';
 return <section className="reschedule-price" aria-label="Reschedule Summary" aria-live="polite">
   <h3>Reschedule Summary</h3><dl><div><dt>Original Booking</dt><dd>{originalPrice.toLocaleString()} MMK</dd></div><div><dt>Verified payment</dt><dd>{quote.paidAmount==null?'Needs staff review':`${quote.paidAmount.toLocaleString()} MMK`}</dd></div><div><dt>New Booking</dt><dd>{quote.newPrice.toLocaleString()} MMK</dd></div></dl>
   <p className="reschedule-price__label">{label}</p><p className="reschedule-price__difference">{difference==null?'Staff review':`${difference>0?'+':difference<0?'−':''}${Math.abs(difference).toLocaleString()} MMK`}</p>
   <p className="reschedule-price__policy">{privateCourse?'Your assigned coach must approve this change. Your payment and package entitlements stay unchanged.':difference==null?'Staff must reconcile your original payment. Your current booking stays reserved.':difference>0?'Only the additional amount is due. Confirm to record this payment and reschedule immediately. This uses the same simulated payment as normal booking; no external charge is made.':difference<0?`You’ll lose ${Math.abs(difference).toLocaleString()} MMK by choosing this lower-priced session. This amount won’t be refunded or credited. Do you want to continue?`:'Your existing payment carries over. No payment step is required.'}</p>
 </section>;
}

/** The coordinator preserves one lifecycle while reusing each normal booking screen. */
export function SharedRescheduleFlow({bookingId,requestId,onClose}:{bookingId:string;requestId?:string;onClose:()=>void}) {
 const [session,setSession]=useState<Session|null>(null),[target,setTarget]=useState<ReplacementTarget|null>(null),[quote,setQuote]=useState<Quote|null>(null);
 const [stage,setStage]=useState<'select'|'review'|'done'>('select'),[courtStep,setCourtStep]=useState<1|2>(1),[loading,setLoading]=useState(true),[pricing,setPricing]=useState(false),[busy,setBusy]=useState(false),[ack,setAck]=useState(false),[error,setError]=useState(''),[outcome,setOutcome]=useState('');
 const reviewSurface=useRef<HTMLDivElement>(null);
 const lock=useRef(false),selectionKey=useRef(''),quotedRevision=useRef('');
 useBookingClock();
 const revision=useBookingRevision(),completed=stage==='done';
 useEffect(()=>{if(stage==='select')return;const heading=reviewSurface.current?.querySelector('h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}},[stage]);
 useEffect(()=>{let live=true;void post<Session>(`/rescheduling/member/bookings/${encodeURIComponent(bookingId)}/session`,{...(requestId?{requestId}:{})}).then(data=>{if(live)setSession(data);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[bookingId,requestId]);
 const select=useCallback((selection:ReplacementTarget|undefined)=>{
   const next=selection?{courtId:selection.courtId,date:selection.date,time:selection.time}:null,key=JSON.stringify(next);
   if(selectionKey.current===key)return;
   selectionKey.current=key;setTarget(next);setQuote(null);setAck(false);setError('');
 },[]);
 useEffect(()=>{
   if(!session||!target||completed||lock.current){if(!target)setPricing(false);return;}
   let live=true;const key=selectionKey.current;setPricing(true);setError('');
   void post<Quote>(`/rescheduling/requests/${session.id}/quote`,target).then(value=>{if(live&&key===selectionKey.current){if(quotedRevision.current!==value.revision)setAck(false);quotedRevision.current=value.revision;setQuote(value);}}).catch(e=>{if(live&&key===selectionKey.current){setQuote(null);setError(e.message);}}).finally(()=>{if(live&&key===selectionKey.current)setPricing(false);});
   return()=>{live=false;};
 },[session,target,revision,completed]);
 const review=async(selection:ReplacementTarget)=>{
   if(!session)return;const next={courtId:selection.courtId,date:selection.date,time:selection.time};select(next);const key=JSON.stringify(next);
   const current=await post<Quote>(`/rescheduling/requests/${session.id}/quote`,next);
   if(selectionKey.current!==key)throw new Error('Your selection changed. Review your new session again.');
   quotedRevision.current=current.revision;setQuote(current);setAck(false);setError('');setStage('review');window.scrollTo({top:0,behavior:'auto'});
 };
 const confirm=async()=>{
   if(!session||!quote||!target||lock.current||pricing)return;
   lock.current=true;setBusy(true);setError('');
   try{const result=await post<{status:string}>(`/rescheduling/requests/${session.id}/confirm`,{target,revision:quote.revision,acknowledged:ack,paymentConfirmed:quote.priceDifference!=null&&quote.priceDifference>0});setOutcome(result.status);setStage('done');window.scrollTo({top:0,behavior:'auto'});}
   catch(e){setError(e instanceof Error?e.message:'Could not confirm. Check your booking status before retrying.');setQuote(null);}
   finally{lock.current=false;setBusy(false);}
 };
 if(loading)return <Page title="Reschedule your booking"><Card className="p-6"><p role="status">Loading your booking…</p></Card></Page>;
 if(!session)return <Page title="Reschedule your booking"><Card className="space-y-4 p-6"><p role="alert">{error||'This booking is unavailable.'}</p><Button onClick={onClose}>Back to bookings</Button></Card></Page>;
 if(!completed&&!deskRescheduleEligibility('member',session.booking.date,session.booking.time).eligible)return <Page title="Rescheduling unavailable"><Card className="space-y-4 p-6"><p role="alert">Member changes require more than 24 hours before the original session. You can still request a refund review or staff assistance.</p><Button onClick={onClose}>Back to bookings</Button></Card></Page>;
 const privateCourse=session.kind==='private_course',calendarPath=`/rescheduling/requests/${session.id}/calendar`;
 const details={booking:session.booking,customer:'Your booking',eligibility:session.eligibility};
 const priceSummary=<>{pricing&&<p role="status" className="text-sm">Checking price and availability…</p>}{quote&&<PriceDifferenceSummary originalPrice={session.booking.price} quote={quote} privateCourse={privateCourse}/>}</>;
 const notice=outcome==='COMPLETED'?'Your replacement is confirmed.':outcome==='CUSTOMER_SELECTING'?'Your proposal is awaiting coach approval. The original session stays booked.':'Staff will arrange and record the required payment. The original booking is unchanged.';
 return <>
   {!completed&&<div hidden={stage!=='select'}>{privateCourse?<PrivateCourse reschedule={{booking:session.booking,calendarPath,error,onReview:review,onSelectionChange:select}}/>:<CourtBooking reschedule={{detail:details,backTo:'/bookings',step:courtStep,onStepChange:setCourtStep,onReview:review,exceptionReason:'',onExceptionReason:()=>{},availabilityVersion:0,error,calendarPath,onSelectionChange:select,priceSummary}}/>}</div>}
   {stage!=='select'&&<div ref={reviewSurface}><Page title={completed?'Rescheduling update':'Review your change'} eyebrow={privateCourse?'Private course':'Court rental'}><Card className="mx-auto max-w-3xl space-y-5 p-5 sm:p-8">
     <DeskSchedule label="Original booking" court={session.original.courtName||session.booking.courtName} date={session.original.date} time={session.original.time}>{session.booking.coachName&&<p>Assigned coach: {session.booking.coachName}</p>}</DeskSchedule>
     {target&&<DeskSchedule label="Replacement" court={quote?.courtName} date={target.date} time={target.time}/>}
     {priceSummary}
     {completed?<><p role="status" className="reschedule-success">{notice}{outcome==='COMPLETED'&&quote?.priceDifference!=null&&quote.priceDifference>0&&' The additional payment was recorded as simulated; no external charge was made.'}</p><Button onClick={onClose}>Back to bookings</Button></>:<>
       {privateCourse&&<p className="text-sm text-zawana-500">Your course, coach, payment and entitlements stay unchanged. Your coach must approve the new schedule.</p>}
       {quote?.priceDifference!=null&&quote.priceDifference<0&&<label className="desk-acknowledgment"><input type="checkbox" disabled={busy||pricing} checked={ack} onChange={e=>setAck(e.target.checked)}/>{`I agree to lose ${Math.abs(quote.priceDifference).toLocaleString()} MMK with no refund or credit.`}</label>}
       <div className="flex flex-wrap justify-between gap-3"><Button variant="secondary" disabled={busy} onClick={()=>{setStage('select');setAck(false);}}>Edit replacement</Button><Button loading={busy} disabled={busy||pricing||!quote||(quote.priceDifference!=null&&quote.priceDifference<0&&!ack)} onClick={()=>void confirm()}>{privateCourse?'Send to Coach':quote?.priceDifference==null?'Request Staff Payment Assistance':quote.priceDifference>0?`Pay ${quote.priceDifference.toLocaleString()} MMK & Reschedule`:quote.priceDifference<0?'Continue — I Understand':'Confirm Replacement'}</Button></div>
     </>}{error&&<p role="alert" className="desk-load-error">{error}</p>}
   </Card></Page></div>}
 </>;
}
