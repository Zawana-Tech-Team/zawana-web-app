import { categoryLabel } from './BadmintonCategoryField';
import { ArrowUpRight, CalendarDays, Download, ListFilter, RefreshCw } from 'lucide-react';
import type { AttendanceRow } from './AttendanceDetail';

type Props = {
  records: AttendanceRow[];
  loading: boolean;
  error: string;
  period: string;
  filtered: boolean;
  canExport: boolean;
  onView: (record: AttendanceRow) => void;
  onExport: () => void;
  onClear: () => void;
  onRetry: () => void;
};
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', year: 'numeric' });
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

export function AttendanceList({ records, loading, error, period, filtered, canExport, onView, onExport, onClear, onRetry }: Props) {
  return <section className="attendance-list-panel" aria-label="Filtered attendance list" aria-busy={loading}>
    <header className="attendance-list-heading"><div><p className="attendance-list-eyebrow">PARTICIPANT RECORDS</p><h2>Attendance list<span>{loading ? '—' : records.length}</span></h2><p className="attendance-list-period">{period}{filtered ? ' · Filtered results' : ''}</p></div>
      {canExport && <button type="button" className="attendance-button attendance-export" aria-label="Export filtered CSV" disabled={loading || !!error || records.length === 0} onClick={onExport}><Download size={14} strokeWidth={1.5} /><span>Export CSV</span></button>}
    </header>
    {loading ? <div className="attendance-list-loading" role="status"><span className="sr-only">Loading attendance records…</span>{[0, 1, 2].map(row => <div className="attendance-list-skeleton" key={row} aria-hidden="true"><i /><div><span /><span /></div><span /><span /></div>)}</div>
      : error ? <div className="attendance-list-empty"><RefreshCw size={25} strokeWidth={1.25} /><h3>Unable to load attendance</h3><p>Refresh the records to try again.</p><button className="attendance-button" onClick={onRetry}>Try again</button></div>
        : records.length === 0 ? <div className="attendance-list-empty"><ListFilter size={27} strokeWidth={1.25} /><h3>{filtered ? 'No matching records' : 'No attendance yet'}</h3><p>{filtered ? 'Try another name, status or date range.' : 'Check-ins and scheduled sessions will appear here.'}</p>{filtered && <button className="attendance-button" onClick={onClear}>Clear filters</button>}</div>
          : <>
            <div className="attendance-list-desktop"><table className="attendance-list-table"><caption className="sr-only">Participant attendance, package usage and session details</caption><thead><tr>{['Participant', 'Session', 'Package', 'Sessions', 'Date & time', 'Status', ''].map((heading, i) => <th scope="col" key={heading || i}>{heading || <span className="sr-only">Actions</span>}</th>)}</tr></thead><tbody>
              {records.map(record => <tr key={`${record.kind}-${record.id}`}>
                <td><div className="attendance-list-person"><Avatar record={record} /><div className="attendance-list-identity"><button className="attendance-list-name" onClick={() => onView(record)}>{record.name}</button>{record.contact && <p className="attendance-list-contact" title={record.contact}>{record.contact}</p>}<p className="attendance-list-member" title={record.memberId}>ID · {record.memberId}</p></div></div></td>
                <td><p className="attendance-list-primary">{record.kind === 'course' ? record.title : 'Package visit'}</p><p className="attendance-list-secondary">{record.coach ? `Coach · ${record.coach}` : record.kind === 'course' ? 'Coach not assigned' : categoryLabel(record.categoryCode)}</p></td>
                <td><Package record={record} /></td>
                <td><Sessions record={record} /></td>
                <td className="attendance-list-date"><p className="attendance-list-primary">{dateLabel(record.date)}</p><p className="attendance-list-secondary">{record.time}</p></td>
                <td><Status status={record.status} /></td>
                <td><button className="attendance-list-action" aria-label={`View attendance details for ${record.name}`} onClick={() => onView(record)}><span>Details</span><ArrowUpRight size={14} strokeWidth={1.5} /></button></td>
              </tr>)}
            </tbody></table></div>
            <div className="attendance-list-mobile">{records.map(record => <article className="attendance-list-card" key={`${record.kind}-${record.id}`}>
              <div className="attendance-list-card-head"><div className="attendance-list-person"><Avatar record={record} /><div className="attendance-list-identity"><button className="attendance-list-name" onClick={() => onView(record)}>{record.name}</button><p className="attendance-list-member" title={record.memberId}>ID · {record.memberId}</p></div></div><Status status={record.status} /></div>
              <div className="attendance-list-card-session"><p className="attendance-list-primary">{record.kind === 'course' ? record.title : record.package?.name || record.title}</p><p className="attendance-list-secondary">{record.coach ? `Coach · ${record.coach}` : record.kind === 'package' ? `${categoryLabel(record.categoryCode)} · ${record.sessionsDeducted ?? '—'} session used` : 'Private course'}</p></div>
              <p className="attendance-list-card-date"><CalendarDays size={13} strokeWidth={1.5} />{dateLabel(record.date)}<span>·</span>{record.time}</p>
              {record.package && <div className="attendance-list-card-package"><Sessions record={record} /><p className={`attendance-list-validity ${record.package.status === 'expired' ? 'is-expired' : ''}`}>Valid until {dateLabel(record.package.expiryDate)} · {record.package.status}</p></div>}
              <footer>{record.contact ? <span className="attendance-list-contact" title={record.contact}>{record.contact}</span> : <span className="attendance-list-secondary">Participant record</span>}<button className="attendance-list-action" aria-label={`View attendance details for ${record.name}`} onClick={() => onView(record)}>Details<ArrowUpRight size={14} strokeWidth={1.5} /></button></footer>
            </article>)}</div>
            <footer className="attendance-list-footer"><span>{records.length} {records.length === 1 ? 'record' : 'records'}{filtered ? ' match your filters' : ' in this period'}</span><span>Yangon time · UTC+6:30</span></footer>
          </>}
  </section>;
}

function Avatar({ record }: { record: AttendanceRow }) {
  return <span className="attendance-list-avatar" aria-hidden="true">{record.avatar ? <img src={record.avatar} alt="" /> : initials(record.name)}</span>;
}
function Status({ status }: { status: AttendanceRow['status'] }) {
  return <span className={`attendance-list-status attendance-list-status--${status}`}>{status}</span>;
}
function Package({ record }: { record: AttendanceRow }) {
  if (!record.package) return <><p className="attendance-list-primary">Private course</p><p className="attendance-list-secondary">No package linked</p></>;
  return <><p className="attendance-list-primary">{record.package.name}</p><p className={`attendance-list-validity ${record.package.status === 'expired' ? 'is-expired' : ''}`}>{record.package.status === 'expired' ? 'Expired' : 'Until'} {dateLabel(record.package.expiryDate)}</p></>;
}
function Sessions({ record }: { record: AttendanceRow }) {
  const p = record.package;
  if (!p) return <span className="attendance-list-secondary" aria-label="No package sessions">—</span>;
  return <div className={`attendance-list-sessions ${p.remaining <= 2 ? 'is-low' : ''}`}><div><span>{p.used}<small> / {p.total} used</small></span><span>{p.remaining} left</span></div><progress aria-label={`Sessions used by ${record.name}`} value={Math.min(Math.max(p.used, 0), Math.max(p.total, 1))} max={Math.max(p.total, 1)} /></div>;
}
