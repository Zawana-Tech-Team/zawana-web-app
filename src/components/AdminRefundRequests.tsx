import { useState } from 'react';
import { Banknote, CalendarDays, CheckCircle2, CircleAlert, Clock3, CreditCard, RotateCcw, Search } from 'lucide-react';
import { AdminRequestToolbar } from './AdminRequestToolbar';
import { Button } from './UI';
import { HistoryPagination } from './member-booking/HistoryPagination';
import { rentalCourtLabel } from './court-desk/RentalReschedulePresentation';
import { formatBookingDate } from '../utils/bookingDates';
import { normalizeBookingTime } from '../utils/bookingTime';

type RefundSummary = {
  booking: { id: string; code: string; kind: string; date: string; time: string };
  customer: { name: string; phone: string | null }; court: { name: string; floor?: string } | null;
  coach: { name: string } | null; paidAmount: number | null;
  request: { status: string } | null; refund: { amount: number; method: string } | null; blocked: string | null;
};
const states = { requested: 'Refund requested', processing: 'Processing', refunded: 'Refunded', rejected: 'Refund rejected' };
const stateOf = (row: RefundSummary): keyof typeof states => row.refund ? 'refunded' : row.request?.status === 'REFUND_REJECTED' ? 'rejected' : row.request?.status === 'REFUND_PROCESSING' ? 'processing' : 'requested';
const money = (amount: number) => `${amount.toLocaleString('en-GB')} MMK`;

export function AdminRefundRequests({ rows, loaded, loading, error, onRefresh, onOpen }: {
  rows: RefundSummary[]; loaded: boolean; loading: boolean; error: string; onRefresh: () => void; onOpen: (id: string) => void;
}) {
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1);
  const term = search.trim().toLowerCase();
  const filtered = rows.filter(row => (!status || stateOf(row) === status) && (!term || `${row.customer.name} ${row.customer.phone || ''} ${row.booking.code} ${row.court?.name || ''} ${row.coach?.name || ''} ${row.booking.kind}`.toLowerCase().includes(term)));
  const pages = Math.max(1, Math.ceil(filtered.length / 10)), current = Math.min(page, pages);
  const hasFilters = !!(search || status);
  const clear = () => { setSearch(''); setStatus(''); setPage(1); };
  return <section className="admin-request-tab admin-refund-requests" aria-label="Refund management" aria-busy={loading}>
    <AdminRequestToolbar search={search} searchLabel="Search refund requests" placeholder="Find a customer, booking or court" onSearch={value => { setSearch(value); setPage(1); }} loading={loading} refreshLabel="Refresh refunds" onRefresh={onRefresh} filtered={hasFilters} onClear={clear}>
      <select aria-label="Refund status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All refund statuses</option>{Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </AdminRequestToolbar>
    {error && <div role="alert" className="admin-request-error"><CircleAlert size={18} aria-hidden="true"/><p>{error}</p><Button variant="secondary" onClick={onRefresh}>Retry refunds</Button></div>}
    {!loaded ? <p role="status" className="admin-request-empty">Loading refund requests…</p> : !filtered.length && !error ? <div className="admin-request-empty">{hasFilters ? <Search size={28} strokeWidth={1.4} aria-hidden="true"/> : <RotateCcw size={28} strokeWidth={1.4} aria-hidden="true"/>}<h2>{hasFilters ? 'No matching refunds' : 'No refund requests yet.'}</h2><p>{hasFilters ? 'Try another customer or status.' : 'Refund requests will appear here for review.'}</p></div> : <div className="admin-refund-list">{filtered.slice((current - 1) * 10, current * 10).map(row => {
      const state = stateOf(row), done = !!row.refund;
      const StatusIcon = done ? CheckCircle2 : state === 'rejected' || row.blocked ? CircleAlert : Clock3;
      return <article key={row.booking.id} aria-label={`Refund ${row.booking.code}`}>
        <div className="admin-refund-customer"><span className="admin-request-avatar" aria-hidden="true">{row.customer.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('') || '?'}</span><div><h2>{row.customer.name}</h2><p>{row.booking.kind === 'court' ? rentalCourtLabel(row.court) : 'Private course'}{row.booking.kind !== 'court' && row.court && <span> · {rentalCourtLabel(row.court)}</span>}</p><small>{row.booking.code}</small></div></div>
        <div className="admin-request-session"><p><CalendarDays size={15} aria-hidden="true"/><strong>{formatBookingDate(row.booking.date, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB')}</strong></p><p><Clock3 size={14} aria-hidden="true"/>{normalizeBookingTime(row.booking.time)}</p></div>
        <div className="admin-refund-amount"><span>{done ? 'Refund amount' : 'Amount paid'}</span><strong>{done ? money(row.refund!.amount) : row.paidAmount == null ? 'Needs review' : money(row.paidAmount)}</strong>{row.refund && <small>{row.refund.method==='CASH'?<Banknote size={13} aria-hidden="true"/>:<CreditCard size={13} aria-hidden="true"/>}{row.refund.method === 'CASH' ? 'Cash' : 'Online payment'}</small>}</div>
        <div className="admin-refund-action"><span className="admin-request-status" data-tone={done ? 'success' : state === 'rejected' ? 'muted' : 'pending'}><StatusIcon size={14} aria-hidden="true"/>{states[state]}</span><Button variant={done || row.blocked ? 'secondary' : 'primary'} onClick={() => onOpen(row.booking.id)}>{done ? 'View Refund' : row.blocked ? 'View Details' : 'Process Refund'}</Button></div>
        {row.blocked && !done && <p className="admin-refund-blocked"><CircleAlert size={14} aria-hidden="true"/>{row.blocked}</p>}
      </article>;
    })}</div>}
    {loaded && !error && <HistoryPagination page={current} totalPages={pages} total={filtered.length} pageSize={10} noun="refunds" label="Admin refund request pagination" disabled={loading} onPage={setPage}/>}
  </section>;
}
