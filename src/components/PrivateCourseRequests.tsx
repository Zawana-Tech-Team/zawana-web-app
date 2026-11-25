import { ActionRequiredIndicator } from './operational-actions/OperationalActionUI';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, MapPin, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { get } from '../api';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { normalizeBookingTime } from '../utils/bookingTime';
import { BookingStatusBadge, bookingStatusLabel } from './BookingStatusBadge';
import { Button, Empty } from './UI';
import { Select } from './Select';
import { DeskDialog } from './court-desk/DeskDialog';
import { HistoryPagination } from './member-booking/HistoryPagination';

type CourseBooking = {
  id: string; code: string; title: string; date: string; time: string; location: string;
  price: number; status: string; paymentStatus: string; createdAt: string; paymentExpiresAt?: string;
  user?: { name: string; email?: string; phone?: string };
  court?: { name: string }; coach?: { name: string };
};
const initialFilters = { q: '', status: '', coachId: '', from: '', to: '' };
const statuses = ['PENDING_COACH_CONFIRMATION', 'AWAITING_PAYMENT', 'CONFIRMED', 'COACH_DECLINED', 'EXPIRED', 'CANCELLED', 'COMPLETED'];
const money = (value: number) => `${value.toLocaleString('en-GB')} MMK`;
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Yangon' });
const timestampLabel = (date: string) => new Date(date).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Yangon' });
const paymentLabel = (status: string) => status.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());

