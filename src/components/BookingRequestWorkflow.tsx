import { HistorySchedule, HistoryLoading } from './member-booking/HistoryPresentation';
import { requestMessage } from '../../backend/src/domain/requestMessages';
import { requestBatchProgress } from '../utils/requestBatch';
import { ReplacementSessionFields } from './ReplacementSessionFields';
import { OperationalReasonField } from './OperationalReasonField';
import { operationalReasonLabel } from '../../backend/src/domain/rescheduleReasons';
import { DeskDialog, DeskSteps, DeskSchedule } from './court-desk/DeskDialog';
import { RefundDialog } from './RefundWorkflow';
import { courtFloor } from './court-desk/timetable';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Phone, CalendarClock, CheckCircle2, Headset, RotateCcw } from 'lucide-react';
import { get, post } from '../api';
import { Button } from './UI';
import { Select } from './Select';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { DeskMoveDialog } from './court-desk/DeskMoveDialog';
import './court-desk/court-desk.css';
type Target={courtId:string;date:string;time:string};
type RequestRow={events?:{detail:{message?:string}}[];batchId?:string|null;batch?:{id:string;senderId:string;createdAt:string;reason:string}|null;id:string;bookingId:string;kind:string;status:string;reason:string;oldPaid:number|null;newPrice:number|null;priceDifference:number|null;oldSchedule:Target;proposed:Target|null;privateProposalId:string|null;updatedAt:string;booking:{id?:string;code:string;title:string;date:string;time:string;courtId:string;status:string;court:{id:string;name:string;floor?:string}|null;coach:{name:string}|null;user:{name:string;phone?:string|null}}};
type Detail={booking:{id:string;code:string;kind:string;date:string;time:string;status:string;paymentStatus:string;price:number};customer:{name:string|null;phone:string|null;linked:boolean};court:{name:string;floor?:string}|null;coach:{name:string}|null;paidAmount:number|null;request:{status:string}|null};
const label=(s:string)=>({DECLINED:'Declined',PENDING_CUSTOMER:'Awaiting Customer Response',CUSTOMER_SELECTING:'Awaiting Coach Approval',ADMIN_HANDLING:'Admin Handling',AWAITING_ADDITIONAL_PAYMENT:'Awaiting Additional Payment',REFUND_REQUESTED:'Refund Requested',REFUND_PROCESSING:'Refund Processing',REFUNDED:'Refunded',REFUND_REJECTED:'Refund Rejected',COMPLETED:'Completed',CANCELLED:'Cancelled',EXPIRED:'Expired'}[s]||s);
const active=(s:string)=>!['COMPLETED','CANCELLED','EXPIRED','REFUNDED','REFUND_REJECTED','DECLINED'].includes(s);
function ContactSummary({detail,compact=false}:{detail:Detail;compact?:boolean}){const phone=detail.customer.phone;return <div className={compact?'desk-contact-compact space-y-3':'space-y-3'}><div><h3 className="text-lg font-semibold">{detail.customer.name||'Customer name unavailable'}</h3>{phone?<div className="mt-2 flex flex-wrap items-center gap-3"><strong>{phone}</strong><a className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm" href={`tel:${phone.replace(/[^+\d]/g,'')}`}><Phone size={14}/>Call Customer</a></div>:<p className="mt-2 text-sm text-zawana-500">Phone number unavailable</p>}</div><p className="text-xs text-zawana-500">{detail.booking.code} · {detail.booking.kind==='court'?'Court Rental':'Private Course'}</p><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-zawana-500">Court / Floor</dt><dd>{detail.court?.name||'Court unavailable'} · {detail.court?courtFloor(detail.court):'Floor not recorded'}</dd></div><div><dt className="text-xs text-zawana-500">Schedule</dt><dd>{detail.booking.date}<br/>{detail.booking.time}</dd></div>{detail.coach&&<div><dt className="text-xs text-zawana-500">Coach</dt><dd>{detail.coach.name}</dd></div>}{!compact&&<><div><dt className="text-xs text-zawana-500">Total paid</dt><dd>{detail.paidAmount==null?'Payment amount needs review':`${detail.paidAmount.toLocaleString()} MMK`}</dd></div><div><dt className="text-xs text-zawana-500">Payment / Booking</dt><dd>{detail.booking.paymentStatus} · {detail.booking.status}</dd></div></>}</dl>{detail.request&&<p className="rounded-lg bg-amber-50 p-3 text-sm">{label(detail.request.status)}</p>}</div>;}
export function BookingContextSummary({bookingId}:{bookingId:string}){
 const [expanded,setExpanded]=useState(false);
 const revision=useBookingRevision();const[detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true,version=0;setDetail(null);setError('');const load=()=>{if(document.hidden)return;const v=++version;void get<Detail>(`/rescheduling/bookings/${bookingId}/details`).then(d=>{if(live&&v===version){setDetail(d);setError('');}}).catch(e=>{if(live&&v===version)setError(e.message);});};load();return()=>{live=false;};},[bookingId,revision]);
 return <section aria-label="Selected booking details" className="desk-booking-summary">{error?<p role="alert" className="text-sm text-red-700">{error}</p>:!detail?<p role="status" className="text-sm text-zawana-500">Loading customer details…</p>:<>
   <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><strong className="text-sm">{detail.customer.name||'Customer name unavailable'}</strong>{detail.customer.phone?<a className="desk-booking-summary__phone" href={`tel:${detail.customer.phone.replace(/[^+\d]/g,'')}`} aria-label={`Call Customer: ${detail.customer.phone}`}><span>{detail.customer.phone}</span><Phone size={14} aria-hidden="true"/></a>:<span className="text-xs text-zawana-500">Phone number unavailable</span>}</div>
   <p className="text-xs text-zawana-500">{detail.booking.kind==='court'?'Court Rental':'Private Course'} · {detail.court?.name||'Court unavailable'} · {detail.booking.date} · {detail.booking.time}</p>
   <div className="flex flex-wrap items-center gap-3">{detail.request&&<span role="status" className="text-xs font-medium text-amber-800">{label(detail.request.status)}</span>}<button type="button" className="text-xs font-semibold underline underline-offset-4" onClick={()=>setExpanded(true)}>View Details</button>{!detail.customer.linked&&<span className="text-xs text-zawana-500">No linked account · Contact customer directly</span>}</div>
   {expanded&&<DeskDialog title="Booking details" size="compact" cancelLabel="Close" onClose={()=>setExpanded(false)} closeLabel="Close booking details"><ContactSummary detail={detail}/></DeskDialog>}
 </>}</section>;

}
export function StaffRescheduleRequestDialog({bookingIds,onClose,onSent}:{bookingIds:string[];onClose:()=>void;onSent:(message:string)=>void}) {
 const [details,setDetails]=useState<Detail[]>([]),[notes,setNotes]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const requestKey=useRef(crypto.randomUUID());
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
       const result=await post<{createdCount:number;existingCount:number}>('/rescheduling/requests/batch',{bookingIds,reason,notes,requestKey:requestKey.current});
       onSent(result.createdCount ? `Requests sent for ${result.createdCount} rental${result.createdCount===1?'':'s'}. Awaiting Customer Response.${result.existingCount?` ${result.existingCount} already had active requests.`:''}` : 'All selected rentals already have active requests. No duplicate notifications were sent.');
     }else{
       await post('/rescheduling/requests',{bookingId:bookingIds[0],reason,notes});
       onSent('Request sent. Awaiting Customer Response.');
     }
     onClose();
   }catch(e){setError(e instanceof Error?e.message:'Could not send requests.');}
   finally{lock.current=false;setBusy(false);}
 };
 return <DeskDialog title="Send reschedule request" heading={batch?`Request Reschedule · ${bookingIds.length} rentals`:'Request Reschedule'} size="compact" onClose={onClose} busy={busy} closeLabel="Close request confirmation"
   description="Ask the customer to choose how to handle the booking."
   actions={<Button loading={busy} disabled={busy||details.length!==bookingIds.length||invalid||!newCount||!reason} onClick={()=>void send()}>{batch?`Send ${newCount} Request${newCount===1?'':'s'}`:'Send Request'}</Button>} bodyClassName="space-y-4">
     {!details.length&&!error&&<p role="status">Loading selected bookings…</p>}
     {batch?<><p className="text-sm">Each member receives one grouped notification for their new requests and can respond to each booking separately.</p>
       <ul aria-label="Rentals to request" className="divide-y rounded-xl border px-4">{details.map(d=><li key={d.booking.id} className="space-y-1 py-3 text-sm"><strong>{d.customer.name||'Customer name unavailable'}</strong><p className="text-xs text-zawana-500">{d.booking.code} · {d.court?.name} · {d.booking.date} · {d.booking.time}</p><p className="text-xs">{!d.customer.linked?'No linked member account — remove this rental to send requests':d.request?`${label(d.request.status)} · No duplicate request will be sent`:!['confirmed','CONFIRMED'].includes(d.booking.status)||d.booking.paymentStatus==='refunded'?'Only confirmed, non-refunded rentals can receive requests':'Ready to send'}</p></li>)}</ul>
       {details.some(d=>d.request)&&<p className="text-xs text-zawana-500">Rentals with active requests will be kept; no duplicate notifications will be sent.</p>}
     </>:details[0]&&<ContactSummary detail={details[0]} compact/>}
     {invalid&&<p role="alert" className="text-sm text-amber-800">Every selected booking must be confirmed and linked to an active member account. Close this dialog and remove ineligible rentals. Contact walk-in customers directly.</p>}
     <OperationalReasonField value={reason} onChange={setReason} disabled={busy}/>
     {reason && <section aria-label="Request message preview" className="whitespace-pre-line rounded-xl bg-zawana-950/[.025] p-4 text-sm leading-relaxed" aria-live="polite">{requestMessage(reason)}</section>}
     <label className="block text-sm">Notes (optional)<textarea className="mt-2 w-full" maxLength={1000} disabled={busy} value={notes} onChange={event => setNotes(event.target.value)}/></label>
     <p className="text-xs text-zawana-500">Sending requests does not change bookings or payments.</p>
     {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </DeskDialog>;
}

