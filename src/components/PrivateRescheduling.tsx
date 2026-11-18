import { useEffect, useRef, useState } from 'react';
import { get, post } from '../api';
import { DeskDialog, DeskSchedule } from './court-desk/DeskDialog';
import { Button } from './UI';
import { Select } from './Select';
import { usePaymentRevision } from '../hooks/usePaymentRevision';
import { bookingStart } from '../utils/bookingTime';
type Booking = { id: string; title: string; date: string; time: string; courtId?: string | null };
type Request = { id: string; bookingId: string; status: string; date: string; time: string; courtId: string; reason: string; courtName?: string; originalCourtName?: string; customerName?: string; reviewReason?: string; original: Pick<Booking, 'id' | 'date' | 'time' | 'courtId'>; booking: Booking };
export function PrivateRescheduleInbox({ coach = false, onChanged }: { coach?: boolean; onChanged?: () => void }) {
  const revision = usePaymentRevision();
  const [rows, setRows] = useState<Request[]>([]), [error, setError] = useState('');
  useEffect(() => { let live = true, request = 0; const load = () => { if (document.hidden) return; const generation = ++request; void get<Request[]>('/rescheduling/private').then(rows => { if (live && generation === request) { setRows(rows); setError(''); } }).catch(e => { if (live && generation === request) setError(e.message); }); }; load(); const timer = window.setInterval(load, 30000); window.addEventListener('focus', load); return () => { live = false; window.clearInterval(timer); window.removeEventListener('focus', load); }; }, [revision]);
  if (!rows.length && !error) return null;
  return <section className="desk-panel mb-6 p-5" aria-label="Private course reschedule requests"><h2 className="text-lg font-semibold">Private course reschedule requests</h2><p className="mt-1 text-xs text-zawana-500">Original sessions stay reserved until the assigned coach approves a change.</p>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-4 space-y-4">{rows.map(row => <RequestRow key={row.id} row={row} coach={coach} onChanged={onChanged} />)}</div></section>;
}
function RequestRow({ row, coach, onChanged }: { row: Request; coach: boolean; onChanged?: () => void }) {
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const decide = async (decision: string) => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { const result = await post<Request>(`/rescheduling/private/proposals/${row.id}/decision`, { decision, reason: reason.trim() || (decision === 'approve' ? 'Approved by assigned coach' : 'Withdrawn by customer') }); if (result.status === 'CONFLICTED') setError(result.reviewReason || 'The destination is unavailable. Original session unchanged.'); onChanged?.(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update proposal.'); } finally { lock.current = false; setBusy(false); } };
  return <article className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">{row.booking.title}{coach && row.customerName ? ` · ${row.customerName}` : ''}</h3><span className="text-xs font-medium">{row.status}</span></div><p className="mt-2 text-xs text-zawana-500">Original: {row.originalCourtName} · {row.original.date} · {row.original.time}</p><p className="mt-2 text-sm">Proposed: {row.courtName} · {row.date} · {row.time}</p><p className="mt-2 text-xs text-zawana-500">{row.reason}</p>{row.reviewReason && <p className="mt-2 text-xs">{row.reviewReason}</p>}{row.status === 'PENDING' && <div className="mt-3 space-y-3">{coach && <label className="block text-xs">Review reason<input className="mt-1 w-full" disabled={busy} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>}<div className="flex flex-wrap gap-2">{coach ? <><Button disabled={busy} loading={busy} onClick={() => void decide('approve')}>Approve new time</Button><Button variant="secondary" disabled={busy || reason.trim().length < 3} onClick={() => void decide('reject')}>Keep original time</Button></> : <Button variant="secondary" disabled={busy} loading={busy} onClick={() => void decide('withdraw')}>Withdraw proposal</Button>}</div></div>}{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}</article>;
}
export function PrivateRescheduleDialog({ booking, onClose, onChanged }: { booking: Booking; onClose: () => void; onChanged: () => void }) {
  const [courts, setCourts] = useState<{ id: string; name: string }[]>([]), [courtId, setCourtId] = useState(booking.courtId || ''), [date, setDate] = useState(booking.date), [time, setTime] = useState(booking.time), [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => { let live = true; void get<typeof courts>('/courts').then(rows => { if (live) setCourts(rows); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  const parts = booking.time.split(/\s*(?:—|–|-)\s*/), duration = bookingStart(parts[1] || '') - bookingStart(parts[0]);
  const clock = (minute: number) => `${Math.floor(minute / 60) % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${minute >= 720 ? 'PM' : 'AM'}`;
  const slots = Number.isFinite(duration) && duration > 0 ? Array.from({ length: Math.max(0, Math.floor((1260 - duration - 360) / 60) + 1) }, (_, i) => `${clock(360 + i * 60)} — ${clock(360 + i * 60 + duration)}`) : [];
  const submit = async () => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await post(`/rescheduling/private/${booking.id}/proposals`, { courtId, date, time, reason }); onChanged(); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not send proposal.'); } finally { lock.current = false; setBusy(false); } };
  return <DeskDialog title="Request private course reschedule" heading="Choose a new session" eyebrow={booking.title} size="compact" onClose={onClose} busy={busy} closeLabel="Close reschedule request"
    description="Your original session stays reserved until your assigned coach approves a replacement. Requests require at least 24 hours before the original start time."
    summary={<p>Existing payment and assigned coach remain unchanged.</p>}
    actions={<Button loading={busy} disabled={busy||!courtId||!slots.length||reason.trim().length<3} onClick={()=>void submit()}>Send to coach for approval</Button>} bodyClassName="space-y-4">
    <DeskSchedule label="Original booking" date={booking.date} time={booking.time}/>
    {error&&<p role="alert" className="desk-load-error">{error}</p>}
    <fieldset disabled={busy} className="space-y-4"><label className="block text-sm">New court<Select aria-label="New private course court" value={courtId} onChange={e => setCourtId(e.target.value)}><option value="">Choose court</option>{courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label><label className="block text-sm">New date<input className="mt-1 w-full" type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label className="block text-sm">New session time<Select aria-label="New private course time" value={time} onChange={e => setTime(e.target.value)}>{slots.map(t => <option key={t}>{t}</option>)}</Select></label><label className="block text-sm">Reason<textarea className="mt-1 w-full" minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label></fieldset>
    <DeskSchedule label="Proposed replacement" court={courts.find(c=>c.id===courtId)?.name} date={date} time={time}/>
  </DeskDialog>;

}
export function PrivateRescheduleInvite({ bookingId, onClose, onSent }: { bookingId: string; onClose: () => void; onSent: (message: string) => void }) {
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const submit = async () => { if (lock.current) return; lock.current = true; setBusy(true); try { const result = await post<{ message: string }>(`/rescheduling/private/${bookingId}/invite`, { reason }); onSent(result.message); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not notify customer.'); } finally { lock.current = false; setBusy(false); } };
  return <DeskDialog title="Ask customer to reschedule" heading="Ask customer to choose a new time" size="compact" onClose={onClose} busy={busy}
    description="The customer chooses the destination and the assigned coach approves it. The original session stays booked."
    actions={<Button loading={busy} disabled={busy||reason.trim().length<3} onClick={()=>void submit()}>Notify customer</Button>} bodyClassName="space-y-4">
    <label className="block text-sm">Reason<textarea className="mt-2" disabled={busy} value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></label>{error&&<p role="alert" className="desk-load-error">{error}</p>}
  </DeskDialog>;

}
