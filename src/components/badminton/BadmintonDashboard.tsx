import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, CheckCircle2, ChevronRight, CircleAlert, ClipboardList, Clock3, CreditCard, PackagePlus, RefreshCw, RotateCcw, ScanLine } from 'lucide-react';
import { get } from '../../api';
import { useBookingRevision } from '../../hooks/useBookingRevision';
import { usePaymentRevision } from '../../hooks/usePaymentRevision';
import { useBookingClock } from '../../hooks/useBookingClock';
import { bookingStart, normalizeBookingTime } from '../../utils/bookingTime';
import { formatBookingDate } from '../../utils/bookingDates';
import { rentalCourtLabel } from '../court-desk/RentalReschedulePresentation';
import { BookingStatusBadge } from '../BookingStatusBadge';
import { Button } from '../UI';
import './badminton-dashboard.css';

type Metrics = { revenueToday: number; bookingsToday: number; checkInsToday: number };
type Booking = { id: string; kind: string; title: string; date: string; time: string; status: string; meta?: string; user?: { name: string }; court?: { name: string; floor?: string }; coach?: { name: string } };
type BookingPage = { data: Booking[]; pagination: { totalPages: number } };
type ClassBlock = { id: string; title: string; courtName?: string; start: string; end: string; type: string; active?: boolean };
type Request = { kind: string; status: string };
type Refund = { booking: { paymentStatus: string }; request: { status: string } | null; refund: { id: string } | null };
type Session = { id: string; title: string; subtitle: string; time: string; status: string; kind: string; href: string };
const loadMetrics = () => get<Metrics>('/dashboard');
const loadRequests = () => get<Request[]>('/rescheduling/requests');
const loadRefunds = () => get<Refund[]>('/rescheduling/refunds');

