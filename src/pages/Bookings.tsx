import { ArrowUpRight, CalendarDays, ChevronDown, Clock3, Search, SlidersHorizontal, UserRound } from 'lucide-react';
import '../components/member-booking/booking-history.css';
import { useBookingRevision } from '../hooks/useBookingRevision';
import '../components/member-booking/member-booking.css';
import { DeskDialog } from '../components/court-desk/DeskDialog';
import { MemberRefundHistory } from '../components/RefundWorkflow';
import { BookingRequestInbox } from '../components/BookingRequestWorkflow';
import { deskRescheduleEligibility } from '../utils/deskRescheduleEligibility';
import { PrivateRescheduleDialog, PrivateRescheduleInbox } from '../components/PrivateRescheduling';
import { startPayment } from '../services/paymentFlow';
import { courtReschedulePath } from '../types/courtChanges';
import { CourtChangeDialog } from "../components/CourtChangeDialog";
import { normalizeBookingTime } from "../utils/bookingTime";
import { SegmentedControl } from '../components/Interactions';
import { Select } from '../components/Select';
import { useCallback, useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Badge, Page, Empty, Pagination } from "../components/UI";
import { get, patch, post } from "../api";
import { formatBookingDate, localDateKey, type BookingDatePreset } from "../utils/bookingDates";
import { useLanguage } from "../context/LanguageContext";

type BookingFilter = {
  datePreset: BookingDatePreset;
  q: string;
  kind: string;
  status: string;
  courtId: string;
  coachId: string;
  from: string;
  to: string
};
type PageInfo = { page: number; limit: number; total: number; totalPages: number };
type DateCounts = Record<BookingDatePreset, number>;
const EMPTY_COUNTS: DateCounts = { today: 0, yesterday: 0, upcoming: 0, all: 0 };
const EMPTY_PAGE: PageInfo = { page: 1, limit: 20, total: 0, totalPages: 0 };
const ACTIVE_STATUSES = [
  "confirmed",
  "CONFIRMED",
  "pending",
  "PENDING_COACH_CONFIRMATION",
  "AWAITING_PAYMENT"
];

