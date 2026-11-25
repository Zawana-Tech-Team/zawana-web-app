import { CheckCircle2, Info } from 'lucide-react';
import { RefundBookingCard } from './refund/RefundPresentation';
import { useEffect, useRef, useState } from 'react';
import { post } from '../api';
import { useAuth } from '../context/AuthContext';
import { DeskDialog } from './court-desk/DeskDialog';
import { Button } from './UI';
import { Select } from './Select';
type Detail = { booking: { id: string; code: string; date: string; time: string }; customer: { name: string }; court: { name: string } | null; paidAmount: number | null; blocked: string | null; revision: string; payments: { id: string; method: string; amount: number }[] };
type Preview = { bookingId: string; detail: Detail | null; error: string | null };
type Result = { bookingId: string; status: 'completed' | 'failed'; message?: string; amount?: number };
const money = (amount: number) => `${amount.toLocaleString()} MMK`;
export function BulkRefundDialog({ bookingIds, onClose, onCompleted }: { bookingIds: string[]; onClose: () => void; onCompleted: () => Promise<void> }) {
  const { user } = useAuth();
 const staffRefund = !!user && ['admin', 'badminton_fo'].includes(user.role);
  const [rows, setRows] = useState<Preview[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({}), [references, setReferences] = useState<Record<string, string>>({});
  const [method, setMethod] = useState('CASH'), [employee, setEmployee] = useState(user?.name || ''), [notes, setNotes] = useState('');
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [results, setResults] = useState<Result[]>([]);
  const [reload,setReload]=useState(0);
  const adminStage=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(staffRefund)adminStage.current?.closest('.desk-reservation-dialog__body')?.scrollTo({top:0});},[review,staffRefund]);
  const lock = useRef(false), retries = useRef(new Map<string, { payload: string; key: string }>());
  useEffect(() => {
    let live = true;setError('');
    void post<Preview[]>('/rescheduling/refunds/preview', { bookingIds }).then(data => { if (live) { setRows(data); setAmounts(Object.fromEntries(data.map(row => [row.bookingId, String(row.detail?.paidAmount || '')]))); } }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [bookingIds,reload]);
  const chosen = rows.filter(row => selected.includes(row.bookingId) && row.detail && !row.detail.blocked);
  const total = chosen.reduce((sum, row) => sum + (Number(amounts[row.bookingId]) || 0), 0);
  const valid = chosen.length > 0 && employee.trim().length >= 2 && notes.trim().length >= 3 && chosen.every(row => Number.isInteger(Number(amounts[row.bookingId])) && Number(amounts[row.bookingId]) > 0 && Number(amounts[row.bookingId]) <= (row.detail?.paidAmount || 0) && (method === 'CASH' || (references[row.bookingId] || '').trim().length >= 6));
  const finish = async () => {
    if (lock.current || !valid) return; lock.current = true; setBusy(true); setError('');
    const items = chosen.map(row => {
      const input = { amount: Number(amounts[row.bookingId]), method, employeeName: employee.trim(), notes: notes.trim(), reference: method === 'ONLINE' ? (references[row.bookingId] || '').trim() : '', confirmed: true, revision: row.detail!.revision };
      const payload = JSON.stringify(input), prior = retries.current.get(row.bookingId);
      const retry = prior?.payload === payload ? prior : { payload, key: crypto.randomUUID() }; retries.current.set(row.bookingId, retry);
      return { bookingId: row.bookingId, input: { ...input, requestKey: retry.key } };
    });
    try {
      const response = await post<{ results: Result[] }>('/rescheduling/refunds/complete-batch', { items });
      setResults(previous => [...previous.filter(row => !response.results.some(next => next.bookingId === row.bookingId)), ...response.results]);
      const completed = response.results.filter(row => row.status === 'completed').map(row => row.bookingId);
      setSelected(previous => previous.filter(id => !completed.includes(id))); setReview(false);
      try { await onCompleted(); } catch { setError('Refund results are saved. The schedule could not refresh; retry loading it.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record refunds. Retry with the same details.'); }
    finally { lock.current = false; setBusy(false); }
  };
  if(staffRefund){
    const completedIds=new Set(results.filter(result=>result.status==='completed').map(result=>result.bookingId));
    const eligible=rows.filter(row=>row.detail&&!row.detail.blocked&&!row.error&&!completedIds.has(row.bookingId));
    const visible=review?chosen:rows;
    return <DeskDialog title="Refund selected bookings" heading={review?'Review selected refunds':'Refund selected bookings'} size="wide" className="admin-refund-dialog admin-bulk-refund-dialog" onClose={onClose} busy={busy} cancelLabel="Close"
      actions={eligible.length>0&&(review?<><Button variant="ghost" disabled={busy} onClick={()=>setReview(false)}>Edit refunds</Button><Button variant="danger" loading={busy} disabled={busy||!valid} onClick={()=>void finish()}>Confirm Selected Refunds</Button></>:<Button type="submit" form="admin-bulk-refund" disabled={busy||!valid}>Review Selected Refunds</Button>)}>
      <div ref={adminStage}/>
      {!rows.length?(error?<div className="refund-error" role="alert"><p>{error}</p><Button variant="secondary" onClick={()=>setReload(value=>value+1)}>Retry refund checks</Button></div>:<p role="status" className="refund-loading">Checking refund eligibility…</p>):<>
        {results.length>0&&<p role="status" className="refund-result-summary">{results.filter(row=>row.status==='completed').length} completed · {results.filter(row=>row.status==='failed').length} not completed</p>}
        <form id="admin-bulk-refund" onSubmit={event=>{event.preventDefault();if(valid){setError('');setReview(true);}}}><fieldset className="refund-fields" disabled={busy}>
          {!review&&eligible.length>0&&<label className="refund-batch-method">Refund Method<select aria-label="Refund Method" value={method} onChange={event=>setMethod(event.target.value)}><option value="CASH">Cash</option><option value="ONLINE">Online Payment</option></select></label>}
          <ul aria-label="Selected refund bookings" className="refund-bulk-list">{visible.map(row=>{
            const result=results.find(item=>item.bookingId===row.bookingId),blocked=row.error||row.detail?.blocked,selectedRow=selected.includes(row.bookingId),completed=result?.status==='completed';
            return <li key={row.bookingId} data-selected={selectedRow||undefined}>
              {!review&&!completed&&<label className="refund-select"><input type="checkbox" aria-label={`Select ${row.detail?.booking.code||row.bookingId} for refund`} disabled={busy||!!blocked||completed} checked={selectedRow} onChange={event=>setSelected(ids=>event.target.checked?[...ids,row.bookingId]:ids.filter(id=>id!==row.bookingId))}/><span>{blocked?'Not eligible':'Select for refund'}</span></label>}
              {row.detail?<RefundBookingCard detail={row.detail} compact/>:<p className="refund-caption">{row.bookingId}</p>}
              {blocked&&!completed&&<p className="refund-warning">Not eligible: {blocked}</p>}
              {!blocked&&!completed&&selectedRow&&(review?<div className="refund-bulk-review-value"><span>Refund amount</span><strong>{money(Number(amounts[row.bookingId]))}</strong>{method==='ONLINE'&&<p>Refund Transaction ID: {references[row.bookingId]}</p>}</div>:<div className="refund-field-grid"><label className="refund-bulk-amount">Refund amount<input aria-label={`Refund amount · ${row.detail?.booking.code}`} type="number" min="1" step="1" max={row.detail?.paidAmount||0} required value={amounts[row.bookingId]||''} onChange={event=>setAmounts(values=>({...values,[row.bookingId]:event.target.value}))}/></label>{method==='ONLINE'&&<label>Refund Transaction ID<input aria-label={`Refund Transaction ID · ${row.detail?.booking.code}`} required minLength={6} maxLength={200} value={references[row.bookingId]||''} onChange={event=>setReferences(values=>({...values,[row.bookingId]:event.target.value}))}/></label>}</div>)}
              {!blocked&&!completed&&selectedRow&&Number(amounts[row.bookingId])>0&&Number(amounts[row.bookingId])<(row.detail?.paidAmount||0)&&<p className="refund-warning">This partial refund closes the entire booking. The remaining {money((row.detail?.paidAmount||0)-Number(amounts[row.bookingId]))} is retained and cannot be refunded again.</p>}
              {result&&<p role={completed?'status':'alert'} className={completed?'refund-result-completed':'refund-error'}>{completed?<><CheckCircle2 size={15} aria-hidden="true"/>Refund recorded: {money(result.amount||0)}</>:`Not completed: ${result.message}`}</p>}
            </li>;
          })}</ul>
          {chosen.length>0&&<>
            <section className="refund-value" aria-label="Selected refund total"><span>Selected total · {chosen.length} {chosen.length===1?'booking':'bookings'}</span><strong>{money(total)}</strong></section>
            {!review?<>
              <label>Refund Notes<textarea aria-label="Refund Notes" required minLength={3} maxLength={2000} rows={2} value={notes} onChange={event=>setNotes(event.target.value)}/></label>
              <details className="refund-staff-edit" open={!user?.name?.trim()||undefined}><summary>Recorded by {employee||'Add employee'}</summary><label>Employee Name<input aria-label="Employee Name" required minLength={2} maxLength={120} value={employee} onChange={event=>setEmployee(event.target.value)}/></label></details>
            </>:<dl className="refund-facts"><div><dt>Refund Method</dt><dd>{method==='CASH'?'Cash':'Online Payment'}</dd></div><div><dt>Employee</dt><dd>{employee}</dd></div><div><dt>Refund Notes</dt><dd>{notes}</dd></div></dl>}
            <p className={review?'refund-confirmation':'refund-hint'}><Info size={18} aria-hidden="true"/><span>{review?`Confirm that ${money(total)} has already been returned for these ${chosen.length} selected bookings. Only successfully recorded refunds cancel their bookings and release the court slots.`:'Record money already returned to the customer. This form does not transfer money.'}</span></p>
          </>}
          <details className="refund-disclosure"><summary>Original payment details</summary><div className="refund-batch-receipts">{rows.filter(row=>row.detail).map(row=><section key={row.bookingId}><strong>{row.detail!.booking.code}</strong>{row.detail!.payments.length?row.detail!.payments.map(payment=><p key={payment.id}>{payment.method} · {money(payment.amount)}<small>{payment.id}</small></p>):<p>No linked paid receipt.</p>}</section>)}</div></details>
        </fieldset></form>
        {error&&<p className="refund-error" role="alert">{error}</p>}
      </>}
    </DeskDialog>;
  }
  return <DeskDialog title="Refund selected bookings" heading={review ? 'Confirm selected refunds' : 'Refund Selected'} size="wide" onClose={onClose} busy={busy} cancelLabel="Close"
    actions={review ? <><Button variant="ghost" disabled={busy} onClick={() => setReview(false)}>Edit refunds</Button><Button variant="danger" loading={busy} disabled={busy || !valid} onClick={() => void finish()}>Confirm Selected Refunds</Button></> : <Button disabled={busy || !valid} onClick={() => setReview(true)}>Review Selected Refunds</Button>} bodyClassName="space-y-5">
    <p className="text-sm">Each booking keeps its own refund record and payment history. Select only the bookings whose refunds you intend to record.</p>
    {!rows.length && !error && <p role="status">Checking each booking’s refund eligibility…</p>}
    <ul aria-label="Selected refund bookings" className="divide-y">{rows.map(row => {
      const result = results.find(result => result.bookingId === row.bookingId), blocked = row.error || row.detail?.blocked;
      return <li key={row.bookingId} className="space-y-2 py-4 text-sm">
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" disabled={busy || review || !!blocked || result?.status === 'completed'} checked={selected.includes(row.bookingId)} onChange={e => setSelected(ids => e.target.checked ? [...ids, row.bookingId] : ids.filter(id => id !== row.bookingId))}/><strong>{row.detail?.booking.code || row.bookingId} · {row.detail?.customer.name}</strong></label>
        {row.detail && <><p>{row.detail.court?.name} · {row.detail.booking.date} · {row.detail.booking.time}</p><p className="text-xs text-zawana-500">Paid: {money(row.detail.paidAmount || 0)} · {row.detail.payments.map(payment => `${payment.method}: ${money(payment.amount)}`).join(' / ')}</p></>}
        {blocked && <p className="text-amber-800">Not eligible: {blocked}</p>}
        {!blocked && selected.includes(row.bookingId) && <><label className="block">Refund amount · {row.detail?.booking.code}<input type="number" min="1" step="1" max={row.detail?.paidAmount || 0} disabled={busy || review} value={amounts[row.bookingId] || ''} onChange={e => setAmounts(values => ({ ...values, [row.bookingId]: e.target.value }))}/></label>{method === 'ONLINE' && <><label className="block">Refund Transaction ID · {row.detail?.booking.code}<input required maxLength={200} disabled={busy || review} value={references[row.bookingId] || ''} onChange={e => setReferences(values => ({ ...values, [row.bookingId]: e.target.value }))}/></label><span className="text-xs">Use a separate actual returned-payment reference for this booking.</span></>}{Number(amounts[row.bookingId]) < (row.detail?.paidAmount || 0) && <p className="text-amber-800">This partial refund closes the entire booking. The remaining paid balance is retained and cannot be refunded again.</p>}</>}
        {result && <p role="status" className={result.status === 'completed' ? 'text-emerald-800' : 'text-red-700'}>{result.status === 'completed' ? `Refund recorded: ${money(result.amount || 0)}` : `Not completed: ${result.message}`}</p>}
      </li>;
    })}</ul>
    <p aria-live="polite" className="text-2xl font-semibold">Selected total: {money(total)}</p>
    <fieldset disabled={busy || review} className="grid gap-4 sm:grid-cols-2"><label>Refund Method<Select aria-label="Refund Method" value={method} onChange={e => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="ONLINE">Online Payment</option></Select></label><label>Employee Name<input required maxLength={120} value={employee} onChange={e => setEmployee(e.target.value)}/></label><label className="sm:col-span-2">Refund Notes<textarea required maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)}/></label></fieldset>
    <p className="rounded-xl bg-amber-50 p-3 text-sm">{review ? `Confirm that ${money(total)} has already been returned for these ${chosen.length} selected bookings. Only successfully recorded refunds cancel their bookings and release the court slots.` : 'Record money already returned to the customer. This form does not transfer money.'}</p>
    {results.length > 0 && <p role="status">{results.filter(row => row.status === 'completed').length} completed · {results.filter(row => row.status === 'failed').length} not completed</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </DeskDialog>;
}
