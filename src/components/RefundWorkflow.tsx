import { useSearchParams } from 'react-router-dom';
import { AdminRefundRequests } from './AdminRefundRequests';
import { CheckCircle2, Info } from 'lucide-react';
import { RefundBookingCard, RefundPaymentDetails, refundTimestamp } from './refund/RefundPresentation';
import { Banknote, CreditCard, RotateCcw } from 'lucide-react';
import { HistoryLoading } from './member-booking/HistoryPresentation';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { useLanguage } from '../context/LanguageContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { get, post } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePaymentRevision } from '../hooks/usePaymentRevision';
import { DeskDialog, DeskSteps } from './court-desk/DeskDialog';
import { Button } from './UI';
import { Select } from './Select';
import { courtFloor } from './court-desk/timetable';
import './court-desk/court-desk.css';
type RecordRow={id:string;amount:number;paidAmount:number;method:string;employeeName:string;employeeUserId:string;notes:string;refundReference:string|null;status:string;processedAt:string};
type Detail={booking:{id:string;code:string;kind:string;date:string;time:string;status:string;paymentStatus:string};customer:{id:string|null;name:string;phone:string|null};court:{name:string;floor?:string}|null;coach:{name:string}|null;paidAmount:number|null;payments:{id:string;amount:number;method:string}[];request:{id:string;reason:string;status:string}|null;refund:RecordRow|null;blocked:string|null;revision:string};
const money=(n:number)=>`${n.toLocaleString()} MMK`;
const method=(m:string)=>m==='CASH'?'Cash':'Online Payment';
const status=(d:Detail)=>d.refund?'Refunded':d.request?.status==='REFUND_REJECTED'?'Refund Rejected':d.request?.status==='REFUND_PROCESSING'?'Refund Processing':'Refund Requested';
function BookingSummary({detail:d}:{detail:Detail}){
 return <section aria-label="Refund booking summary" className="space-y-2 break-words rounded-xl border p-4 text-sm"><strong>{d.customer.name}</strong>{d.customer.phone&&<a className="ml-3 underline" href={`tel:${d.customer.phone.replace(/[^+\d]/g,'')}`}>{d.customer.phone}</a>}<p className="text-xs text-zawana-500">{d.booking.kind==='court'?'Court Rental':'Private Course'} · {d.booking.code}</p><p className="text-xs text-zawana-500">{d.court?.name} · {d.court?courtFloor(d.court):''} · {d.booking.date} · {d.booking.time}{d.coach?` · ${d.coach.name}`:''}</p><p>Original payment: {d.paidAmount==null?'Needs reconciliation':money(d.paidAmount)}{d.payments.length>0&&<span className="text-xs text-zawana-500"> · {[...new Set(d.payments.map(p=>p.method))].join(' / ')}</span>}</p><details className="text-xs text-zawana-500"><summary className="cursor-pointer">Original payment details</summary><p className="mt-2">{d.payments.map(p=>`${p.method} · ${money(p.amount)} · ${p.id}`).join(' / ')||'No linked paid receipt'}</p></details><p className="text-xs">Reason: {d.request?.reason||'Staff-recorded refund'}</p><p className="text-xs font-medium">{d.refund?'Refunded':d.request?status(d):'Awaiting staff review'}</p></section>;
}
export function RefundDialog({bookingId,onClose,onCompleted}:{bookingId:string;onClose:()=>void;onCompleted:()=>Promise<void>}){
 const {user}=useAuth();
 const staffRefund = !!user && ['admin', 'badminton_fo'].includes(user.role);
 const [detail,setDetail]=useState<Detail|null>(null),[amount,setAmount]=useState(''),[refundMethod,setRefundMethod]=useState('CASH'),[employeeName,setEmployeeName]=useState(user?.name||''),[notes,setNotes]=useState(''),[reference,setReference]=useState(''),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),retry=useRef({payload:'',key:''});
 const [reload,setReload]=useState(0);
 const adminStage=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(staffRefund)adminStage.current?.closest('.desk-reservation-dialog__body')?.scrollTo({top:0});},[review,staffRefund]);
 useEffect(()=>{let live=true;setDetail(null);setError('');void get<Detail>(`/rescheduling/refunds/bookings/${bookingId}`).then(d=>{if(live){setDetail(d);setAmount(String(d.paidAmount||''));}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[bookingId,reload]);
 const valid=!!detail&&!detail.blocked&&Number.isInteger(Number(amount))&&Number(amount)>0&&Number(amount)<=(detail.paidAmount||0)&&employeeName.trim().length>=2&&notes.trim().length>=3&&(refundMethod==='CASH'||reference.trim().length>=6);
 const finish=async()=>{
   if(lock.current||!detail||!valid)return;
   const payload={amount:Number(amount),method:refundMethod,employeeName:employeeName.trim(),notes:notes.trim(),reference:refundMethod==='ONLINE'?reference.trim():'',confirmed:true,revision:detail.revision};
   const serialized=JSON.stringify(payload);if(retry.current.payload!==serialized)retry.current={payload:serialized,key:crypto.randomUUID()};
   lock.current=true;setBusy(true);setError('');
   let recorded:RecordRow|null=null;
   try{recorded=await post<RecordRow>(`/rescheduling/refunds/bookings/${bookingId}/complete`,{...payload,requestKey:retry.current.key});await onCompleted();onClose();}
   catch(e){if(recorded&&staffRefund){setDetail({...detail,refund:recorded,blocked:'Refund already completed.'});setReview(false);setError('Refund saved. The booking list could not refresh; close this dialog and refresh the page.');}else setError(e instanceof Error?e.message:'Could not record refund.');}
   finally{lock.current=false;setBusy(false);}
 };
 if(staffRefund)return <DeskDialog title="Process refund" heading={detail?.refund?'Refund details':review?'Review refund':'Refund booking'} size="standard" className="admin-refund-dialog" onClose={onClose} busy={busy} closeLabel="Close refund processing" cancelLabel={detail?.refund?'Close':'Cancel'}
   actions={detail&&!detail.refund&&!detail.blocked&&(review?<><Button variant="ghost" disabled={busy} onClick={()=>setReview(false)}>Edit refund</Button><Button variant="danger" loading={busy} disabled={busy||!valid} onClick={()=>void finish()}>Confirm Refund Completed</Button></>:<Button type="submit" form="admin-refund-form" disabled={busy||!valid}>Review Refund</Button>)}>
   <div ref={adminStage}/>
   {!detail?(error?<div role="alert" className="refund-error"><p>{error}</p><Button variant="secondary" onClick={()=>setReload(value=>value+1)}>Retry payment details</Button></div>:<p role="status" className="refund-loading">Loading payment details…</p>):<>
     <RefundBookingCard detail={detail}/>
     {detail.refund?<>
       <section className="refund-value" aria-label="Recorded refund"><span><CheckCircle2 size={15} aria-hidden="true"/>Refunded</span><strong>{money(detail.refund.amount)}</strong><p>{method(detail.refund.method)} · {refundTimestamp(detail.refund.processedAt)} · Yangon</p></section>
       <dl className="refund-facts"><div><dt>Employee</dt><dd>{detail.refund.employeeName}</dd></div>{detail.refund.refundReference&&<div><dt>Refund Transaction ID</dt><dd>{detail.refund.refundReference}</dd></div>}<div><dt>Refund Notes</dt><dd>{detail.refund.notes}</dd></div></dl>
       <details className="refund-disclosure"><summary>Audit details</summary><dl className="refund-facts"><div><dt>Refund ID</dt><dd>{detail.refund.id}</dd></div><div><dt>Verified staff ID</dt><dd>{detail.refund.employeeUserId}</dd></div></dl></details>
     </>:detail.blocked?<p role="alert" className="refund-warning">{detail.blocked}</p>:!review?<form id="admin-refund-form" onSubmit={event=>{event.preventDefault();if(valid){setError('');setReview(true);}}}><fieldset className="refund-fields" disabled={busy}>
       <div className="refund-field-grid refund-core-fields">
         <label className="refund-amount-field">Refund Amount (MMK)<input aria-label="Refund Amount (MMK)" type="number" required min="1" step="1" max={detail.paidAmount||0} value={amount} onChange={event=>setAmount(event.target.value)}/></label>
         <label>Refund Method<select aria-label="Refund Method" value={refundMethod} onChange={event=>{setRefundMethod(event.target.value);setReference('');}}><option value="CASH">Cash</option><option value="ONLINE">Online Payment</option></select></label>
       </div>
       {Number(amount)>0&&Number(amount)<(detail.paidAmount||0)&&<p className="refund-warning">This partial refund closes the entire booking. The remaining {money((detail.paidAmount||0)-Number(amount))} is retained and cannot be refunded again.</p>}
       {refundMethod==='ONLINE'&&<label>Refund Transaction ID<input aria-label="Refund Transaction ID" required minLength={6} maxLength={200} value={reference} onChange={event=>setReference(event.target.value)}/><span className="refund-caption">Use the actual returned-payment reference.</span></label>}
       <label>Refund Notes<textarea aria-label="Refund Notes" required minLength={3} maxLength={2000} rows={2} value={notes} onChange={event=>setNotes(event.target.value)}/></label>
       <details className="refund-staff-edit" open={!user?.name?.trim()||undefined}><summary>Recorded by {employeeName||'Add employee'}</summary><label>Employee Name<input aria-label="Employee Name" required minLength={2} maxLength={120} value={employeeName} onChange={event=>setEmployeeName(event.target.value)}/></label></details>
       <p className="refund-hint"><Info size={16} aria-hidden="true"/><span>Record money already returned to the customer. This form does not transfer money.</span></p>
     </fieldset></form>:<section aria-label="Refund confirmation summary">
       <div className="refund-value"><span>Refund amount</span><strong>{money(Number(amount))}</strong><p>{method(refundMethod)}</p></div>
       <dl className="refund-facts"><div><dt>Employee</dt><dd>{employeeName}</dd></div>{refundMethod==='ONLINE'&&<div><dt>Refund Transaction ID</dt><dd>{reference}</dd></div>}<div><dt>Refund Notes</dt><dd>{notes}</dd></div></dl>
       {Number(amount)<(detail.paidAmount||0)&&<p className="refund-warning">This records a partial refund and closes the entire selected booking. The remaining {money((detail.paidAmount||0)-Number(amount))} is retained; this booking cannot be refunded again.</p>}
       <p className="refund-confirmation"><Info size={18} aria-hidden="true"/><span>Confirm that the refund has already been issued to the customer. Completing this action will mark the booking as refunded and release its reserved court slot.</span></p>
     </section>}
     <RefundPaymentDetails payments={detail.payments} reason={detail.request?.reason}/>
     {error&&<p role="alert" className="refund-error">{error}</p>}
   </>}
 </DeskDialog>;
 return <DeskDialog title="Process refund" heading={detail?.refund?'Refund details':busy?'Refund Processing':review?'Confirm refund completed':'Process Refund'} size="compact" onClose={onClose} busy={busy} closeLabel="Close refund processing" cancelLabel={detail?.refund?'Close':'Cancel'}
   steps={detail&&!detail.refund?<DeskSteps labels={['Refund details','Review & confirm']} current={review?1:0}/>:undefined}
   actions={!detail?.refund&&(review?<><Button variant="ghost" disabled={busy} onClick={()=>setReview(false)}>Edit refund</Button><Button variant="danger" loading={busy} disabled={busy||!valid} onClick={()=>void finish()}>Confirm Refund Completed</Button></>:<Button disabled={busy||!valid} onClick={()=>{setError('');setReview(true);}}>Review Refund</Button>)} bodyClassName="space-y-4">

   {!detail&&!error&&<p role="status">Loading payment details…</p>}{detail&&<BookingSummary detail={detail}/>}
   {detail?.refund?<section className="space-y-2 text-sm"><p className="text-xl font-semibold">Refunded {money(detail.refund.amount)} · {method(detail.refund.method)}</p><p>Employee: {detail.refund.employeeName}</p><p>Verified staff ID: {detail.refund.employeeUserId}</p><p>Processed: {new Date(detail.refund.processedAt).toLocaleString()}</p>{detail.refund.refundReference&&<p>Refund Transaction ID: {detail.refund.refundReference}</p>}<p>Refund Notes: {detail.refund.notes}</p><p className="text-xs">Refund ID: {detail.refund.id}</p></section>:detail&&!review?<div className="space-y-4">
     {detail.blocked&&<p role="alert" className="text-sm text-amber-800">{detail.blocked}</p>}
     <label className="block text-sm">Refund Amount (MMK)<input aria-label="Refund Amount (MMK)" className="mt-1 w-full text-lg font-semibold" type="number" min="1" max={detail.paidAmount||0} step="1" value={amount} disabled={busy||!!detail.blocked} onChange={e=>setAmount(e.target.value)}/></label>
     <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">Refund Method<Select aria-label="Refund Method" value={refundMethod} disabled={busy} onChange={e=>{setRefundMethod(e.target.value);setReference('');}}><option value="CASH">Cash</option><option value="ONLINE">Online Payment</option></Select></label>
     <label className="block text-sm">Employee Name<input className="mt-1 w-full" required maxLength={120} disabled={busy} value={employeeName} onChange={e=>setEmployeeName(e.target.value)}/></label></div>
     {refundMethod==='ONLINE'&&<label className="block text-sm">Refund Transaction ID<input aria-label="Refund Transaction ID" className="mt-1 w-full" required maxLength={200} disabled={busy} value={reference} onChange={e=>setReference(e.target.value)}/><span className="mt-1 block text-xs text-zawana-500">Enter the actual returned-payment reference, not the original payment ID.</span></label>}
     <label className="block text-sm">Refund Notes<textarea className="mt-1 w-full" required maxLength={2000} disabled={busy} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
     <p className="text-xs text-zawana-500">Record money already returned to the customer. This form does not transfer money.</p>
   </div>:detail&&review?<section aria-label="Refund confirmation summary" className="space-y-3 break-words text-sm"><p className="text-2xl font-semibold">{money(Number(amount))}</p><p>{method(refundMethod)} · Employee: {employeeName}</p>{refundMethod==='ONLINE'&&<p>Refund Transaction ID: {reference}</p>}<p>Refund Notes: {notes}</p>{Number(amount)<(detail.paidAmount||0)&&<p className="text-sm text-amber-800">This records a partial refund and closes the entire selected booking. The remaining {money((detail.paidAmount||0)-Number(amount))} is retained; this booking cannot be refunded again.</p>}<p className="rounded-xl bg-amber-50 p-3">Confirm that the refund has already been issued to the customer. Completing this action will mark the booking as refunded and release its reserved court slot.</p></section>:null}
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </DeskDialog>;

}
export function RefundInbox({pendingOnly=false,embedded=false,emptyMessage,adminTab=false}:{pendingOnly?:boolean;embedded?:boolean;emptyMessage?:string;adminTab?:boolean}){
 const [actionParams,setActionParams]=useSearchParams();const refundBooking=actionParams.get('refundBooking');
 const {user}=useAuth();const authorized=!!user&&['admin','badminton_fo'].includes(user.role);
 const revision=usePaymentRevision();const [rows,setRows]=useState<Detail[]>([]),[open,setOpen]=useState(''),[error,setError]=useState('');
 const [loaded,setLoaded]=useState(false),[refreshing,setRefreshing]=useState(false),[reload,setReload]=useState(0);
 const version=useRef(0);
 const refresh=useCallback(async()=>{const request=++version.current;setRefreshing(true);try{const result=await get<Detail[]>('/rescheduling/refunds');if(request===version.current){setRows(result);setError('');}}catch(error){if(request===version.current)setError(error instanceof Error?error.message:'Could not load refunds.');throw error;}finally{if(request===version.current){setLoaded(true);setRefreshing(false);}}},[]);
 useEffect(()=>{if(!authorized)return;const activeRequests=version;const load=()=>{if(document.hidden)return;void refresh().catch(()=>{});};load();const timer=window.setInterval(load,15000);window.addEventListener('focus',load);return()=>{activeRequests.current++;window.clearInterval(timer);window.removeEventListener('focus',load);};},[revision,authorized,reload,refresh]);
 useEffect(()=>{if(authorized&&adminTab&&refundBooking)setOpen(refundBooking);},[authorized,adminTab,refundBooking]);
 const closeRefund=()=>{setOpen('');if(refundBooking){const next=new URLSearchParams(actionParams);next.delete('refundBooking');setActionParams(next,{replace:true});}};
 if(!authorized)return null;
 if(adminTab&&authorized)return <><AdminRefundRequests rows={pendingOnly?rows.filter(row=>!row.refund):rows} loaded={loaded} loading={refreshing} error={error} onRefresh={()=>setReload(value=>value+1)} onOpen={setOpen}/>{open&&<RefundDialog bookingId={open} onClose={closeRefund} onCompleted={refresh}/>}</>;
 if(!rows.length&&!error)return emptyMessage?<p role="status" className="text-sm text-zawana-500">{loaded?emptyMessage:'Loading refund requests…'}</p>:null;
 return <section className="desk-panel mb-5 p-5" aria-label="Refund management">{!embedded&&<h2 className="text-lg font-semibold">Refund requests</h2>}{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-3 divide-y">{pendingOnly && !rows.some(d=>!d.refund) && <p className="text-sm text-zawana-500">No pending refund requests.</p>}{rows.filter(d=>!pendingOnly || !d.refund).map(d=><article key={d.booking.id} className="space-y-2 py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{d.customer.name} · {d.customer.phone||'Phone number unavailable'}</strong><span>{status(d)}</span></div><p className="text-xs text-zawana-500">{d.booking.code} · {d.booking.kind==='court'?'Court Rental':'Private Course'} · {d.court?.name} · {d.booking.date} · {d.booking.time}</p><p className="text-xs">{d.refund?`Refunded ${money(d.refund.amount)} by ${method(d.refund.method)}`:`Original payment: ${d.paidAmount==null?'Needs review':money(d.paidAmount)}`}</p><Button variant="secondary" onClick={()=>setOpen(d.booking.id)}>{d.refund?'View Refund':'Process Refund'}</Button></article>)}</div>{open&&<RefundDialog bookingId={open} onClose={closeRefund} onCompleted={refresh}/>}</section>;
}
export function MemberRefundHistory({onViewRequests}:{onViewRequests?:()=>void}){
 const revision=useBookingRevision(), {locale}=useLanguage();
 const [rows,setRows]=useState<{id:string;amount:number;method:string;processedAt:string;booking:{code:string;title:string}}[]>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
   let live=true;
   void get<typeof rows>('/rescheduling/refunds/mine').then(data=>{if(live){setRows(data);setError('');}}).catch(error=>{if(live)setError(error instanceof Error?error.message:'Could not load refunds.');}).finally(()=>{if(live)setLoaded(true);});
   return()=>{live=false;};
 },[revision]);
 const total=rows.reduce((sum,row)=>sum+row.amount,0);
 const processedDate=(date:string)=>new Intl.DateTimeFormat(locale,{timeZone:'Asia/Yangon',day:'numeric',month:'short',year:'numeric'}).format(new Date(date));
 return <section id="refunds" aria-label="Refund history" className="refund-history">
   {!!rows.length&&<header className="refund-history-heading"><div><h2>Recorded refunds</h2><p>{rows.length} completed refund{rows.length===1?'':'s'}</p></div><p className="refund-history-balance"><strong>{total.toLocaleString(locale)}</strong><span>MMK total</span></p></header>}
   {!loaded&&!error&&<HistoryLoading label="Loading refund history…"/>}
   {error&&<p role="alert" className="history-error">{error}</p>}
   {loaded&&!rows.length&&!error&&<div className="history-empty"><RotateCcw size={30} strokeWidth={1.3} aria-hidden="true"/><h3>No completed refunds yet</h3><p>Once staff confirm a refund, its amount and payment method will appear here.</p></div>}
   <div className="refund-history-list">{rows.map(row=><article key={row.id} className="refund-history-card"><span className="refund-history-method-icon">{row.method==='CASH'?<Banknote size={24} strokeWidth={1.4} aria-hidden="true"/>:<CreditCard size={24} strokeWidth={1.4} aria-hidden="true"/>}</span><div className="refund-history-card-main"><span className="booking-history-status">Refunded</span><h3>{row.booking.title}</h3><p>{row.booking.code}</p><span className="refund-history-recorded">{processedDate(row.processedAt)} · {method(row.method)}</span></div><div className="refund-history-amount"><strong>{row.amount.toLocaleString(locale)} <small>MMK</small></strong></div></article>)}</div>
   {loaded&&<div className="refund-history-help"><p>Refunds under review appear in Requests.</p>{onViewRequests&&<Button variant="secondary" onClick={onViewRequests}>View requests</Button>}</div>}
 </section>;
}
