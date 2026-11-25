import { categoryLabel } from '../components/BadmintonCategoryField';
import { MemberAttendanceHistory } from '../components/member-booking/MemberAttendanceHistory';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Download, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { SegmentedControl } from '../components/Interactions';
import { AttendanceStatus } from '../components/AttendanceStatus';
import { get, API_BASE_URL, getToken } from '../api';
import { AttendanceList } from '../components/AttendanceList';
import { AttendanceDetail, type AttendanceRow } from '../components/AttendanceDetail';
import { useAuth } from '../context/AuthContext';
import { bookingClock } from '../utils/bookingTime';
import './attendance.css';

type Record = AttendanceRow;
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'Asia/Yangon' }).format(new Date(`${date}T12:00:00Z`));
const clock = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Yangon', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export default function Attendance() {
  const {user}=useAuth();
  return user?.role==='member'?<MemberAttendanceHistory key={user.id}/>:<StaffAttendance/>;
}

function StaffAttendance() {
  const { user } = useAuth();
  const today = bookingClock().date;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [packageFilter, setPackageFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [detail, setDetail] = useState<Record | null>(null);
  const [version, setVersion] = useState(0);
  const [view,setView]=useState<'calendar'|'records'>('calendar');
  const [exporting,setExporting]=useState(false);
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
    (!categoryFilter || record.categoryCode === categoryFilter) && (!packageFilter || record.packageId === packageFilter) &&
    (!from || record.date >= from) && (!to || record.date <= to) &&
    `${record.name} ${record.memberId} ${record.title} ${record.package?.name || ''} ${record.categoryCode || ''}`.toLowerCase().includes(query.toLowerCase().trim()),
  ), [records, query, filter, packageFilter, categoryFilter, from, to]);
  const counts = useMemo(() => {
    const result = new Map<string, { present: number; other: number }>();
    for (const record of filtered) {
      const entry = result.get(record.date) || { present: 0, other: 0 };
      if (record.status === 'present' || record.status === 'late') entry.present++; else entry.other++; result.set(record.date, entry);
    }
    return result;
  }, [filtered]);
  const dayRecords = filtered.filter(record => record.date === selected);
  const present = filtered.filter(record => record.status === 'present' || record.status === 'late');
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const changeMonth = (amount: number) => {
    setFrom(''); setTo('');
    const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + amount, 1)).toISOString().slice(0, 7);
    setMonth(next); setSelected(`${next}-01`);
  };
  const exportCsv = async () => {
    if(exporting)return;setExporting(true);setError('');
    const params = new URLSearchParams({ month, export: 'csv', q: query, from, to, packageId: packageFilter, categoryCode: categoryFilter });
    if (filter !== 'all') params.set('status', filter);
    try {
      const response = await fetch(`${API_BASE_URL}/attendance?${params}`, { headers: { Authorization: `Bearer ${getToken()}` }, credentials: 'include' });
      if (!response.ok) throw new Error('Attendance export failed. Refresh and try again.');
      const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = `attendance-${month}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); }
    finally{setExporting(false);}
  };
  const advancedFilterCount = [packageFilter, categoryFilter, from, to].filter(Boolean).length;
  const hasFilters = advancedFilterCount > 0 || filter !== 'all' || !!query.trim();
  const clearFilters = () => { setQuery(''); setFilter('all'); setPackageFilter(''); setCategoryFilter(''); setFrom(''); setTo(''); };
  const period = from && to ? `${dateLabel(from, { day: 'numeric', month: 'short', year: 'numeric' })} — ${dateLabel(to, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : dateLabel(`${(from || to || month).slice(0, 7)}-01`, { month: 'long', year: 'numeric' });
  return <main className="attendance-page">
    <header className="attendance-header">
      <div><p className="attendance-eyebrow">Daily records</p><h1>Attendance</h1></div>
      <div className="attendance-header-actions">{user?.role==='admin'&&<button type="button" className="attendance-button" aria-label="Export filtered CSV" disabled={loading||exporting||filtered.length===0} onClick={()=>void exportCsv()}>{exporting?<RefreshCw size={15} className="animate-spin" aria-hidden="true"/>:<Download size={15} aria-hidden="true"/>}<span>{exporting?'Exporting…':'Export CSV'}</span></button>}<button className="attendance-button" onClick={() => setVersion(v => v + 1)} disabled={loading} aria-label="Refresh attendance"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true"/><span>Refresh</span></button></div>
    </header>
    <section className="attendance-stats" aria-label="Monthly attendance summary">
      <div><span><Check size={16} aria-hidden="true"/> Check-ins</span><strong>{loading ? '—' : present.length}</strong></div>
      <div><span><CalendarDays size={16} aria-hidden="true"/> Sessions used</span><strong>{loading ? '—' : filtered.reduce((total, record) => total + (record.sessionsDeducted || 0), 0)}</strong></div>
    </section>
    <SegmentedControl label="Attendance view" className="attendance-view" value={view} onChange={setView} options={[{value:'calendar',label:'Calendar'},{value:'records',label:'Records'}]}/>
    <div className="attendance-toolbar">
      <label className="attendance-search"><Search size={16} strokeWidth={1.5} /><input aria-label="Search attendance" placeholder="Search a student or package…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="attendance-toolbar-actions">
        <label className="attendance-filter"><span className="sr-only">Status</span><select aria-label="Attendance status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select></label>
        <button type="button" className="attendance-button attendance-filter-toggle" aria-expanded={showFilters} aria-controls="attendance-extra-filters" onClick={() => setShowFilters(value => !value)}><SlidersHorizontal size={14} strokeWidth={1.5} />Filters{advancedFilterCount > 0 && <span className="attendance-filter-count">{advancedFilterCount}</span>}</button>
        {hasFilters && <button type="button" className="attendance-clear-filters" onClick={clearFilters}>Clear</button>}
      </div>
    </div>
    <div id="attendance-extra-filters" className="attendance-extra-filters" hidden={!showFilters}>

      <label>Category<select aria-label="Category filter" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="">All categories</option>{['FOUNDATION', 'SOCIAL', 'PATHWAY'].map(code => <option key={code} value={code}>{categoryLabel(code)}</option>)}</select></label><label>Package<select aria-label="Package filter" value={packageFilter} onChange={e => setPackageFilter(e.target.value)}><option value="">All packages</option>{[...new Map(records.filter(r => r.packageId).map(r => [r.packageId!, r.package!.name])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>From<input aria-label="From date" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>To<input aria-label="To date" type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
    </div>
    {detail && <AttendanceDetail record={detail} onClose={() => setDetail(null)} onChanged={() => setVersion(v => v + 1)} />}
    {error && <div className="attendance-error" role="alert">{error}<button onClick={() => setVersion(v => v + 1)}>Retry</button></div>}
    <div className="attendance-period-bar"><h2>{period}</h2><div className="attendance-month-actions"><button aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={19} aria-hidden="true"/></button><button onClick={() => { setFrom(''); setTo(''); setMonth(today.slice(0, 7)); setSelected(today); }}>Today</button><button aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={19} aria-hidden="true"/></button></div></div>
    {view==='calendar'&&<div className="attendance-workspace" aria-busy={loading}>
      <section className="attendance-calendar" aria-label="Attendance calendar">
        <div className="attendance-weekdays" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
        <div className="attendance-days">{Array.from({ length: offset }, (_, i) => <div className="attendance-day attendance-day--blank" key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}`;
          const count = counts.get(date);
          return <button key={date} className={`attendance-day ${count?'has-records':''} ${selected === date ? 'is-selected' : ''} ${date === today ? 'is-today' : ''}`} onClick={() => setSelected(date)} aria-pressed={date === selected} aria-current={date===today?'date':undefined} aria-label={`${dateLabel(date, { day: 'numeric', month: 'long' })}, ${count?.present || 0} check-ins, ${count?.other || 0} other records`}><span>{i + 1}</span><div>{!loading && count && <><b>{count.present > 0 && <><i aria-hidden="true"/>{count.present}<span className="attendance-day-caption"> check-ins</span></>}</b>{count.other > 0 && <small>{count.other}<span className="attendance-day-caption"> other</span></small>}</>}</div></button>;
        })}</div>
        <footer><span><i aria-hidden="true"/> Checked in</span><span><i aria-hidden="true"/> Other records</span></footer>
      </section>
      <section className="attendance-agenda" aria-labelledby="attendance-day-title">
        <div className="attendance-agenda-heading"><h2 id="attendance-day-title">{dateLabel(selected, { weekday:'short',day: 'numeric', month: 'short',year:'numeric' })}</h2><span>{dayRecords.length} {dayRecords.length === 1 ? 'record' : 'records'}</span></div>
        {loading ? <div className="attendance-empty" role="status"><RefreshCw className="animate-spin" size={24} /><p>Loading attendance…</p></div> : error ? <div className="attendance-empty"><p>Attendance could not be loaded.</p></div> : dayRecords.length === 0 ? <div className="attendance-empty"><CalendarDays size={30} strokeWidth={1} /><h3>A clear day</h3><p>No attendance records{query ? ' match your search' : ' for this date'}.</p></div> : <div className="attendance-records">{dayRecords.map(record => <article key={`${record.kind}-${record.id}`} className="attendance-record">
          <div className="attendance-record-top"><AttendanceStatus status={record.status}/><span>{categoryLabel(record.categoryCode)}</span></div>
          <h3><button className="underline decoration-dotted underline-offset-4" onClick={() => setDetail(record)}>{record.name}</button></h3><p>{record.package?.name || record.title}</p>{record.coach && <p className="attendance-coach">Coach · {record.coach}</p>}
          <div className="attendance-record-time"><Clock3 size={14} /><span>{record.checkedInAt ? `Arrived ${clock(record.checkedInAt)}` : record.time}</span></div>
        </article>)}</div>}
      </section>
    </div>}
    {view==='records'&&<AttendanceList records={filtered} loading={loading} error={records.length === 0 ? error : ''} filtered={hasFilters} onView={setDetail}/>}
    <p className="attendance-footnote">Attendance comes from package check-ins. Empty dates do not indicate absence. Times are shown in Yangon.</p>
  </main>;
}
