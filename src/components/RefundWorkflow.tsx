import { useEffect, useRef, useState } from 'react';
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
 const [detail,setDetail]=useState<Detail|null>(null),[amount,setAmount]=useState(''),[refundMethod,setRefundMethod]=useState('CASH'),[employeeName,setEmployeeName]=useState(user?.name||''),[notes,setNotes]=useState(''),[reference,setReference]=useState(''),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),retry=useRef({payload:'',key:''});
 useEffect(()=>{let live=true;void get<Detail>(`/rescheduling/refunds/bookings/${bookingId}`).then(d=>{if(live){setDetail(d);setAmount(String(d.paidAmount||''));}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[bookingId]);
 const valid=!!detail&&!detail.blocked&&Number.isInteger(Number(amount))&&Number(amount)>0&&Number(amount)<=(detail.paidAmount||0)&&employeeName.trim().length>=2&&notes.trim().length>=3&&(refundMethod==='CASH'||reference.trim().length>=6);
 const finish=async()=>{
   if(lock.current||!detail||!valid)return;
   const payload={amount:Number(amount),method:refundMethod,employeeName:employeeName.trim(),notes:notes.trim(),reference:refundMethod==='ONLINE'?reference.trim():'',confirmed:true,revision:detail.revision};
   const serialized=JSON.stringify(payload);if(retry.current.payload!==serialized)retry.current={payload:serialized,key:crypto.randomUUID()};
   lock.current=true;setBusy(true);setError('');
   try{await post(`/rescheduling/refunds/bookings/${bookingId}/complete`,{...payload,requestKey:retry.current.key});await onCompleted();onClose();}
   catch(e){setError(e instanceof Error?e.message:'Could not record refund.');}
   finally{lock.current=false;setBusy(false);}
 };
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
export function RefundInbox({pendingOnly=false}:{pendingOnly?:boolean}){
 const {user}=useAuth();const authorized=!!user&&['admin','badminton_fo'].includes(user.role);
 const revision=usePaymentRevision();const [rows,setRows]=useState<Detail[]>([]),[open,setOpen]=useState(''),[error,setError]=useState('');
 const refresh=async()=>setRows(await get<Detail[]>('/rescheduling/refunds'));
 useEffect(()=>{if(!authorized)return;let live=true;const load=()=>{if(document.hidden)return;void get<Detail[]>('/rescheduling/refunds').then(r=>{if(live){setRows(r);setError('');}}).catch(e=>{if(live)setError(e.message);});};load();const timer=window.setInterval(load,15000);window.addEventListener('focus',load);return()=>{live=false;window.clearInterval(timer);window.removeEventListener('focus',load);};},[revision,authorized]);
 if(!authorized||(!rows.length&&!error))return null;
 return <section className="desk-panel mb-5 p-5" aria-label="Refund management"><h2 className="text-lg font-semibold">Refund requests</h2>{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-3 divide-y">{pendingOnly && !rows.some(d=>!d.refund) && <p className="text-sm text-zawana-500">No pending refund requests.</p>}{rows.filter(d=>!pendingOnly || !d.refund).map(d=><article key={d.booking.id} className="space-y-2 py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{d.customer.name} · {d.customer.phone||'Phone number unavailable'}</strong><span>{status(d)}</span></div><p className="text-xs text-zawana-500">{d.booking.code} · {d.booking.kind==='court'?'Court Rental':'Private Course'} · {d.court?.name} · {d.booking.date} · {d.booking.time}</p><p className="text-xs">{d.refund?`Refunded ${money(d.refund.amount)} by ${method(d.refund.method)}`:`Original payment: ${d.paidAmount==null?'Needs review':money(d.paidAmount)}`}</p><Button variant="secondary" onClick={()=>setOpen(d.booking.id)}>{d.refund?'View Refund':'Process Refund'}</Button></article>)}</div>{open&&<RefundDialog bookingId={open} onClose={()=>setOpen('')} onCompleted={refresh}/>}</section>;
}
export function MemberRefundHistory(){
 const revision=usePaymentRevision();const [rows,setRows]=useState<{id:string;amount:number;method:string;processedAt:string;booking:{code:string;title:string}}[]>([]);
 useEffect(()=>{let live=true;const load=()=>{void get<typeof rows>('/rescheduling/refunds/mine').then(r=>{if(live)setRows(r);}).catch(()=>{});};load();const timer=window.setInterval(load,15000);window.addEventListener('focus',load);return()=>{live=false;window.clearInterval(timer);window.removeEventListener('focus',load);};},[revision]);
 if(!rows.length)return null;
 return <section id="refunds" aria-label="Refund history" className="desk-panel mb-5 p-5"><h2 className="text-lg font-semibold">Refund history</h2>{rows.map(r=><article key={r.id} className="mt-3 space-y-1 border-t pt-3 text-sm"><strong>Refunded {money(r.amount)} · {method(r.method)}</strong><p>{r.booking.code} · {r.booking.title}</p><p className="text-xs text-zawana-500">Staff confirmed the money was returned · {new Date(r.processedAt).toLocaleString()}</p></article>)}</section>;
}
