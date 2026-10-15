import { useEffect, useMemo, useState } from 'react';

import { Check, Clock3, LogIn, Search, UserRound } from 'lucide-react';

import { Badge, Button, Card, Empty, Page, Stat } from '../components/UI';

import { get, post } from '../api';
import { gymToday } from '../types/gym';

type Membership = {
  accessMode?: string;
  id: string;
  customer: string;
  customerId: string;
  phone: string;
  package: string;
  startDate: string;
  expiryDate: string;
  status: string;
  sessionsTotal: number;
  sessionsRemaining: number;
  lastCheckIn?: string | null;
  checkIns?: { id: string; date: string; time: string; sessionsUsed: number }[]
};

export function GymCheckIn() {
  const [rows, setRows] = useState<Membership[]>([]),
    [query, setQuery] = useState(''),
    [selectedId, setSelectedId] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');

  const load = () =>
    get<Membership[]>('/memberships').then(data => {
      setRows(data);
      setSelectedId(id =>data.some(m => m.id === id) ? id : data[0]?.id || '')
    });

  useEffect(() => {
    load()
      .catch((e: any) => setError(e.message || 'Could not load Gym memberships.'))
      .finally(() => setLoading(false))
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter(m =>
        `${m.customer} ${m.phone} ${m.customerId} ${m.package}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ),
    [rows, query]
  );

  const member = rows.find(m => m.id === selectedId) || filtered[0],
    isReady =
      !!member &&
      member.status === 'active' && member.startDate <= gymToday() &&
      member.expiryDate >= gymToday() &&
      (member.accessMode === 'unlimited' || member.sessionsRemaining > 0),
    checkedToday = !!member?.checkIns?.some(c => c.date === gymToday());

  const checkIn = async () => {
    if (!member) return;
    setBusy(true);
    setError('');
    try {
      const result = await post<any>('/memberships/check-in', { membershipId: member.id });
      await load();
      setNotice(
        result.membership.accessMode === 'unlimited' ? `${member.customer} checked in · unlimited access.` : `${member.customer} checked in · ${result.membership.sessionsRemaining} visits remain.`
      )
    } catch (e: any) {
      setError(e.message || 'Gym check-in was denied.')
    } finally {
      setBusy(false)
    }
  };

  return <Page title="Gym check-in" eyebrow="Front desk operations">
    <div className="mb-5 grid gap-4 sm:grid-cols-3">
      <Stat label="Memberships" value={rows.length} />
      <Stat
        label="Ready for check-in"
        value={
          rows.filter(
            m =>
              m.status === 'active' && m.startDate <= gymToday() &&
              m.expiryDate >= gymToday() &&
              (m.accessMode === 'unlimited' || m.sessionsRemaining > 0)
          ).length
        }
      />
      <Stat
        label="Visits today"
        value={
          rows.filter(m => m.lastCheckIn?.startsWith(gymToday()))
            .length
        }
      />
    </div>
    {notice &&
      <p
        role="status"
        className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800"
      >
        {notice}
      </p>}
    {error &&
      <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>}
    <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
      <Card className="h-fit p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3.5 text-zawana-500" />
          <input
            className="w-full pl-9"
            placeholder="Search member or phone"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="mt-4 space-y-2">
          {loading ?
            <p className="p-5 text-sm text-zawana-500">Loading memberships…</p> :
            filtered.map(m =>
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={`w-full rounded-xl border p-3 text-left ${m.id === member?.id ? 'border-zawana-gold bg-zawana-gold/10' : 'border-zawana-950/8'}`}
              >
                <div className="flex justify-between gap-2">
                  <b>{m.customer}</b>
                  <span className="text-xs">
                    {m.accessMode === 'unlimited' ? 'Unlimited' : `${m.sessionsRemaining}/${m.sessionsTotal}`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zawana-500">
                  {m.phone} · {m.package}
                </p>
              </button>
          )}
          {!filtered.length && !loading &&
            <Empty title="No members found" body="Try another name or phone number." />}
        </div>
      </Card>
      {member ?
        <div className="space-y-5">
          <Card className="p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-zawana-950 text-white">
                  <UserRound />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-zawana-accent">Selected member</p>
                  <h2 className="text-xl font-black">{member.customer}</h2>
                  <p className="text-sm text-zawana-500">
                    {member.phone} · {member.package}
                  </p>
                </div>
              </div>
              <Button disabled={!isReady || checkedToday || busy} onClick={() => void checkIn()}>
                <LogIn size={16} />
                {busy ? 'Checking in…' : checkedToday ? 'Checked in today' : 'Check in'}
              </Button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-zawana-950/4 p-4">
                <p className="text-xs text-zawana-500">Sessions remaining</p>
                <b className="text-xl">
                  {member.accessMode === 'unlimited' ? 'Unlimited' : `${member.sessionsRemaining} / ${member.sessionsTotal}`}
                </b>
              </div>
              <div className="rounded-xl bg-zawana-950/4 p-4">
                <p className="text-xs text-zawana-500">Package expiry</p>
                <b>{member.expiryDate}</b>
              </div>
              <div className="rounded-xl bg-zawana-950/4 p-4">
                <p className="text-xs text-zawana-500">Last check-in</p>
                <b>{member.lastCheckIn || '—'}</b>
              </div>
              <div className="rounded-xl bg-zawana-950/4 p-4">
                <p className="text-xs text-zawana-500">Access</p>
                <Badge good={isReady}>{isReady ? 'Ready' : 'Blocked'}</Badge>
              </div>
            </div>
          </Card>
          <Card className="overflow-hidden p-0">
            <div className="border-b p-4">
              <h3 className="font-black">Session history</h3>
              <p className="text-xs text-zawana-500">Latest visits for this Gym package.</p>
            </div>
            {member.checkIns?.length ?
              <div className="divide-y">
                {member.checkIns.map(c =>
                  <div key={c.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <Clock3 size={16} className="text-zawana-accent" />
                      <div>
                        <b>
                          {c.date} · {c.time}
                        </b>
                        <p className="text-xs text-zawana-500">{c.sessionsUsed ? `${c.sessionsUsed} visit used` : 'Unlimited membership visit'}</p>
                      </div>
                    </div>
                    <Badge>Gym</Badge>
                  </div>
                )}
              </div> :
              <div className="p-6 text-sm text-zawana-500">No check-ins recorded on this membership yet.</div>}
          </Card>
        </div> :
        <Card className="p-8 text-center">
          {loading ? 'Loading Gym members…' : 'Select a membership to view access.'}
        </Card>}
    </div>
  </Page>
}
