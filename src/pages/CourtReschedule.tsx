import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { CourtBooking, type SlotPick } from './CourtBooking';
import { CourtBookingSteps } from '../components/CourtBookingSteps';
import { Button, Card, Empty, Page, Toast } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { get, post } from '../api';
import { bookingHasStarted } from '../utils/bookingTime';
import { courtBookingsPath, type CourtChangeDetail, type CourtChangeQuote } from '../types/courtChanges';

const day = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'long', year: 'numeric' });
const amount = (value: number) => `${value.toLocaleString()} MMK`;

export default function CourtReschedule() {
  const { id = '' } = useParams();
  return <RescheduleFlow key={id} bookingId={id} />;
}

function RescheduleFlow({ bookingId }: { bookingId: string }) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<CourtChangeDetail | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [quote, setQuote] = useState<CourtChangeQuote | null>(null);
  const [reason, setReason] = useState(''), [exceptionReason, setExceptionReason] = useState('');
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [showSuccess, setShowSuccess] = useState(true);
  const [busy, setBusy] = useState(false), [done, setDone] = useState<CourtChangeDetail['booking'] | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const base = `/court-booking/bookings/${encodeURIComponent(bookingId)}`;
  const backTo = courtBookingsPath(user?.role);

  useEffect(() => {
    let active = true;
    get<CourtChangeDetail>(`${base}/changes`).then(data => { if (active) setDetail(data); })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [base]);
  useEffect(() => {
    if (!quote && !done) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
    const heading = reviewRef.current?.querySelector<HTMLHeadingElement>('h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }, [quote, done]);

  const review = async (selection: SlotPick) => {
    setError('');
    const result = await post<CourtChangeQuote>(`${base}/reschedule/quote`, { date: selection.date, courtId: selection.courtId, time: selection.time, exceptionReason: exceptionReason || undefined });
    // Present the same current reservation that the quote revision will protect on commit.
    const fresh = await get<CourtChangeDetail>(`${base}/changes`);
    setDetail(fresh);
    if (fresh.revision !== result.revision) throw new Error('This reservation changed while the change was being reviewed. Please review it again.');
    setQuote(result);
  };
  const confirm = async () => {
    if (!quote || busy || reason.trim().length < 3 || quote.difference !== 0) return;
    setBusy(true); setError('');
    try {
      const changed = await post<CourtChangeDetail['booking']>(`${base}/reschedule`, {
        date: quote.proposed.date, courtId: quote.proposed.courtId, time: quote.proposed.time,
        revision: quote.revision, reason, exceptionReason: exceptionReason || undefined,
      });
      setDone(changed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This change could not be completed. Please review availability again.');
      try { setDetail(await get<CourtChangeDetail>(`${base}/changes`)); } catch { /* Keep the commit error and the last known reservation. */ }
      setQuote(null); setStep(2); setAvailabilityVersion(value => value + 1);
    } finally { setBusy(false); }
  };

  if (loading) return <Page title="Reschedule your court" eyebrow="Zawana Badminton Arena"><Card className="p-8"><p role="status" className="text-sm text-zawana-500">Loading your reservation…</p></Card></Page>;
  if (!detail) return <Page title="Reschedule your court" eyebrow="Zawana Badminton Arena"><Empty title="Reservation unavailable" body={error || 'This reservation could not be found.'} action={<Link to={backTo}><Button variant="secondary">Back to bookings</Button></Link>} /></Page>;
  const exceptionAllowed = user?.role === 'admin' && detail.exceptionsEnabled && detail.booking.status.toLowerCase() === 'confirmed' && !bookingHasStarted(detail.booking.date, detail.booking.time);
  if (!done && !detail.eligibility.eligible && !exceptionAllowed) return <Page title="Reschedule your court" eyebrow="Zawana Badminton Arena"><Empty title="This booking cannot be rescheduled" body={error || detail.eligibility.message} action={<Link to={backTo}><Button variant="secondary">Back to bookings</Button></Link>} /></Page>;

  if (done) return <div ref={reviewRef}><Page title="Court booking rescheduled" eyebrow="Zawana Badminton Arena">
    <Card className="mx-auto max-w-3xl overflow-hidden p-0"><div className="border-b border-zawana-border bg-zawana-900 p-6 sm:p-8"><span className="mb-5 grid h-12 w-12 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800"><Check size={22} /></span><h2 className="text-2xl font-semibold tracking-tight">Your new court time is confirmed.</h2><p className="mt-3 text-sm text-zawana-500">{done.code} · {detail.customer}</p></div>
      <div className="space-y-6 p-6 sm:p-8"><Session title="New reservation" court={done.title} date={done.date} time={done.time} /><div className="flex flex-wrap items-center justify-between gap-3 border-t border-zawana-border pt-5 text-sm"><span className="text-zawana-500">Booking amount</span><span className="font-semibold">{amount(done.price)}</span></div><p className="text-xs leading-6 text-zawana-500">Only this one-hour session has changed. Payment remains {done.paymentStatus}. Your rescheduling history is available in booking details.</p><Link to={backTo}><Button>Back to bookings<ArrowRight size={15} /></Button></Link></div>
    </Card>
    {showSuccess && <Toast message="Booking rescheduled successfully." onClose={() => setShowSuccess(false)} />}
  </Page></div>;

  return <>
    <div hidden={!!quote}>
      <CourtBooking reschedule={{ detail, step, onStepChange: setStep, backTo, onReview: review, exceptionReason, onExceptionReason: setExceptionReason, availabilityVersion, error }} />
    </div>
    {quote && <div ref={reviewRef}><Page title="Review your change" eyebrow="Zawana Badminton Arena" actions={<Link to={backTo} className="text-xs text-zawana-500 underline underline-offset-4">Back to bookings</Link>}>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="space-y-5"><CourtBookingSteps step={3} includeReview canChooseCourts canReview busy={busy} onChange={next => { if (next !== 3) { setQuote(null); setStep(next); } }} />
          <Card className="overflow-hidden p-0"><div className="border-b border-zawana-border p-5 sm:p-6"><h2 className="text-xl font-semibold tracking-tight">Check your new reservation</h2><p className="mt-2 text-sm text-zawana-500">Check your current and new court sessions before confirming.</p></div>
            <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6"><Session title="Current reservation" court={detail.booking.title} date={detail.booking.date} time={detail.booking.time} /><Session title="New reservation" court={quote.proposed.courtName} date={quote.proposed.date} time={quote.proposed.time} /></div>
          </Card>
          <Card className="p-5 sm:p-6"><label className="block text-sm font-medium">Reason<textarea aria-label="Reason" rows={3} maxLength={1000} disabled={busy} className="mt-3" placeholder="A short note about this change" value={reason} onChange={e => setReason(e.target.value)} /></label><p className="mt-3 text-xs text-zawana-500">This note is saved in your booking history.</p></Card>
          <button type="button" disabled={busy} className="flex min-h-11 items-center gap-2 text-xs font-medium text-zawana-500 underline underline-offset-4" onClick={() => { setQuote(null); setStep(2); }}><ArrowLeft size={14} />Edit court selection</button>
        </div>
        <Card className="h-fit overflow-hidden p-0 xl:sticky xl:top-24"><div className="border-b border-zawana-border bg-zawana-900 p-5"><p className="eyebrow text-zawana-accent">CHANGE SUMMARY</p><h2 className="mt-2 text-xl font-semibold">Confirm your change</h2><p className="mt-2 break-all text-xs text-zawana-500">{detail.booking.code} · {detail.customer}</p></div>
          <div className="space-y-5 p-5"><dl className="space-y-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-zawana-500">Current amount</dt><dd>{amount(detail.booking.price)}</dd></div><div className="flex justify-between gap-4"><dt className="text-zawana-500">New amount</dt><dd>{amount(quote.proposed.price)}</dd></div></dl><p className="border-t border-zawana-border pt-4 text-sm font-semibold">Price difference: {amount(quote.difference)}</p>
            {quote.difference !== 0 ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">Staff must arrange the payment adjustment before this move can be completed.</p> : <p className="text-xs leading-6 text-zawana-500">No additional payment is required. Your payment status stays {detail.booking.paymentStatus}.</p>}
            {!detail.eligibility.eligible && <div className="rounded-xl border border-zawana-border p-3 text-xs leading-6"><p className="font-medium">Manager exception</p><p className="mt-1 text-zawana-500">{exceptionReason}</p></div>}
            <Button className="w-full" disabled={busy || reason.trim().length < 3 || quote.difference !== 0} loading={busy} onClick={confirm}>Confirm reschedule<ArrowRight size={15} /></Button><p className="text-center text-[11px] leading-6 text-zawana-500">Your current court stays reserved until this change is confirmed. All times are in Yangon time.</p>
          </div>
        </Card>
      </div>
    </Page></div>}
  </>;
}

function Session({ title, court, date, time }: { title: string; court: string; date: string; time: string }) {
  return <section aria-label={title}><p className="text-[10px] font-semibold uppercase tracking-wider text-zawana-500">{title}</p><h3 className="mt-3 text-lg font-semibold">{court}</h3><p className="mt-3 flex items-start gap-2 text-sm text-zawana-500"><CalendarDays size={14} className="mt-1 shrink-0" />{day(date)}</p><p className="mt-2 flex items-start gap-2 text-sm text-zawana-500"><Clock3 size={14} className="mt-1 shrink-0" />{time}</p></section>;
}
