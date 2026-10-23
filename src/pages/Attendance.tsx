import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, RefreshCw, Search, Users } from 'lucide-react';
import { get, post } from '../api';
import { useAuth } from '../context/AuthContext';
import { bookingClock } from '../utils/bookingTime';
import './attendance.css';

type Record = { id: string; personId: string; kind: 'course' | 'package'; name: string; title: string; coach: string | null; date: string; time: string; checkedInAt: string | null; recordedBy: string | null; status: 'present' | 'scheduled'; canCheckIn: boolean };
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'Asia/Yangon' }).format(new Date(`${date}T12:00:00Z`));
const clock = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export default function Attendance() {
  const { user } = useAuth();
  const today = bookingClock().date;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setRecords([]);
    get<{ records: Record[] }>(`/attendance?month=${month}`).then(data => {
      if (active) setRecords(data.records);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, version]);
  useEffect(() => {
    const refresh = () => setVersion(v => v + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  const filtered = useMemo(() => records.filter(record =>
    (filter === 'all' || record.status === filter) &&
    `${record.name} ${record.title} ${record.coach || ''}`.toLowerCase().includes(query.toLowerCase().trim()),
  ), [records, query, filter]);
  const counts = useMemo(() => {
    const result = new Map<string, { present: number; scheduled: number }>();
    for (const record of filtered) {
      const entry = result.get(record.date) || { present: 0, scheduled: 0 };
      entry[record.status]++; result.set(record.date, entry);
    }
    return result;
  }, [filtered]);
  const dayRecords = filtered.filter(record => record.date === selected);
  const present = records.filter(record => record.status === 'present');
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const changeMonth = (amount: number) => {
    const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + amount, 1)).toISOString().slice(0, 7);
    setMonth(next); setSelected(`${next}-01`); setNotice('');
  };
  const checkIn = async (record: Record) => {
    setBusy(record.id); setError(''); setNotice('');
    try {
      await post(`/attendance/courses/${record.id}/check-in`, {});
      setNotice(`${record.name} checked in successfully.`); setVersion(v => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Check-in failed. Please retry.'); }
    finally { setBusy(null); }
  };
  const scoped = user?.role === 'coach' ? 'Your assigned private-course students, in one calendar.' : user?.role === 'member' ? 'Your badminton package visits and private-course attendance.' : 'Badminton package visits and private-course attendance, together.';
  return <main className="attendance-page">
    <header className="attendance-header">
      <div><p className="attendance-eyebrow">THE ZAWANA · DAILY RECORDS</p><h1>Attendance<span>.</span></h1><p>{scoped}</p></div>
      <button className="attendance-button" onClick={() => setVersion(v => v + 1)} disabled={loading} aria-label="Refresh attendance"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
    </header>
    <section className="attendance-stats" aria-label="Monthly attendance summary">
      <div><span><Check size={16} /> Check-ins</span><strong>{loading ? '—' : present.length}</strong><small>This month</small></div>
      <div><span><Users size={16} /> People present</span><strong>{loading ? '—' : new Set(present.map(r => r.personId)).size}</strong><small>Individual attendees</small></div>
      <div><span><Clock3 size={16} /> Scheduled</span><strong>{loading ? '—' : records.length - present.length}</strong><small>Private courses awaiting check-in</small></div>
    </section>
    <div className="attendance-toolbar">
      <label className="attendance-search"><Search size={17} /><input aria-label="Search attendance" placeholder="Search a name, package or coach…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label className="attendance-filter">Show<select aria-label="Attendance status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All records</option><option value="present">Checked in</option><option value="scheduled">Scheduled</option></select></label>
    </div>
    {error && <div className="attendance-error" role="alert">{error}<button onClick={() => setVersion(v => v + 1)}>Retry</button></div>}
    <p className="sr-only" role="status">{notice}</p>
    <div className="attendance-workspace" aria-busy={loading}>
      <section className="attendance-calendar" aria-label="Attendance calendar">
        <div className="attendance-calendar-heading"><div><p>MONTHLY VIEW</p><h2>{dateLabel(`${month}-01`, { month: 'long', year: 'numeric' })}</h2></div><div className="attendance-month-actions"><button aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={19} /></button><button onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>Today</button><button aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={19} /></button></div></div>
        <div className="attendance-weekdays" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
        <div className="attendance-days">{Array.from({ length: offset }, (_, i) => <div className="attendance-day attendance-day--blank" key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}`;
          const count = counts.get(date);
          return <button key={date} className={`attendance-day ${selected === date ? 'is-selected' : ''} ${date === today ? 'is-today' : ''}`} onClick={() => setSelected(date)} aria-pressed={date === selected} aria-label={`${dateLabel(date, { day: 'numeric', month: 'long' })}, ${count?.present || 0} check-ins, ${count?.scheduled || 0} scheduled`}><span>{i + 1}</span><div>{!loading && count && <><b>{count.present > 0 && <><i />{count.present}<span className="attendance-day-caption"> present</span></>}</b>{count.scheduled > 0 && <small>{count.scheduled}<span className="attendance-day-caption"> scheduled</span></small>}</>}</div></button>;
        })}</div>
        <footer><span><i /> Checked in</span><span><i /> Scheduled course</span><span>Myanmar time · UTC+6:30</span></footer>
      </section>
      <section className="attendance-agenda" aria-labelledby="attendance-day-title">
        <div className="attendance-agenda-heading"><p>{dateLabel(selected, { weekday: 'long' }).toUpperCase()}</p><h2 id="attendance-day-title">{dateLabel(selected, { day: 'numeric', month: 'long' })}</h2><span>{dayRecords.length} {dayRecords.length === 1 ? 'record' : 'records'}</span></div>
        {loading ? <div className="attendance-empty" role="status"><RefreshCw className="animate-spin" size={24} /><p>Loading attendance…</p></div> : error ? <div className="attendance-empty"><p>Attendance could not be loaded.</p></div> : dayRecords.length === 0 ? <div className="attendance-empty"><CalendarDays size={30} strokeWidth={1} /><h3>A clear day</h3><p>No {filter === 'all' ? '' : filter === 'present' ? 'check-in ' : 'scheduled '}records{query ? ' match your search' : ' for this date'}.</p></div> : <div className="attendance-records">{dayRecords.map(record => <article key={`${record.kind}-${record.id}`} className="attendance-record">
          <div className="attendance-record-top"><span className={`attendance-badge ${record.status === 'present' ? 'is-present' : ''}`}>{record.status === 'present' ? <Check size={12} /> : <Clock3 size={12} />}{record.status === 'present' ? 'Checked in' : 'Scheduled'}</span><span>{record.kind === 'course' ? 'Private course' : 'Package'}</span></div>
          <h3>{record.name}</h3><p>{record.title}</p>{record.coach && <p className="attendance-coach">Coach · {record.coach}</p>}
          <div className="attendance-record-time"><Clock3 size={14} /><span>{record.checkedInAt ? `Arrived ${clock(record.checkedInAt)}` : record.time}</span></div>
          {record.recordedBy && <small>Recorded by {record.recordedBy}</small>}
          {record.canCheckIn && <button className="attendance-checkin" disabled={busy !== null || loading} onClick={() => void checkIn(record)}><Check size={15} />{busy === record.id ? 'Checking in…' : 'Check in student'}</button>}
        </article>)}</div>}
      </section>
    </div>
    <p className="attendance-footnote">Attendance appears after a check-in is recorded. An empty date does not indicate absence.</p>
  </main>;
}
