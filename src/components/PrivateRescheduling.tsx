import { ActionRequiredIndicator, PendingActionCounter } from './operational-actions/OperationalActionUI';
import { useOperationalActions } from '../context/OperationalActionsContext';
import { HistorySchedule } from './member-booking/HistoryPresentation';
import { operationalReasonLabel } from '../../backend/src/domain/rescheduleReasons';
import { Navigate, useSearchParams } from 'react-router-dom';
import { StaffRescheduleRequestDialog } from './BookingRequestWorkflow';
import { useEffect, useRef, useState } from 'react';
import { get, post } from '../api';
import { Button } from './UI';
import { useBookingRevision } from '../hooks/useBookingRevision';

type Booking = { id: string; title: string; date: string; time: string; courtId?: string | null };
type Request = { id: string; bookingId: string; status: string; date: string; time: string; courtId: string; reason: string; courtName?: string; originalCourtName?: string; customerName?: string; reviewReason?: string; original: Pick<Booking, 'id' | 'date' | 'time' | 'courtId'>; booking: Booking };
export function PrivateRescheduleInbox({ coach = false, memberView = false, onChanged }: { coach?: boolean; memberView?: boolean; onChanged?: () => void }) {
  const revision = useBookingRevision();
  const { counts } = useOperationalActions();
  const [params]=useSearchParams();const proposalId=params.get('proposal');const focused=useRef('');

  const [rows, setRows] = useState<Request[]>([]), [error, setError] = useState('');
  useEffect(()=>{if(!proposalId||focused.current===proposalId||!rows.some(row=>row.id===proposalId))return;const element=document.getElementById(`private-proposal-${proposalId}`);if(element){focused.current=proposalId;element.focus();element.scrollIntoView({block:'center'});}},[proposalId,rows]);
  useEffect(() => { let live = true, request = 0; const load = () => { if (document.hidden) return; const generation = ++request; void get<Request[]>('/rescheduling/private').then(rows => { if (live && generation === request) { setRows(rows); setError(''); } }).catch(e => { if (live && generation === request) setError(e.message); }); }; load(); return () => { live = false; }; }, [revision]);
  const visibleRows=memberView?rows.filter(row=>row.status==='PENDING'):rows;
  if (!visibleRows.length && !error) return null;
  return <section className={memberView ? "private-request-history" : "desk-panel mb-6 p-5"} aria-label="Private course reschedule requests"><h2 className="text-lg font-semibold">{memberView ? 'Coach approvals' : 'Private course reschedule requests'}{coach&&<PendingActionCounter count={counts.coachRequests} label="Coach requests"/>}</h2><p className="mt-1 text-xs text-zawana-500">Original sessions stay reserved until the assigned coach approves a change.</p>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<div className="mt-4 space-y-4">{visibleRows.map(row => <RequestRow key={row.id} row={row} coach={coach} memberView={memberView} onChanged={onChanged} />)}</div></section>;
}
function RequestRow({ row, coach, onChanged, memberView }: { row: Request; coach: boolean; memberView: boolean; onChanged?: () => void }) {
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const decide = async (decision: string) => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { const result = await post<Request>(`/rescheduling/private/proposals/${row.id}/decision`, { decision, reason: reason.trim() || (decision === 'approve' ? 'Approved by assigned coach' : 'Withdrawn by customer') }); if (result.status === 'CONFLICTED') setError(result.reviewReason || 'The destination is unavailable. Original session unchanged.'); onChanged?.(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update proposal.'); } finally { lock.current = false; setBusy(false); } };
  return <article id={`private-proposal-${row.id}`} tabIndex={-1} className={memberView ? "private-request-card" : "rounded-xl border p-4"}><div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">{row.booking.title}{coach && row.customerName ? ` · ${row.customerName}` : ''}</h3><span className={memberView ? 'booking-history-status' : 'text-xs font-medium'} data-tone={row.status==='PENDING'?'pending':row.status==='APPROVED'?'confirmed':'muted'}>{memberView ? ({PENDING:'Awaiting coach',APPROVED:'Approved',REJECTED:'Declined',WITHDRAWN:'Withdrawn',CONFLICTED:'Time unavailable',EXPIRED:'Expired'} as Record<string,string>)[row.status] || row.status : row.status}</span></div>{coach&&<ActionRequiredIndicator bookingId={row.bookingId}/>}<HistorySchedule original={{court:row.originalCourtName,date:row.original.date,time:row.original.time}} proposed={{court:row.courtName,date:row.date,time:row.time}}/><p className="mt-2 text-xs text-zawana-500">{operationalReasonLabel(row.reason)}</p>{row.reviewReason && <p className="mt-2 text-xs">{row.reviewReason}</p>}{row.status === 'PENDING' && <div className="mt-3 space-y-3">{coach && <label className="block text-xs">Review reason<input className="mt-1 w-full" disabled={busy} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>}<div className="flex flex-wrap gap-2">{coach ? <><Button disabled={busy} loading={busy} onClick={() => void decide('approve')}>Approve new time</Button><Button variant="secondary" disabled={busy || reason.trim().length < 3} onClick={() => void decide('reject')}>Keep original time</Button></> : <Button variant="secondary" disabled={busy} loading={busy} onClick={() => void decide('withdraw')}>Withdraw proposal</Button>}</div></div>}{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}</article>;
}
export function PrivateRescheduleDialog({ booking }: { booking: Booking; onClose: () => void; onChanged: () => void }) {
  return <Navigate to={`/bookings/${encodeURIComponent(booking.id)}/reschedule`}/>;
}
export function PrivateRescheduleInvite({ bookingId, onClose, onSent }: { bookingId: string; onClose: () => void; onSent: (message: string) => void }) {
  return <StaffRescheduleRequestDialog bookingIds={[bookingId]} onClose={onClose} onSent={onSent}/>;
}
