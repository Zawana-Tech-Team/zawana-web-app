import { useMemo, useState } from 'react';
import { Check, Clock3, LogIn, Search, UserRound, X } from 'lucide-react';
import { Badge, Button, Card, Empty, Page, Stat } from '../components/UI';

type CheckInRecord = { date: string; time: string; location: string; type: string };
type Member = { id: string; name: string; phone: string; membership: string; expires: string; lastCheckIn: string; records: CheckInRecord[] };

const members: Member[] = [
  { id: 'ZW-1201', name: 'Sai Zay', phone: '09 765 432 100', membership: 'Performance', expires: '31 Dec 2026', lastCheckIn: '28 Sep · 5:42 PM', records: [{ date: '28 Sep 2026', time: '5:42 PM', location: 'High Performance Gym', type: 'Gym' }, { date: '26 Sep 2026', time: '10:12 AM', location: 'Badminton Courts', type: 'Court' }, { date: '24 Sep 2026', time: '6:05 PM', location: 'High Performance Gym', type: 'Gym' }] },
  { id: 'ZW-1202', name: 'Htet Aung', phone: '09 432 118 210', membership: 'Premium', expires: '12 Jan 2027', lastCheckIn: '29 Sep · 8:18 AM', records: [{ date: '29 Sep 2026', time: '8:18 AM', location: 'High Performance Gym', type: 'Gym' }, { date: '27 Sep 2026', time: '3:05 PM', location: 'Training Studio', type: 'Class' }] },
  { id: 'ZW-1203', name: 'Nandar', phone: '09 555 302 441', membership: 'Active', expires: '20 Nov 2026', lastCheckIn: '28 Sep · 7:30 PM', records: [{ date: '28 Sep 2026', time: '7:30 PM', location: 'High Performance Gym', type: 'Gym' }, { date: '22 Sep 2026', time: '6:45 PM', location: 'High Performance Gym', type: 'Gym' }] },
];

export function GymCheckIn() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('ZW-1201');
  const [checkedInIds, setCheckedInIds] = useState<string[]>(['ZW-1202']);
  const [notice, setNotice] = useState('');

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return members;
    return members.filter((member) => [member.name, member.id, member.phone].some((x) => x.toLowerCase().includes(value)));
  }, [query]);

  const member = members.find((item) => item.id === selectedId) ?? members[0];
  const isCheckedIn = checkedInIds.includes(member.id);

  const toggleCheckIn = () => {
    setCheckedInIds((current) => isCheckedIn ? current.filter((id) => id !== member.id) : [...current, member.id]);
    setNotice(`${member.name} ${isCheckedIn ? 'checked out' : 'checked in'} successfully.`);
  };

  return (
    <Page title="Gym check-in" eyebrow="Front desk operations">
      {notice && <button onClick={() => setNotice('')} className="mb-5 flex w-full items-center justify-between rounded-2xl border border-zawana-accent/30 bg-zawana-accent/10 px-4 py-3 text-left text-sm"><span className="flex items-center gap-2 font-bold"><Check size={16} />{notice}</span><X size={16} /></button>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Checked in now" value="42" /><Stat label="Today's visits" value="127" /><Stat label="Peak occupancy" value="78%" /><Stat label="Membership alerts" value="6" sub="Needs attention" /></div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[340px_1fr]">
        <Card className="h-fit p-5">
          <div className="flex items-center gap-2 rounded-xl border border-zawana-950/10 bg-zawana-950/4 px-3 py-2"><Search size={16} className="text-zawana-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search member or scan ID" className="w-full bg-transparent text-sm outline-none" /></div>
          <button className="mt-3 w-full rounded-xl border border-dashed border-zawana-950/15 px-3 py-3 text-sm font-bold text-zawana-500">Scan member QR / ID</button>
          <div className="mt-4 space-y-2">{filtered.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-left ${item.id === member.id ? 'border-zawana-accent bg-zawana-accent/10' : 'border-zawana-950/8 bg-zawana-950/2'}`}><div className="flex items-center justify-between"><b>{item.name}</b><span className="text-[10px] font-bold tracking-widest text-zawana-500">{item.id}</span></div><p className="mt-1 text-xs text-zawana-500">{item.phone}</p></button>)}{!filtered.length && <Empty title="No member found" body="Try a name, phone number or member ID." />}</div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4"><div className="grid h-14 w-14 place-items-center rounded-full bg-zawana-accent text-zawana-950"><UserRound size={22} /></div><div><p className="text-xs font-bold tracking-widest text-zawana-accent">SELECTED MEMBER</p><h2 className="mt-1 text-2xl font-black">{member.name}</h2><p className="mt-1 text-sm text-zawana-500">{member.id} · {member.phone}</p></div></div>
              <div className="flex items-center gap-3"><Badge>{member.membership}</Badge><Button onClick={toggleCheckIn}><LogIn size={16} />{isCheckedIn ? 'Check out' : 'Check in'}</Button></div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3"><div className="rounded-xl bg-zawana-950/4 p-4"><p className="text-xs text-zawana-500">Membership expiry</p><b className="mt-1 block">{member.expires}</b></div><div className="rounded-xl bg-zawana-950/4 p-4"><p className="text-xs text-zawana-500">Last check-in</p><b className="mt-1 block">{member.lastCheckIn}</b></div><div className={`rounded-xl p-4 ${isCheckedIn ? 'bg-zawana-accent/15' : 'bg-zawana-950/4'}`}><p className="text-xs text-zawana-500">Current status</p><b className="mt-1 block">{isCheckedIn ? 'Currently checked in' : 'Not checked in'}</b></div></div>
          </Card>

          <Card className="overflow-hidden"><div className="border-b border-zawana-950/8 p-5"><p className="text-xs font-bold tracking-widest text-zawana-accent">MEMBER ACTIVITY</p><h3 className="mt-1 text-lg font-black">Check-in history</h3></div><div className="divide-y divide-zawana-950/8">{member.records.map((record) => <div key={`${record.date}-${record.time}-${record.location}`} className="grid gap-3 p-5 md:grid-cols-[150px_1fr_auto] md:items-center"><div className="flex items-center gap-2 text-sm font-bold"><Clock3 size={15} className="text-zawana-accent" />{record.date}<span className="text-zawana-500">{record.time}</span></div><div><b>{record.location}</b><p className="mt-1 text-sm text-zawana-500">Attendance recorded through front desk</p></div><Badge>{record.type}</Badge></div>)}</div></Card>
        </div>
      </div>
    </Page>
  );
}
