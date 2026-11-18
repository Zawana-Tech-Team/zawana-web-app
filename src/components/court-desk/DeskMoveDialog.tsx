import { useRef, useState } from 'react';
import { post } from '../../api';
import { Select } from '../Select';
import { Button } from '../UI';
import { DeskDialog, DeskSchedule, DeskSteps } from './DeskDialog';
import { DeskPaymentFields, emptyDeskPayment, deskPaymentReady } from './DeskPaymentFields';
import { bookingStart } from '../../utils/bookingTime';
export type MoveSource = { id: string; kind: 'court' | 'weekly'; date: string; time: string; courtId: string; title: string };
type Move = { id: string; sourceDate: string; scope?: 'occurrence' | 'future'; courtId: string; date: string; time: string };
type Preview = { revision: string; surcharge: number; rows: { id: string; scope?: 'occurrence' | 'future' | null; destinationPrice: number; paidBasis?: number; original: { price?: number; date: string; time?: string; start?: string; end?: string }; target: { courtName: string; date: string; time: string }; surcharge: number }[] };
const durationOf = (time: string) => { const parts = time.split(/\s*(?:—|–|-)\s*/); return bookingStart(parts[1] || '') - bookingStart(parts[0]); };
const timeRange = (hour: number, duration: number) => { const f = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m >= 720 ? 'PM' : 'AM'}`; return `${f(hour * 60)} — ${f(hour * 60 + duration)}`; };
export function DeskMoveDialog({ sources, courts, onClose, onChanged, initialDestination }: { initialDestination?: { courtId: string; date: string; time: string }; sources: MoveSource[]; courts: { id: string; name: string }[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const kind = sources[0].kind;
  const [moves, setMoves] = useState<Move[]>(sources.map(s => ({ id: s.id, sourceDate: s.date, courtId: s.courtId, date: s.date, time: s.time, ...(sources.length === 1 && initialDestination ? initialDestination : {}) })));
  const [reason, setReason] = useState(''), [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [payment, setPayment] = useState(emptyDeskPayment);
  const lock = useRef(false), retry = useRef({ payload: '', key: '' });
  const scopeMissing = kind === 'weekly' && moves.some(move => !move.scope);
  const input = { kind, reason: reason.trim(), moves };
  const edit = (i: number, next: Partial<Move>) => { setMoves(rows => rows.map((row, index) => index === i ? { ...row, ...next } : row)); setPreview(null); setPayment(emptyDeskPayment()); };
  const quote = async () => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { setPreview(await post<Preview>('/rescheduling/moves/quote', input)); setPayment(emptyDeskPayment()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not preview moves.'); } finally { lock.current = false; setBusy(false); } };
  const confirm = async () => {
    if (!preview || lock.current) return;
    const payload = { input, revision: preview.revision, ...(preview.surcharge ? { payment } : {}) };
    const serialized = JSON.stringify(payload);
    if (retry.current.payload !== serialized) retry.current = { payload: serialized, key: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError('');
    try { await post('/rescheduling/moves/confirm', { ...payload, requestKey: retry.current.key }); await onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not move bookings.'); if ([400, 409].includes((e as { status?: number }).status || 0)) setPreview(null); }
    finally { lock.current = false; setBusy(false); }
  };
  return <DeskDialog title="Move selected bookings" heading={preview?'Review your changes':'Choose replacement sessions'} eyebrow={`${sources.length} ${kind==='weekly'?'weekly classes':'rentals'}`} size="wide" onClose={onClose} busy={busy} closeLabel="Close move review"
    description={kind==='weekly'?'Choose a replacement and whether to change one occurrence or the weekly schedule.':'Choose a new court, date and time for each selected rental.'}
    steps={<DeskSteps labels={['Choose replacement','Review & confirm']} current={preview?1:0}/>}
    summary={<p>Original bookings remain until the whole batch succeeds.</p>}
    actions={preview?<><Button variant="ghost" disabled={busy} onClick={()=>{setPreview(null);setPayment(emptyDeskPayment());}}>Edit replacement</Button><Button loading={busy} disabled={busy||(preview.surcharge>0&&!deskPaymentReady(payment))} onClick={()=>void confirm()}>Confirm all moves</Button></>:<Button loading={busy} disabled={busy||scopeMissing||reason.trim().length<3} onClick={()=>void quote()}>Check availability & preview</Button>} bodyClassName="space-y-5">
    {error&&<p role="alert" className="desk-load-error">{error}</p>}
    {!preview?<>
      {moves.map((move,i)=><fieldset key={`${move.id}|${move.sourceDate}`} disabled={busy} className="desk-form-section space-y-4"><legend>{sources[i].title}</legend>
        <DeskSchedule label="Original booking" court={courts.find(c=>c.id===sources[i].courtId)?.name} date={sources[i].date} time={sources[i].time}/>
        <div className="grid gap-4 sm:grid-cols-3"><label>Destination court<Select aria-label={`Destination court ${i+1}`} value={move.courtId} onChange={e=>edit(i,{courtId:e.target.value})}>{courts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label><label>Destination date<input aria-label={`Destination date ${i+1}`} type="date" value={move.date} onChange={e=>edit(i,{date:e.target.value})}/></label><label>Destination time<Select aria-label={`Destination time ${i+1}`} value={move.time} onChange={e=>edit(i,{time:e.target.value})}>{Array.from({length:Math.max(0,Math.floor((900-durationOf(sources[i].time))/60)+1)},(_,h)=>timeRange(6+h,durationOf(sources[i].time))).map(t=><option key={t}>{t}</option>)}</Select></label></div>
        {kind==='weekly'&&<label>Apply change to<Select aria-label={`Weekly change scope ${i+1}`} value={move.scope||''} onChange={e=>edit(i,{scope:e.target.value as Move['scope']})}><option value="">Choose which classes to change</option><option value="occurrence">This occurrence only</option><option value="future">This and future occurrences</option></Select></label>}
      </fieldset>)}
      <label className="block">Reason for change<textarea className="mt-2" disabled={busy} minLength={3} maxLength={1000} value={reason} onChange={e=>{setReason(e.target.value);setPreview(null);setPayment(emptyDeskPayment());}}/></label>
    </>:<section aria-label="Move preview" className="space-y-4">
      {preview.rows.map((row,i)=><div key={row.id} className="space-y-2"><div className="desk-change-summary"><DeskSchedule label="Original booking" court={courts.find(c=>c.id===sources[i].courtId)?.name} date={sources[i].date} time={sources[i].time}/><DeskSchedule label="Replacement" court={row.target.courtName} date={row.target.date} time={row.target.time}/></div>{kind==='weekly'?<p className="text-xs font-medium">{row.scope==='future'?'This and future occurrences':'This occurrence only'}</p>:<p className="text-xs text-zawana-500">Price basis: {(row.paidBasis??row.original.price??0).toLocaleString()} MMK · Destination rate: {row.destinationPrice.toLocaleString()} MMK · Additional charge: {row.surcharge.toLocaleString()} MMK</p>}</div>)}
      <div className="desk-note">Reason: {reason}</div>
      <p className="text-sm font-semibold">Total additional payment: {preview.surcharge.toLocaleString()} MMK</p>
      {kind==='court'&&<p className="text-xs text-zawana-500">Cheaper destinations receive no refund and do not offset other charges.</p>}
      {preview.surcharge>0&&<DeskPaymentFields value={payment} onChange={setPayment} disabled={busy}/>}
    </section>}
  </DeskDialog>;
}
