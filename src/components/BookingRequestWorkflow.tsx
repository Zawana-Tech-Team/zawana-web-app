import { useAuth } from '../context/AuthContext';
import { RentalChangeReason, RentalScheduleCard } from './court-desk/RentalReschedulePresentation';
import { StaffBookingRequests } from './StaffBookingRequests';
import { AffectedBookingGroup } from './member-booking/AffectedBookingGroup';
import { HistorySchedule, HistoryLoading } from './member-booking/HistoryPresentation';
import { affectedBookingMessage, requestMessage } from '../../backend/src/domain/requestMessages';
import { OperationalReasonField } from './OperationalReasonField';
import { DeskDialog, DeskSchedule } from './court-desk/DeskDialog';
import { RefundDialog } from './RefundWorkflow';
import { courtFloor } from './court-desk/timetable';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Phone, CheckCircle2, Info } from 'lucide-react';
import { get, post } from '../api';
import { Button } from './UI';
import { Select } from './Select';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { DeskMoveDialog } from './court-desk/DeskMoveDialog';
import './court-desk/court-desk.css';
type Target={courtId:string;date:string;time:string};
export type RequestRow={originalCourtName?:string|null;events?:{detail:{message?:string}}[];batchId?:string|null;batch?:{id:string;senderId:string;createdAt:string;reason:string}|null;id:string;bookingId:string;kind:string;status:string;reason:string;oldPaid:number|null;newPrice:number|null;priceDifference:number|null;oldSchedule:Target;proposed:Target|null;privateProposalId:string|null;updatedAt:string;booking:{id?:string;code:string;title:string;date:string;time:string;courtId:string;status:string;court:{id:string;name:string;floor?:string}|null;coach:{name:string}|null;user:{name:string;phone?:string|null}}};
type Detail={booking:{id:string;code:string;kind:string;date:string;time:string;status:string;paymentStatus:string;price:number};customer:{name:string|null;phone:string|null;linked:boolean};court:{name:string;floor?:string}|null;coach:{name:string}|null;paidAmount:number|null;request:{status:string}|null};
const label=(s:string)=>({ACKNOWLEDGED:'Accepted',DECLINED:'Declined',PENDING_CUSTOMER:'Awaiting Customer Response',CUSTOMER_SELECTING:'Awaiting Coach Approval',ADMIN_HANDLING:'Admin Handling',AWAITING_ADDITIONAL_PAYMENT:'Awaiting Additional Payment',REFUND_REQUESTED:'Refund Requested',REFUND_PROCESSING:'Refund Processing',REFUNDED:'Refunded',REFUND_REJECTED:'Refund Rejected',COMPLETED:'Completed',CANCELLED:'Cancelled',EXPIRED:'Expired'}[s]||s);
const active=(s:string)=>!['ACKNOWLEDGED','COMPLETED','CANCELLED','EXPIRED','REFUNDED','REFUND_REJECTED','DECLINED'].includes(s);
function ContactSummary({detail,compact=false}:{detail:Detail;compact?:boolean}){const phone=detail.customer.phone;return <div className={compact?'desk-contact-compact space-y-3':'space-y-3'}><div><h3 className="text-lg font-semibold">{detail.customer.name||'Customer name unavailable'}</h3>{phone?<div className="mt-2 flex flex-wrap items-center gap-3"><strong>{phone}</strong><a className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm" href={`tel:${phone.replace(/[^+\d]/g,'')}`}><Phone size={14}/>Call Customer</a></div>:<p className="mt-2 text-sm text-zawana-500">Phone number unavailable</p>}</div><p className="text-xs text-zawana-500">{detail.booking.code} · {detail.booking.kind==='court'?'Court Rental':'Private Course'}</p><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-zawana-500">Court / Floor</dt><dd>{detail.court?.name||'Court unavailable'} · {detail.court?courtFloor(detail.court):'Floor not recorded'}</dd></div><div><dt className="text-xs text-zawana-500">Schedule</dt><dd>{detail.booking.date}<br/>{detail.booking.time}</dd></div>{detail.coach&&<div><dt className="text-xs text-zawana-500">Coach</dt><dd>{detail.coach.name}</dd></div>}{!compact&&<><div><dt className="text-xs text-zawana-500">Total paid</dt><dd>{detail.paidAmount==null?'Payment amount needs review':`${detail.paidAmount.toLocaleString()} MMK`}</dd></div><div><dt className="text-xs text-zawana-500">Payment / Booking</dt><dd>{detail.booking.paymentStatus} · {detail.booking.status}</dd></div></>}</dl>{detail.request&&<p className="rounded-lg bg-amber-50 p-3 text-sm">{label(detail.request.status)}</p>}</div>;}
export function BookingContextSummary({bookingId,compact=false}:{bookingId:string;compact?:boolean}){
 const [expanded,setExpanded]=useState(false),[reload,setReload]=useState(0);
 const enabled=!compact||expanded;
 const revision=useBookingRevision(enabled);const[detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState('');
 useEffect(()=>{if(!enabled)return;let live=true,version=0;setDetail(null);setError('');const load=()=>{if(document.hidden)return;const v=++version;void get<Detail>(`/rescheduling/bookings/${bookingId}/details`).then(d=>{if(live&&v===version){setDetail(d);setError('');}}).catch(e=>{if(live&&v===version)setError(e.message);});};load();return()=>{live=false;};},[bookingId,revision,enabled,reload]);
 const dialog=expanded&&<DeskDialog title="Booking details" size="compact" cancelLabel="Close" onClose={()=>setExpanded(false)} closeLabel="Close booking details">{error?<div role="alert" className="desk-load-error"><p>{error}</p><Button variant="secondary" onClick={()=>setReload(value=>value+1)}>Retry details</Button></div>:!detail?<p role="status" className="text-sm text-zawana-500">Loading booking details…</p>:<ContactSummary detail={detail}/>}</DeskDialog>;
 if(compact)return <><Button variant="secondary" onClick={()=>setExpanded(true)}>View Details</Button>{dialog}</>;
 return <section aria-label="Selected booking details" className="desk-booking-summary">{error?<p role="alert" className="text-sm text-red-700">{error}</p>:!detail?<p role="status" className="text-sm text-zawana-500">Loading customer details…</p>:<>
   <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><strong className="text-sm">{detail.customer.name||'Customer name unavailable'}</strong>{detail.customer.phone?<a className="desk-booking-summary__phone" href={`tel:${detail.customer.phone.replace(/[^+\d]/g,'')}`} aria-label={`Call Customer: ${detail.customer.phone}`}><span>{detail.customer.phone}</span><Phone size={14} aria-hidden="true"/></a>:<span className="text-xs text-zawana-500">Phone number unavailable</span>}</div>
   <p className="text-xs text-zawana-500">{detail.booking.kind==='court'?'Court Rental':'Private Course'} · {detail.court?.name||'Court unavailable'} · {detail.booking.date} · {detail.booking.time}</p>
   <div className="flex flex-wrap items-center gap-3">{detail.request&&<span role="status" className="text-xs font-medium text-amber-800">{label(detail.request.status)}</span>}<button type="button" className="text-xs font-semibold underline underline-offset-4" onClick={()=>setExpanded(true)}>View Details</button>{!detail.customer.linked&&<span className="text-xs text-zawana-500">No linked account · Contact customer directly</span>}</div>
 </>}{dialog}</section>;
}

export function StaffRescheduleRequestDialog({bookingIds,onClose,onSent}:{bookingIds:string[];onClose:()=>void;onSent:(message:string)=>void}) {
 const { user } = useAuth();
 const [reload, setReload] = useState(0);
 const [loading, setLoading] = useState(true);
 const [details,setDetails]=useState<Detail[]>([]),[notes,setNotes]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const requestKey=useRef(crypto.randomUUID());
 const lock=useRef(false);
 const batch=bookingIds.length>1;
 useEffect(()=>{
   let live=true;
   setLoading(true);setError('');
   void Promise.all(bookingIds.map(id=>get<Detail>(`/rescheduling/bookings/${id}/details`)))
     .then(rows=>{if(live)setDetails(rows);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});
   return()=>{live=false;};
 },[bookingIds,reload]);
 const invalid=details.some(d=>!d.customer.linked||!['confirmed','CONFIRMED'].includes(d.booking.status)||d.booking.paymentStatus==='refunded');
 const newCount=details.filter(d=>!d.request).length;
 const staffRental = !!user && ['admin', 'badminton_fo'].includes(user.role) && (!details.length || details.every(detail => detail.booking.kind === 'court'));
 const commonCustomer = details[0] && details.every(detail => detail.customer.name === details[0].customer.name && detail.customer.phone === details[0].customer.phone) ? details[0].customer : null;
 const send=async()=>{
   if(lock.current||loading||details.length!==bookingIds.length||invalid||!newCount||!reason)return;
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
 if (staffRental) return <DeskDialog title="Send reschedule request" heading={batch ? `Request reschedule · ${bookingIds.length} rentals` : 'Request reschedule'} className="rental-change-dialog rental-request-dialog" size="standard" onClose={onClose} busy={busy} closeLabel="Close request confirmation"
   actions={<Button type="submit" form="admin-rental-request" loading={busy} disabled={busy || loading || details.length !== bookingIds.length || invalid || !newCount || !reason}>{details.length === bookingIds.length && !newCount ? batch ? 'Requests already sent' : 'Request already sent' : batch ? `Send ${newCount} Request${newCount === 1 ? '' : 's'}` : 'Send Request'}</Button>}>
   {loading ? <p className="rental-change-loading" role="status">Loading selected bookings…</p> : !details.length && error ? <div className="rental-change-error" role="alert"><p>{error}</p><Button variant="secondary" onClick={() => setReload(value => value + 1)}>Retry booking details</Button></div> : <form id="admin-rental-request" onSubmit={event => { event.preventDefault(); void send(); }}><fieldset className="rental-change-fields" disabled={busy}>
     {commonCustomer && <header className="rental-request-customer"><strong>{commonCustomer.name || 'Customer name unavailable'}</strong>{commonCustomer.phone && <a href={`tel:${commonCustomer.phone.replace(/[^+\d]/g, '')}`}><Phone size={13} aria-hidden="true"/>{commonCustomer.phone}</a>}</header>}
     <ul className="rental-request-bookings" aria-label="Rentals to request">{details.map(detail => <li key={detail.booking.id}>
       <header>{!commonCustomer && <div><strong>{detail.customer.name || 'Customer name unavailable'}</strong>{detail.customer.phone && <a href={`tel:${detail.customer.phone.replace(/[^+\d]/g, '')}`}><Phone size={13} aria-hidden="true"/>{detail.customer.phone}</a>}</div>}<span>{detail.booking.code}</span></header>
       <RentalScheduleCard label="Original booking" court={detail.court} date={detail.booking.date} time={detail.booking.time}/>
       {!detail.customer.linked ? <p className="rental-request-warning">No linked member account — remove this rental to send requests</p> : !['confirmed', 'CONFIRMED'].includes(detail.booking.status) || detail.booking.paymentStatus === 'refunded' ? <p className="rental-request-warning">Only confirmed, non-refunded rentals can receive requests.</p> : detail.request && <p className="rental-request-existing">{label(detail.request.status)} · No duplicate request will be sent</p>}
     </li>)}</ul>
     <RentalChangeReason value={reason} onChange={setReason} disabled={busy}/>
     {reason && <details className="rental-request-disclosure"><summary>Customer notice</summary><p className="rental-request-message" aria-label="Request message preview">{batch ? affectedBookingMessage(reason) : requestMessage(reason)}</p></details>}
     <details className="rental-request-disclosure"><summary>Notes (optional)</summary><label className="rental-change-field"><span className="sr-only">Notes (optional)</span><textarea aria-label="Notes (optional)" rows={3} maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)}/></label></details>
     <p className="rental-change-hint"><Info size={16} aria-hidden="true"/><span>The member chooses how to proceed. Sending a request keeps the booking and payment unchanged.</span></p>
     {error && <p className="rental-change-error" role="alert">{error}</p>}
   </fieldset></form>}
 </DeskDialog>;
 return <DeskDialog title="Send reschedule request" heading={batch?`Affected booking notices · ${bookingIds.length} bookings`:'Request Reschedule'} size="compact" onClose={onClose} busy={busy} closeLabel="Close request confirmation"
   description={batch?'Notify members about affected bookings. No alternative court or time is required.':'Ask the customer to choose how to handle the booking.'}
   actions={<Button loading={busy} disabled={busy||details.length!==bookingIds.length||invalid||!newCount||!reason} onClick={()=>void send()}>{batch?`Send ${newCount} Request${newCount===1?'':'s'}`:'Send Request'}</Button>} bodyClassName="space-y-4">
     {!details.length&&!error&&<p role="status">Loading selected bookings…</p>}
     {batch?<><p className="text-sm">Each member receives one grouped notification for their new requests and can respond to each booking separately.</p>
       <ul aria-label="Rentals to request" className="divide-y rounded-xl border px-4">{details.map(d=><li key={d.booking.id} className="space-y-1 py-3 text-sm"><strong>{d.customer.name||'Customer name unavailable'}</strong><p className="text-xs text-zawana-500">{d.booking.code} · {d.court?.name} · {d.booking.date} · {d.booking.time}</p><p className="text-xs">{!d.customer.linked?'No linked member account — remove this rental to send requests':d.request?`${label(d.request.status)} · No duplicate request will be sent`:!['confirmed','CONFIRMED'].includes(d.booking.status)||d.booking.paymentStatus==='refunded'?'Only confirmed, non-refunded rentals can receive requests':'Ready to send'}</p></li>)}</ul>
       {details.some(d=>d.request)&&<p className="text-xs text-zawana-500">Rentals with active requests will be kept; no duplicate notifications will be sent.</p>}
     </>:details[0]&&<ContactSummary detail={details[0]} compact/>}
     {invalid&&<p role="alert" className="text-sm text-amber-800">Every selected booking must be confirmed and linked to an active member account. Close this dialog and remove ineligible rentals. Contact walk-in customers directly.</p>}
     <OperationalReasonField value={reason} onChange={setReason} disabled={busy}/>
     {reason && <section aria-label="Request message preview" className="whitespace-pre-line rounded-xl bg-zawana-950/[.025] p-4 text-sm leading-relaxed" aria-live="polite">{batch ? affectedBookingMessage(reason) : requestMessage(reason)}</section>}
     <label className="block text-sm">Notes (optional)<textarea className="mt-2 w-full" maxLength={1000} disabled={busy} value={notes} onChange={event => setNotes(event.target.value)}/></label>
     <p className="text-xs text-zawana-500">Sending requests does not change bookings or payments.</p>
     {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </DeskDialog>;
}

type RequestIntent = 'choices' | 'select' | 'REFUND_REQUESTED' | 'ADMIN_HANDLING';
function MemberRequestActions({code,kind,onAction}:{code:string;kind:string;onAction:(intent:RequestIntent)=>void}) {
 return <div className="flex flex-wrap gap-2" aria-label={`Actions for ${code}`}><Button onClick={()=>onAction('select')}>Accept</Button><Button variant="secondary" onClick={()=>onAction('REFUND_REQUESTED')}>Refund</Button>{kind==='court'&&<Button variant="secondary" onClick={()=>onAction('ADMIN_HANDLING')}>Admin Handle</Button>}</div>;
}
export function BookingRequestInbox({staff=false,adminTab=false}:{staff?:boolean;adminTab?:boolean}){
 const revision=useBookingRevision();const[rows,setRows]=useState<RequestRow[]>([]),[error,setError]=useState(''),[open,setOpen]=useState(''),[intent,setIntent]=useState<RequestIntent>('choices'),[filter,setFilter]=useState(''),[search,setSearch]=useState(''),[courts,setCourts]=useState<{id:string;name:string}[]>([]),[move,setMove]=useState<RequestRow|null>(null);const[params]=useSearchParams();const opened=useRef('');
 const [loaded, setLoaded] = useState(false),[refreshing,setRefreshing]=useState(false);
 const [feedback,setFeedback]=useState('');
 const visibleRows=staff?rows:rows.filter(row=>row.status==='PENDING_CUSTOMER');
 const groupTarget = params.get('batch') || rows.find(row=>row.id===params.get('request'))?.batchId || (!staff?params.get('request'):null);
 const focusedGroup = useRef('');
 useEffect(() => {
   if (!groupTarget || focusedGroup.current === groupTarget) return;
   const element = document.getElementById(`request-group-${groupTarget}`);
   if (element) { focusedGroup.current = groupTarget; element.focus(); element.scrollIntoView({ block: 'start' }); }
 }, [rows, groupTarget]);
 const [refundId,setRefundId]=useState('');
 const refresh=async()=>{setRefreshing(true);try{setRows(await get<RequestRow[]>('/rescheduling/requests'));setError('');setLoaded(true);}catch(error){setError(error instanceof Error?error.message:'Could not load requests.');throw error;}finally{setRefreshing(false);}};
 useEffect(()=>{let live=true,version=0;const load=()=>{if(document.hidden)return;const v=++version;setRefreshing(true);void get<RequestRow[]>('/rescheduling/requests').then(rows=>{if(live&&v===version){setRows(rows);setError('');}}).catch(e=>{if(live&&v===version)setError(e.message);}).finally(()=>{if(live&&v===version){setLoaded(true);setRefreshing(false);}});};load();return()=>{live=false;};},[revision]);
 useEffect(()=>{const id=params.get('request');if(staff&&id&&opened.current!==id&&rows.some(row=>row.id===id)){opened.current=id;setOpen(id);}},[rows,params,staff]);
 useEffect(()=>{let live=true;void get<typeof courts>('/courts').then(c=>{if(live)setCourts(c);}).catch(()=>{});return()=>{live=false;};},[staff]);
 const row=rows.find(r=>r.id===open);
 const batches = [...new Set(visibleRows.map(row => row.batchId || (!staff?row.id:null)).filter((id): id is string => !!id))];
 const selectedBatch = params.get('batch');
 if(staff)return <><StaffBookingRequests adminTab={adminTab} rows={rows} courts={courts} loaded={loaded} loading={refreshing} error={error} target={params.get('batch')||params.get('request')} label={label} onRefresh={()=>void refresh().catch(()=>{})} onDetails={id=>{setIntent('choices');setOpen(id);}} onArrange={setMove} onRefund={setRefundId}/>{refundId&&<RefundDialog bookingId={refundId} onClose={()=>setRefundId('')} onCompleted={refresh}/>} {row&&<CustomerRequestDialog key={`${row.id}:${intent}`} initialMode={intent} onRefund={()=>{setOpen('');setRefundId(row.bookingId);}} row={row} staff onClose={()=>{setOpen('');setIntent('choices');}} onChanged={refresh}/>} {move&&<DeskMoveDialog sources={[{id:move.bookingId,kind:'court',date:move.booking.date,time:move.booking.time,courtId:move.booking.courtId,title:move.booking.user.name,customerName:move.booking.user.name}]} initialDestination={move.proposed||undefined} courts={courts} onClose={()=>setMove(null)} onChanged={async()=>{setMove(null);await refresh();}}/>}</>;

 return <section className={staff ? "desk-panel mb-6 p-5" : "request-history"} aria-label="Reschedule request management">{staff ? <h2 className="text-lg font-semibold">Reschedule requests</h2> : <>
   {!loaded && !error && <HistoryLoading label="Loading booking requests…"/>}
   {loaded && !visibleRows.length && !error && <div className="history-empty"><CheckCircle2 size={30} strokeWidth={1.3} aria-hidden="true"/><h3>You’re all caught up</h3><p>No requests need your response. New booking notices will appear here.</p></div>}
 </>}{!staff&&feedback&&<p role="status" className="affected-booking-feedback">{feedback}</p>}{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{staff&&<div className="my-4 flex flex-wrap gap-3"><input aria-label="Search reschedule requests" placeholder="Customer, phone or booking" value={search} onChange={e=>setSearch(e.target.value)}/><Select aria-label="Request status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All request statuses</option>{['PENDING_CUSTOMER','ACKNOWLEDGED','ADMIN_HANDLING','CUSTOMER_SELECTING','AWAITING_ADDITIONAL_PAYMENT','REFUND_REQUESTED','REFUND_PROCESSING','REFUNDED','REFUND_REJECTED','COMPLETED','CANCELLED','EXPIRED'].map(s=><option key={s} value={s}>{label(s)}</option>)}</Select></div>}<div className="my-4 space-y-3" aria-label="Grouped booking requests">{batches.map(id => {
   const children = visibleRows.filter(row => (row.batchId || (!staff?row.id:null)) === id);
   if (!children.some(row => (!filter || row.status === filter) && (!search || `${row.booking.user.name} ${row.booking.user.phone || ''} ${row.booking.code}`.toLowerCase().includes(search.toLowerCase())))) return null;
   return <AffectedBookingGroup key={id} id={id} reason={children[0].batch?.reason || children[0].reason} items={children} courts={courts} staff={staff} onResponse={staff?undefined:setFeedback} onChanged={refresh} onRefund={setRefundId} onArrange={requestId=>{const request=rows.find(row=>row.id===requestId);if(request)setMove(request);}} onAccept={requestId=>{setIntent('select');setOpen(requestId);}}/>;
 })}</div>{selectedBatch && !batches.includes(selectedBatch) && (staff || visibleRows.length>0) && <p role="status">{staff?'This request group is unavailable for your account.':'No requests need your response in this group.'}</p>}<div className="mt-3 divide-y">{visibleRows.filter(r=>staff&&!r.batchId&&(!filter||r.status===filter)&&(!search||`${r.booking.user.name} ${r.booking.user.phone||''} ${r.booking.code}`.toLowerCase().includes(search.toLowerCase()))).map(r=><article key={r.id} className="request-history-single space-y-2 py-4"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{staff?`${r.booking.user.name} · ${r.booking.user.phone||'Phone number unavailable'}`:r.booking.title}</strong><span className="booking-history-status" data-tone={r.status === 'PENDING_CUSTOMER' ? 'pending' : 'muted'}>{label(r.status)}</span></div><p className="history-eyebrow">{r.booking.code} · {r.kind==='court'?'Court Rental':'Private Course'}</p><HistorySchedule original={{...r.oldSchedule,court:courts.find(c=>c.id===r.oldSchedule.courtId)?.name||r.booking.court?.name}} proposed={r.proposed?{...r.proposed,court:courts.find(c=>c.id===r.proposed?.courtId)?.name||'Replacement court'}:null}/><p className="text-xs text-zawana-500">Updated {new Date(r.updatedAt).toLocaleString('en-GB',{timeZone:'Asia/Yangon'})}</p>{staff?<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>{setIntent('choices');setOpen(r.id);}}>Request details</Button>{r.kind==='court'&&['ADMIN_HANDLING','AWAITING_ADDITIONAL_PAYMENT'].includes(r.status)&&<Button onClick={()=>setMove(r)}>Arrange & confirm replacement</Button>}</div>:r.status==='PENDING_CUSTOMER'?<MemberRequestActions kind={r.kind} code={r.booking.code} onAction={intent=>{setIntent(intent);setOpen(r.id);}}/>:<Button variant="secondary" onClick={()=>{setIntent('choices');setOpen(r.id);}}>{active(r.status)?'Review request':'View request'}</Button>}</article>)}</div>{refundId&&<RefundDialog bookingId={refundId} onClose={()=>setRefundId('')} onCompleted={refresh}/>} {row&&<CustomerRequestDialog key={`${row.id}:${intent}`} initialMode={intent} onRefund={()=>{setOpen('');setRefundId(row.bookingId);}} row={row} staff={staff} onClose={()=>{setOpen('');setIntent('choices');}} onChanged={refresh}/>} {move&&<DeskMoveDialog sources={[{id:move.bookingId,kind:'court',date:move.booking.date,time:move.booking.time,courtId:move.booking.courtId,title:move.booking.user.name,customerName:move.booking.user.name}]} initialDestination={move.proposed||undefined} courts={courts} onClose={()=>setMove(null)} onChanged={async()=>{setMove(null);await refresh();}}/>}</section>;
}
function CustomerRequestDialog({row,staff,onClose,onChanged,onRefund,initialMode='choices'}:{initialMode?:'choices'|'select'|'REFUND_REQUESTED'|'ADMIN_HANDLING';row:RequestRow;staff:boolean;onClose:()=>void;onChanged:()=>Promise<void>;onRefund:()=>void}){
 const [mode,setMode]=useState<'choices'|'select'|'ADMIN_HANDLING'|'REFUND_REQUESTED'|'CANCELLED'>(initialMode),[courts,setCourts]=useState<{id:string;name:string}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false);
 useEffect(()=>{let live=true;void get<typeof courts>('/courts').then(data=>{if(live)setCourts(data);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
 const respond=async()=>{
   if(lock.current||mode==='choices'||mode==='select')return;
   lock.current=true;setBusy(true);setError('');
   try{if(mode==='CANCELLED')await post(`/rescheduling/requests/${row.id}/cancel`,{});else await post(`/rescheduling/requests/${row.id}/respond`,{action:mode});await onChanged();setNotice(mode==='CANCELLED'?'Request closed. The booking and payment are unchanged.':mode==='ADMIN_HANDLING'?'Zawana staff will contact you to arrange your booking.':'Refund requested. No money has been transferred and the original payment remains unchanged.');setMode('choices');}
   catch(e){setError(e instanceof Error?e.message:'Could not update request.');}finally{lock.current=false;setBusy(false);}
 };
 if(mode==='select'&&!staff)return <Navigate to={`/bookings/${encodeURIComponent(row.bookingId)}/reschedule?request=${encodeURIComponent(row.id)}`}/>;
 const confirming=mode!=='choices';
 return <DeskDialog title="Reschedule request details" heading={row.kind==='court'?'Court Rental request':'Private Course request'} eyebrow={row.booking.code} size="compact" onClose={onClose} busy={busy} closeLabel="Close request details" cancelLabel={mode==='choices'?'Done':'Cancel'}
   actions={confirming?<><Button variant="ghost" disabled={busy} onClick={()=>setMode('choices')}>Back</Button><Button disabled={busy} loading={busy} onClick={()=>void respond()}>Confirm Request</Button></>:undefined} bodyClassName="space-y-4">
   <DeskSchedule label="Original booking" court={row.originalCourtName||courts.find(c=>c.id===row.oldSchedule.courtId)?.name||row.booking.court?.name} date={row.oldSchedule.date} time={row.oldSchedule.time}/>
   {!row.batchId&&row.reason&&row.reason!=='Member self-reschedule'&&<p className="whitespace-pre-line text-sm leading-relaxed">{row.events?.find(event=>event.detail.message)?.detail.message||requestMessage(row.reason)}</p>}
   {notice&&<p role="status" className="reschedule-success">{notice}</p>}{error&&<p role="alert" className="desk-load-error">{error}</p>}
   {mode==='choices'&&!staff&&active(row.status)&&row.status!=='REFUND_REQUESTED'&&<div className="grid gap-2">
     <Button aria-label="Reschedule" disabled={busy||!!row.privateProposalId} onClick={()=>setMode('select')}>Reschedule</Button>
     {row.kind==='court'&&<Button variant="secondary" onClick={()=>setMode('ADMIN_HANDLING')}>Admin Handle</Button>}
     <Button variant="secondary" onClick={()=>setMode('REFUND_REQUESTED')}>Refund</Button>
   </div>}
   {confirming&&<p className="desk-note">{mode==='CANCELLED'?'Close this request. The original booking and payment will remain unchanged.':mode==='ADMIN_HANDLING'?'Zawana staff will contact you to arrange your booking.':'Send this booking for refund review. No money is transferred and your original booking stays reserved.'}</p>}
   {staff&&<div className="space-y-3 text-sm">{['REFUND_REQUESTED','REFUNDED'].includes(row.status)&&<Button onClick={onRefund}>{row.status==='REFUNDED'?'View Refund':'Process Refund'}</Button>}{active(row.status)&&row.status!=='REFUND_REQUESTED'&&mode==='choices'&&<Button variant="secondary" onClick={()=>setMode('CANCELLED')}>Close Request</Button>}<p>Customer: {row.booking.user.name} · {row.booking.user.phone||'Phone number unavailable'}</p><p>Response: {label(row.status)}</p>{row.proposed&&<DeskSchedule label="Requested replacement" court={courts.find(c=>c.id===row.proposed?.courtId)?.name} date={row.proposed.date} time={row.proposed.time}/>}<p>Original paid: {row.oldPaid==null?'Needs review':`${row.oldPaid.toLocaleString()} MMK`}</p>{row.priceDifference!=null&&<p>Difference: {row.priceDifference.toLocaleString()} MMK</p>}</div>}
 </DeskDialog>;
}
