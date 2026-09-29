import { useState } from 'react';
import { CalendarDays, Check, Clock3, FileText } from 'lucide-react';
import { Badge, Button, Card, Page } from '../components/UI';
import { useAuth } from '../context/AuthContext';

const treatmentHistory = [
  { date: '25 Sep 2026', title: 'Sports Massage', practitioner: 'May Thu', note: 'Lower-body recovery after training.' },
  { date: '18 Sep 2026', title: 'Mobility & Recovery', practitioner: 'Thiri', note: 'Hip and ankle mobility work.' },
  { date: '05 Sep 2026', title: 'Sports Massage', practitioner: 'May Thu', note: 'Posterior chain recovery.' },
];

const bookings = [
  { date: '30 Sep 2026', time: '4:30 PM', title: 'Revive Clinic · Sports Massage', status: 'Confirmed' },
  { date: '03 Oct 2026', time: '6:30 PM', title: 'Indoor Court 03', status: 'Confirmed' },
];

const checkIns = [
  { date: '28 Sep 2026', time: '5:42 PM', location: 'High Performance Gym' },
  { date: '26 Sep 2026', time: '10:12 AM', location: 'Badminton Courts' },
  { date: '24 Sep 2026', time: '6:05 PM', location: 'High Performance Gym' },
];

export function Profile() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [saved, setSaved] = useState(false);

  return (
    <Page title="Profile" eyebrow="Your Zawana identity">
      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-zawana-accent text-xl font-black text-zawana-950">{name.slice(0, 2).toUpperCase()}</div>
            <div><h2 className="text-2xl font-black">{name}</h2><p className="text-sm text-zawana-500">{user?.email}</p></div>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <label className="text-sm font-bold">Name<input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-zawana-950/5 p-3 outline-none focus:border-zawana-accent" /></label>
            <label className="text-sm font-bold">Phone<input defaultValue="09 000 000 000" className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-zawana-950/5 p-3 outline-none" /></label>
            <label className="text-sm font-bold">Primary sport<select className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-zawana-950/5 p-3 outline-none"><option>Badminton</option><option>Fitness</option><option>Athlete Performance</option></select></label>
            <label className="text-sm font-bold">Goal<input defaultValue="Performance" className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-zawana-950/5 p-3 outline-none" /></label>
          </div>
          <div className="mt-6 flex items-center gap-3"><Button onClick={() => setSaved(true)}>Save profile</Button>{saved && <span className="flex items-center gap-1 text-sm font-bold text-zawana-500"><Check size={15} /> Saved</span>}</div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold tracking-widest text-zawana-accent">CARE + BOOKING PROFILE</p><h3 className="mt-1 text-xl font-black">Your upcoming schedule</h3></div><CalendarDays size={20} className="text-zawana-500" /></div>
          <div className="mt-5 space-y-3">{bookings.map((booking) => <div key={`${booking.date}-${booking.time}`} className="flex items-center justify-between gap-4 rounded-xl bg-zawana-950/4 p-4"><div><b>{booking.title}</b><p className="mt-1 flex items-center gap-1 text-sm text-zawana-500"><Clock3 size={14} />{booking.date} · {booking.time}</p></div><Badge>{booking.status}</Badge></div>)}</div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden"><div className="border-b border-zawana-950/8 p-5"><p className="text-xs font-bold tracking-widest text-zawana-accent">REVIVE CLINIC</p><h3 className="mt-1 text-xl font-black">Treatment history</h3><p className="mt-1 text-sm text-zawana-500">Your previous treatments are visible to the front desk for faster check-in and continuity of care.</p></div><div className="divide-y divide-zawana-950/8">{treatmentHistory.map((item) => <div key={`${item.date}-${item.title}`} className="p-5"><div className="flex items-start justify-between gap-3"><div><b>{item.title}</b><p className="mt-1 text-xs text-zawana-500">{item.date} · {item.practitioner}</p></div><FileText size={16} className="text-zawana-500" /></div><p className="mt-3 text-sm leading-5 text-zawana-500">{item.note}</p></div>)}</div></Card>

        <Card className="overflow-hidden"><div className="border-b border-zawana-950/8 p-5"><p className="text-xs font-bold tracking-widest text-zawana-accent">ATTENDANCE</p><h3 className="mt-1 text-xl font-black">Gym & facility check-ins</h3><p className="mt-1 text-sm text-zawana-500">Every check-in becomes part of your Zawana activity history.</p></div><div className="divide-y divide-zawana-950/8">{checkIns.map((item) => <div key={`${item.date}-${item.time}`} className="grid gap-3 p-5 md:grid-cols-[145px_1fr]"><div className="text-sm font-bold">{item.date}<span className="mt-1 block text-xs font-normal text-zawana-500">{item.time}</span></div><div><b>{item.location}</b><p className="mt-1 text-sm text-zawana-500">Attendance verified at front desk</p></div></div>)}</div></Card>
      </div>
    </Page>
  );
}
