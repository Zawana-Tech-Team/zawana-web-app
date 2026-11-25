import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ChevronRight, CircleAlert, Search, UsersRound, RefreshCw } from 'lucide-react';
import { get, post } from '../../api';
import { useBookingClock } from '../../hooks/useBookingClock';
import { useBookingRevision } from '../../hooks/useBookingRevision';
import { formatBookingDate } from '../../utils/bookingDates';
import { SegmentedControl } from '../Interactions';
import { QrDesk } from '../QrDesk';
import { Button } from '../UI';
import { DeskDialog } from '../court-desk/DeskDialog';
import { HistoryPagination } from '../member-booking/HistoryPagination';
import './badminton-check-in.css';

type PackageEntry = { id: string; packageName: string; categoryCode: string | null; categoryName: string; sessionsRemaining: number; expiryDate: string; checkedInToday: boolean };
type Student = { id: string; name: string; phone: string; packages: PackageEntry[] };
type Roster = { date: string; totalActiveStudents: number; categories: { code: string; name: string; activeStudents: number }[]; total: number; page: number; pageSize: number; totalPages: number; rows: Student[] };
const dateLabel = (date: string) => formatBookingDate(date, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB');

function ManualCheckIn() {
  const now = useBookingClock(), revision = useBookingRevision();
  const [search, setSearch] = useState(''), [category, setCategory] = useState(''), [page, setPage] = useState(1), [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ key: string; data: Roster } | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [selected, setSelected] = useState<{ student: Student; entry: PackageEntry } | null>(null), [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false);
  const key = JSON.stringify([now.date, search, category, page]);
  useEffect(() => {
    let live = true; setLoading(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: search.trim(), category, page: String(page), pageSize: '20' });
      void get<Roster>(`/badminton/check-in-students?${params}`).then(data => { if (live) { setResult({ key, data }); setError(''); } })
        .catch((cause: Error) => { if (live) setError(cause.message || 'Could not load active students.'); })
        .finally(() => { if (live) setLoading(false); });
    }, search ? 250 : 0);
    return () => { live = false; window.clearTimeout(timer); };
  }, [key, now.date, search, category, page, reload, revision]);
  const data = result?.key === key && result.data.date === now.date ? result.data : null;
  const summary = result?.data.date === now.date ? result.data : null;
  const choose = (student: Student, entry: PackageEntry) => { setActionError(''); setSelected({ student, entry }); };
  const checkIn = async () => {
    if (!selected || lock.current) return;
    lock.current = true; setBusy(true); setActionError('');
    try {
      const saved = await post<{ categoryCode: string; enrollment: { sessionsRemaining: number } }>('/badminton/check-ins', { enrollmentId: selected.entry.id });
      setNotice(`${selected.student.name} checked in · ${selected.entry.categoryName} · ${saved.enrollment.sessionsRemaining} sessions left.`);
      setSelected(null); setLoading(true); setReload(value => value + 1);
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Check-in failed.'); setReload(value => value + 1); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="manual-check-in" aria-label="Manual package check-in" aria-busy={loading}>
    <div className="check-in-categories" role="group" aria-label="Active students by category">
      <button aria-pressed={!category} onClick={() => { setCategory(''); setPage(1); }}><UsersRound size={19} aria-hidden="true"/><span>All active students</span><strong>{summary ? summary.totalActiveStudents : '—'}</strong></button>
      {summary?.categories.map(item => <button key={item.code} aria-pressed={category === item.code} onClick={() => { setCategory(item.code); setPage(1); }}><span>{item.name}</span><strong>{item.activeStudents}</strong><small>active {item.activeStudents === 1 ? 'student' : 'students'}</small></button>)}
    </div>
    <div className="manual-check-in-tools"><label><Search size={17} aria-hidden="true"/><input aria-label="Search active students" placeholder="Find a student, phone or package" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}/></label><Button variant="secondary" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={15} aria-hidden="true"/>Refresh students</Button>{(search || category) && <Button variant="ghost" onClick={() => { setSearch(''); setCategory(''); setPage(1); }}>Clear filters</Button>}</div>
    {notice && <div role="status" className="manual-check-in-success"><CheckCircle2 size={18} aria-hidden="true"/><p>{notice}</p><Button variant="ghost" onClick={() => setNotice('')}>Dismiss</Button></div>}
    {error && <div role="alert" className="manual-check-in-error"><CircleAlert size={18} aria-hidden="true"/><p>{error}</p><Button variant="secondary" onClick={() => setReload(value => value + 1)}>Retry students</Button></div>}
    {!data && loading ? <p role="status" className="manual-check-in-empty">Loading active students…</p> : data?.rows.length ? <div className="manual-check-in-list">{data.rows.map(student => <article key={student.id} aria-label={`Student ${student.name}`}>
      <header><span className="manual-check-in-avatar" aria-hidden="true">{student.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('')}</span><div><h2>{student.name}</h2>{student.phone && <p>{student.phone}</p>}</div></header>
      <ul>{student.packages.map(entry => <li key={entry.id}><div className="manual-check-in-package"><span>{entry.categoryName}</span><h3>{entry.packageName}</h3><p><CalendarDays size={13} aria-hidden="true"/>Valid until {dateLabel(entry.expiryDate)}</p></div><div className="manual-check-in-balance"><strong>{entry.sessionsRemaining}</strong><span>sessions left</span></div>{entry.checkedInToday ? <span className="manual-check-in-done"><CheckCircle2 size={16} aria-hidden="true"/>Checked in today</span> : <Button disabled={loading||busy||!entry.categoryCode} aria-label={`Check in ${student.name} · ${entry.categoryName}`} onClick={() => choose(student, entry)}>Check in<ChevronRight size={14} aria-hidden="true"/></Button>}</li>)}</ul>
    </article>)}</div> : !loading && !error && <div className="manual-check-in-empty"><UsersRound size={30} strokeWidth={1.4} aria-hidden="true"/><h2>{search || category ? 'No matching students' : 'No active students'}</h2><p>{search || category ? 'Choose another category or search again.' : 'Students with an active package will appear here.'}</p></div>}
    {data && <HistoryPagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} noun="students" label="Manual check-in pagination" disabled={loading} onPage={setPage}/>}
    {selected && <DeskDialog title="Confirm check-in" heading={selected.student.name} size="compact" onClose={() => { if (!busy) setSelected(null); }} busy={busy} cancelLabel="Cancel" actions={<Button disabled={busy} loading={busy} onClick={() => void checkIn()}>Confirm check-in</Button>}>
      <div className="manual-check-in-confirm"><span>{selected.entry.categoryName}</span><h3>{selected.entry.packageName}</h3><p>One session will be used for today’s check-in.</p><div><strong>{selected.entry.sessionsRemaining}</strong><ChevronRight size={20} aria-hidden="true"/><strong>{Math.max(0, selected.entry.sessionsRemaining - 1)}</strong><span>sessions remaining</span></div></div>
      {actionError && <p role="alert" className="manual-check-in-error">{actionError}</p>}
    </DeskDialog>}
  </section>;
}

export function BadmintonCheckInWorkspace() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'manual' ? 'manual' : 'qr';
  return <div className="badminton-check-in-workspace"><SegmentedControl label="Check-in method" value={tab} onChange={value => { const next = new URLSearchParams(params); next.set('tab', value); setParams(next); }} options={[{ value: 'qr', label: 'QR Generation' }, { value: 'manual', label: 'Manual Check-in' }]}/>{tab === 'qr' ? <QrDesk compact/> : <ManualCheckIn/>}</div>;
}
