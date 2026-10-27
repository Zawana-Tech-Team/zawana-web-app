import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Info } from 'lucide-react';
import { get, post } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button, Toast } from './UI';
import { StaffDialog } from './StaffDialog';
import { useNavigate } from 'react-router-dom';
import { courtReschedulePath, type CourtChangeDetail as Detail } from '../types/courtChanges';

type Cancellation = Detail['cancellations'][number];
const stamp = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Yangon' });
const label = (value: string) => value.toLowerCase().replaceAll('_', ' ');

export function CourtChangeDialog({ bookingId, onClose, onChanged }: { bookingId: string; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Detail | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [reason, setReason] = useState('');
  const [mode, setMode] = useState<'details' | 'cancel'>('details');
  const base = `/court-booking/bookings/${encodeURIComponent(bookingId)}`;
  const staff = user?.role === 'admin' || user?.role === 'badminton_fo';
  const refresh = async () => { setDetail(await get<Detail>(`${base}/changes`)); };

  useEffect(() => {
    let active = true;
    get<Detail>(`${base}/changes`).then(d => { if (active) setDetail(d); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [base]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The change failed. Refresh and try again.'); }
    finally { setBusy(false); }
  };
  const cancel = () => run(async () => {
    const result = await post<Cancellation>(`${base}/cancellation-requests`, { reason });
    setMode('details');
    setNotice(result.status === 'completed' ? 'Booking cancelled. No refund was issued.' : 'Cancellation submitted for staff review. The reservation remains active.');
    await refresh(); onChanged();
  });
  const review = (id: string, approve: boolean) => run(async () => {
    await post(`${base}/cancellation-requests/${id}/review`, { approve, reason }); await refresh();
    setNotice(approve ? 'Cancellation approved. Financial review remains separate.' : 'Cancellation request rejected.'); onChanged();
  });
  const exceptionAllowed = user?.role === 'admin' && detail?.exceptionsEnabled && detail.booking.status.toLowerCase() === 'confirmed';
  const feedback = error ? <Toast placement="inline" message={error} type="error" onClose={() => setError('')} />
    : notice ? <Toast placement="inline" message={notice} onClose={() => setNotice('')} /> : null;

  return <StaffDialog title="Court booking details" eyebrow="THE ZAWANA · COURT RENTAL" onClose={onClose} busy={busy} feedback={feedback}
    footer={detail && <>
      <span className="z-dialog__footer-note">{mode === 'cancel' ? 'Refunds require separate approval.' : 'Yangon time · UTC+6:30'}</span>
      {mode === 'details' ? <Button className="z-dialog-secondary" disabled={busy} onClick={onClose}>Done</Button> : <>
        <Button className="z-dialog-secondary" disabled={busy} onClick={() => setMode('details')}>Back</Button>
        <Button className="z-dialog-danger" loading={busy} disabled={busy || reason.trim().length < 3} onClick={cancel}>{detail.booking.paymentStatus === 'pending' ? 'Confirm cancellation' : 'Submit cancellation request'}</Button>
      </>}
    </>}
  >
    {!detail ? <p role="status" className="z-empty">{error ? 'Booking details could not be loaded.' : 'Loading reservation…'}</p> : <>
      <section aria-label="Current reservation">
        <div className="z-booking-summary"><div><p className="z-reference">{detail.booking.code}</p><h3 className="z-session-title">{detail.booking.title}</h3></div><span className={`z-status z-status--${label(detail.booking.status)}`}>{label(detail.booking.status)}</span></div>
        <div className="z-session-meta"><span><CalendarDays size={14} strokeWidth={1.5} />{dateLabel(detail.booking.date)}</span><span><Clock3 size={14} strokeWidth={1.5} />{detail.booking.time}</span></div>
        {mode === 'details' ? <dl className="z-booking-facts"><div className="z-fact"><dt>Reserved for</dt><dd>{detail.customer}</dd></div><div className="z-fact"><dt>Booking amount</dt><dd>{detail.booking.price.toLocaleString()} MMK</dd></div><div className="z-fact"><dt>Payment</dt><dd className="capitalize">{label(detail.booking.paymentStatus)}</dd></div></dl> : <p className="z-caption mt-4">{detail.customer} · {detail.booking.price.toLocaleString()} MMK · {label(detail.booking.paymentStatus)}</p>}
        <div className="z-policy">{detail.eligibility.eligible ? <CheckCircle2 size={14} strokeWidth={1.5} /> : <Info size={14} strokeWidth={1.5} />}<div>{detail.eligibility.message}{detail.eligibility.deadline && <small>Change by {stamp(detail.eligibility.deadline)} · Yangon</small>}</div></div>
      </section>
      <nav className="z-dialog-nav" aria-label="Booking options">
        <button type="button" aria-pressed={mode === 'details'} disabled={busy} onClick={() => setMode('details')}>History</button>
        <button type="button" disabled={busy || (!detail.eligibility.eligible && !exceptionAllowed)} onClick={() => navigate(courtReschedulePath(bookingId, user?.role))}>Change Date / Time</button>
        {['pending', 'confirmed'].includes(detail.booking.status.toLowerCase()) && <button type="button" className="z-nav-cancel" aria-pressed={mode === 'cancel'} disabled={busy} onClick={() => setMode('cancel')}>Cancel Booking</button>}
      </nav>
      {mode === 'cancel' && <section className="z-form" aria-label="Cancellation confirmation">
        <h3 className="z-section-title">Confirm cancellation request</h3><p className="z-muted">{detail.cancellationPolicy.message}</p>
        <label className="z-field">Cancellation reason<textarea disabled={busy} rows={3} maxLength={1000} placeholder="Tell us why you need to cancel" value={reason} onChange={e => setReason(e.target.value)} /></label>
      </section>}
      {mode === 'details' && <>
        {detail.cancellations.length > 0 && <section>
          <div className="z-section-heading"><h3 className="z-section-title">Cancellation requests</h3><span className="z-caption">{detail.cancellations.length}</span></div>
          {detail.cancellations.map(c => <div key={c.id} className="z-request"><div className="z-request-head"><span className={`z-status z-status--${c.status}`}>{label(c.status)}</span><span className="z-caption">Financial status: {label(c.refundStatus)}</span></div><p className="z-muted">{c.reason}</p>{c.reviewReason && <p className="z-caption">Review: {c.reviewReason}</p>}
            {staff && c.status === 'requested' && <div className="mt-4"><label className="z-field">Review reason<input disabled={busy} value={reason} placeholder="Add a brief review note" onChange={e => setReason(e.target.value)} /></label><div className="z-request-actions"><Button className="z-dialog-primary" disabled={busy || reason.trim().length < 3} onClick={() => review(c.id, true)}>Approve cancellation</Button><Button className="z-dialog-secondary" disabled={busy || reason.trim().length < 3} onClick={() => review(c.id, false)}>Reject request</Button></div></div>}
          </div>)}
        </section>}
        <section className={detail.cancellations.length ? 'z-section' : ''}><div className="z-section-heading"><h3 className="z-section-title">Booking history</h3><span className="z-caption">Yangon time</span></div>
          {!detail.history.length ? <p className="z-empty">No booking changes recorded.</p> : <ol className="z-timeline">{detail.history.map(h => <li key={h.id}><div className="z-timeline-title"><h4>{label(h.action)}{h.policyException ? ' · Manager exception' : ''}</h4><time dateTime={h.createdAt}>{stamp(h.createdAt)}</time></div><p>{h.reason}</p>{h.action === 'rescheduled' && <p>{describe(h.previous)} → {describe(h.current)}</p>}{h.approvedById && <p>Approved by {h.approvedById}</p>}</li>)}</ol>}
        </section>
      </>}
    </>}
  </StaffDialog>;
}
function describe(value: string) { try { const s = JSON.parse(value); return `${s.date ? dateLabel(s.date) : 'Previous date'} · ${s.time || ''}`; } catch { return 'Historical schedule'; } }