export function BookingRequestInbox({staff=false}:{staff?:boolean}){
 const revision=useBookingRevision();const[rows,setRows]=useState<RequestRow[]>([]),[error,setError]=useState(''),[open,setOpen]=useState(''),[intent,setIntent]=useState<'choices'|'select'|'REFUND_REQUESTED'|'ADMIN_HANDLING'>('choices'),[filter,setFilter]=useState(''),[search,setSearch]=useState(''),[courts,setCourts]=useState<{id:string;name:string}[]>([]),[move,setMove]=useState<RequestRow|null>(null);const[params]=useSearchParams();const opened=useRef(false);
 const [loaded, setLoaded] = useState(false);
 const groupTarget = params.get('batch');
 const focusedGroup = useRef('');
 useEffect(() => {
   if (!groupTarget || focusedGroup.current === groupTarget) return;
   const element = document.getElementById(`request-group-${groupTarget}`);
   if (element) { focusedGroup.current = groupTarget; element.focus(); element.scrollIntoView({ block: 'start' }); }
 }, [rows, groupTarget]);
 const [refundId,setRefundId]=useState('');
 const refresh=async()=>setRows(await get<RequestRow[]>('/rescheduling/requests'));
 useEffect(()=>{let live=true,version=0;const load=()=>{if(document.hidden)return;const v=++version;void get<RequestRow[]>('/rescheduling/requests').then(rows=>{if(live&&v===version){setRows(rows);setError('');}}).catch(e=>{if(live&&v===version)setError(e.message);}).finally(()=>{if(live&&v===version)setLoaded(true);});};load();return()=>{live=false;};},[revision]);
 useEffect(()=>{if(!opened.current&&params.get('request')&&rows.some(r=>r.id===params.get('request'))){opened.current=true;setOpen(params.get('request')!);}},[rows,params]);
 useEffect(()=>{let live=true;void get<typeof courts>('/courts').then(c=>{if(live)setCourts(c);}).catch(()=>{});return()=>{live=false;};},[staff]);
 if(staff&&!rows.length&&!error)return null;
 const row=rows.find(r=>r.id===open);
 const batches = [...new Set(rows.map(row => row.batchId).filter((id): id is string => !!id))];
 const selectedBatch = params.get('batch');
 return <section className={staff ? "desk-panel mb-6 p-5" : "request-history"} aria-label="Reschedule request management">{staff ? <h2 className="text-lg font-semibold">Reschedule requests</h2> : <>
   <header className="history-section-header"><div className="history-section-title"><span className="history-section-icon"><CalendarClock size={23} strokeWidth={1.5} aria-hidden="true"/></span><div><h2>Requests & schedule changes</h2><p>Choose what works for you. Your session stays booked until a change is confirmed.</p></div></div><div className="history-section-count"><strong>{loaded ? rows.filter(row => row.status === 'PENDING_CUSTOMER').length : '—'}</strong><span>Awaiting your response</span></div></header>
   {!loaded && !error && <HistoryLoading label="Loading booking requests…"/>}
   {loaded && !rows.length && !error && <div className="history-empty"><CheckCircle2 size={30} strokeWidth={1.3} aria-hidden="true"/><h3>No staff requests</h3><p>When the team requests a booking change, you can respond here.</p></div>}
 </>}{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{staff&&<div className="my-4 flex flex-wrap gap-3"><input aria-label="Search reschedule requests" placeholder="Customer, phone or booking" value={search} onChange={e=>setSearch(e.target.value)}/><Select aria-label="Request status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All request statuses</option>{['PENDING_CUSTOMER','ADMIN_HANDLING','CUSTOMER_SELECTING','AWAITING_ADDITIONAL_PAYMENT','REFUND_REQUESTED','REFUND_PROCESSING','REFUNDED','REFUND_REJECTED','COMPLETED','CANCELLED','EXPIRED'].map(s=><option key={s} value={s}>{label(s)}</option>)}</Select></div>}<div className="my-4 space-y-3" aria-label="Grouped booking requests">{batches.map(id => {
   const children = rows.filter(row => row.batchId === id), progress = requestBatchProgress(children);
   if (!children.some(row => (!filter || row.status === filter) && (!search || `${row.booking.user.name} ${row.booking.user.phone || ''} ${row.booking.code}`.toLowerCase().includes(search.toLowerCase())))) return null;
   return <section key={id} id={`request-group-${id}`} tabIndex={-1} className="request-history-group rounded-xl border p-4 focus-visible:ring-2 focus-visible:ring-zawana-gold" aria-label={`Request group: ${children.length} bookings`}>
     <div className="request-history-group-title"><div><span className="history-eyebrow">{operationalReasonLabel(children[0].batch?.reason || children[0].reason)}</span><h3>{children.length} booking requests</h3></div><span className="booking-history-status" data-tone={progress.pending ? 'pending' : 'confirmed'}>{progress.status}</span></div>
     <p className="mt-1 text-xs text-zawana-500">From Zawana staff · {new Date(children[0].batch?.createdAt || children[0].updatedAt).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })} · {progress.pending} awaiting response · {progress.resolved} resolved</p>
     <progress className="request-history-progress" max={progress.total} value={progress.resolved} aria-label="Resolved requests"/>
     <details className="request-history-message"><summary>Message from The Zawana</summary><p className="whitespace-pre-line text-sm leading-relaxed">{children[0].events?.find(event => event.detail.message)?.detail.message || requestMessage(children[0].batch?.reason || children[0].reason)}</p></details>
     <ul className="mt-3 divide-y">{children.map(child => <li key={child.id} className="request-history-item space-y-2 py-3 text-sm"><div className="request-history-item-heading"><strong>{child.booking.code}</strong><span className="booking-history-status" data-tone={child.status === 'PENDING_CUSTOMER' ? 'pending' : 'muted'}>{label(child.status)}</span></div><HistorySchedule original={{...child.oldSchedule,court:courts.find(c => c.id === child.oldSchedule.courtId)?.name || child.booking.court?.name}} proposed={child.proposed ? {...child.proposed,court:courts.find(c => c.id === child.proposed?.courtId)?.name || 'Replacement court'} : null}/>{!staff && child.status === 'PENDING_CUSTOMER' ? <div className="flex flex-wrap gap-2" aria-label={`Actions for ${child.booking.code}`}><Button onClick={() => { setIntent('select'); setOpen(child.id); }}>A. Reschedule</Button><Button variant="secondary" onClick={() => { setIntent('ADMIN_HANDLING'); setOpen(child.id); }}>B. Let Admin Handle</Button><Button variant="secondary" onClick={() => { setIntent('REFUND_REQUESTED'); setOpen(child.id); }}>C. Refund</Button></div> : !staff && child.status === 'ADMIN_HANDLING' ? <><p className="text-xs">Zawana staff will arrange this booking.</p><Button variant="ghost" onClick={() => { setIntent('choices'); setOpen(child.id); }}>View details</Button></> : <Button variant="secondary" onClick={() => { setIntent('choices'); setOpen(child.id); }}>{staff ? 'Request details' : 'View request'}</Button>}{staff && child.kind === 'court' && ['ADMIN_HANDLING','AWAITING_ADDITIONAL_PAYMENT'].includes(child.status) && <Button onClick={() => setMove(child)}>Arrange & confirm replacement</Button>}</li>)}</ul>
   </section>;
 })}</div>{selectedBatch && !batches.includes(selectedBatch) && <p role="status">This request group is unavailable for your account.</p>}<div className="mt-3 divide-y">{rows.filter(r=>!r.batchId&&(!filter||r.status===filter)&&(!search||`${r.booking.user.name} ${r.booking.user.phone||''} ${r.booking.code}`.toLowerCase().includes(search.toLowerCase()))).map(r=><article key={r.id} className="request-history-single space-y-2 py-4"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{staff?`${r.booking.user.name} · ${r.booking.user.phone||'Phone number unavailable'}`:r.booking.title}</strong><span className="booking-history-status" data-tone={r.status === 'PENDING_CUSTOMER' ? 'pending' : 'muted'}>{label(r.status)}</span></div><p className="history-eyebrow">{r.booking.code} · {r.kind==='court'?'Court Rental':'Private Course'}</p><HistorySchedule original={{...r.oldSchedule,court:courts.find(c=>c.id===r.oldSchedule.courtId)?.name||r.booking.court?.name}} proposed={r.proposed?{...r.proposed,court:courts.find(c=>c.id===r.proposed?.courtId)?.name||'Replacement court'}:null}/><p className="text-xs text-zawana-500">Updated {new Date(r.updatedAt).toLocaleString('en-GB',{timeZone:'Asia/Yangon'})}</p>{staff?<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>{setIntent('choices');setOpen(r.id);}}>Request details</Button>{r.kind==='court'&&['ADMIN_HANDLING','AWAITING_ADDITIONAL_PAYMENT'].includes(r.status)&&<Button onClick={()=>setMove(r)}>Arrange & confirm replacement</Button>}</div>:<Button variant="secondary" onClick={()=>{setIntent('choices');setOpen(r.id);}}>{active(r.status)?'Review request':'View request'}</Button>}</article>)}</div>{refundId&&<RefundDialog bookingId={refundId} onClose={()=>setRefundId('')} onCompleted={refresh}/>} {row&&<CustomerRequestDialog key={`${row.id}:${intent}`} initialMode={intent} onRefund={()=>{setOpen('');setRefundId(row.bookingId);}} row={row} staff={staff} onClose={()=>{setOpen('');setIntent('choices');}} onChanged={refresh}/>} {move&&<DeskMoveDialog sources={[{id:move.bookingId,kind:'court',date:move.booking.date,time:move.booking.time,courtId:move.booking.courtId,title:move.booking.user.name}]} initialDestination={move.proposed||undefined} courts={courts} onClose={()=>setMove(null)} onChanged={async()=>{setMove(null);await refresh();}}/>}</section>;
}
function CustomerRequestDialog({row,staff,onClose,onChanged,onRefund,initialMode='choices'}:{initialMode?:'choices'|'select'|'REFUND_REQUESTED'|'ADMIN_HANDLING';row:RequestRow;staff:boolean;onClose:()=>void;onChanged:()=>Promise<void>;onRefund:()=>void}){
 const[mode,setMode]=useState<'choices'|'select'|'ADMIN_HANDLING'|'REFUND_REQUESTED'|'CANCELLED'|'DECLINED'>(initialMode),[courts,setCourts]=useState<{id:string;name:string}[]>([]),[target,setTarget]=useState<Target>({courtId:row.booking.courtId,date:row.booking.date,time:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[quote,setQuote]=useState<{revision:string;newPrice:number;paidAmount:number|null;priceDifference:number|null}|null>(null),[ack,setAck]=useState(false);const lock=useRef(false);
 useEffect(()=>{let live=true;void get<typeof courts>('/courts').then(c=>{if(live)setCourts(c);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);

 const edit=(next:Partial<Target>)=>{setTarget(t=>({...t,...next,...(next.date||next.courtId?{time:''}:{})}));setQuote(null);setAck(false);setError('');};
 const run=async(task:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await task();}catch(e){setError(e instanceof Error?e.message:'Could not update request.');}finally{lock.current=false;setBusy(false);}};
 const review=()=>run(async()=>{setQuote(await post(`/rescheduling/requests/${row.id}/quote`,target));setAck(false);});
 const confirm=()=>run(async()=>{if(!quote)return;const result=await post<{status:string}>(`/rescheduling/requests/${row.id}/confirm`,{target,revision:quote.revision,acknowledged:ack});await onChanged();setMode('choices');setQuote(null);setNotice(result.status==='COMPLETED'?'Your replacement is confirmed.':result.status==='CUSTOMER_SELECTING'?'Your proposal is awaiting coach approval. The original session stays booked.':'Staff will arrange and record the required payment. The original booking is unchanged.');});
 const respond=()=>run(async()=>{if(mode!=='ADMIN_HANDLING'&&mode!=='REFUND_REQUESTED'&&mode!=='CANCELLED'&&mode!=='DECLINED')return;if(mode==='CANCELLED')await post(`/rescheduling/requests/${row.id}/cancel`,{});else await post(`/rescheduling/requests/${row.id}/respond`,{action:mode});await onChanged();setNotice(mode==='DECLINED'?'Request declined. Your original booking and payment are unchanged.':mode==='CANCELLED'?'Request closed. The booking and payment are unchanged.':mode==='ADMIN_HANDLING'?'Zawana staff will contact you to arrange your booking.':'Refund requested. No money has been transferred and the original payment remains unchanged.');setMode('choices');});
 const back=()=>{setMode('choices');setQuote(null);};
 const chooseAnother=()=>{setQuote(null);setAck(false);};
 const confirmLabel=quote&&quote.priceDifference!=null&&quote.priceDifference<0?'Continue — I Understand':quote?.priceDifference==null||quote.priceDifference>0?'Request Staff Payment Assistance':row.kind==='private_course'?'Send to Coach':'Confirm Replacement';
 const confirming=mode==='DECLINED'||mode==='ADMIN_HANDLING'||mode==='REFUND_REQUESTED'||mode==='CANCELLED';
 return <DeskDialog title="Reschedule request details" heading={row.kind==='court'?'Court Rental request':'Private Course request'} eyebrow={row.booking.code} size="compact" onClose={onClose} busy={busy} closeLabel="Close request details" cancelLabel={mode==='choices'?'Done':'Cancel'}
   steps={!staff&&active(row.status)&&row.status!=='REFUND_REQUESTED'?<DeskSteps labels={mode==='select'?['Choose replacement','Review & confirm']:confirming?['Choose action','Confirm request']:['Booking details','Choose action']} current={mode==='select'?(quote?1:0):1}/>:undefined}
   actions={<>{mode!=='choices'&&<Button variant="ghost" disabled={busy} onClick={back}>Back</Button>}{mode==='select'&&(!quote?<Button disabled={busy||!target.time} loading={busy} onClick={()=>void review()}>Review replacement</Button>:<>{!(row.kind==='court'&&quote.priceDifference!=null&&quote.priceDifference<0)&&<Button variant="ghost" disabled={busy} onClick={chooseAnother}>Choose Another Time</Button>}<Button disabled={busy||(quote.priceDifference!=null&&quote.priceDifference<0&&!ack)} loading={busy} onClick={()=>void confirm()}>{confirmLabel}</Button></>)}{confirming&&<Button disabled={busy} loading={busy} onClick={()=>void respond()}>Confirm Request</Button>}</>} bodyClassName="space-y-4">
   <div className="flex flex-wrap justify-between gap-2 text-xs"><strong>{row.booking.user.name}</strong><span>{label(row.status)}</span></div>
   {!quote&&<DeskSchedule label="Original booking" court={row.booking.court?.name} date={row.oldSchedule.date} time={row.oldSchedule.time}/>}
   {!row.batchId && row.reason && <p className="whitespace-pre-line text-sm leading-relaxed">{row.events?.find(event => event.detail.message)?.detail.message || requestMessage(row.reason)}</p>}
   {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm">{notice}</p>}
   {error&&<p role="alert" className="desk-load-error">{error}</p>}
   {mode==='choices'&&!staff&&active(row.status)&&row.status!=='REFUND_REQUESTED'&&<div className="grid gap-2">
     <Button aria-label="Reschedule" className="desk-action-choice" disabled={busy||!!row.privateProposalId} onClick={()=>{setNotice('');setMode('select');}}><CalendarClock aria-hidden="true"/><span>Reschedule<small>Choose another court, date and time.</small></span></Button>
     {row.kind==='court'&&<Button aria-label="Let Admin Handle" className="desk-action-choice" variant="secondary" disabled={busy} onClick={()=>{setNotice('');setMode('ADMIN_HANDLING');}}><Headset aria-hidden="true"/><span>Let Admin Handle<small>Ask the Front Office to arrange your booking.</small></span></Button>}
     <Button aria-label="Refund" className="desk-action-choice" variant="secondary" disabled={busy} onClick={()=>{setNotice('');setMode('REFUND_REQUESTED');}}><RotateCcw aria-hidden="true"/><span>Refund<small>Send a refund request for staff review.</small></span></Button>
   </div>}
   {mode==='select'&&!quote&&<ReplacementSessionFields target={target} onChange={edit} availabilityPath={`/rescheduling/requests/${row.id}/availability`} disabled={busy}/>}
   {mode==='select'&&quote&&<section aria-label="Replacement price review" className="space-y-4">
     <div className="desk-change-summary"><DeskSchedule label="Original booking" court={row.booking.court?.name} date={row.oldSchedule.date} time={row.oldSchedule.time}/><DeskSchedule label="Replacement" court={courts.find(c=>c.id===target.courtId)?.name} date={target.date} time={target.time}/></div>
     <p className="text-sm">New booking price: {quote.newPrice.toLocaleString()} MMK</p>
     {row.kind==='court'&&quote.priceDifference!=null&&quote.priceDifference<0?<div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4"><h3 className="font-semibold">Your new booking costs {Math.abs(quote.priceDifference).toLocaleString()} MMK less.</h3><p className="text-sm">If you continue, you will not receive the {Math.abs(quote.priceDifference).toLocaleString()} MMK difference back. Continue, or select another busy-hour time slot to keep the full value of your booking.</p><Button variant="secondary" disabled={busy} onClick={chooseAnother}>Choose Another Time</Button><label className="desk-acknowledgment"><input type="checkbox" disabled={busy} checked={ack} onChange={e=>setAck(e.target.checked)}/>I understand the difference is non-refundable.</label></div>
       :quote.priceDifference!=null&&quote.priceDifference>0?<div className="desk-note"><h3 className="font-semibold">Additional Payment Required: {quote.priceDifference.toLocaleString()} MMK</h3><p className="mt-2">Staff must record this payment before the replacement is confirmed. Your original session remains booked.</p></div>
       :quote.priceDifference==null?<p className="desk-note">Your original paid amount needs staff review. The booking will stay unchanged.</p>:<p className="desk-note">{row.kind==='private_course'?'Your assigned coach must approve this replacement. Existing payment stays unchanged.':'No additional payment is required.'}</p>}
   </section>}
   {confirming&&<div className="desk-note space-y-3"><h3 className="font-semibold">{mode==='DECLINED'?'Decline this request?':mode==='CANCELLED'?'Close this reschedule request?':mode==='ADMIN_HANDLING'?'Let Admin Handle?':'Request a refund review?'}</h3><p>{mode==='DECLINED'?'Your original booking and payment stay unchanged. Only this request is closed.':mode==='CANCELLED'?'The original booking and payment will remain unchanged.':mode==='ADMIN_HANDLING'?'Zawana staff will contact you to arrange your booking.':'This creates a refund request for staff review. No money is transferred, and your booking and payment are not automatically cancelled or refunded.'}</p></div>}
   {staff&&<div className="space-y-3 text-sm">{['REFUND_REQUESTED','REFUNDED'].includes(row.status)&&<Button onClick={onRefund}>{row.status==='REFUNDED'?'View Refund':'Process Refund'}</Button>}{active(row.status)&&row.status!=='REFUND_REQUESTED'&&mode==='choices'&&<Button variant="secondary" onClick={()=>setMode('CANCELLED')}>Close Request</Button>}<p>Customer: {row.booking.user.name} · {row.booking.user.phone||'Phone number unavailable'}</p><p>Response: {label(row.status)}</p>{row.proposed&&<DeskSchedule label="Requested replacement" court={courts.find(c=>c.id===row.proposed?.courtId)?.name} date={row.proposed.date} time={row.proposed.time}/>}<p>Original paid: {row.oldPaid==null?'Needs review':`${row.oldPaid.toLocaleString()} MMK`}</p>{row.priceDifference!=null&&<p>Difference: {row.priceDifference.toLocaleString()} MMK</p>}</div>}
 </DeskDialog>;
}
