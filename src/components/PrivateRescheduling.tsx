import { HistorySchedule } from './member-booking/HistoryPresentation';
import { operationalReasonLabel } from '../../backend/src/domain/rescheduleReasons';
import { ReplacementSessionFields, type ReplacementTarget } from './ReplacementSessionFields';
import { StaffRescheduleRequestDialog } from './BookingRequestWorkflow';
import { useEffect, useRef, useState } from 'react';
import { get, post } from '../api';
import { DeskDialog, DeskSchedule, DeskSteps } from './court-desk/DeskDialog';
import { Button } from './UI';
import { useBookingRevision } from '../hooks/useBookingRevision';

type Booking = { id: string; title: string; date: string; time: string; courtId?: string | null };
type Request = { id: string; bookingId: string; status: string; date: string; time: string; courtId: string; reason: string; courtName?: string; originalCourtName?: string; customerName?: string; reviewReason?: string; original: Pick<Booking, 'id' | 'date' | 'time' | 'courtId'>; booking: Booking };
export function PrivateRescheduleInbox({ coach = false, memberView = false, onChanged }: { coach?: boolean; memberView?: boolean; onChanged?: () => void }) {
  const revision = useBookingRevision();
  const [rows, setRows] = useState<Request[]>([]), [error, setError] = useState('');
  useEffect(() => { let live = true, request = 0; const load = () => { if (document.hidden) return; const generation = ++request; void get<Request[]>('/rescheduling/private').then(rows => { if (live && generation === request) { setRows(rows); setError(''); } }).catch(e => { if (live && generation === request) setError(e.message); }); }; load(); return () => { live = false; }; }, [revision]);
  if (!rows.length && !error) return null;
  return <section className={memberView ? "private-request-history" : "desk-panel mb-6 p-5"} aria-label="Private course reschedule requests"><h2 className="text-lg font-semibold">{memberView ? 'Coach approvals' : 'Private course reschedule requests'}</h2><p className="mt-1 text-xs text-zawana-500">Original sessions stay reserved until the assigned coach approves a change.</p>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-4 space-y-4">{rows.map(row => <RequestRow key={row.id} row={row} coach={coach} memberView={memberView} onChanged={onChanged} />)}</div></section>;
}
function RequestRow({ row, coach, onChanged, memberView }: { row: Request; coach: boolean; memberView: boolean; onChanged?: () => void }) {
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const decide = async (decision: string) => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { const result = await post<Request>(`/rescheduling/private/proposals/${row.id}/decision`, { decision, reason: reason.trim() || (decision === 'approve' ? 'Approved by assigned coach' : 'Withdrawn by customer') }); if (result.status === 'CONFLICTED') setError(result.reviewReason || 'The destination is unavailable. Original session unchanged.'); onChanged?.(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update proposal.'); } finally { lock.current = false; setBusy(false); } };
  return <article className={memberView ? "private-request-card" : "rounded-xl border p-4"}><div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">{row.booking.title}{coach && row.customerName ? ` · ${row.customerName}` : ''}</h3><span className="text-xs font-medium">{row.status}</span></div><HistorySchedule original={{court:row.originalCourtName,date:row.original.date,time:row.original.time}} proposed={{court:row.courtName,date:row.date,time:row.time}}/><p className="mt-2 text-xs text-zawana-500">{operationalReasonLabel(row.reason)}</p>{row.reviewReason && <p className="mt-2 text-xs">{row.reviewReason}</p>}{row.status === 'PENDING' && <div className="mt-3 space-y-3">{coach && <label className="block text-xs">Review reason<input className="mt-1 w-full" disabled={busy} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>}<div className="flex flex-wrap gap-2">{coach ? <><Button disabled={busy} loading={busy} onClick={() => void decide('approve')}>Approve new time</Button><Button variant="secondary" disabled={busy || reason.trim().length < 3} onClick={() => void decide('reject')}>Keep original time</Button></> : <Button variant="secondary" disabled={busy} loading={busy} onClick={() => void decide('withdraw')}>Withdraw proposal</Button>}</div></div>}{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}</article>;
}
export function PrivateRescheduleDialog({ booking, onClose, onChanged }: { booking: Booking; onClose: () => void; onChanged: () => void }) {
  const [reviewing, setReviewing] = useState(false);
  const [target, setTarget] = useState<ReplacementTarget>({ courtId: booking.courtId || '', date: booking.date, time: '' });
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const submit = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await post(`/rescheduling/private/${booking.id}/proposals`, { ...target, reason }); onChanged(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not send proposal.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <DeskDialog title="Request private course reschedule" heading="Choose a new session" eyebrow={booking.title} size="compact" onClose={onClose} busy={busy} closeLabel="Close reschedule request"
    description="Your original session stays reserved until your assigned coach approves a replacement. Requests require at least 24 hours before the original start time."
    summary={<p>Existing payment and assigned coach remain unchanged.</p>}
    steps={<DeskSteps labels={['Choose replacement', 'Review & confirm']} current={reviewing ? 1 : 0}/>}
    actions={reviewing ? <><Button variant="ghost" disabled={busy} onClick={() => setReviewing(false)}>Edit replacement</Button><Button loading={busy} disabled={busy || !target.time} onClick={() => void submit()}>Send to coach for approval</Button></> : <Button disabled={busy || !target.time || reason.trim().length < 3} onClick={() => setReviewing(true)}>Review replacement</Button>} bodyClassName="space-y-4">
    <DeskSchedule label="Original booking" date={booking.date} time={booking.time}/>
    <ReplacementSessionFields target={target} onChange={next => setTarget(current => ({ ...current, ...next }))} availabilityPath={`/rescheduling/private/${booking.id}/availability`} disabled={busy || reviewing}/>
    <label className="block text-sm">Reason<textarea className="mt-1 w-full" disabled={busy || reviewing} minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)}/></label>
    <DeskSchedule label="Proposed replacement" date={target.date} time={target.time}/>
    {error && <p role="alert" className="desk-load-error">{error}</p>}
  </DeskDialog>;
}
export function PrivateRescheduleInvite({ bookingId, onClose, onSent }: { bookingId: string; onClose: () => void; onSent: (message: string) => void }) {
  return <StaffRescheduleRequestDialog bookingIds={[bookingId]} onClose={onClose} onSent={onSent}/>;
}
