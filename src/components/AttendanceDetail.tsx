import { categoryLabel } from './BadmintonCategoryField';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { get, post } from '../api';
import { useAuth } from '../context/AuthContext';
import { StaffDialog } from './StaffDialog';
import { Button, Toast } from './UI';
export type AttendanceRow = {
  id: string; personId: string; memberId: string; kind: 'course' | 'package'; name: string; avatar: string | null; contact: string | null; membership: string | null;
  categoryCode: string | null; source: string | null; sessionsDeducted: number | null;
  title: string; coach: string | null; coachId: string | null; date: string; time: string; location: string; enrolledAt: string; checkedInAt: string | null; recordedBy: string | null;
  status: 'present' | 'absent' | 'late' | 'excused' | 'pending'; notes: string | null; canCheckIn: boolean; canCorrect: boolean; packageId: string | null;
  package: { id: string; name: string; type: string; purchaseDate: string | null; activationDate: string; expiryDate: string; total: number; used: number; remaining: number; status: string } | null;
};
type Detail = { history: AttendanceRow[]; modifications: { id: string; bookingId: string; actorId: string; reason: string; createdAt: string; previous: string; current: string }[];
  summary: { attended: number; missed: number; late: number; excused: number; completedScheduled: number; percentage: number | null } };
export function AttendanceDetail({ record, onClose, onChanged }: { record: AttendanceRow; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null), [error, setError] = useState('');
  const [status, setStatus] = useState(record.status === 'pending' ? 'present' : record.status);
  const [notes, setNotes] = useState(record.notes || ''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [view, setView] = useState<'overview' | 'history' | 'edit'>('overview');
  const path = `/attendance/${record.kind}/${encodeURIComponent(record.id)}/detail`;
  useEffect(() => {
    let active = true;
    get<Detail>(path).then(d => { if (active) setDetail(d); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [path]);
  const mark = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await post(`/attendance/${record.kind === 'course' ? 'courses' : 'packages'}/${encodeURIComponent(record.id)}/mark`, { status, notes, reason: reason || undefined });
      setDetail(await get<Detail>(path)); setNotice('Attendance saved.'); setView('history'); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Attendance could not be saved.'); }
    finally { setBusy(false); }
  };
  const current = detail?.history.find(r => r.id === record.id && r.kind === record.kind) || record;
  const p = current.package;
  const canEdit = !!detail && user?.role !== 'member' && (current.canCheckIn || current.canCorrect);
  const history = [...(detail?.history || [])].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const feedback = error ? <Toast placement="inline" message={error} type="error" onClose={() => setError('')} />
    : notice ? <Toast placement="inline" message={notice} onClose={() => setNotice('')} /> : null;

  return <StaffDialog title="Participant attendance" eyebrow="THE ZAWANA · MEMBER RECORD" onClose={onClose} busy={busy} feedback={feedback}
    footer={<>
      <span className="z-dialog__footer-note">{view === 'edit' ? 'Changes are saved to the attendance record.' : 'Yangon time · UTC+6:30'}</span>
      {view === 'edit' ? <>
        <Button className="z-dialog-secondary" disabled={busy} onClick={() => setView('overview')}>Back</Button>
        <Button className="z-dialog-primary" loading={busy} disabled={busy || (current.status !== 'pending' && reason.trim().length < 3)} onClick={mark}>Save attendance<ArrowRight size={14} /></Button>
      </> : <>
        <Button className="z-dialog-secondary" disabled={busy} onClick={onClose}>Done</Button>
        {canEdit && <Button className="z-dialog-primary" onClick={() => setView('edit')}>{current.status === 'pending' ? 'Mark attendance' : 'Correct attendance'}<ArrowRight size={14} /></Button>}
      </>}
    </>}
  >
    <section className="z-profile" aria-label="Participant profile">
      <div className="z-profile__avatar" aria-hidden="true">{record.avatar ? <img src={record.avatar} alt="" /> : initials(record.name)}</div>
      <div className="z-profile__identity"><h3 className="z-profile__name">{record.name}</h3><p className="z-profile__contact">{record.contact || 'Contact unavailable'}</p><p className="z-profile__id" title={record.memberId}>Member ID · {record.memberId}</p></div>
      <span className={`z-status z-status--${current.status}`}>{current.status}</span>
    </section>
    {view !== 'edit' && <nav className="z-dialog-nav" aria-label="Attendance views"><button aria-pressed={view === 'overview'} onClick={() => setView('overview')}>Overview</button><button aria-pressed={view === 'history'} onClick={() => setView('history')}>History</button></nav>}
    {!detail ? <p role="status" className="z-empty">{error ? 'Attendance could not be loaded.' : 'Loading attendance history…'}</p> : <>
      {view === 'overview' && <>
        <section className="z-attendance-stats z-attendance-stats--overview" aria-label="Attendance summary">
          {[
            ['Attended', detail.summary.attended], ['Missed', detail.summary.missed], ['Late', detail.summary.late],
            ['Attendance', detail.summary.percentage === null ? '—' : `${detail.summary.percentage}%`],
          ].map(([label, value]) => <div key={label} className="z-attendance-stat"><span>{label}</span><strong>{value}</strong></div>)}
        </section>
        <div className="z-detail-columns mt-6">
          <section><h3 className="z-section-title">Training information</h3><dl className="z-detail-list">
            <div className="z-fact"><dt>Class / program</dt><dd>{record.title}</dd></div>
            <div className="z-fact"><dt>Assigned coach</dt><dd>{record.coach || 'Not assigned'}</dd></div>
            <div className="z-fact"><dt>Scheduled session</dt><dd>{day(record.date)}<br />{record.time}</dd></div>
            <div className="z-fact"><dt>Location</dt><dd>{record.location}</dd></div>
            <div className="z-fact"><dt>Enrolled</dt><dd>{dateTime(record.enrolledAt, false)}</dd></div>
          </dl></section>
          <section><h3 className="z-section-title">Package information</h3>{p ? <>
            <p className="mt-4 text-sm">{p.name}</p><p className="z-caption">{categoryLabel(current.categoryCode)} · {p.type}</p><span className={`z-status z-status--${p.status} mt-2`}>{p.status}</span>
            <div className="z-package-balance"><span>{p.used} of {p.total} used</span><span>{p.remaining} remaining</span></div>
            <progress className="z-package-meter" aria-label="Package sessions used" value={Math.min(Math.max(p.used, 0), Math.max(p.total, 1))} max={Math.max(p.total, 1)} />
            <dl className="z-detail-list"><div className="z-fact"><dt>Sessions this visit</dt><dd>{current.sessionsDeducted ?? 'Not recorded'} · {current.source || 'Legacy'}</dd></div><div className="z-fact"><dt>Activation</dt><dd>{day(p.activationDate)}</dd></div><div className="z-fact"><dt>Valid until</dt><dd>{day(p.expiryDate)}</dd></div><div className="z-fact"><dt>Purchased</dt><dd>{p.purchaseDate ? dateTime(p.purchaseDate, false) : 'Not recorded'}</dd></div></dl>
          </> : <p className="z-muted mt-4">Independently purchased private course. No package is linked to this session.</p>}
            <div className="z-fact mt-5"><p className="z-fact-label">Membership</p><p className="text-xs">{record.membership || 'Not recorded'}</p></div>
          </section>
        </div>
        <section className="z-section"><div className="z-section-heading"><h3 className="z-section-title">Attendance history</h3><button className="z-dialog-link" onClick={() => setView('history')}>View all · {history.length}</button></div><HistoryList records={history.slice(0, 3)} /></section>
      </>}
      {view === 'edit' && <section className="z-section z-form">
        <div><h3 className="z-section-title">{current.status === 'pending' ? 'Mark attendance' : 'Correct attendance'}</h3><p className="z-caption mt-1">{record.title} · {day(record.date)} · {record.time}</p></div>
        <label className="z-field">Status<select aria-label="Status" disabled={busy} value={status} onChange={e => setStatus(e.target.value as typeof status)}>{['present', 'absent', 'late', 'excused'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></label>
        <label className="z-field">Training notes<textarea disabled={busy} rows={3} placeholder="A short note about the session" maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        {current.status !== 'pending' && <label className="z-field">Correction reason (required)<input disabled={busy} maxLength={1000} placeholder="Why is this record being changed?" value={reason} onChange={e => setReason(e.target.value)} /><span className="z-field-hint">Included in the modification history.</span></label>}
      </section>}
      {view === 'history' && <>
        <section><div className="z-section-heading"><h3 className="z-section-title">Attendance history</h3><span className="z-caption">{history.length} records</span></div><HistoryList records={history} /></section>
        <details className="z-section"><summary className="z-caption cursor-pointer">How attendance is calculated</summary><p className="z-caption mt-3">Present and late attendance over {detail.summary.completedScheduled} completed scheduled sessions. Future and cancelled sessions and unscheduled package visits are excluded.</p></details>
        {user?.role === 'admin' && <section className="z-section"><h3 className="z-section-title">Modification audit</h3>{!detail.modifications.length ? <p className="z-empty">No attendance corrections.</p> : detail.modifications.map(m => <div key={m.id} className="z-audit-row"><p>{m.reason}</p><p className="capitalize">{auditStatus(m.previous)} → {auditStatus(m.current)}</p><p>{dateTime(m.createdAt)} · Staff {m.actorId}</p></div>)}</section>}
      </>}
    </>}
  </StaffDialog>;
}

function HistoryList({ records }: { records: AttendanceRow[] }) {
  if (!records.length) return <p className="z-empty">No attendance records yet.</p>;
  return <ol>{records.map(r => <li key={`${r.kind}-${r.id}`} className="z-history-row"><div className="z-history-row-head"><h4>{day(r.date)} · {r.time}</h4><span className={`z-status z-status--${r.status}`}>{r.status}</span></div><p>{r.title}{r.kind === 'package' ? ` · ${categoryLabel(r.categoryCode)} · ${r.sessionsDeducted ?? '—'} sessions` : ''}{r.coach ? ` · ${r.coach}` : ''}</p><p>{r.checkedInAt ? `Checked in ${dateTime(r.checkedInAt)}` : 'No check-in recorded'} · {r.recordedBy || 'Awaiting attendance'}</p>{r.notes && <p>{r.notes}</p>}</li>)}</ol>;
}
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
function day(value: string) { return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', year: 'numeric' }); }
function dateTime(value: string, includeTime = true) { return new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', year: 'numeric', ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}) }); }
function auditStatus(value: string) { try { return JSON.parse(value).status; } catch { return 'Historical status'; } }