export function PrivateCourseRequests({ coaches }: { coaches: { id: string; name: string }[] }) {
  const revision = useBookingRevision();
  const [rows, setRows] = useState<CourseBooking[]>([]);
  const [page, setPage] = useState(1);
  const [info, setInfo] = useState({ total: 0, totalPages: 0 });
  const [filters, setFilters] = useState(initialFilters);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CourseBooking | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const loadedQuery = useRef('');
  const loadedDetail = useRef('');
  const selectedId = selected?.id;
  useEffect(() => {
    let live = true;
    const queryKey = JSON.stringify([page, filters]);
    setLoading(loadedQuery.current !== queryKey); setRefreshing(true); setError('');
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ kind: 'private_course', page: String(page), limit: '10' });
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      get<{ data: CourseBooking[]; pagination: typeof info }>(`/bookings?${params}`)
        .then(result => {
          if (!live) return;
          const pages = Math.max(1, result.pagination.totalPages);
          if (page > pages) { setPage(pages); return; }
          loadedQuery.current = queryKey;
          setRows(result.data); setInfo(result.pagination);
        })
        .catch((cause: Error) => { if (live) setError(cause.message || 'Could not load booking requests.'); })
        .finally(() => { if (live) { setLoading(false); setRefreshing(false); } });
    }, filters.q ? 250 : 0);
    return () => { live = false; window.clearTimeout(timer); };
  }, [page, filters, revision, reload]);

  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    setDetailLoading(loadedDetail.current !== selectedId); setDetailError('');
    get<{ data: CourseBooking[] }>(`/bookings?kind=private_course&booking=${encodeURIComponent(selectedId)}&page=1&limit=1`)
      .then(result => {
        if (!live) return;
        if (!result.data[0]) { setDetailError('This booking is no longer available.'); return; }
        loadedDetail.current = selectedId;
        setSelected(result.data[0]);
      })
      .catch((cause: Error) => { if (live) setDetailError(cause.message || 'Could not refresh this booking.'); })
      .finally(() => { if (live) setDetailLoading(false); });
    return () => { live = false; };
  }, [selectedId, revision, reload]);

  const change = (key: keyof typeof filters, value: string) => { setPage(1); setFilters(current => ({ ...current, [key]: value })); };
  const filtered = Object.values(filters).some(Boolean);
  return <section className="private-course-requests" aria-label="Private course booking requests" aria-busy={refreshing}>
    <div className="private-course-request-tools">
      <label className="private-course-search"><Search size={17} aria-hidden="true"/><input aria-label="Search course requests" placeholder="Find a member, course or booking" value={filters.q} onChange={event => change('q', event.target.value)}/></label>
      <Select aria-label="Booking status" value={filters.status} onChange={event => change('status', event.target.value)}>
        <option value="">All statuses</option>{statuses.map(status => <option key={status} value={status}>{bookingStatusLabel(status)}</option>)}
      </Select>
      <Select aria-label="Coach" value={filters.coachId} onChange={event => change('coachId', event.target.value)}>
        <option value="">All coaches</option>{coaches.map(coach => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
      </Select>
      <Button variant="secondary" aria-label="Refresh booking requests" disabled={refreshing} onClick={() => setReload(value => value + 1)}><RefreshCw size={16} aria-hidden="true"/></Button>
    </div>
    <div className="private-course-filter-options">
      <details><summary><SlidersHorizontal size={15} aria-hidden="true"/>Date range{(filters.from || filters.to) && <span>Applied</span>}</summary>
        <div className="private-course-date-filters"><label>From date<input type="date" aria-label="From date" max={filters.to || undefined} value={filters.from} onChange={event => change('from', event.target.value)}/></label><label>To date<input type="date" aria-label="To date" min={filters.from || undefined} value={filters.to} onChange={event => change('to', event.target.value)}/></label></div>
      </details>
      {filtered && <Button variant="ghost" onClick={() => { setPage(1); setFilters(initialFilters); }}>Clear filters</Button>}
    </div>
    {error ? <div className="private-course-error" role="alert"><p>{error}</p><Button variant="secondary" onClick={() => setReload(value => value + 1)}>Retry requests</Button></div>
      : loading ? <div role="status" className="private-course-loading">Loading booking requests…</div>
      : rows.length ? <div className="private-course-request-list">{rows.map(booking => <article key={booking.id} aria-label={`Booking ${booking.code}`}>
        <div className="private-course-request-identity"><h2>{booking.title}</h2><p>{booking.user?.name || 'Member'} <span aria-hidden="true">·</span> {booking.coach?.name || 'Coach pending'}</p></div>
        <div className="private-course-request-session"><CalendarDays size={17} aria-hidden="true"/><div><strong>{dateLabel(booking.date)}</strong><p>{normalizeBookingTime(booking.time)}</p></div></div>
        <div className="private-course-request-court"><MapPin size={16} aria-hidden="true"/><span>{booking.court?.name || booking.location || 'Court pending'}</span></div>
        <div className="private-course-request-payment"><strong>{money(booking.price)}</strong><p>Payment · {paymentLabel(booking.paymentStatus)}</p></div>
        <div className="private-course-request-actions"><BookingStatusBadge status={booking.status}/><ActionRequiredIndicator bookingId={booking.id}/><Button variant="secondary" aria-label={`View booking ${booking.code}`} onClick={() => setSelected(booking)}>View Details<ArrowUpRight size={15} aria-hidden="true"/></Button></div>
      </article>)}</div>
      : <Empty title={filtered ? 'No matching requests' : 'No booking requests yet'} body={filtered ? 'Try a different status, coach or date range.' : 'Private course bookings will appear here.'}/>}
    {!error && !loading && <HistoryPagination page={page} totalPages={info.totalPages} total={info.total} pageSize={10} noun="requests" label="Private course request pagination" disabled={refreshing} onPage={setPage}/>}
    {selected && <DeskDialog title="Private course booking details" heading={selected.title} size="compact" className="private-course-detail" onClose={() => setSelected(null)} cancelLabel="Close"
      actions={!detailError && !detailLoading && <Link className="private-course-primary-link" to={`/admin/court-rentals?history=1&kind=private_course&booking=${encodeURIComponent(selected.id)}`}>Open booking<ArrowUpRight size={16} aria-hidden="true"/></Link>}>
      {detailError ? <div className="private-course-error" role="alert"><p>{detailError}</p><Button variant="secondary" onClick={() => setReload(value => value + 1)}>Retry details</Button></div>
        : detailLoading ? <p role="status">Refreshing booking…</p> : <>
          <BookingStatusBadge status={selected.status}/>
          <section className="private-course-detail-session" aria-label="Booked session"><CalendarDays size={21} aria-hidden="true"/><div><strong>{dateLabel(selected.date)}</strong><p>{normalizeBookingTime(selected.time)}</p><p>{selected.court?.name || selected.location || 'Court pending'}</p></div></section>
          <dl className="private-course-detail-facts">
            <div><dt>Member</dt><dd>{selected.user?.name || 'Member'}{selected.user?.email && <a href={`mailto:${selected.user.email}`}>{selected.user.email}</a>}{selected.user?.phone && <a href={`tel:${selected.user.phone}`}>{selected.user.phone}</a>}</dd></div>
            <div><dt>Coach</dt><dd>{selected.coach?.name || 'Coach pending'}</dd></div>
            <div><dt>Booking total</dt><dd className="private-course-detail-amount">{money(selected.price)}<span>Payment · {paymentLabel(selected.paymentStatus)}</span></dd></div>
            {selected.paymentExpiresAt && <div><dt>Payment deadline</dt><dd>{timestampLabel(selected.paymentExpiresAt)}<span>Yangon time</span></dd></div>}
            <div><dt>Reference</dt><dd>{selected.code}</dd></div>
            <div><dt>Requested</dt><dd>{timestampLabel(selected.createdAt)}<span>Yangon time</span></dd></div>
          </dl>
        </>}
    </DeskDialog>}
  </section>;
}
