import { useEffect, useRef, useState } from 'react';
import { get, post } from '../api';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { Button } from './UI';
import { DeskDialog, DeskSchedule, DeskSteps } from './court-desk/DeskDialog';
import { ReplacementSessionFields, type ReplacementTarget } from './ReplacementSessionFields';
import './shared-reschedule.css';

type Session = {
 id:string; bookingId:string; kind:string; status:string; staffRequested:boolean;
 original:ReplacementTarget & {courtName?:string};
 booking:{code:string;title:string;price:number;courtName?:string;coachName?:string};
};
type Quote = {revision:string;newPrice:number;paidAmount:number|null;priceDifference:number|null;courtName:string};
export function PriceDifferenceSummary({originalPrice,quote,privateCourse=false}:{originalPrice:number;quote:Quote;privateCourse?:boolean}) {
 const difference=quote.priceDifference;
 const label=difference==null?'Payment review required':difference>0?'Additional Payment Required':difference<0?'Lower-priced replacement':'No Additional Payment';
 return <section className="reschedule-price" aria-label="Reschedule Summary" aria-live="polite">
   <h3>Reschedule Summary</h3><dl><div><dt>Original Booking</dt><dd>{originalPrice.toLocaleString()} MMK</dd></div><div><dt>Verified payment</dt><dd>{quote.paidAmount==null?'Needs staff review':`${quote.paidAmount.toLocaleString()} MMK`}</dd></div><div><dt>New Booking</dt><dd>{quote.newPrice.toLocaleString()} MMK</dd></div></dl>
   <p className="reschedule-price__label">{label}</p><p className="reschedule-price__difference">{difference==null?'Staff review':`${difference>0?'+':difference<0?'−':''}${Math.abs(difference).toLocaleString()} MMK`}</p>
   <p className="reschedule-price__policy">{privateCourse?'Your assigned coach must approve this change. Your payment and package entitlements stay unchanged.':difference==null?'Staff must reconcile your original payment. Your current booking stays reserved.':difference>0?'Only this difference is owed. Staff must verify and record the additional payment before confirming your replacement. Your original booking stays reserved.':difference<0?'The difference is non-refundable under the existing rescheduling policy. No refund or credit will be issued automatically.':'Your existing payment carries over. No payment step is required.'}</p>
 </section>;
}

