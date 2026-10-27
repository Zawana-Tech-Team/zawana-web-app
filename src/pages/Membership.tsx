import { categoryLabel } from '../components/BadmintonCategoryField';
import { bookingClock } from '../utils/bookingTime';
import '../components/member-premium.css';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Trophy } from 'lucide-react';
import { Badge, Button, Card, Empty, Page } from '../components/UI';
import { get, post } from '../api';

export function Membership() {
  const [packages, setPackages] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [checkIns, setCheckIns] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
    setBusyId(id);
    setError('');
    try {
      const result = await post<any>(`/member/badminton-packages/${id}/purchase`, {});
      await load();
      setNotice(
        `${result.enrollment?.packageName || 'Your badminton package'} is active. ${result.enrollment?.sessionsRemaining ?? ''} sessions are ready to use.`
      );
    } catch (e: any) {
      setError(e.message || 'Package request could not be created. Please try again.');
    } finally {
      setBusyId('');
    }
  };

  const shown = packages;
  const pendingFor = (id: string) =>
    purchases.find(p => p.packageId === id && p.status === 'PENDING');

  return <Page title="Badminton packages" eyebrow="Sessions & membership">
    <div className="member-refined">
    {notice &&
      <p
        role="status"
        className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800"
      >
        {notice}
      </p>}
    {error &&
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
          <p className="mt-1 text-sm text-zawana-500">Compare sessions, validity and price, then activate the package for your badminton visits.</p>
        </div>
        {shown.length ?
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map(p => {
              const pending = pendingFor(p.id);
              const comingSoon = p.status === 'coming_soon';
              return <Card key={p.id} className="package-offer p-6">
                {p.imageUrl &&
                  <img
                    src={p.imageUrl}
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
                <p className="mt-2 min-h-10 text-sm text-zawana-500">{p.description}</p>
                <p className="mt-5 text-2xl font-black">
                  {Number(p.price).toLocaleString()} <span className="text-sm text-zawana-500">MMK</span>
                </p>
                <p className="mt-2 text-sm text-zawana-500">Valid for {p.validity} days{p.availableFrom && p.availableUntil
                    ? ` · ${p.availableFrom}–${p.availableUntil}`
                    : ''}
                </p>
                {p.scheduleNotes &&
                  <p className="mt-2 text-xs text-zawana-500">{p.scheduleNotes}</p>}
                {p.courtRules &&
                  <p className="mt-2 text-xs text-zawana-500">Court rules: {p.courtRules}</p>}
                {!comingSoon &&
                  <div className="mt-5 flex items-center gap-2 text-xs text-zawana-500">
                    <Check size={14} />Package check-in supported</div>}
                {comingSoon ?
                  <Link to="/contact" className="mt-5 block">
                    <Button variant="secondary" className="w-full">Contact Admin</Button>
                  </Link> :
                  <Button
                    className="mt-5 w-full"
                    disabled={!!pending || busyId === p.id || !p.category?.code}
                    onClick={() => buy(p.id)}
                  >
                    {busyId === p.id
                      ? 'Activating package…'
                      : pending
                        ? 'Purchase processing'
                        : `Activate package · ${Number(p.price).toLocaleString()} MMK`}
                  </Button>}
              </Card>;
            })}
          </div> :
          <Empty
            title="No badminton packages available"
            body="There are no active packages listed right now."
          />}
      </>}
    </div>
  </Page>;
}