/** Retain successful data on refresh, while rejecting results from an older day/read. */
function useDeskRead<T>(load: () => Promise<T>, day: string, refreshKey: string) {
  const [result, setResult] = useState<{ day: string; value: T } | null>(null);
  const [failure, setFailure] = useState<{ day: string; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  useEffect(() => {
    let live = true;
    setRefreshing(true);
    void load().then(value => { if (live) { setResult({ day, value }); setFailure(null); } })
      .catch((error: unknown) => { if (live) setFailure({ day, message: error instanceof Error ? error.message : 'Could not load this section.' }); })
      .finally(() => { if (live) setRefreshing(false); });
    return () => { live = false; };
  }, [load, day, refreshKey]);
  return { data: result?.day === day ? result.value : null, error: failure?.day === day ? failure.message : '', refreshing };
}

function customer(booking: Booking) {
  try { const name = JSON.parse(booking.meta || '{}').customerName; if (typeof name === 'string' && name.trim()) return name; } catch { /* Use the linked account for older records. */ }
  return booking.user?.name || 'Customer';
}
const endMinute = (time: string) => bookingStart(normalizeBookingTime(time).split(/\s*(?:—|–|-|to)\s*/i)[1] || '');

export function BadmintonDashboard() {
  const now = useBookingClock(), bookingRevision = useBookingRevision(), paymentRevision = usePaymentRevision();
  const [reload, setReload] = useState(0);
  const refreshKey = `${bookingRevision}:${paymentRevision}:${reload}`;
  const loadBookings = useCallback(async () => {
    const path = `/bookings?date=${now.date}&limit=100`;
    const first = await get<BookingPage>(`${path}&page=1`);
    const rest = await Promise.all(Array.from({ length: Math.max(0, first.pagination.totalPages - 1) }, (_, index) => get<BookingPage>(`${path}&page=${index + 2}`)));
    return [...new Map([first, ...rest].flatMap(page => page.data).map(row => [row.id, row])).values()];
  }, [now.date]);
  const loadClasses = useCallback(() => get<ClassBlock[]>(`/court-blocks?date=${now.date}`), [now.date]);
  const metrics = useDeskRead(loadMetrics, now.date, refreshKey), bookings = useDeskRead(loadBookings, now.date, refreshKey);
  const classes = useDeskRead(loadClasses, now.date, refreshKey), requests = useDeskRead(loadRequests, now.date, refreshKey);
  const refundReviews = useDeskRead(loadRefunds, now.date, refreshKey);
  const refreshing = metrics.refreshing || bookings.refreshing || classes.refreshing || requests.refreshing || refundReviews.refreshing;
  const failures = [['Today’s totals', metrics.error], ['Bookings', bookings.error], ['Weekly classes', classes.error], ['Requests', requests.error], ['Refunds', refundReviews.error]].filter(([, error]) => error);
  const hasStaleData = [metrics, bookings, classes, requests, refundReviews].some(section => !!section.error && section.data !== null);
  const schedule: Session[] = [
    ...(bookings.data || []).filter(row => ['court', 'private_course'].includes(row.kind) && ['pending', 'confirmed', 'pending_coach_confirmation', 'awaiting_payment'].includes(row.status.toLowerCase())).map(row => ({ id: row.id, title: row.kind === 'court' ? rentalCourtLabel(row.court || null) : row.title, subtitle: row.kind === 'court' ? customer(row) : `${customer(row)} · ${rentalCourtLabel(row.court || null)}${row.coach ? ` · ${row.coach.name}` : ''}`, time: normalizeBookingTime(row.time), status: row.status, kind: row.kind, href: `/badminton-fo/bookings?history=1&kind=${row.kind}&booking=${encodeURIComponent(row.id)}` })),
    ...(classes.data || []).filter(row => row.type === 'class' && row.active !== false).map(row => ({ id: `class:${row.id}`, title: row.title, subtitle: row.courtName || 'Court unavailable', time: `${row.start} — ${row.end}`, status: 'active', kind: 'weekly', href: '/badminton-fo/courts' })),
  ].filter(row => endMinute(row.time) > now.minute).sort((a, b) => bookingStart(a.time) - bookingStart(b.time) || a.title.localeCompare(b.title));
  const assistance = requests.data?.filter(row => row.kind === 'court' && ['ADMIN_HANDLING', 'AWAITING_ADDITIONAL_PAYMENT'].includes(row.status)).length;
  const refunds = refundReviews.data?.filter(row => !row.refund && row.booking.paymentStatus.toLowerCase() !== 'refunded' && row.request?.status !== 'REFUND_REJECTED').length;
  const scheduleReady = bookings.data !== null && classes.data !== null;
  return <div className="badminton-dashboard">
    <div className="badminton-dashboard-date"><p><CalendarDays size={16} aria-hidden="true"/>{formatBookingDate(now.date, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB')}</p><Button variant="secondary" disabled={refreshing} onClick={() => setReload(value => value + 1)}><RefreshCw size={15} aria-hidden="true"/>Refresh dashboard</Button></div>
    <nav className="badminton-dashboard-shortcuts" aria-label="Front desk actions">
      {[{ href: '/badminton-fo/courts', title: 'Court rental', caption: 'Availability & booking', Icon: CalendarDays }, { href: '/badminton-fo/check-in', title: 'Package check-in', caption: 'Scan or find a student', Icon: ScanLine }, { href: '/badminton-fo/packages', title: 'Activate package', caption: 'Members & walk-ins', Icon: PackagePlus }].map(({ href, title, caption, Icon }) => <Link key={href} to={href}><span><Icon size={22} strokeWidth={1.5} aria-hidden="true"/></span><div><strong>{title}</strong><p>{caption}</p></div><ArrowUpRight size={17} aria-hidden="true"/></Link>)}
    </nav>
    {!!failures.length && <div className="badminton-dashboard-error" role="alert"><CircleAlert size={18} aria-hidden="true"/><div>{failures.map(([section, error]) => <p key={section}><strong>{section}:</strong> {error}</p>)}{hasStaleData&&<p className="badminton-dashboard-stale">Previously loaded data is shown where available.</p>}</div><Button variant="secondary" disabled={refreshing} onClick={() => setReload(value => value + 1)}>Retry dashboard</Button></div>}
    {!metrics.data && !metrics.error ? <div className="badminton-dashboard-loading" role="status" aria-label="Loading dashboard totals">{[1, 2, 3].map(key => <div key={key}/>)}</div> : <section className="badminton-dashboard-metrics" aria-label="Today’s badminton totals">
      {[{ label: 'Net revenue today', value: metrics.data?.revenueToday.toLocaleString('en-GB') ?? '—', unit: 'MMK', href: '/badminton-fo/transactions', destination: 'Finance', Icon: CreditCard }, { label: 'Court rentals today', value: metrics.data?.bookingsToday.toLocaleString('en-GB') ?? '—', unit: '', href: '/badminton-fo/bookings', destination: 'Booking history', Icon: CalendarDays }, { label: 'Package check-ins today', value: metrics.data?.checkInsToday.toLocaleString('en-GB') ?? '—', unit: '', href: '/badminton-fo/attendance', destination: 'Attendance history', Icon: ScanLine }].map(({ label, value, unit, href, destination, Icon }) => <article key={label}><header><span>{label}</span><Icon size={18} strokeWidth={1.6} aria-hidden="true"/></header><p><strong>{value}</strong>{unit && <small>{unit}</small>}</p><Link to={href}>{destination}<ChevronRight size={14} aria-hidden="true"/></Link></article>)}
    </section>}
    <div className="badminton-dashboard-panels">
      <section className="badminton-dashboard-panel" aria-label="Today’s schedule"><header><h2>Today’s schedule</h2><span className="badminton-dashboard-caption">{schedule.length>6?'Next 6 · Yangon time':'Yangon time'}</span></header>
        {!scheduleReady && !bookings.error && !classes.error ? <p role="status" className="badminton-dashboard-note">Loading today’s sessions…</p> : schedule.length ? <ul className="badminton-dashboard-schedule">{schedule.slice(0, 6).map(row => <li key={row.id}><Link to={row.href}><div className="badminton-dashboard-session-time"><Clock3 size={14} aria-hidden="true"/>{row.time}</div><div className="badminton-dashboard-session"><small>{row.kind === 'court' ? 'Court rental' : row.kind === 'weekly' ? 'Weekly class' : 'Private course'}</small><h3>{row.title}</h3><p>{row.subtitle}</p></div><BookingStatusBadge status={row.status}/><ChevronRight size={15} aria-hidden="true"/></Link></li>)}</ul> : bookings.error || classes.error ? <p className="badminton-dashboard-note">Refresh to load the complete schedule.</p> : <div className="badminton-dashboard-empty"><CalendarDays size={30} strokeWidth={1.3} aria-hidden="true"/><h3>No more sessions today</h3><p>Open the court desk to check availability or make a booking.</p></div>}
      </section>
      <section className="badminton-dashboard-panel" aria-label="Front desk follow-up"><header><h2>Needs attention</h2></header><div className="badminton-dashboard-attention">
        <Link to="/badminton-fo/bookings?activity=requests"><span><ClipboardList size={19} aria-hidden="true"/></span><div><strong>Reschedule assistance</strong><p>Review customer requests</p></div><b>{assistance == null ? '—' : assistance}</b><ChevronRight size={15} aria-hidden="true"/></Link>
        <Link to="/badminton-fo/bookings?activity=refunds"><span><RotateCcw size={19} aria-hidden="true"/></span><div><strong>Refund requests</strong><p>Review before processing</p></div><b>{refunds == null ? '—' : refunds}</b><ChevronRight size={15} aria-hidden="true"/></Link>
      </div>{requests.data && refundReviews.data && !assistance && !refunds && <p className="badminton-dashboard-clear"><CheckCircle2 size={15} aria-hidden="true"/>No requests need staff action.</p>}</section>
    </div>
  </div>;
}
