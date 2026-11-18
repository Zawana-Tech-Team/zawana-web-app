import { DeskDialog, DeskSteps, DeskSchedule } from './court-desk/DeskDialog';
import { RefundDialog } from './RefundWorkflow';
import { courtFloor } from './court-desk/timetable';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Phone, CalendarClock, Headset, RotateCcw } from 'lucide-react';
import { get, post } from '../api';
import { Button } from './UI';
import { Select } from './Select';
import { usePaymentRevision } from '../hooks/usePaymentRevision';
import { DeskMoveDialog } from './court-desk/DeskMoveDialog';
import './court-desk/court-desk.css';
type Target={courtId:string;date:string;time:string};
type RequestRow={id:string;bookingId:string;kind:string;status:string;reason:string;oldPaid:number|null;newPrice:number|null;priceDifference:number|null;oldSchedule:Target;proposed:Target|null;privateProposalId:string|null;updatedAt:string;booking:{id?:string;code:string;title:string;date:string;time:string;courtId:string;status:string;court:{id:string;name:string;floor?:string}|null;coach:{name:string}|null;user:{name:string;phone?:string|null}}};
type Detail={booking:{id:string;code:string;kind:string;date:string;time:string;status:string;paymentStatus:string;price:number};customer:{name:string|null;phone:string|null;linked:boolean};court:{name:string;floor?:string}|null;coach:{name:string}|null;paidAmount:number|null;request:{status:string}|null};
const label=(s:string)=>({PENDING_CUSTOMER:'Awaiting Customer Response',CUSTOMER_SELECTING:'Awaiting Coach Approval',ADMIN_HANDLING:'Admin Handling',AWAITING_ADDITIONAL_PAYMENT:'Awaiting Additional Payment',REFUND_REQUESTED:'Refund Requested',REFUND_PROCESSING:'Refund Processing',REFUNDED:'Refunded',REFUND_REJECTED:'Refund Rejected',COMPLETED:'Completed',CANCELLED:'Cancelled',EXPIRED:'Expired'}[s]||s);
const active=(s:string)=>!['COMPLETED','CANCELLED','EXPIRED','REFUNDED','REFUND_REJECTED'].includes(s);
function ContactSummary({detail,compact=false}:{detail:Detail;compact?:boolean}){const phone=detail.customer.phone;return <div className={compact?'desk-contact-compact space-y-3':'space-y-3'}><div><h3 className="text-lg font-semibold">{detail.customer.name||'Customer name unavailable'}</h3>{phone?<div className="mt-2 flex flex-wrap items-center gap-3"><strong>{phone}</strong><a className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm" href={`tel:${phone.replace(/[^+\d]/g,'')}`}><Phone size={14}/>Call Customer</a></div>:<p className="mt-2 text-sm text-zawana-500">Phone number unavailable</p>}</div><p className="text-xs text-zawana-500">{detail.booking.code} · {detail.booking.kind==='court'?'Court Rental':'Private Course'}</p><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-zawana-500">Court / Floor</dt><dd>{detail.court?.name||'Court unavailable'} · {detail.court?courtFloor(detail.court):'Floor not recorded'}</dd></div><div><dt className="text-xs text-zawana-500">Schedule</dt><dd>{detail.booking.date}<br/>{detail.booking.time}</dd></div>{detail.coach&&<div><dt className="text-xs text-zawana-500">Coach</dt><dd>{detail.coach.name}</dd></div>}{!compact&&<><div><dt className="text-xs text-zawana-500">Total paid</dt><dd>{detail.paidAmount==null?'Payment amount needs review':`${detail.paidAmount.toLocaleString()} MMK`}</dd></div><div><dt className="text-xs text-zawana-500">Payment / Booking</dt><dd>{detail.booking.paymentStatus} · {detail.booking.status}</dd></div></>}</dl>{detail.request&&<p className="rounded-lg bg-amber-50 p-3 text-sm">{label(detail.request.status)}</p>}</div>;}
export function BookingContextSummary({bookingId}:{bookingId:string}){
 const [expanded,setExpanded]=useState(false);
 const revision=usePaymentRevision();const[detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true,version=0;setDetail(null);setError('');const load=()=>{if(document.hidden)return;const v=++version;void get<Detail>(`/rescheduling/bookings/${bookingId}/details`).then(d=>{if(live&&v===version){setDetail(d);setError('');}}).catch(e=>{if(live&&v===version)setError(e.message);});};load();const timer=window.setInterval(load,15000);window.addEventListener('focus',load);return()=>{live=false;window.clearInterval(timer);window.removeEventListener('focus',load);};},[bookingId,revision]);
 return <section aria-label="Selected booking details" className="desk-booking-summary">{error?<p role="alert" className="text-sm text-red-700">{error}</p>:!detail?<p role="status" className="text-sm text-zawana-500">Loading customer details…</p>:<>
   <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><strong className="text-sm">{detail.customer.name||'Customer name unavailable'}</strong>{detail.customer.phone?<a className="desk-booking-summary__phone" href={`tel:${detail.customer.phone.replace(/[^+\d]/g,'')}`} aria-label={`Call Customer: ${detail.customer.phone}`}><span>{detail.customer.phone}</span><Phone size={14} aria-hidden="true"/></a>:<span className="text-xs text-zawana-500">Phone number unavailable</span>}</div>
   <p className="text-xs text-zawana-500">{detail.booking.kind==='court'?'Court Rental':'Private Course'} · {detail.court?.name||'Court unavailable'} · {detail.booking.date} · {detail.booking.time}</p>
   <div className="flex flex-wrap items-center gap-3">{detail.request&&<span role="status" className="text-xs font-medium text-amber-800">{label(detail.request.status)}</span>}<button type="button" className="text-xs font-semibold underline underline-offset-4" onClick={()=>setExpanded(true)}>View Details</button>{!detail.customer.linked&&<span className="text-xs text-zawana-500">No linked account · Contact customer directly</span>}</div>
   {expanded&&<DeskDialog title="Booking details" size="compact" cancelLabel="Close" onClose={()=>setExpanded(false)} closeLabel="Close booking details"><ContactSummary detail={detail}/></DeskDialog>}
 </>}</section>;

}
export function StaffRescheduleRequestDialog({bookingIds,onClose,onSent}:{bookingIds:string[];onClose:()=>void;onSent:(message:string)=>void}) {
 const [details,setDetails]=useState<Detail[]>([]),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false);
 const batch=bookingIds.length>1;
 useEffect(()=>{
   let live=true;
   void Promise.all(bookingIds.map(id=>get<Detail>(`/rescheduling/bookings/${id}/details`)))
     .then(rows=>{if(live)setDetails(rows);}).catch(e=>{if(live)setError(e.message);});
   return()=>{live=false;};
 },[bookingIds]);
 const invalid=details.some(d=>!d.customer.linked||!['confirmed','CONFIRMED'].includes(d.booking.status)||d.booking.paymentStatus==='refunded');
 const newCount=details.filter(d=>!d.request).length;
 const send=async()=>{
   if(lock.current)return;
   lock.current=true;setBusy(true);setError('');
   try {
     if(batch){
       const result=await post<{createdCount:number;existingCount:number}>('/rescheduling/requests/batch',{bookingIds,reason});
       onSent(result.createdCount ? `Requests sent for ${result.createdCount} rental${result.createdCount===1?'':'s'}. Awaiting Customer Response.${result.existingCount?` ${result.existingCount} already had active requests.`:''}` : 'All selected rentals already have active requests. No duplicate notifications were sent.');
     }else{
       await post('/rescheduling/requests',{bookingId:bookingIds[0],reason});
       onSent('Request sent. Awaiting Customer Response.');
     }
     onClose();
   }catch(e){setError(e instanceof Error?e.message:'Could not send requests.');}
   finally{lock.current=false;setBusy(false);}
 };
 return <DeskDialog title="Send reschedule request" heading={batch?`Request Reschedule · ${bookingIds.length} rentals`:'Request Reschedule'} size="compact" onClose={onClose} busy={busy} closeLabel="Close request confirmation"
   description="Ask the customer to choose how to handle the booking."
   actions={<Button loading={busy} disabled={busy||details.length!==bookingIds.length||invalid||!newCount} onClick={()=>void send()}>{batch?`Send ${newCount} Request${newCount===1?'':'s'}`:'Send Request'}</Button>} bodyClassName="space-y-4">
     {!details.length&&!error&&<p role="status">Loading selected bookings…</p>}
     {batch?<><p className="text-sm">Each rental's linked member receives a request and can respond separately. Matching names do not change the linked recipient.</p>
       <ul aria-label="Rentals to request" className="divide-y rounded-xl border px-4">{details.map(d=><li key={d.booking.id} className="space-y-1 py-3 text-sm"><strong>{d.customer.name||'Customer name unavailable'}</strong><p className="text-xs text-zawana-500">{d.booking.code} · {d.court?.name} · {d.booking.date} · {d.booking.time}</p><p className="text-xs">{!d.customer.linked?'No linked member account — remove this rental to send requests':d.request?`${label(d.request.status)} · No duplicate request will be sent`:!['confirmed','CONFIRMED'].includes(d.booking.status)||d.booking.paymentStatus==='refunded'?'Only confirmed, non-refunded rentals can receive requests':'Ready to send'}</p></li>)}</ul>
       {details.some(d=>d.request)&&<p className="text-xs text-zawana-500">Rentals with active requests will be kept; no duplicate notifications will be sent.</p>}
     </>:details[0]&&<ContactSummary detail={details[0]} compact/>}
     {invalid&&<p role="alert" className="text-sm text-amber-800">Every selected booking must be confirmed and linked to an active member account. Close this dialog and remove ineligible rentals. Contact walk-in customers directly.</p>}
     <label className="block text-sm">Reason (optional)<textarea className="mt-2 w-full" disabled={busy} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
     <p className="text-xs text-zawana-500">Sending requests does not change bookings or payments.</p>
     {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </DeskDialog>;
}

