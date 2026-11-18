import { DialogSurface } from '../components/Interactions';
import { mediaImageSrc } from '../components/ImageUpload';
import { badmintonDaysLabel } from '../components/BadmintonAvailableDays';
import { startPayment } from '../services/paymentFlow';
import { categoryLabel } from '../components/BadmintonCategoryField';
import { bookingClock } from '../utils/bookingTime';
import '../components/member-premium.css';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, X, CalendarDays, ArrowRight } from 'lucide-react';
import { Badge, Button, Card, Empty, Page } from '../components/UI';
import { get, post } from '../api';

export function Membership() {
  const [packages, setPackages] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [checkIns, setCheckIns] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const activationInFlight = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const retryKeys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    const data = await get<any>('/member/dashboard');
    setPackages(data.packages || []);
    setEnrollments(data.enrollments || data.enrollmentHistory || []);
    setCheckIns(data.checkIns || []);
    setPurchases(data.purchases || []);
  }, []);

  useEffect(() => {
    load()
      .catch((e: any) => setError(e.message || 'Could not load badminton packages.'))
      .finally(() => setLoading(false));
  }, [load]);

  const buy = async (id: string) => {
    if (activationInFlight.current || selectedId !== id) return;
    activationInFlight.current = true;
    setBusyId(id);
    setError('');
    try {
      const pending = purchases.find(purchase => purchase.packageId === id && ['PENDING', 'AWAITING_PAYMENT'].includes(purchase.status));
      if (pending) { await startPayment('/payments/confirm', { resourceType: 'badminton_package', resourceId: pending.id }); await load(); setNotice('Manual/simulated payment confirmed. Your package is active.'); setSelectedId(''); return; }
      const key = retryKeys.current.get(id) || crypto.randomUUID(); retryKeys.current.set(id, key);
      const result = await post<any>(`/member/badminton-packages/${id}/purchase`, { confirmed: true, requestKey: key });
      await load();
      retryKeys.current.delete(id);
      setSelectedId('');
      setNotice(
        `${result.enrollment?.packageName || 'Your badminton package'} is active after simulated payment confirmation (no external charge). ${result.enrollment?.sessionsRemaining ?? ''} sessions are ready to use.`
      );
    } catch (e: any) {
      setError(e.message || 'Package request could not be created. Please try again.');
    } finally {
      activationInFlight.current = false;
      setBusyId('');
    }
  };

  const shown = packages;
  const pendingFor = (id: string) =>
    purchases.find(p => p.packageId === id && ['PENDING', 'AWAITING_PAYMENT'].includes(p.status));
  const selected = packages.find(p => p.id === selectedId);
  const closeDetails = () => { if (!activationInFlight.current) setSelectedId(''); };

  return <Page title="Badminton packages" eyebrow="Sessions & membership">
    <div className="member-refined"><p className="mb-4 text-xs text-zawana-500">Temporary manual/simulated payment confirmation. No external charge is made.</p>
    {notice &&
      <p
        role="status"
        className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800"
      >
        {notice}
      </p>}
    {error && !selected &&
      <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
        {error}
      </p>}
    {loading ?
      <Card className="h-40 animate-pulse bg-zawana-950/5" /> :
      <>
        {enrollments.length > 0 && <section className="mb-8"><div className="mb-4"><h2 className="text-xl font-semibold">Your packages</h2><p className="mt-1 text-sm text-zawana-500">Each package keeps its own balance. Check-in uses the eligible package in that category expiring soonest.</p></div><div className="grid gap-4 md:grid-cols-2">{enrollments.map(enrollment => {
          const date = bookingClock().date;
          const status = enrollment.expiryDate < date ? 'Expired' : enrollment.sessionsRemaining <= 0 ? 'Exhausted' : enrollment.startDate > date ? 'Pending' : enrollment.status === 'active' ? 'Active' : enrollment.status;
          const visits = checkIns.filter(c => c.enrollmentId === enrollment.id);
          return <Card key={enrollment.id} className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-widest text-zawana-500">{categoryLabel(enrollment.categoryCode)}</p><h3 className="mt-2 text-lg font-semibold">{enrollment.packageName}</h3></div><Badge good={status === 'Active'}>{status}</Badge></div><div className="mt-6 flex items-end justify-between gap-4"><p className="text-3xl font-semibold">{enrollment.sessionsRemaining}<span className="text-sm font-normal text-zawana-500"> / {enrollment.sessionsTotal} left</span></p><Link className="text-xs font-semibold underline underline-offset-4" to="/attendance">Attendance history</Link></div><progress className="mt-4 h-1.5 w-full accent-emerald-800" aria-label={`${enrollment.packageName} remaining sessions`} max={Math.max(1, enrollment.sessionsTotal)} value={Math.max(0, enrollment.sessionsRemaining)} /><dl className="mt-4 grid grid-cols-2 gap-4 text-xs"><div><dt className="text-zawana-500">Starts</dt><dd className="mt-1">{enrollment.startDate}</dd></div><div><dt className="text-zawana-500">Expires</dt><dd className="mt-1">{enrollment.expiryDate}</dd></div></dl>{!enrollment.categoryCode && <p className="mt-4 text-xs text-amber-800">The front desk needs to assign this package’s category before check-in.</p>}{visits.length > 0 && <details className="mt-4 border-t pt-3 text-xs"><summary className="cursor-pointer text-zawana-500">Recent session history</summary>{visits.slice(0, 5).map(c => <p className="mt-2 flex justify-between gap-3" key={c.id}><span>{c.date} · {c.time}</span><span>{c.sessionsUsed} session{c.sessionsUsed === 1 ? '' : 's'} · {c.status}</span></p>)}</details>}{status === 'Active' && enrollment.categoryCode && <Link to="/check-in" className="mt-5 inline-block text-sm font-semibold">Scan to check in →</Link>}</Card>;
        })}</div></section>}

        {purchases.length > 0 &&
          <Card className="mb-6 p-5">
            <h2 className="text-lg font-black">Package purchase history</h2>
            <div className="mt-3 divide-y divide-zawana-950/8">
              {purchases.map(p =>
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <div>
                    <b>{p.packageName}</b>
                    <p className="mt-1 text-xs text-zawana-500">
                      {p.code} · {new Date(p.createdAt).toLocaleDateString()} · {Number(p.price).toLocaleString()} MMK</p>
                  </div>
                  <Badge good={p.status === 'ACTIVE' || p.status === 'PAID'}>
                    {p.status === 'ACTIVE' ? 'Activated' : p.status}
                  </Badge>
                </div>
              )}
            </div>
          </Card>}
        <div className="mb-5">
          <h2 className="text-xl font-black">Available badminton packages</h2>
          <p className="mt-1 text-sm text-zawana-500">Find days that work for you, then view the details before activating a package.</p>
        </div>
        {shown.length ?
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map(p => {
              const comingSoon = p.status === 'coming_soon';
              return <Card key={p.id} className="package-offer flex h-full flex-col p-6">
                {p.imageUrl &&
                  <img
                    src={mediaImageSrc(p.imageUrl)}
                    alt=""
                    className="mb-4 h-36 w-full rounded-xl object-cover"
                  />}
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-zawana-accent/15">
                    <Trophy />
                  </span>
                  {comingSoon ?
                    <Badge>Coming Soon</Badge> :
                    <Badge good>{p.sessions} sessions</Badge>}
                </div>
                <h3 className="mt-4 text-xl font-black">{p.title}</h3><p className="mt-1 text-xs text-zawana-500">{p.category?.name || 'Category needs review'}</p>
                <div className="mt-4 rounded-xl bg-zawana-950/[.035] p-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-zawana-500"><CalendarDays size={14} aria-hidden="true" />Available days</p>
                  <p className="mt-2 text-sm font-medium">{badmintonDaysLabel(p.availableDays)}</p>
                </div>
                <p className="mt-5 text-2xl font-black">
                  {Number(p.price).toLocaleString()} <span className="text-sm text-zawana-500">MMK</span>
                </p>
                <p className="mt-2 text-sm text-zawana-500">Valid for {p.validity} days{p.availableFrom && p.availableUntil
                    ? ` · ${p.availableFrom}–${p.availableUntil}`
                    : ''}
                </p>
                <div className="mt-auto pt-5">
                  <Button variant="secondary" className="w-full" aria-label={`View details for ${p.title}`} onClick={() => { setError(''); setSelectedId(p.id); }}>
                    View details <ArrowRight size={15} aria-hidden="true" />
                  </Button>
                </div>
              </Card>;
            })}
          </div> :
          <Empty
            title="No badminton packages available"
            body="There are no active packages listed right now."
          />}
      </>}
    {selected && <DialogSurface title={`${selected.title} details`} onClose={closeDetails} className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden bg-white">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b p-5 sm:p-6">
        <div><p className="text-xs font-medium uppercase tracking-widest text-zawana-500">{selected.category?.name || 'Badminton package'}</p><h2 className="mt-2 text-xl font-semibold">{selected.title}</h2></div>
        <Button variant="ghost" disabled={!!busyId} aria-label="Close package details" onClick={closeDetails}><X size={18} /></Button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
        {selected.imageUrl && <img src={mediaImageSrc(selected.imageUrl)} alt={selected.title} className="h-44 w-full rounded-xl object-cover" />}
        {selected.status === 'coming_soon' && <Badge>Coming Soon</Badge>}
        <p className="text-3xl font-semibold">{Number(selected.price).toLocaleString()} <span className="text-sm font-normal text-zawana-500">MMK</span></p>
        <dl className="grid grid-cols-2 gap-4 rounded-xl bg-zawana-950/[.035] p-4 text-sm">
          <div><dt className="text-xs text-zawana-500">Sessions</dt><dd className="mt-1 font-semibold">{selected.sessions} sessions</dd></div>
          <div><dt className="text-xs text-zawana-500">Validity</dt><dd className="mt-1 font-semibold">{selected.validity} days</dd></div>
          <div className="col-span-2"><dt className="text-xs text-zawana-500">Available days</dt><dd className="mt-1 font-semibold">{badmintonDaysLabel(selected.availableDays)}</dd></div>
          {(selected.availableFrom || selected.availableUntil) && <div className="col-span-2"><dt className="text-xs text-zawana-500">Available times</dt><dd className="mt-1">{selected.availableFrom || 'Not specified'} – {selected.availableUntil || 'Not specified'}</dd></div>}
        </dl>
        {selected.description && <section><h3 className="text-sm font-semibold">About this package</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zawana-500">{selected.description}</p></section>}
        {selected.scheduleNotes && <section><h3 className="text-sm font-semibold">Schedule notes</h3><p className="mt-2 whitespace-pre-wrap text-sm text-zawana-500">{selected.scheduleNotes}</p></section>}
        {selected.courtRules && <section><h3 className="text-sm font-semibold">Court rules</h3><p className="mt-2 whitespace-pre-wrap text-sm text-zawana-500">{selected.courtRules}</p></section>}
        {selected.status !== 'coming_soon' && <p className="text-xs leading-relaxed text-zawana-500">Activation starts your package immediately. Payment confirmation is currently manual/simulated; no external charge is made.</p>}
        {!selected.category?.code && selected.status !== 'coming_soon' && <p className="text-sm text-amber-800">This package needs a category assigned before it can be activated. Please contact the front desk.</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>
      <footer className="flex shrink-0 flex-col gap-2 border-t bg-white p-4 sm:p-5">
        {selected.status === 'coming_soon' ? <Link to="/contact" className="rounded-xl bg-zawana-950 px-4 py-3 text-center text-sm font-semibold text-white">Contact Admin</Link> : <Button className="w-full" loading={busyId === selected.id} disabled={!!busyId || !selected.category?.code} onClick={() => buy(selected.id)}>
          {busyId === selected.id ? 'Activating package…' : pendingFor(selected.id) ? 'Confirm manual payment' : `Activate package · ${Number(selected.price).toLocaleString()} MMK`}
        </Button>}
        <Button variant="ghost" disabled={!!busyId} onClick={closeDetails}>Back to packages</Button>
      </footer>
    </DialogSurface>}
    </div>
  </Page>;
}
