import { categoryLabel } from '../components/BadmintonCategoryField';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, RefreshCw, Search, SlidersHorizontal, Users } from 'lucide-react';
import { get, post, API_BASE_URL, getToken } from '../api';
import { AttendanceList } from '../components/AttendanceList';
import { Toast } from '../components/UI';
import { AttendanceDetail, type AttendanceRow } from '../components/AttendanceDetail';
import { useAuth } from '../context/AuthContext';
import { bookingClock } from '../utils/bookingTime';
import './attendance.css';

type Record = AttendanceRow;
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
  const [classFilter, setClassFilter] = useState('');
  const [coachFilter, setCoachFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [packageFilter, setPackageFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [detail, setDetail] = useState<Record | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setRecords([]);
    get<{ records: Record[] }>(`/attendance?${new URLSearchParams({ month, from, to })}`).then(data => {
      if (active) setRecords(data.records);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, version, from, to]);
  useEffect(() => {
    const refresh = () => setVersion(v => v + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  const filtered = useMemo(() => records.filter(record =>
    (filter === 'all' || record.status === filter) &&
    (!categoryFilter || record.categoryCode === categoryFilter) && (!classFilter || record.title === classFilter) && (!coachFilter || record.coachId === coachFilter) && (!packageFilter || record.packageId === packageFilter) &&
    (!from || record.date >= from) && (!to || record.date <= to) &&
    `${record.name} ${record.memberId} ${record.title} ${record.coach || ''} ${record.categoryCode || ''}`.toLowerCase().includes(query.toLowerCase().trim()),
  ), [records, query, filter, classFilter, coachFilter, packageFilter, categoryFilter, from, to]);
  const counts = useMemo(() => {
    const result = new Map<string, { present: number; scheduled: number }>();
    for (const record of filtered) {
      const entry = result.get(record.date) || { present: 0, scheduled: 0 };
      if (record.status === 'present' || record.status === 'late') entry.present++; else entry.scheduled++; result.set(record.date, entry);
    }
    return result;
  }, [filtered]);
  const dayRecords = filtered.filter(record => record.date === selected);
  const present = records.filter(record => record.status === 'present' || record.status === 'late');
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const changeMonth = (amount: number) => {
    setFrom(''); setTo('');
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
  const exportCsv = async () => {
    const params = new URLSearchParams({ month, export: 'csv', q: query, title: classFilter, from, to, coachId: coachFilter, packageId: packageFilter, categoryCode: categoryFilter });
    if (filter !== 'all') params.set('status', filter);
    try {
      const response = await fetch(`${API_BASE_URL}/attendance?${params}`, { headers: { Authorization: `Bearer ${getToken()}` }, credentials: 'include' });
      if (!response.ok) throw new Error('Attendance export failed. Refresh and try again.');
      const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = `attendance-${month}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); }
  };
  const advancedFilterCount = [classFilter, coachFilter, packageFilter, categoryFilter, from, to].filter(Boolean).length;
  const hasFilters = advancedFilterCount > 0 || filter !== 'all' || !!query.trim();
  const clearFilters = () => { setQuery(''); setFilter('all'); setClassFilter(''); setCoachFilter(''); setPackageFilter(''); setCategoryFilter(''); setFrom(''); setTo(''); };
  const period = from && to ? `${dateLabel(from, { day: 'numeric', month: 'short', year: 'numeric' })} — ${dateLabel(to, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : dateLabel(`${(from || to || month).slice(0, 7)}-01`, { month: 'long', year: 'numeric' });
  const scoped = user?.role === 'coach' ? 'Your assigned private-course students, in one calendar.' : user?.role === 'member' ? 'Your badminton package visits and private-course attendance.' : 'Badminton package visits and private-course attendance, together.';
  return <main className="attendance-page">
    <header className="attendance-header">
      <div><p className="attendance-eyebrow">THE ZAWANA · DAILY RECORDS</p><h1>Attendance<span>.</span></h1><p>{scoped}</p></div>
      <button className="attendance-button" onClick={() => setVersion(v => v + 1)} disabled={loading} aria-label="Refresh attendance"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
    </header>
    <section className="attendance-stats" aria-label="Monthly attendance summary">
      <div><span><Check size={16} /> Check-ins</span><strong>{loading ? '—' : present.length}</strong><small>{from || to ? 'Selected period' : 'This month'}</small></div>
      <div><span><Users size={16} /> People present</span><strong>{loading ? '—' : new Set(present.map(r => r.personId)).size}</strong><small>Individual attendees</small></div>
      <div><span><Clock3 size={16} /> Scheduled</span><strong>{loading ? '—' : records.filter(r => r.status === 'pending').length}</strong><small>Private courses awaiting check-in</small></div>
    </section>
    <div className="attendance-toolbar">
      <label className="attendance-search"><Search size={16} strokeWidth={1.5} /><input aria-label="Search attendance" placeholder="Search a participant, package or coach…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="attendance-toolbar-actions">
        <label className="attendance-filter"><span className="sr-only">Status</span><select aria-label="Attendance status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option><option value="present">Present</option><option value="pending">Pending</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select></label>
        <button type="button" className="attendance-button attendance-filter-toggle" aria-expanded={showFilters} aria-controls="attendance-extra-filters" onClick={() => setShowFilters(value => !value)}><SlidersHorizontal size={14} strokeWidth={1.5} />Filters{advancedFilterCount > 0 && <span className="attendance-filter-count">{advancedFilterCount}</span>}</button>
        {hasFilters && <button type="button" className="attendance-clear-filters" onClick={clearFilters}>Clear</button>}
      </div>
    </div>
    <div id="attendance-extra-filters" className="attendance-extra-filters" hidden={!showFilters}>
      <label>Class / program<select aria-label="Class / program" value={classFilter} onChange={e => setClassFilter(e.target.value)}><option value="">All programs</option>{[...new Set(records.map(r => r.title))].map(title => <option key={title} value={title}>{title}</option>)}</select></label>
      <label>Coach<select aria-label="Coach filter" value={coachFilter} onChange={e => setCoachFilter(e.target.value)}><option value="">All coaches</option>{[...new Map(records.filter(r => r.coachId).map(r => [r.coachId!, r.coach!])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      {user?.role !== 'coach' && <label>Category<select aria-label="Category filter" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="">All categories</option>{['FOUNDATION', 'SOCIAL', 'PATHWAY'].map(code => <option key={code} value={code}>{categoryLabel(code)}</option>)}</select></label>}<label>Package<select aria-label="Package filter" value={packageFilter} onChange={e => setPackageFilter(e.target.value)}><option value="">All packages</option>{[...new Map(records.filter(r => r.packageId).map(r => [r.packageId!, r.package!.name])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>From<input aria-label="From date" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>To<input aria-label="To date" type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      <div className="attendance-extra-filters-footer"><span>Filters apply to the calendar and attendance list.</span>{hasFilters && <button type="button" className="attendance-clear-filters" onClick={clearFilters}>Clear filters</button>}</div>
    </div>
    {detail && <AttendanceDetail record={detail} onClose={() => setDetail(null)} onChanged={() => setVersion(v => v + 1)} />}
    {error && <div className="attendance-error" role="alert">{error}<button onClick={() => setVersion(v => v + 1)}>Retry</button></div>}
    {notice && <Toast message={notice} onClose={() => setNotice('')} />}
    <div className="attendance-workspace" aria-busy={loading}>
      <section className="attendance-calendar" aria-label="Attendance calendar">
        <div className="attendance-calendar-heading"><div><p>MONTHLY VIEW</p><h2>{dateLabel(`${month}-01`, { month: 'long', year: 'numeric' })}</h2></div><div className="attendance-month-actions"><button aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={19} /></button><button onClick={() => { setFrom(''); setTo(''); setMonth(today.slice(0, 7)); setSelected(today); }}>Today</button><button aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={19} /></button></div></div>
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
          <div className="attendance-record-top"><span className={`attendance-badge ${record.status === 'present' ? 'is-present' : ''}`}>{record.status === 'present' ? <Check size={12} /> : <Clock3 size={12} />}{record.status === 'present' ? 'Checked in' : record.status}</span><span>{record.kind === 'course' ? 'Private course' : categoryLabel(record.categoryCode)}</span></div>
          <h3><button className="underline decoration-dotted underline-offset-4" onClick={() => setDetail(record)}>{record.name}</button></h3><p>{record.title}</p>{record.coach && <p className="attendance-coach">Coach · {record.coach}</p>}
          <div className="attendance-record-time"><Clock3 size={14} /><span>{record.checkedInAt ? `Arrived ${clock(record.checkedInAt)}` : record.time}</span></div>
          {record.recordedBy && <small>Recorded by {record.recordedBy}</small>}
          {record.canCheckIn && <button className="attendance-checkin" disabled={busy !== null || loading} onClick={() => void checkIn(record)}><Check size={15} />{busy === record.id ? 'Checking in…' : 'Check in student'}</button>}
        </article>)}</div>}
      </section>
    </div>
    <AttendanceList records={filtered} loading={loading} error={records.length === 0 ? error : ''} period={period} filtered={hasFilters} canExport={user?.role === 'admin'} onView={setDetail} onExport={() => void exportCsv()} onClear={clearFilters} onRetry={() => setVersion(v => v + 1)} />
    <p className="attendance-footnote">Attendance appears after a check-in is recorded. An empty date does not indicate absence.</p>
  </main>;
}