export function BookingRequestInbox({staff=false}:{staff?:boolean}){
 const revision=usePaymentRevision();const[rows,setRows]=useState<RequestRow[]>([]),[error,setError]=useState(''),[open,setOpen]=useState(''),[filter,setFilter]=useState(''),[search,setSearch]=useState(''),[courts,setCourts]=useState<{id:string;name:string}[]>([]),[move,setMove]=useState<RequestRow|null>(null);const[params]=useSearchParams();const opened=useRef(false);
 const [refundId,setRefundId]=useState('');
 const refresh=async()=>setRows(await get<RequestRow[]>('/rescheduling/requests'));
 useEffect(()=>{let live=true,version=0;const load=()=>{if(document.hidden)return;const v=++version;void get<RequestRow[]>('/rescheduling/requests').then(rows=>{if(live&&v===version){setRows(rows);setError('');}}).catch(e=>{if(live&&v===version)setError(e.message);});};load();const timer=window.setInterval(load,15000);window.addEventListener('focus',load);return()=>{live=false;window.clearInterval(timer);window.removeEventListener('focus',load);};},[revision]);
 useEffect(()=>{if(!opened.current&&params.get('request')&&rows.some(r=>r.id===params.get('request'))){opened.current=true;setOpen(params.get('request')!);}},[rows,params]);
 useEffect(()=>{if(!staff)return;let live=true;void get<typeof courts>('/courts').then(c=>{if(live)setCourts(c);}).catch(()=>{});return()=>{live=false;};},[staff]);
 if(!rows.length&&!error)return null;
 const row=rows.find(r=>r.id===open);
 return <section className="desk-panel mb-6 p-5" aria-label="Reschedule request management"><h2 className="text-lg font-semibold">Reschedule requests</h2>{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{staff&&<div className="my-4 flex flex-wrap gap-3"><input aria-label="Search reschedule requests" placeholder="Customer, phone or booking" value={search} onChange={e=>setSearch(e.target.value)}/><Select aria-label="Request status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All request statuses</option>{['PENDING_CUSTOMER','ADMIN_HANDLING','CUSTOMER_SELECTING','AWAITING_ADDITIONAL_PAYMENT','REFUND_REQUESTED','REFUND_PROCESSING','REFUNDED','REFUND_REJECTED','COMPLETED','CANCELLED','EXPIRED'].map(s=><option key={s} value={s}>{label(s)}</option>)}</Select></div>}<div className="mt-3 divide-y">{rows.filter(r=>(!filter||r.status===filter)&&(!search||`${r.booking.user.name} ${r.booking.user.phone||''} ${r.booking.code}`.toLowerCase().includes(search.toLowerCase()))).map(r=><article key={r.id} className="space-y-2 py-4"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{staff?`${r.booking.user.name} · ${r.booking.user.phone||'Phone number unavailable'}`:r.booking.title}</strong><span className="text-xs font-semibold">{label(r.status)}</span></div><p className="text-xs text-zawana-500">{r.booking.code} · {r.kind==='court'?'Court Rental':'Private Course'} · Original: {r.oldSchedule.date} · {r.oldSchedule.time}</p>{r.proposed&&<p className="text-xs">Requested: {courts.find(c=>c.id===r.proposed?.courtId)?.name||'Replacement court'} · {r.proposed.date} · {r.proposed.time}</p>}<p className="text-xs text-zawana-500">Updated {new Date(r.updatedAt).toLocaleString('en-GB',{timeZone:'Asia/Yangon'})}</p>{staff?<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>setOpen(r.id)}>Request details</Button>{r.kind==='court'&&['ADMIN_HANDLING','AWAITING_ADDITIONAL_PAYMENT'].includes(r.status)&&<Button onClick={()=>setMove(r)}>Arrange & confirm replacement</Button>}</div>:<Button variant="secondary" onClick={()=>setOpen(r.id)}>{active(r.status)?'Review request':'View request'}</Button>}</article>)}</div>{refundId&&<RefundDialog bookingId={refundId} onClose={()=>setRefundId('')} onCompleted={refresh}/>} {row&&<CustomerRequestDialog onRefund={()=>{setOpen('');setRefundId(row.bookingId);}} row={row} staff={staff} onClose={()=>setOpen('')} onChanged={refresh}/>} {move&&<DeskMoveDialog sources={[{id:move.bookingId,kind:'court',date:move.booking.date,time:move.booking.time,courtId:move.booking.courtId,title:move.booking.user.name}]} initialDestination={move.proposed||undefined} courts={courts} onClose={()=>setMove(null)} onChanged={async()=>{setMove(null);await refresh();}}/>}</section>;
}
function CustomerRequestDialog({row,staff,onClose,onChanged,onRefund}:{row:RequestRow;staff:boolean;onClose:()=>void;onChanged:()=>Promise<void>;onRefund:()=>void}){
 const[mode,setMode]=useState<'choices'|'select'|'ADMIN_HANDLING'|'REFUND_REQUESTED'|'CANCELLED'>('choices'),[courts,setCourts]=useState<{id:string;name:string}[]>([]),[target,setTarget]=useState<Target>({courtId:row.booking.courtId,date:row.booking.date,time:''}),[slots,setSlots]=useState<{time:string;available:boolean}[]>([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[quote,setQuote]=useState<{revision:string;newPrice:number;paidAmount:number|null;priceDifference:number|null}|null>(null),[ack,setAck]=useState(false);const lock=useRef(false);
 useEffect(()=>{let live=true;void get<typeof courts>('/courts').then(c=>{if(live)setCourts(c);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
 useEffect(()=>{if(mode!=='select'||!target.date||!target.courtId)return;let live=true;setLoading(true);setSlots([]);void get<{slots:typeof slots}>(`/rescheduling/requests/${row.id}/availability?date=${target.date}&courtId=${encodeURIComponent(target.courtId)}`).then(r=>{if(live)setSlots(r.slots);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[mode,target.date,target.courtId,row.id]);
 const edit=(next:Partial<Target>)=>{setTarget(t=>({...t,...next,...(next.date||next.courtId?{time:''}:{})}));setQuote(null);setAck(false);setError('');};
 const run=async(task:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await task();}catch(e){setError(e instanceof Error?e.message:'Could not update request.');}finally{lock.current=false;setBusy(false);}};
 const review=()=>run(async()=>{setQuote(await post(`/rescheduling/requests/${row.id}/quote`,target));setAck(false);});
 const confirm=()=>run(async()=>{if(!quote)return;const result=await post<{status:string}>(`/rescheduling/requests/${row.id}/confirm`,{target,revision:quote.revision,acknowledged:ack});await onChanged();setMode('choices');setQuote(null);setNotice(result.status==='COMPLETED'?'Your replacement is confirmed.':result.status==='CUSTOMER_SELECTING'?'Your proposal is awaiting coach approval. The original session stays booked.':'Staff will arrange and record the required payment. The original booking is unchanged.');});
 const respond=()=>run(async()=>{if(mode!=='ADMIN_HANDLING'&&mode!=='REFUND_REQUESTED'&&mode!=='CANCELLED')return;if(mode==='CANCELLED')await post(`/rescheduling/requests/${row.id}/cancel`,{});else await post(`/rescheduling/requests/${row.id}/respond`,{action:mode});await onChanged();setNotice(mode==='CANCELLED'?'Request closed. The booking and payment are unchanged.':mode==='ADMIN_HANDLING'?'Zawana staff will contact you to arrange your booking.':'Refund requested. No money has been transferred and the original payment remains unchanged.');setMode('choices');});
 const back=()=>{setMode('choices');setQuote(null);};
 const chooseAnother=()=>{setQuote(null);setAck(false);};
 const confirmLabel=quote&&quote.priceDifference!=null&&quote.priceDifference<0?'Continue — I Understand':quote?.priceDifference==null||quote.priceDifference>0?'Request Staff Payment Assistance':row.kind==='private_course'?'Send to Coach':'Confirm Replacement';
 const confirming=mode==='ADMIN_HANDLING'||mode==='REFUND_REQUESTED'||mode==='CANCELLED';
 return <DeskDialog title="Reschedule request details" heading={row.kind==='court'?'Court Rental request':'Private Course request'} eyebrow={row.booking.code} size="compact" onClose={onClose} busy={busy} closeLabel="Close request details" cancelLabel={mode==='choices'?'Done':'Cancel'}
   steps={!staff&&active(row.status)&&row.status!=='REFUND_REQUESTED'?<DeskSteps labels={mode==='select'?['Choose replacement','Review & confirm']:confirming?['Choose action','Confirm request']:['Booking details','Choose action']} current={mode==='select'?(quote?1:0):1}/>:undefined}
   actions={<>{mode!=='choices'&&<Button variant="ghost" disabled={busy} onClick={back}>Back</Button>}{mode==='select'&&(!quote?<Button disabled={busy||loading||!target.time} loading={busy} onClick={()=>void review()}>Review replacement</Button>:<>{!(row.kind==='court'&&quote.priceDifference!=null&&quote.priceDifference<0)&&<Button variant="ghost" disabled={busy} onClick={chooseAnother}>Choose Another Time</Button>}<Button disabled={busy||(quote.priceDifference!=null&&quote.priceDifference<0&&!ack)} loading={busy} onClick={()=>void confirm()}>{confirmLabel}</Button></>)}{confirming&&<Button disabled={busy} loading={busy} onClick={()=>void respond()}>Confirm Request</Button>}</>} bodyClassName="space-y-4">
   <div className="flex flex-wrap justify-between gap-2 text-xs"><strong>{row.booking.user.name}</strong><span>{label(row.status)}</span></div>
   {!quote&&<DeskSchedule label="Original booking" court={row.booking.court?.name} date={row.oldSchedule.date} time={row.oldSchedule.time}/>}
   {row.reason&&<p className="text-xs text-zawana-500">{row.reason}</p>}
   {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm">{notice}</p>}
   {error&&<p role="alert" className="desk-load-error">{error}</p>}
   {mode==='choices'&&!staff&&active(row.status)&&row.status!=='REFUND_REQUESTED'&&<div className="grid gap-2">
     <Button aria-label="Reschedule" className="desk-action-choice" disabled={busy||!!row.privateProposalId} onClick={()=>{setNotice('');setMode('select');}}><CalendarClock aria-hidden="true"/><span>Reschedule<small>Choose another court, date and time.</small></span></Button>
     {row.kind==='court'&&<Button aria-label="Let Admin Handle" className="desk-action-choice" variant="secondary" disabled={busy} onClick={()=>{setNotice('');setMode('ADMIN_HANDLING');}}><Headset aria-hidden="true"/><span>Let Admin Handle<small>Ask the Front Office to arrange your booking.</small></span></Button>}
     <Button aria-label="Refund" className="desk-action-choice" variant="secondary" disabled={busy} onClick={()=>{setNotice('');setMode('REFUND_REQUESTED');}}><RotateCcw aria-hidden="true"/><span>Refund<small>Send a refund request for staff review.</small></span></Button>
   </div>}
   {mode==='select'&&!quote&&<fieldset disabled={busy} className="desk-form-section space-y-4"><legend>Replacement session</legend>
     <label className="block">Replacement court<Select aria-label="Replacement court" value={target.courtId} onChange={e=>edit({courtId:e.target.value})}>{courts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
     <label className="block">Replacement date<input className="mt-1" type="date" value={target.date} onChange={e=>edit({date:e.target.value})}/></label>
     <label className="block">Available session<Select aria-label="Available replacement time" disabled={loading} value={target.time} onChange={e=>edit({time:e.target.value})}><option value="">{loading?'Checking court and coach availability…':'Choose available time'}</option>{slots.map(s=><option key={s.time} value={s.time} disabled={!s.available}>{s.time}{!s.available?' · Unavailable':''}</option>)}</Select></label>
   </fieldset>}
   {mode==='select'&&quote&&<section aria-label="Replacement price review" className="space-y-4">
     <div className="desk-change-summary"><DeskSchedule label="Original booking" court={row.booking.court?.name} date={row.oldSchedule.date} time={row.oldSchedule.time}/><DeskSchedule label="Replacement" court={courts.find(c=>c.id===target.courtId)?.name} date={target.date} time={target.time}/></div>
     <p className="text-sm">New booking price: {quote.newPrice.toLocaleString()} MMK</p>
     {row.kind==='court'&&quote.priceDifference!=null&&quote.priceDifference<0?<div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4"><h3 className="font-semibold">Your new booking costs {Math.abs(quote.priceDifference).toLocaleString()} MMK less.</h3><p className="text-sm">If you continue, you will not receive the {Math.abs(quote.priceDifference).toLocaleString()} MMK difference back. Continue, or select another busy-hour time slot to keep the full value of your booking.</p><Button variant="secondary" disabled={busy} onClick={chooseAnother}>Choose Another Time</Button><label className="desk-acknowledgment"><input type="checkbox" disabled={busy} checked={ack} onChange={e=>setAck(e.target.checked)}/>I understand the difference is non-refundable.</label></div>
       :quote.priceDifference!=null&&quote.priceDifference>0?<div className="desk-note"><h3 className="font-semibold">Additional Payment Required: {quote.priceDifference.toLocaleString()} MMK</h3><p className="mt-2">Staff must record this payment before the replacement is confirmed. Your original session remains booked.</p></div>
       :quote.priceDifference==null?<p className="desk-note">Your original paid amount needs staff review. The booking will stay unchanged.</p>:<p className="desk-note">{row.kind==='private_course'?'Your assigned coach must approve this replacement. Existing payment stays unchanged.':'No additional payment is required.'}</p>}
   </section>}
   {confirming&&<div className="desk-note space-y-3"><h3 className="font-semibold">{mode==='CANCELLED'?'Close this reschedule request?':mode==='ADMIN_HANDLING'?'Let Admin Handle?':'Request a refund review?'}</h3><p>{mode==='CANCELLED'?'The original booking and payment will remain unchanged.':mode==='ADMIN_HANDLING'?'Zawana staff will contact you to arrange your booking.':'This creates a refund request for staff review. No money is transferred, and your booking and payment are not automatically cancelled or refunded.'}</p></div>}
   {staff&&<div className="space-y-3 text-sm">{['REFUND_REQUESTED','REFUNDED'].includes(row.status)&&<Button onClick={onRefund}>{row.status==='REFUNDED'?'View Refund':'Process Refund'}</Button>}{active(row.status)&&row.status!=='REFUND_REQUESTED'&&mode==='choices'&&<Button variant="secondary" onClick={()=>setMode('CANCELLED')}>Close Request</Button>}<p>Customer: {row.booking.user.name} · {row.booking.user.phone||'Phone number unavailable'}</p><p>Response: {label(row.status)}</p>{row.proposed&&<DeskSchedule label="Requested replacement" court={courts.find(c=>c.id===row.proposed?.courtId)?.name} date={row.proposed.date} time={row.proposed.time}/>}<p>Original paid: {row.oldPaid==null?'Needs review':`${row.oldPaid.toLocaleString()} MMK`}</p>{row.priceDifference!=null&&<p>Difference: {row.priceDifference.toLocaleString()} MMK</p>}</div>}
 </DeskDialog>;
}