/** Every member entry point uses this flow; booking-specific rules remain on the server. */
export function SharedRescheduleFlow({bookingId,requestId,onClose,onChanged}:{bookingId:string;requestId?:string;onClose:()=>void;onChanged:()=>void|Promise<void>}) {
 const [session,setSession]=useState<Session|null>(null),[target,setTarget]=useState<ReplacementTarget>({courtId:'',date:'',time:''});
 const [courts,setCourts]=useState<{id:string;name:string}[]>([]),[quote,setQuote]=useState<Quote|null>(null);
 const [step,setStep]=useState<'select'|'review'|'done'>('select'),[loading,setLoading]=useState(true),[pricing,setPricing]=useState(false),[busy,setBusy]=useState(false),[ack,setAck]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false),version=useRef(0),targetVersion=useRef(''),quotedRevision=useRef('');
 const revision=useBookingRevision();
 const targetKey=JSON.stringify(target);targetVersion.current=targetKey;
 useEffect(()=>{
   let live=true;
   void Promise.all([post<Session>(`/rescheduling/member/bookings/${encodeURIComponent(bookingId)}/session`,{...(requestId?{requestId}:{})}),get<typeof courts>('/courts')]).then(([data,courts])=>{if(live){setSession(data);setCourts(courts);setTarget({courtId:data.original.courtId,date:data.original.date,time:''});}}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});
   return()=>{live=false;};
 },[bookingId,requestId]);
 useEffect(()=>{
   if(!session||step==='done'||lock.current)return;
   if(!target.time){setPricing(false);return;}
   let live=true;const generation=++version.current;
   setPricing(true);setError('');
   void post<Quote>(`/rescheduling/requests/${session.id}/quote`,target).then(value=>{if(live&&generation===version.current){if(quotedRevision.current!==value.revision)setAck(false);quotedRevision.current=value.revision;setQuote(value);}}).catch(e=>{if(live&&generation===version.current){setQuote(null);setError(e.message);}}).finally(()=>{if(live&&generation===version.current)setPricing(false);});
   return()=>{live=false;};
   // Selecting a different schedule or receiving a booking update invalidates the server quote.
 },[session,target,revision,step]);
 const edit=(next:Partial<ReplacementTarget>)=>{version.current++;setTarget(current=>({...current,...next}));setQuote(null);setAck(false);setError('');};
 const confirm=async()=>{
   if(!session||!quote||lock.current||pricing)return;
   const selected=targetVersion.current;lock.current=true;setBusy(true);setError('');
   try{
     const result=await post<{status:string}>(`/rescheduling/requests/${session.id}/confirm`,{target,revision:quote.revision,acknowledged:ack});
     if(selected!==targetVersion.current)throw new Error('Your selection changed. Check your request status before trying again.');
     setNotice(result.status==='COMPLETED'?'Your replacement is confirmed.':result.status==='CUSTOMER_SELECTING'?'Your proposal is awaiting coach approval. The original session stays booked.':'Staff will arrange and record the required payment. The original booking is unchanged.');
     setStep('done');
     try{await onChanged();}catch{setError('Your request was saved. The booking list will update when the connection returns.');}
   }catch(e){setError(e instanceof Error?e.message:'Could not confirm this change. Your original booking stays reserved.');setQuote(null);setStep('select');setTarget(current=>({...current,time:''}));}
   finally{lock.current=false;setBusy(false);}
 };
 const privateCourse=session?.kind==='private_course';
 const confirmLabel=privateCourse?'Send to Coach':quote?.priceDifference==null||quote.priceDifference>0?'Request Staff Payment Assistance':quote.priceDifference<0?'Continue — I Understand':'Confirm Replacement';
 return <DeskDialog title="Reschedule request details" heading={session?(privateCourse?'Private Course request':'Court Rental request'):'Reschedule booking'} eyebrow={session?.booking.code} size="compact" onClose={onClose} busy={busy} closeLabel="Close reschedule request" cancelLabel={step==='done'?'Done':'Cancel'}
   steps={<DeskSteps labels={['Current booking','Choose replacement','Review changes','Confirm']} current={step==='select'?1:step==='review'?2:3}/>}
   actions={session&&step!=='done'?<>{step==='review'&&<Button variant="ghost" disabled={busy} onClick={()=>{setStep('select');setAck(false);}}>Edit replacement</Button>}{step==='select'?<Button disabled={busy||pricing||!quote} onClick={()=>setStep('review')}>Review replacement</Button>:<Button loading={busy} disabled={busy||pricing||!quote||(quote.priceDifference!=null&&quote.priceDifference<0&&!ack)} onClick={()=>void confirm()}>{confirmLabel}</Button>}</>:undefined} bodyClassName="space-y-4">
   {loading&&<p role="status">Loading your booking…</p>}
   {session&&<>
     <DeskSchedule label="Original booking" court={session.original.courtName||session.booking.courtName} date={session.original.date} time={session.original.time}>{session.booking.coachName&&<p>Assigned coach: {session.booking.coachName}</p>}</DeskSchedule>
     {step==='select'&&<><p className="text-sm text-zawana-500">Choose a new session. Unavailable times include existing court reservations{privateCourse?' and your assigned coach’s commitments':''}. Your original booking stays reserved.</p><ReplacementSessionFields target={target} onChange={edit} availabilityPath={`/rescheduling/requests/${session.id}/availability`} disabled={busy}/></>}
     {step==='review'&&<DeskSchedule label="Replacement" court={quote?.courtName||courts.find(c=>c.id===target.courtId)?.name} date={target.date} time={target.time}/>}
     {pricing&&<p role="status">Checking the current price and availability…</p>}
     {quote&&step!=='done'&&<PriceDifferenceSummary originalPrice={session.booking.price} quote={quote} privateCourse={privateCourse}/>}
     {step==='review'&&quote?.priceDifference!=null&&quote.priceDifference<0&&<label className="desk-acknowledgment"><input type="checkbox" disabled={busy||pricing} checked={ack} onChange={e=>setAck(e.target.checked)}/>I understand the difference is non-refundable.</label>}
     {step==='done'&&<p role="status" className="reschedule-success">{notice}</p>}
   </>}
   {error&&<p role="alert" className="desk-load-error">{error}</p>}
 </DeskDialog>;
}