export function Bookings() {
  const { locale } = useLanguage();
  const [searchParams] = useSearchParams();
  const categoryParam = searchParams.get('kind') || '';
  const requestId = searchParams.get('request');
  const batchId = searchParams.get('batch');
  const refundId = searchParams.get('refund');
  const [view, setView] = useState(() => requestId || batchId ? 'requests' : refundId || window.location.hash === '#refunds' ? 'refunds' : 'bookings');
  useEffect(() => { if (requestId || batchId) setView('requests'); else if (refundId) setView('refunds'); }, [requestId, batchId, refundId]);
  const revision = useBookingRevision();
  const loadGeneration = useRef(0);
  const lastQuery = useRef('');
  const [bookings, setBookings] = useState<any[]>([]);
  const [courts, setCourts] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [privateChange, setPrivateChange] = useState<any>(null);
  const [changeBooking, setChangeBooking] = useState<string | null>(null);
  const [cancelCandidate, setCancelCandidate] = useState<any>(null);
  const [paymentCandidate, setPaymentCandidate] = useState<any>(null);
  const [cancelling, setCancelling] = useState("");
  const [paying, setPaying] = useState("");
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<PageInfo>(EMPTY_PAGE);
  const [dateCounts, setDateCounts] = useState<DateCounts>(EMPTY_COUNTS);
  const [filters, setFilters] = useState<BookingFilter>({
    datePreset: "all",
    q: "",
    kind: ['court','private_course','class'].includes(categoryParam) ? categoryParam : '',
    status: "",
    courtId: "",
    coachId: "",
    from: "",
    to: ""
  });

  useEffect(() => {
    setPage(1);
    setFilters(current => ({ ...current, kind: ['court','private_course','class'].includes(categoryParam) ? categoryParam : '' }));
  }, [categoryParam]);

  useEffect(() => {
    get<any>("/member/booking-filters")
      .then(data => {
        setCourts(data.courts || []);
        setCoaches(data.coaches || []);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
      referenceDate: localDateKey(),
      datePreset: filters.datePreset
    });
    for (const [key, value] of Object.entries(filters))
      if (value && key !== "datePreset") params.set(key, value);
    const result = await get<any>(`/bookings?${params}`);
    if (generation !== loadGeneration.current) return;
    setBookings(result.data || []);
    setPageInfo(result.pagination || EMPTY_PAGE);
    setDateCounts({ ...EMPTY_COUNTS, ...(result.dateCounts || {}) });
  }, [filters, page]);

  useEffect(() => {
    let active = true;
    const generationRef = loadGeneration;
    const query = JSON.stringify({ filters, page });
    if (query !== lastQuery.current) { setLoading(true); lastQuery.current = query; }
    setError("");
    const timer = window.setTimeout(
      () => {
        load()
          .catch((e: any) => {
            if (active) setError(e.message || "Could not load bookings.");
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      filters.q ? 250 : 0
    );
    return () => {
      active = false;
      ++generationRef.current;
      window.clearTimeout(timer);
    };
  }, [load, filters, page, revision]);


  const updateFilters = (next: Partial<BookingFilter>) => {
    setPage(1);
    setFilters(current => ({ ...current, ...next }));
  };
  const setPreset = (datePreset: BookingDatePreset) =>
    updateFilters({ datePreset, from: "", to: "" });

  const cancel = async (booking: any) => {
    if (booking.kind === "court") { setChangeBooking(booking.id); return; }
    setCancelling(booking.id);
    setError("");
    setMessage("");
    try {
      if (booking.kind === "private_course")
        await post(`/member/private-courses/${booking.id}/cancel`, {});
      else await patch(`/bookings/${booking.id}/status`, { status: "cancelled" });
      setCancelCandidate(null);
      setMessage("Booking cancelled.");
      await load();
    } catch (e: any) {
      setError(e.message || "Could not cancel this booking.");
    } finally {
      setCancelling("");
    }
  };

  const confirmCourse = async (booking: any) => {
    if (paying) return;
    setPaying(booking.id);
    setError("");
    setMessage("");
    try {
      await startPayment('/payments/confirm', { resourceType: 'booking', resourceId: booking.id });
      setPaymentCandidate(null);
      setMessage('Manual/simulated payment confirmed. No external charge was made.');
      await load();
    } catch (e: any) {
      setError(e.message || "Could not confirm this private course.");
    } finally {
      setPaying("");
    }
  };

  const statusLabel = (value: string) =>
    ({
        PENDING: "Pending",
        PENDING_COACH_CONFIRMATION: "Waiting for coach",
        AWAITING_PAYMENT: "Payment required",
        COACH_DECLINED: "Coach declined",
        EXPIRED: "Expired",
        CONFIRMED: "Confirmed",
        COMPLETED: "Completed",
        CANCELLED: "Cancelled"
      } as Record<string, string>
    )[value.toUpperCase()] || String(value).replaceAll("_", " ");
  const presets: { id: BookingDatePreset; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "upcoming", label: "Upcoming" },
    { id: "all", label: "All" }
  ];

  return <Page title="Booking history" eyebrow="Your activity" actions={<Link className="booking-history-new" to="/book/court">Book a court <ArrowUpRight size={16} aria-hidden="true"/></Link>}>
    <div className="booking-history">
      <SegmentedControl label="Booking management" className="member-booking-management mb-6" value={view} onChange={setView} options={[{value:'bookings',label:'Bookings'},{value:'requests',label:'Requests'},{value:'refunds',label:'Refunds'}]} />
      {view === 'refunds' && <MemberRefundHistory onViewRequests={() => setView('requests')} />}
      {view === 'requests' && <><BookingRequestInbox /><PrivateRescheduleInbox memberView onChanged={() => { void load(); }} /></>}
      {privateChange && <PrivateRescheduleDialog booking={privateChange} onClose={() => setPrivateChange(null)} onChanged={() => { setMessage('Your proposal was sent to the coach. Your original session stays booked.'); setView('requests'); void load(); }} />}

    {error &&
      <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
        {error}
      </p>}
    {message &&
      <p
        role="status"
        className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"
      >
        {message}
      </p>}
    {view === 'bookings' && <>
    <section className="booking-history-overview" aria-label="Booking overview">
      <div className="booking-history-intro"><span className="booking-history-symbol"><CalendarDays size={23} strokeWidth={1.5} aria-hidden="true"/></span><div><h2>Your sessions, at a glance.</h2><p>Keep track of your courts, coaching and schedule changes.</p></div></div>
      <div className="booking-history-metrics">{[{id:'today' as const,label:'Today'},{id:'upcoming' as const,label:'Upcoming'},{id:'all' as const,label:'All bookings'}].map(item => <button key={item.id} type="button" onClick={() => setPreset(item.id)} aria-pressed={filters.datePreset === item.id && !filters.from && !filters.to}><span>{item.label}</span><strong>{loading ? '—' : dateCounts[item.id].toLocaleString(locale)}</strong></button>)}</div>
    </section>
    <SegmentedControl label="Booking category" className="member-booking-categories mb-5" value={filters.kind} onChange={kind => updateFilters({kind})} options={[{value:'',label:'All bookings'},{value:'court',label:'Court rental'},{value:'private_course',label:'Private course'},{value:'class',label:'Weekly class'}]} />
    <div className="booking-history-tools">
      <label className="booking-history-search"><Search size={18} aria-hidden="true"/><input aria-label="Search bookings" placeholder="Search booking, court or coach" value={filters.q} onChange={event => updateFilters({q:event.target.value})}/></label>

      <details className="booking-history-filters"><summary className="member-booking-disclosure"><SlidersHorizontal size={16} aria-hidden="true"/>Filters{Object.entries(filters).some(([key,value]) => !['datePreset','kind'].includes(key) && value) ? ' · Active' : ''}</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <div className="booking-history-dates"><Select aria-label="Booking dates" value={filters.from || filters.to ? 'custom' : filters.datePreset} onChange={event => setPreset(event.target.value as BookingDatePreset)}>
        {(filters.from || filters.to) && <option value="custom">Custom dates</option>}
        {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.label} · {dateCounts[preset.id]}</option>)}
      </Select></div>
        <Select
          aria-label="Booking status"
          value={filters.status}
          onChange={e => updateFilters({ status: e.target.value })}
        >
          <option value="">All statuses</option>
          {[
            "CONFIRMED",
            "COMPLETED",
            "CANCELLED",
            "pending",
            "PENDING_COACH_CONFIRMATION",
            "AWAITING_PAYMENT",
            "COACH_DECLINED",
            "EXPIRED"
          ].map(s =>
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          )}
        </Select>
        <Select
          aria-label="Court"
          value={filters.courtId}
          onChange={e => updateFilters({ courtId: e.target.value })}
        >
          <option value="">All courts</option>
          {courts.map(c =>
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          )}
        </Select>
        <Select
          aria-label="Coach"
          value={filters.coachId}
          onChange={e => updateFilters({ coachId: e.target.value })}
        >
          <option value="">All coaches</option>
          {coaches.map(c =>
            <option key={c.id} value={c.id}>
              {c.name}
            </option>)}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <input
            aria-label="From date"
            type="date"
            value={filters.from}
            onChange={e => updateFilters({ from: e.target.value, datePreset: "all" })}
          />
          <input
            aria-label="To date"
            type="date"
            value={filters.to}
            onChange={e => updateFilters({ to: e.target.value, datePreset: "all" })}
          />
        </div>
      </div>
      {(filters.q ||
        filters.status ||
        filters.courtId ||
        filters.coachId ||
        filters.from ||
        filters.to) &&
        <button
          className="text-sm font-bold text-zawana-accent"
          onClick={() => {
            setPage(1);
            setFilters({
              datePreset: "all",
              q: "",
              kind: filters.kind,
              status: "",
              courtId: "",
              coachId: "",
              from: "",
              to: ""
            });
          }}
        >Clear filters</button>}
      </details>
    </div>
    <div className="booking-history-list-heading"><h2>{filters.datePreset === 'upcoming' ? 'Upcoming sessions' : filters.datePreset === 'today' ? 'Today’s sessions' : 'Your sessions'}</h2><span>{loading ? 'Updating…' : `${pageInfo.total.toLocaleString(locale)} booking${pageInfo.total === 1 ? '' : 's'}`}</span></div>
    {loading ?
      <div className="booking-history-loading" role="status"><span className="sr-only">Loading bookings…</span>{[0,1,2].map(item => <div key={item} className="booking-history-skeleton" aria-hidden="true"><span/><div><i/><i/></div></div>)}</div> :
      <div className="space-y-3">
        {bookings.map(booking =>
          <details key={booking.id} className="member-booking-row">
            <summary className="booking-history-card-summary">
              <span className="booking-history-date" aria-hidden="true"><span>{formatBookingDate(booking.date, {month:'short'}, locale)}</span><strong>{formatBookingDate(booking.date, {day:'2-digit'}, locale)}</strong><small>{formatBookingDate(booking.date, {year:'numeric'}, locale)}</small></span>
              <div className="booking-history-card-main"><p className="booking-history-kind">{booking.kind === 'private_course' ? <UserRound size={13} aria-hidden="true"/> : <CalendarDays size={13} aria-hidden="true"/>}{({court:'Court rental',private_course:'Private course',pt:'Other booking',class:'Weekly class'} as Record<string,string>)[booking.kind] || booking.kind}</p><h3>{booking.court?.name || booking.title || booking.location}</h3><p className="booking-history-session"><Clock3 size={14} aria-hidden="true"/><span>{normalizeBookingTime(booking.time || '')}</span></p><span className="sr-only">{formatBookingDate(booking.date, {month:'long',day:'numeric',year:'numeric'}, locale)}</span>{booking.coach && <p className="booking-history-coach">With {booking.coach.name}</p>}</div>
              <div className="booking-history-card-state"><span className="booking-history-status" data-tone={['confirmed','completed'].includes(String(booking.status).toLowerCase()) ? 'confirmed' : ['cancelled','expired','coach_declined'].includes(String(booking.status).toLowerCase()) ? 'muted' : 'pending'}><span aria-hidden="true"/>{statusLabel(booking.status)}</span><p className="booking-history-price">{Number(booking.price).toLocaleString(locale)} <small>MMK</small></p><span className="booking-history-payment">{booking.paymentStatus === 'paid' ? 'Paid' : booking.paymentStatus === 'refunded' ? 'Refunded' : 'Payment pending'}</span></div>
              <span className="booking-history-expand"><span className="member-booking-row__more">View booking</span><span className="member-booking-row__less">Hide details</span><ChevronDown size={18} aria-hidden="true"/></span>
            </summary>
            <div className="booking-history-card-details">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h4 className="mb-2 text-sm font-semibold">{booking.title}</h4>
                <div className="flex flex-wrap items-center gap-2">
                  {booking.kind === "private_course" &&
                    <Badge>
                      {booking.paymentStatus === "paid"
                        ? "Paid"
                        : booking.status === "AWAITING_PAYMENT"
                          ? "Payment required"
                          : booking.status === "CONFIRMED" && booking.paymentStatus !== "paid"
                            ? "Payment due at venue"
                            : booking.status === "PENDING_COACH_CONFIRMATION"
                              ? "Court reserved"
                              : "Private course"}
                    </Badge>}
                </div>
                {booking.kind === 'private_course' && booking.paymentStatus !== 'pending' && <p className="mt-2 text-xs text-zawana-500">{({ SIMULATED: 'Simulated payment', ONLINE: 'Paid Online', BADMINTON_FO: 'Paid at Badminton Front Office', COACH: 'Paid directly to Coach' } as Record<string, string>)[booking.privateCoursePayment?.paymentSource] || 'Legacy Payment — Source Unknown'}</p>}
                {booking.coach && <p className="mt-2 text-sm text-zawana-500">Coach: {booking.coach.name}</p>}
                <p className="mt-1 text-xs text-zawana-500">
                  {booking.code} · {Number(booking.price).toLocaleString(locale)} MMK</p>
                {booking.kind === "private_course" && booking.status === "AWAITING_PAYMENT" &&
                  <p className="mt-2 text-sm font-bold text-amber-800">Coach accepted. Confirm manual/simulated payment within 24 hours to confirm your session.</p>}
                {booking.kind === "private_course" &&
                  booking.status === "CONFIRMED" &&
                  booking.paymentStatus !== "paid" &&
                    <p className="mt-2 text-sm text-zawana-500">Your coach, court and time are confirmed. Payment has not been collected; please arrange it at the venue.</p>}
                {booking.kind === "private_course" &&
                  booking.status === "PENDING_COACH_CONFIRMATION" &&
                    <p className="mt-2 text-sm text-amber-800">Waiting for coach confirmation. Your selected court and time are reserved.</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {booking.kind === 'private_course' && booking.status.toLowerCase() === 'confirmed' && <div className="space-y-2">
                  <Button variant="secondary" disabled={!deskRescheduleEligibility('member', booking.date, booking.time).eligible} onClick={() => setPrivateChange(booking)}>Change Date / Time</Button>
                  <p className="max-w-xs text-xs text-zawana-500">{deskRescheduleEligibility('member', booking.date, booking.time).eligible ? 'Your coach approves the new schedule. Your original session stays reserved.' : 'Requests require at least 24 hours before the session.'}</p>
                </div>}
                {booking.kind === "court" && <Button variant="secondary" onClick={() => setChangeBooking(booking.id)}>Details & history</Button>}
                {booking.kind === "court" && booking.status.toLowerCase() === "confirmed" && <Link to={courtReschedulePath(booking.id)}><Button variant="secondary">Change Date / Time</Button></Link>}
                {booking.kind !== 'court' && booking.paymentStatus === 'pending' && (booking.status === 'AWAITING_PAYMENT' || (booking.kind !== 'private_course' && booking.status.toLowerCase() === 'confirmed')) &&
                  <Button loading={paying === booking.id} disabled={!!paying} onClick={() => { setError(''); setPaymentCandidate(booking); }}>
                    {paying === booking.id ? "Starting payment…" : "Confirm manual payment"}
                  </Button>}
                {ACTIVE_STATUSES.includes(booking.status) &&
                  <Button
                    variant="danger"
                    disabled={cancelling === booking.id}
                    onClick={() => { setError(''); if (booking.kind === 'court') void cancel(booking); else setCancelCandidate(booking); }}
                  >
                    {cancelling === booking.id ? "Cancelling…" : "Cancel"}
                  </Button>}
              </div>
            </div>
            </div>
          </details>)}
        {!bookings.length &&
          <Empty
            title="No bookings match these filters"
            body="Try another date or clear a filter. New court rentals and private courses will appear here."
            action={
              <Link to={filters.kind === 'private_course' ? '/private-course' : '/book/court'}>
                <Button>{filters.kind === 'private_course' ? 'Book a private course' : 'Book a court'}</Button>
              </Link>
            }
          />}
        <Pagination
          page={pageInfo.page || page}
          totalPages={pageInfo.totalPages || 0}
          total={pageInfo.total || 0}
          onPage={setPage}
        />
      </div>}
    </>}
    {cancelCandidate && <DeskDialog title="Cancel booking?" size="compact" onClose={() => setCancelCandidate(null)} busy={!!cancelling} cancelLabel="Keep booking" actions={<Button variant="danger" loading={!!cancelling} onClick={() => void cancel(cancelCandidate)}>Cancel booking</Button>}><p className="text-sm">Cancel {cancelCandidate.title} on {cancelCandidate.date} at {normalizeBookingTime(cancelCandidate.time || '')}?</p>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}</DeskDialog>}
    {paymentCandidate && <DeskDialog title="Confirm manual payment" size="compact" onClose={() => setPaymentCandidate(null)} busy={!!paying} cancelLabel="Back" summary={<strong>{Number(paymentCandidate.price).toLocaleString(locale)} MMK</strong>} actions={<Button loading={!!paying} onClick={() => void confirmCourse(paymentCandidate)}>Confirm payment</Button>}><p className="text-sm">{paymentCandidate.title} · {paymentCandidate.date} · {normalizeBookingTime(paymentCandidate.time || '')}</p><p className="mt-4 text-sm text-zawana-500">This records a manual/simulated payment. No external charge will be made.</p>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}</DeskDialog>}
    {changeBooking && <CourtChangeDialog bookingId={changeBooking} onClose={() => setChangeBooking(null)} onChanged={() => void load()} />}
    </div>
  </Page>;
}
