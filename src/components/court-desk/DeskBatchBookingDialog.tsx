import { BadmintonCategoryField } from '../BadmintonCategoryField';
import { useEffect, useRef, useState } from 'react';
import { post } from '../../api';
import { DeskDialog, DeskSteps } from './DeskDialog';
import { Button } from '../UI';
import { DeskPaymentFields, deskPaymentReady, emptyDeskPayment } from './DeskPaymentFields';
export type DeskSelection = { courtId: string; courtName: string; date: string; time: string; price: number };
export const deskSelectionKey = (s: Pick<DeskSelection, 'courtId' | 'date' | 'time'>) => `${s.date}|${s.courtId}|${s.time}`;
export function DeskBatchBookingDialog({ kind, selections, onClose, onCreated }: { kind: 'rental' | 'weekly'; selections: DeskSelection[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [categoryId,setCategoryId]=useState('');
  const [customer, setCustomer] = useState(''), [title, setTitle] = useState('Badminton Class');
  const [payment, setPayment] = useState(emptyDeskPayment), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), retry = useRef({ payload: '', key: '' });
  const total = selections.reduce((sum, s) => sum + s.price, 0);
  useEffect(() => { setPayment(emptyDeskPayment()); }, [total]);
  const submit = async () => {
    if (lock.current || !selections.length || (kind === 'rental' && (!customer.trim() || !deskPaymentReady(payment))) || (kind === 'weekly' && !title.trim())) return;
    lock.current = true; setBusy(true); setError('');
    const slots = selections.map(({ courtId, date, time }) => ({ courtId, date, time }));
    const payload = kind === 'weekly' ? { selections: slots, title: title.trim(),...(categoryId?{categoryCode:categoryId}:{}) } : { selections: slots, customer: customer.trim(), expectedPrice: total, payment: { method: payment.method } };
    const serialized = JSON.stringify(payload);
    if (retry.current.payload !== serialized) retry.current = { payload: serialized, key: crypto.randomUUID() };
    try { await post(`/staff/court-desk/${kind === 'weekly' ? 'weekly' : 'rentals'}`, { ...payload, requestKey: retry.current.key }); await onCreated(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save these sessions.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <DeskDialog title={kind==='weekly'?'Reserve weekly classes':'Record court rentals'} heading={kind==='weekly'?'Weekly classes':'Court rentals'} eyebrow={`${selections.length} selected sessions`} onClose={onClose} busy={busy}
    steps={<DeskSteps labels={['Select sessions',kind==='weekly'?'Weekly schedule':'Details & payment']} current={1}/>}
    summary={<><p>{kind==='weekly'?'Weekly schedule':'Total rental'}</p><strong>{kind==='weekly'?`${selections.length} sessions`:`${total.toLocaleString()} MMK`}</strong></>}
    actions={<Button loading={busy} disabled={busy||(kind==='rental'?!customer.trim()||!deskPaymentReady(payment):!title.trim())} onClick={()=>void submit()}>{kind==='weekly'?'Reserve weekly classes':'Record rentals & payment'}</Button>} bodyClassName="space-y-5">
      <ul aria-label="Selected sessions" className="desk-selection-list divide-y">{selections.map(s => <li className="py-3 text-sm" key={deskSelectionKey(s)}><strong>{s.courtName}</strong><p className="mt-1 text-xs text-zawana-500">{s.date} · {s.time}{kind === 'weekly' ? ' · Repeats weekly from this date' : ` · ${s.price.toLocaleString()} MMK`}</p></li>)}</ul>
      {error && <p role="alert" className="desk-load-error">{error}</p>}
      {kind === 'rental' ? <fieldset disabled={busy} className="desk-form-section space-y-4"><legend>Customer & payment</legend><label className="block text-sm">Customer name<input className="mt-2 w-full" maxLength={100} value={customer} onChange={e => { setCustomer(e.target.value); setPayment(emptyDeskPayment()); }} /></label><DeskPaymentFields value={payment} onChange={setPayment} disabled={busy} /></fieldset> : <><BadmintonCategoryField useCode value={categoryId} onChange={setCategoryId}/><label className="block text-sm">Weekly class / facility block<input className="mt-2 w-full" disabled={busy} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label></>}
      <p className="text-xs text-zawana-500">All sessions are checked and saved together. A conflict leaves the whole selection unchanged.</p>
  </DeskDialog>;
}
