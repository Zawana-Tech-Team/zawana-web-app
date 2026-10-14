import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  Clock3,
  Dumbbell,
  MapPin,
  Trophy
} from 'lucide-react';
import { Badge, Button, Card, Empty, Page, Stat, PageSkeleton } from '../components/UI';
import { get, post } from '../api';
import { useAuth } from '../context/AuthContext';
import { formatBookingDate, localDateKey } from '../utils/bookingDates';
import { useLanguage } from '../context/LanguageContext';

type DashboardData = {
  bookings: any[];
  recentBookings?: any[];
  todayBookings?: any[];
  todayBookingCount?: number;
  upcomingBookings?: any[];
  upcomingBookingCount?: number;
  packages: any[];
  notifications: any[];
  enrollment: any;
  checkIns: any[]
};
const statusLabel = (s: string) =>
  s
    ?.replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, x => x.toUpperCase());
const todayKey = () => localDateKey();

export function Dashboard() {
  const { user } = useAuth();
  const { locale } = useLanguage();
  const dateLabel = (value: string) =>
    formatBookingDate(value, { month: 'short', day: 'numeric', year: 'numeric' }, locale);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = () =>
    get<DashboardData>(`/member/dashboard?referenceDate=${localDateKey()}`)
      .then(setData)
      .catch((e: any) => setError(e.message || 'Could not load your badminton dashboard.'))
      .finally(() => setLoading(false));
  useEffect(() => {
    load()
  }, []);
  const checkIn = async () => {
    if (!data?.enrollment) return;
    setBusy(true);
    setMessage('');
    try {
      await post('/member/check-in', { enrollmentId: data.enrollment.id });
      setMessage('Checked in. One session was used from your package.');
      await load()
    } catch (e: any) {
      setMessage(e.message || 'Check-in could not be completed.')
    } finally {
      setBusy(false)
    }
  };
  const today = todayKey();
  const valid = (b: any) =>
    !['cancelled', 'CANCELLED', 'COACH_DECLINED', 'EXPIRED', 'completed', 'COMPLETED'].includes(
      b.status
    );
  const todayBookings = (data?.todayBookings || data?.bookings || [])
    .filter((b: any) => b.date === today && valid(b))
    .sort((a: any, b: any) => a.time.localeCompare(b.time));
  const upcoming = (data?.upcomingBookings || data?.bookings || [])
    .filter((b: any) => b.date > today && valid(b))
    .sort((a: any, b: any) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const schedule = [...todayBookings, ...upcoming];
  const nextCourt = schedule.find(b => b.kind === 'court');
  const nextCourse = schedule.find(b => b.kind === 'private_course');
  const checkedToday = Boolean(data?.checkIns?.some((c: any) => c.date === today));
  if (loading) return <PageSkeleton />;
  return <Page
    title={`Welcome back, ${user?.name?.split(' ')[0] || 'Athlete'}`}
    eyebrow="Zawana Badminton"
    actions={
      <Link to="/book/court">
        <Button>
          <CalendarDays size={16} /> Book a court</Button>
      </Link>
    }
  >
    {error &&
      <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
      </div>}
    <div className="grid gap-4 md:grid-cols-3">
      <Stat
        label="Today"
        value={data?.todayBookingCount ?? todayBookings.length}
        sub="Sessions scheduled for today"
      />
      <Stat
        label="Coming up"
        value={data?.upcomingBookingCount ?? upcoming.length}
        sub="Future court rentals and private courses"
      />
      <Stat
        label="Sessions remaining"
        value={data?.enrollment?.sessionsRemaining ?? '—'}
        sub={
          data?.enrollment
            ? `${data.enrollment.packageName} · expires ${dateLabel(data.enrollment.expiryDate)}`
            : 'No active badminton package'
        }
      />
    </div>
    <div className="premium-dashboard__grid mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
      <div className="space-y-6">
        <Card className="border-l-4 border-l-zawana-gold p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-zawana-accent">TODAY · {dateLabel(today)}
              </p>
              <h2 className="mt-1 text-xl font-black">
                {todayBookings.length
                  ? `${todayBookings.length} session${todayBookings.length === 1 ? '' : 's'} today`
                  : 'Nothing scheduled today'}
              </h2>
            </div>
            <CalendarDays size={20} />
          </div>
          {todayBookings.length ?
            <div className="mt-4 divide-y divide-zawana-950/8">
              {todayBookings.map(b =>
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <b>{b.title}</b>
                    <p className="mt-1 text-sm text-zawana-500">
                      {b.time} · {b.court?.name || b.location}
                      {b.coach ? ` · ${b.coach.name}` : ''}
                    </p>
                  </div>
                  <Badge good={b.status === 'CONFIRMED' || b.status === 'confirmed'}>
                    {statusLabel(b.status)}
                  </Badge>
                </div>
              )}
            </div> :
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zawana-500">Book a court or a private session when you’re ready.</p>
              <Link to="/book/court">
                <Button>Book a court</Button>
              </Link>
            </div>}
        </Card>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-zawana-950/8 p-5">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-zawana-accent">UP NEXT</p>
              <h2 className="mt-1 text-xl font-black">Your schedule</h2>
            </div>
            <Link to="/bookings" className="text-sm font-bold">All bookings <ArrowRight className="inline" size={15} />
            </Link>
          </div>
          {upcoming.length ?
            <div className="divide-y divide-zawana-950/8">
              {upcoming.slice(0, 4).map(b =>
                <div
                  key={b.id}
                  className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center"
                >
                  <div className="flex gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-zawana-950 text-zawana-gold">
                      {b.kind === 'private_course' ?
                        <Dumbbell size={20} /> :
                        <Trophy size={20} />}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{b.title}</b>
                        <Badge good={b.status === 'confirmed' || b.status === 'CONFIRMED'}>
                          {statusLabel(b.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-zawana-500">
                        {dateLabel(b.date)} · {b.time}
                      </p>
                      <p className="mt-1 text-xs text-zawana-500">
                        {b.court?.name || b.location}
                        {b.coach ? ` · ${b.coach.name}` : ''}
                      </p>
                    </div>
                  </div>
                  {b.status === 'AWAITING_PAYMENT' &&
                    <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Pay at badminton front desk</span>}
                </div>
              )}
            </div> :
            <div className="p-7">
              <Empty
                title="No upcoming bookings"
                body="Choose a court or request a private course to add your next session."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link to="/book/court">
                      <Button>Book court</Button>
                    </Link>
                    <Link to="/private-course">
                      <Button variant="secondary">Private course</Button>
                    </Link>
                  </div>
                }
              />
            </div>}
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            [nextCourt, 'Next court rental', '/book/court'],
            [nextCourse, 'Next private course', '/private-course']
          ].map(([b, label, to]: any) =>
            <Card key={label} className="p-5">
              <p className="text-xs font-black uppercase tracking-widest text-zawana-500">
                {label}
              </p>
              {b ?
                <>
                  <h3 className="mt-3 text-lg font-black">{b.title}</h3>
                  <p className="mt-1 text-sm text-zawana-500">
                    {dateLabel(b.date)} · {b.time}
                  </p>
                </> :
                <p className="mt-3 text-sm text-zawana-500">Nothing scheduled yet.</p>}
              <Link className="mt-4 inline-flex text-sm font-bold" to={to}>Explore <ArrowRight className="ml-1" size={15} />
              </Link>
            </Card>
          )}
        </div>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-zawana-accent">BADMINTON PACKAGE</p>
              <h2 className="mt-1 text-xl font-black">
                {data?.enrollment?.packageName || 'Choose a package'}
              </h2>
            </div>
            {data?.enrollment && <Badge good>Active</Badge>}
          </div>
          {data?.enrollment ?
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-zawana-500">Sessions left</p>
                  <b className="text-xl">
                    {data.enrollment.sessionsRemaining}
                    <span className="text-sm font-normal text-zawana-500"> / {data.enrollment.sessionsTotal}
                    </span>
                  </b>
                </div>
                <div>
                  <p className="text-xs text-zawana-500">Started</p>
                  <b>{dateLabel(data.enrollment.startDate)}</b>
                </div>
                <div>
                  <p className="text-xs text-zawana-500">Expires</p>
                  <b>{dateLabel(data.enrollment.expiryDate)}</b>
                </div>
                <div>
                  <p className="text-xs text-zawana-500">Last check-in</p>
                  <b>{data.enrollment.lastCheckIn || '—'}</b>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  loading={busy}
                  disabled={
                    busy || checkedToday || Number(data.enrollment.sessionsRemaining) <= 0
                  }
                  onClick={checkIn}
                >
                  {busy ? 'Checking in…' : checkedToday ? 'Checked in today' : 'Check in'} <Check size={16} />
                </Button>
                <span className="text-xs text-zawana-500">Check-in uses one session. One check-in per day.</span>
              </div>
            </> :
            <Link to="/membership">
              <Button variant="secondary">Browse badminton packages</Button>
            </Link>}
          {message && <p className="mt-3 rounded-xl bg-zawana-950/5 p-3 text-sm">{message}</p>}
        </Card>
        {(data?.checkIns?.length ?? 0) > 0 &&
          <Card className="p-5">
            <p className="text-xs font-black uppercase tracking-widest text-zawana-500">SESSION USAGE</p>
            <h3 className="mt-1 font-black">Recent check-ins</h3>
            <div className="mt-3 divide-y divide-zawana-950/8">
              {(data?.checkIns || []).slice(0, 3).map((c: any) =>
                <div key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {dateLabel(c.date)} · {c.time}
                  </span>
                  <Badge>
                    {c.sessionsUsed} session{c.sessionsUsed === 1 ? '' : 's'}
                  </Badge>
                </div>
              )}
            </div>
          </Card>}
      </div>
      <aside className="premium-dashboard__aside" aria-label="Notifications and services">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-zawana-950/8 p-5">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-zawana-500">NEEDS YOUR ATTENTION</p>
              <h2 className="mt-1 text-lg font-black">Notifications</h2>
            </div>
            <Bell size={18} />
          </div>
          {data?.notifications?.length ?
            <div className="divide-y divide-zawana-950/8">
              {data.notifications.slice(0, 5).map(n =>
                <div key={n.id} className="p-4">
                  <b className="text-sm">{n.title}</b>
                  <p className="mt-1 text-xs leading-5 text-zawana-500">{n.body}</p>
                </div>
              )}
            </div> :
            <p className="p-5 text-sm text-zawana-500">You’re all caught up.</p>}
          <Link className="block border-t p-4 text-sm font-bold" to="/notifications">View notifications <ArrowRight className="inline" size={14} />
          </Link>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-black uppercase tracking-widest text-zawana-accent">BADMINTON SERVICES</p>
          <div className="mt-4 space-y-2">
            {[
              ['/book/court', 'Court booking', Trophy],
              ['/private-course', 'Private course', Dumbbell],
              ['/membership', 'Packages & sessions', Clock3],
              ['/bookings', 'Booking history', MapPin]
            ].map(([to, label, Icon]: any) =>
              <Link
                key={to}
                to={to}
                className="flex items-center justify-between rounded-xl bg-zawana-950/[.035] p-3 text-sm font-bold transition hover:bg-zawana-accent/15"
              > <span className="flex items-center gap-3">
                  <Icon size={16} />
                  {label}
                </span>
                <ArrowRight size={15} />
              </Link>
            )}
          </div>
        </Card>
      </aside>
    </div>
    <Card className="mt-6 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-zawana-500">RECENT ACTIVITY</p>
          <h2 className="mt-1 text-xl font-black">Booking history</h2>
        </div>
        <Link to="/bookings" className="text-sm font-bold">See all</Link>
      </div>
      {(data?.recentBookings || data?.bookings)?.length ?
        <div className="mt-4 divide-y divide-zawana-950/8">
          {(data?.recentBookings || data?.bookings || []).slice(0, 4).map(b =>
            <div key={b.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <b className="text-sm">{b.title}</b>
                <p className="mt-1 text-xs text-zawana-500">
                  {dateLabel(b.date)} · {b.time}
                </p>
              </div>
              <Badge good={b.status === 'confirmed' || b.status === 'CONFIRMED'}>
                {statusLabel(b.status)}
              </Badge>
            </div>
          )}
        </div> :
        <p className="mt-4 text-sm text-zawana-500">Your completed and past sessions will appear here.</p>}
    </Card>
  </Page>
}
