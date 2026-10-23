import '../components/member-premium.css';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Trophy } from 'lucide-react';
import { Badge, Button, Card, Empty, Page } from '../components/UI';
import { get, post } from '../api';

export function Membership() {
  const [packages, setPackages] = useState<any[]>([]);
  const [enrollment, setEnrollment] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const data = await get<any>('/member/dashboard');
    setPackages(data.packages || []);
    setEnrollment(data.enrollment);
    setHistory(data.enrollmentHistory || []);
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
        {enrollment &&
          <Card className="package-active mb-6 overflow-hidden">
            <div className="bg-zawana-950 p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">Your active package</p>
                  <h2 className="mt-2 text-2xl font-black">{enrollment.packageName}</h2>
                </div>
                <Badge good>Active</Badge>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-white/55">Sessions remaining</p>
                  <b className="text-xl">
                    {enrollment.sessionsRemaining} / {enrollment.sessionsTotal}
                  </b>
                </div>
                <div>
                  <p className="text-xs text-white/55">Package starts</p>
                  <b>{enrollment.startDate}</b>
                </div>
                <div>
                  <p className="text-xs text-white/55">Expires</p>
                  <b>{enrollment.expiryDate}</b>
                </div>
                <div>
                  <p className="text-xs text-white/55">Last check-in</p>
                  <b>{enrollment.lastCheckIn || '—'}</b>
                </div>
              </div>
              <Link to="/check-in" className="mt-5 inline-block">
                <Button variant="secondary">Scan to check in</Button>
              </Link>
            </div>
          </Card>}

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
        {history.length > 0 &&
          <Card className="mb-6 p-5">
            <h2 className="text-lg font-black">Package history</h2>
            <div className="mt-3 divide-y divide-zawana-950/8">
              {history.map((entry: any) =>
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <div>
                    <b>{entry.packageName}</b>
                    <p className="mt-1 text-xs text-zawana-500">
                      {entry.startDate} – {entry.expiryDate} · {entry.sessionsRemaining}/{entry.sessionsTotal} sessions left</p>
                  </div>
                  <Badge good={entry.status === 'active'}>{entry.status}</Badge>
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
                <h3 className="mt-4 text-xl font-black">{p.title}</h3>
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
                    disabled={!!pending || busyId === p.id}
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
