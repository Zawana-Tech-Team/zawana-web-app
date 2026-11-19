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
  const [rows, setRows] = useState<Preview[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({}), [references, setReferences] = useState<Record<string, string>>({});
  const [method, setMethod] = useState('CASH'), [employee, setEmployee] = useState(user?.name || ''), [notes, setNotes] = useState('');
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [results, setResults] = useState<Result[]>([]);
  const lock = useRef(false), retries = useRef(new Map<string, { payload: string; key: string }>());
  useEffect(() => {
    let live = true;
    void post<Preview[]>('/rescheduling/refunds/preview', { bookingIds }).then(data => { if (live) { setRows(data); setAmounts(Object.fromEntries(data.map(row => [row.bookingId, String(row.detail?.paidAmount || '')]))); } }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [bookingIds]);
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
