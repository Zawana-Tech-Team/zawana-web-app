import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CalendarDays, Check, Plus, RefreshCw, X } from 'lucide-react';
import { get, patch, post } from '../api';
import { Badge, Button, Card, Empty, Pagination } from '../components/UI';
import { DialogSurface, SegmentedControl } from '../components/Interactions';
import { Select } from '../components/Select';
import GymEnrollments from './GymEnrollments';
import { gymToday, type GymCoach, type GymEnrollment, type GymPage, type GymSession } from '../types/gym';

export default function GymPrivateTraining({ coachView = false }: { coachView?: boolean }) {
  const [sessions, setSessions] = useState<GymSession[]>([]), [scope, setScope] = useState('today'), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [busy, setBusy] = useState(''), [schedule, setSchedule] = useState<{ session?: GymSession } | null>(null), [page, setPage] = useState(1);
  const [view, setView] = useState('sessions');
  const [attendance, setAttendance] = useState<Record<string, string[]>>({});
  const loadId = useRef(0);
  const load = useCallback(async () => {
    const id = (loadId.current += 1);
    setLoading(true); setError('');
    try {
      const data = await get<GymSession[]>(`${coachView ? '/coach/private-training' : '/gym/private-training'}?scope=${scope}`);
      if (id === loadId.current) setSessions(data);
    } catch (e) { if (id === loadId.current) setError(e instanceof Error ? e.message : 'Could not load training sessions.'); }
    finally { if (id === loadId.current) setLoading(false); }
  }, [scope, coachView]);
  useEffect(() => { void load(); return () => { loadId.current += 1; }; }, [load]);
  const update = async (s: GymSession, status: string) => {
    setBusy(s.id); setError('');
    const presentMemberIds = attendance[s.id] || s.attendance.filter(a => a.status === 'PRESENT').map(a => a.userId);
    try { await patch(`/gym/private-training/${s.id}/status`, { status, ...(s.enrollmentId && ['CHECKED_IN', 'COMPLETED'].includes(status) ? { presentMemberIds } : {}) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update session.'); }
    finally { setBusy(''); }
  };
  const visible = sessions.slice((page - 1) * 12, page * 12);
  return <div className="space-y-5">
    {!coachView && <SegmentedControl label="Private training management" value={view} onChange={setView} options={[{ value: 'sessions', label: 'Sessions & attendance' }, { value: 'enrollments', label: 'PT enrollments' }]} />}
    {!coachView && view === 'enrollments' ? <GymEnrollments trainingOnly /> : <>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-zawana-accent">{coachView ? 'Gym coach' : 'Gym front desk'}</p><h2 className="mt-1 text-xl font-bold">Training & attendance</h2><p className="mt-1 text-sm text-zawana-500">Individual, couple and group sessions share their enrollment balance.</p></div><div className="flex gap-2"><Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={15} /> Refresh</Button>{!coachView && <Button onClick={() => setSchedule({})}><Plus size={15} /> Schedule session</Button>}</div></div>
    <SegmentedControl label="Training session filter" value={scope} onChange={value => { setScope(value); setPage(1); }} options={[{ value: 'today', label: 'Today' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'completed', label: 'History' }, { value: 'all', label: 'All' }]} />
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {loading ? <Card className="p-6">Loading training sessions…</Card> : visible.length ? <div className="grid gap-4 lg:grid-cols-2">{visible.map(s => {
      const editable = ['SCHEDULED', 'CHECKED_IN'].includes(s.status);
      const selected = attendance[s.id] || s.attendance.filter(a => a.status === 'PRESENT').map(a => a.userId);
      return <Card key={s.id} className="p-5"><div className="flex justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-bold text-zawana-accent"><CalendarDays size={14} />{s.date} · {s.startTime}–{s.endTime}</p><h3 className="mt-3 text-lg font-bold">{s.enrollment?.snapshot.title || s.member.name}</h3><p className="mt-1 text-sm text-zawana-500">Coach {s.coach.name} · {s.durationMinutes} minutes</p></div><Badge good={s.status === 'COMPLETED'}>{s.status.replaceAll('_', ' ')}</Badge></div>
        {s.enrollment && <p className="mt-3 rounded-xl bg-zawana-50 p-3 text-sm"><b>{s.enrollment.sessionsRemaining} / {s.enrollment.sessionsTotal}</b> shared sessions left · {s.enrollment.code}{s.debit ? ' · One session deducted' : ''}</p>}
        {s.attendance.length ? <fieldset className="mt-4"><legend className="text-xs font-bold uppercase tracking-wider text-zawana-500">Participant attendance</legend><div className="mt-2 space-y-2">{s.attendance.map(a => <label key={a.userId} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span className="flex items-center gap-2"><input type="checkbox" disabled={!editable || !!busy} checked={editable ? selected.includes(a.userId) : a.status === 'PRESENT'} onChange={e => setAttendance(current => ({ ...current, [s.id]: e.target.checked ? [...selected, a.userId] : selected.filter(id => id !== a.userId) }))} />{a.user.name}</span><span className="text-xs text-zawana-500">{editable ? selected.includes(a.userId) ? 'Present' : 'Not marked present' : a.status}</span></label>)}</div></fieldset> : <p className="mt-3 text-sm">{s.member.name} · Legacy session</p>}
        {s.notes && <p className="mt-3 text-sm text-zawana-500">{s.notes}</p>}
        {editable && <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={!!busy || s.date !== gymToday()} onClick={() => void update(s, 'CHECKED_IN')}><Check size={15} /> Save attendance</Button>
          <Button disabled={!!busy || s.date > gymToday()} onClick={() => void update(s, 'COMPLETED')}>Complete session</Button>
          <Button variant="secondary" disabled={!!busy || s.date > gymToday()} onClick={() => void update(s, 'NO_SHOW')}>No show</Button>
          {!coachView && s.status === 'SCHEDULED' && s.enrollmentId && <Button variant="secondary" disabled={!!busy} onClick={() => setSchedule({ session: s })}>Reschedule</Button>}
          <Button variant="ghost" disabled={!!busy} onClick={() => void update(s, 'CANCELLED')}>Cancel</Button>
        </div>}
      </Card>;
    })}</div> : <Empty title="No sessions in this view" body="Schedule training from an activated, paid PT enrollment. Cancelled and no-show sessions do not deduct a session." action={!coachView ? <Button variant="secondary" onClick={() => setView('enrollments')}>View PT enrollments</Button> : undefined} />}
    <Pagination page={page} total={sessions.length} totalPages={Math.ceil(sessions.length / 12)} onPage={setPage} />
    {sessions.length === 300 && <p className="text-xs text-zawana-500">Showing up to 300 sessions. Use Today or Upcoming to narrow the results.</p>}
    </>}
    <AnimatePresence>{schedule && <SessionScheduler onEnrollments={() => { setSchedule(null); setView('enrollments'); }} session={schedule.session} onClose={() => setSchedule(null)} onSaved={() => { setSchedule(null); void load(); }} />}</AnimatePresence>
  </div>;
}

function SessionScheduler({ session, onClose, onSaved, onEnrollments }: { onEnrollments: () => void; session?: GymSession; onClose: () => void; onSaved: () => void }) {
  const [enrollments, setEnrollments] = useState<GymEnrollment[]>([]), [coaches, setCoaches] = useState<GymCoach[]>([]), [query, setQuery] = useState('');
  const [enrollmentId, setEnrollmentId] = useState(session?.enrollmentId || ''), [coachId, setCoachId] = useState(session?.coach.id || ''), [date, setDate] = useState(session?.date || gymToday()), [time, setTime] = useState(session?.startTime || ''), [notes, setNotes] = useState(session?.notes || '');
  const [slots, setSlots] = useState<{ time: string; available: boolean; reason: string }[]>([]), [slotLoading, setSlotLoading] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true;
    get<GymCoach[]>('/gym/private-training/coaches').then(data => { if (active) setCoaches(data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true; setLoading(true);
    const timer = window.setTimeout(() => { get<GymPage<GymEnrollment>>(`/gym/enrollments?forScheduling=true&limit=100&q=${encodeURIComponent(query)}`).then(result => { if (active) setEnrollments(result.data); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);
  const enrollment = enrollments.find(e => e.id === enrollmentId), duration = enrollment?.snapshot.sessionMinutes || session?.durationMinutes || 60;
  const excludeId = session?.id;
  useEffect(() => {
    if (!coachId || !date || !enrollmentId) { setSlots([]); return; }
    let active = true; setSlotLoading(true); setSlots([]);
    const params = new URLSearchParams({ coachId, date, enrollmentId, durationMinutes: String(duration), ...(excludeId ? { excludeId } : {}) });
    get<{ slots: typeof slots }>(`/gym/coach-availability?${params}`).then(result => { if (active) setSlots(result.slots); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setSlotLoading(false); });
    return () => { active = false; };
  }, [coachId, date, enrollmentId, duration, excludeId]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const body = { enrollmentId, coachId, date, startTime: time, notes, requestKey }; if (session) await patch(`/gym/private-training/${session.id}`, body); else await post('/gym/private-training', body); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not schedule session.'); }
    finally { setBusy(false); }
  };
  return <DialogSurface title={session ? 'Reschedule training' : 'Schedule training'} onClose={() => { if (!busy) onClose(); }} className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"><form onSubmit={save} className="max-h-[88vh] overflow-y-auto p-6">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{session ? 'Reschedule training' : 'Schedule training'}</h2><Button type="button" variant="ghost" aria-label="Close scheduler" disabled={busy} onClick={onClose}><X size={18} /></Button></div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!session && <label className="mt-5 block text-sm font-bold">Find enrollment<input className="mt-2 w-full" value={query} onChange={e => setQuery(e.target.value)} placeholder="Member, package or reference" /></label>}
    <label className="mt-4 block text-sm font-bold">Paid training enrollment<Select required disabled={!!session || loading} className="mt-2 w-full" value={enrollmentId} onChange={e => { const row = enrollments.find(r => r.id === e.target.value); setEnrollmentId(e.target.value); setCoachId(row?.coachId || ''); setTime(''); }}><option value="">Select an enrollment</option>{session && !enrollment && <option value={session.enrollmentId || ''}>{session.enrollment?.code}</option>}{enrollments.map(e => <option key={e.id} value={e.id}>{e.code} · {e.members.map(m => m.user.name).join(', ')} · {e.sessionsRemaining} left</option>)}</Select></label>
    {!loading && !enrollments.length && !session && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="status">
      <p className="font-bold">No paid PT enrollments found</p>
      <p className="mt-2">PT scheduling needs a paid individual, couple or group PT package with sessions remaining. Open PT enrollments to create a package purchase or take payment for a pending one.</p>
      <Button type="button" variant="secondary" className="mt-3" onClick={onEnrollments}>Open PT enrollments</Button>
    </div>}
    <label className="mt-4 block text-sm font-bold">Coach<Select required className="mt-2 w-full" value={coachId} onChange={e => { setCoachId(e.target.value); setTime(''); }}><option value="">Select coach</option>{coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
    <label className="mt-4 block text-sm font-bold">Session date<input required type="date" min={gymToday()} max={enrollment?.expiryDate} className="mt-2 w-full" value={date} onChange={e => { setDate(e.target.value); setTime(''); }} /></label>
    <fieldset className="mt-4"><legend className="text-sm font-bold">Available start times · {duration} minutes</legend>{slotLoading ? <p className="mt-3 text-sm">Checking coach and participant availability…</p> : <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">{slots.map(s => <button key={s.time} type="button" title={s.reason} disabled={!s.available} aria-pressed={time === s.time} onClick={() => setTime(s.time)} className={`rounded-lg border px-2 py-3 text-xs font-bold disabled:bg-zawana-50 disabled:text-zawana-400 disabled:line-through ${time === s.time ? 'border-zawana-gold bg-zawana-gold/20' : 'border-zawana-border'}`}>{s.time}</button>)}</div>}{!slots.length && !slotLoading && <p className="mt-3 text-sm text-zawana-500">Select an enrollment, coach and date.</p>}</fieldset>
    <label className="mt-4 block text-sm font-bold">Session notes<textarea maxLength={1000} className="mt-2 w-full" value={notes} onChange={e => setNotes(e.target.value)} /></label>
    <Button className="mt-5 w-full" disabled={busy || slotLoading || !slots.some(s => s.time === time && s.available)}>{busy ? 'Saving…' : session ? 'Save reschedule' : 'Schedule session'}</Button>
  </form></DialogSurface>;
}
