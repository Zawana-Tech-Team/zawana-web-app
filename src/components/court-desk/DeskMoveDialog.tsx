import { useRentalMoveAvailability, type RentalAvailabilityRow } from '../../hooks/useRentalMoveAvailability';
import { ArrowRight, CheckCircle2, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RentalChangeReason, RentalScheduleCard, rentalCourtLabel } from './RentalReschedulePresentation';
import { OperationalReasonField } from '../OperationalReasonField';
import { operationalReasonLabel } from '../../../backend/src/domain/rescheduleReasons';
import { useEffect, useRef, useState } from 'react';
import { post } from '../../api';
import { Select } from '../Select';
import { Button } from '../UI';
import { DeskDialog, DeskSchedule, DeskSteps } from './DeskDialog';
import { DeskPaymentFields, emptyDeskPayment, deskPaymentReady } from './DeskPaymentFields';
import { bookingStart } from '../../utils/bookingTime';
export type MoveSource = { id: string; kind: 'court' | 'weekly'; date: string; time: string; courtId: string; title: string; customerName?: string | null };
type Move = { id: string; sourceDate: string; scope?: 'occurrence' | 'future'; courtId: string; date: string; time: string };
type Preview = { revision: string; surcharge: number; rows: { id: string; scope?: 'occurrence' | 'future' | null; destinationPrice: number; paidBasis?: number; original: { courtId?: string | null; price?: number; date: string; time?: string; start?: string; end?: string }; target: { courtId?: string; courtName: string; date: string; time: string }; surcharge: number }[] };
const durationOf = (time: string) => { const parts = time.split(/\s*(?:—|–|-)\s*/); return bookingStart(parts[1] || '') - bookingStart(parts[0]); };
const timeRange = (hour: number, duration: number) => { const f = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m >= 720 ? 'PM' : 'AM'}`; return `${f(hour * 60)} — ${f(hour * 60 + duration)}`; };
function availableRentalTimes(index: number, moves: Move[], rows: RentalAvailabilityRow[]) {
  const move = moves[index];
  const row = rows.find(row => row.bookingId === move.id && row.courtId === move.courtId && row.date === move.date);
  return (row?.slots || []).filter(slot => {
    const start = bookingStart(slot.time), end = start + (row?.durationMinutes || 0);
    return !moves.some((other, otherIndex) => otherIndex !== index && other.courtId === move.courtId && other.date === move.date && other.time && start < bookingStart(other.time) + durationOf(other.time) && bookingStart(other.time) < end);
  }).map(slot => slot.time);
}
export function DeskMoveDialog({ sources, courts, onClose, onChanged, initialDestination }: { initialDestination?: { courtId: string; date: string; time: string }; sources: MoveSource[]; courts: { id: string; name: string; floor?: string | null }[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const kind = sources[0].kind;
  const { user } = useAuth();
  const staffRental = kind === 'court' && !!user && ['admin', 'badminton_fo'].includes(user.role);
  const customerNames = [...new Set(sources.map(source => source.customerName).filter(Boolean))].join(' · ');
  const [completed, setCompleted] = useState(false);
  const [moves, setMoves] = useState<Move[]>(sources.map(s => ({ id: s.id, sourceDate: s.date, courtId: s.courtId, date: s.date, time: staffRental ? '' : s.time, ...(sources.length === 1 && initialDestination ? initialDestination : {}) })));
  const [reason, setReason] = useState(''), [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [payment, setPayment] = useState(emptyDeskPayment);
  const selectingRental = staffRental && !preview && !completed;
  const availability = useRentalMoveAvailability(selectingRental, sources.map(source => source.id), moves);
  const rentalTimesReady = availability.ready && moves.every((move, index) => !!move.time && availableRentalTimes(index, moves, availability.rows).includes(move.time));
  useEffect(() => {
    if (!selectingRental || !availability.ready) return;
    const next = moves.map((move, index) => move.time && !availableRentalTimes(index, moves, availability.rows).includes(move.time) ? { ...move, time: '' } : move);
    if (next.some((move, index) => move !== moves[index])) { setMoves(next); setPayment(emptyDeskPayment()); setError('A selected time is no longer available. Choose another available time.'); }
  }, [selectingRental, availability.ready, availability.rows, moves]);
  const lock = useRef(false), retry = useRef({ payload: '', key: '' });
  const scopeMissing = kind === 'weekly' && moves.some(move => !move.scope);
  const input = { kind, reason: reason.trim(), moves };
  const edit = (i: number, next: Partial<Move>) => { setMoves(rows => rows.map((row, index) => index === i ? { ...row, ...next, ...(staffRental && ('courtId' in next || 'date' in next) ? { time: '' } : {}) } : row)); if (staffRental) setError(''); setPreview(null); setPayment(emptyDeskPayment()); };
  const quote = async () => { if (lock.current || (staffRental && !rentalTimesReady)) return; lock.current = true; setBusy(true); setError(''); try { setPreview(await post<Preview>('/rescheduling/moves/quote', input)); setPayment(emptyDeskPayment()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not preview moves.'); } finally { lock.current = false; setBusy(false); } };
  const confirm = async () => {
    if (!preview || lock.current) return;
    const payload = { input, revision: preview.revision, ...(preview.surcharge ? { payment } : {}) };
    const serialized = JSON.stringify(payload);
    if (retry.current.payload !== serialized) retry.current = { payload: serialized, key: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError('');
    let saved = false;
    try { await post('/rescheduling/moves/confirm', { ...payload, requestKey: retry.current.key }); saved = true; await onChanged(); }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move bookings.');
      if (saved && staffRental) setCompleted(true);
      else if ([400, 409].includes((e as { status?: number }).status || 0)) setPreview(null);
    }
    finally { lock.current = false; setBusy(false); }
  };
  if (staffRental) return <DeskDialog title="Move selected bookings" heading={completed ? 'Reschedule confirmed' : preview ? 'Review reschedule' : sources.length === 1 ? 'Reschedule court rental' : `Reschedule ${sources.length} rentals`} size="wide" className="rental-change-dialog" onClose={onClose} busy={busy} closeLabel="Close move review" cancelLabel={completed ? 'Done' : 'Cancel'}
    actions={!completed && (preview ? <><Button variant="ghost" disabled={busy} onClick={() => { setPreview(null); setPayment(emptyDeskPayment()); }}>Edit replacement</Button><Button loading={busy} disabled={busy || (preview.surcharge > 0 && !deskPaymentReady(payment))} onClick={() => void confirm()}>Confirm reschedule</Button></> : <Button type="submit" form="admin-rental-move" loading={busy} disabled={busy || !rentalTimesReady || reason.trim().length < 3}>Review reschedule</Button>)}>
    {!completed && customerNames && <p className="rental-change-customer">{customerNames}</p>}
    {completed ? <div className="rental-change-success" role="status"><CheckCircle2 size={30} strokeWidth={1.5} aria-hidden="true"/><h3>Booking updated</h3><p>The new schedule and any additional payment have been recorded.</p>{error && <p>The booking was saved. Close this dialog and refresh the court calendar to see the latest details.</p>}</div> : <>
      {error && <p className="rental-change-error" role="alert">{error}</p>}
      {!preview && availability.error && <div role="alert" className="rental-change-error"><p>{availability.error}</p><Button variant="secondary" onClick={availability.refresh}>Retry availability</Button></div>}
      {!preview ? <form id="admin-rental-move" onSubmit={event => { event.preventDefault(); void quote(); }}><fieldset disabled={busy} className="rental-change-fields">
        <div className="rental-change-bookings">{moves.map((move, index) => {
          const source = sources[index];
          const times = availableRentalTimes(index, moves, availability.rows);
          return <section className="rental-change-booking" key={`${move.id}|${move.sourceDate}`} aria-label={`Reschedule rental ${index + 1}`}>
            {sources.length > 1 && <h3>Rental {index + 1}</h3>}
            <RentalScheduleCard label="Original booking" court={courts.find(court => court.id === source.courtId)} date={source.date} time={source.time}/>
            <div className="rental-change-destination"><label className="rental-change-field">New court<select aria-label={`Destination court ${index + 1}`} value={move.courtId} required onChange={event => edit(index, { courtId: event.target.value })}>{courts.map(court => <option key={court.id} value={court.id}>{rentalCourtLabel(court)}</option>)}</select></label>
              <label className="rental-change-field">New date<input aria-label={`Destination date ${index + 1}`} type="date" required value={move.date} onChange={event => edit(index, { date: event.target.value })}/></label>
              <label className="rental-change-field">Available time<select aria-label={`Destination time ${index + 1}`} required disabled={busy || availability.loading || !!availability.error || !times.length} value={times.includes(move.time) ? move.time : ''} onChange={event => edit(index, { time: event.target.value })}><option value="">{!move.date || !move.courtId ? 'Choose court and date' : availability.loading ? 'Loading available times…' : !times.length ? 'No available times' : 'Choose available time'}</option>{times.map(time => <option key={time} value={time}>{time}</option>)}</select></label></div>
            {availability.ready && move.date && move.courtId && !times.length && <p role="status" className="rental-change-reservation-note">No available times for this court and date. Choose another court or date.</p>}
          </section>;
        })}</div>
        <RentalChangeReason value={reason} disabled={busy} onChange={value => { setReason(value); setPreview(null); setPayment(emptyDeskPayment()); }}/>
      </fieldset></form> : <section className="rental-change-review" aria-label="Move preview">
        {preview.rows.map((row, index) => {
          const source = sources.find(item => item.id === row.id) || sources[index];
          const target = courts.find(court => court.id === row.target.courtId) || courts.find(court => court.name === row.target.courtName) || { name: row.target.courtName };
          return <section className="rental-change-comparison" key={row.id} aria-label={`Rental ${index + 1} changes`}>
            <div className="rental-change-comparison-slots"><RentalScheduleCard label="Original booking" court={courts.find(court => court.id === (row.original.courtId || source.courtId))} date={row.original.date} time={row.original.time || source.time}/><ArrowRight size={19} aria-hidden="true"/><RentalScheduleCard label="Replacement" court={target} date={row.target.date} time={row.target.time} replacement/></div>
            <dl className="rental-change-prices"><div><dt>Price basis</dt><dd>{(row.paidBasis ?? row.original.price ?? 0).toLocaleString()} MMK</dd></div><div><dt>New session rate</dt><dd>{row.destinationPrice.toLocaleString()} MMK</dd></div>{sources.length > 1 && <div><dt>Additional payment</dt><dd>{row.surcharge.toLocaleString()} MMK</dd></div>}</dl>
          </section>;
        })}
        <div className="rental-change-reason-summary"><span>Reason</span><strong>{operationalReasonLabel(reason)}</strong></div>
        <section className="rental-change-total" aria-label="Additional payment"><div><span>Additional payment</span><strong>{preview.surcharge.toLocaleString()} <small>MMK</small></strong></div>{preview.surcharge === 0 && <span>No payment needed</span>}</section>
        <p className="rental-change-hint"><Info size={16} aria-hidden="true"/><span>Lower-priced sessions do not receive a refund or offset other charges.</span></p>
        {preview.surcharge > 0 && <DeskPaymentFields value={payment} onChange={setPayment} disabled={busy}/>}
      </section>}
      <p className="rental-change-reservation-note">Original bookings stay reserved until you confirm.</p>
    </>}
  </DeskDialog>;
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
      <OperationalReasonField value={reason} disabled={busy} onChange={value => { setReason(value); setPreview(null); setPayment(emptyDeskPayment()); }}/>

    </>:<section aria-label="Move preview" className="space-y-4">
      {preview.rows.map((row,i)=><div key={row.id} className="space-y-2"><div className="desk-change-summary"><DeskSchedule label="Original booking" court={courts.find(c=>c.id===sources[i].courtId)?.name} date={sources[i].date} time={sources[i].time}/><DeskSchedule label="Replacement" court={row.target.courtName} date={row.target.date} time={row.target.time}/></div>{kind==='weekly'?<p className="text-xs font-medium">{row.scope==='future'?'This and future occurrences':'This occurrence only'}</p>:<p className="text-xs text-zawana-500">Price basis: {(row.paidBasis??row.original.price??0).toLocaleString()} MMK · Destination rate: {row.destinationPrice.toLocaleString()} MMK · Additional charge: {row.surcharge.toLocaleString()} MMK</p>}</div>)}
      <div className="desk-note">Reason: {operationalReasonLabel(reason)}</div>
      <p className="text-sm font-semibold">Total additional payment: {preview.surcharge.toLocaleString()} MMK</p>
      {kind==='court'&&<p className="text-xs text-zawana-500">Cheaper destinations receive no refund and do not offset other charges.</p>}
      {preview.surcharge>0&&<DeskPaymentFields value={payment} onChange={setPayment} disabled={busy}/>}
    </section>}
  </DeskDialog>;
}
