import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { get, post } from '../../api';
import { DialogSurface } from '../Interactions';
import { Button } from '../UI';
import { Select } from '../Select';
import { DeskPaymentFields, deskPaymentReady, emptyDeskPayment } from './DeskPaymentFields';

type Course = { id: string; title: string; duration: number; price: number; coaches: { id: string; name: string }[] };
type Member = { id: string; name: string; email?: string; phone?: string };
type Slot = { time: string; available: boolean; reason?: string; startMinute: number };

export function DeskPrivateCourseDialog({ court, date, initialTime, onClose, onCreated }: {
  court: { id: string; name: string }; date: string; initialTime: string; onClose: () => void; onCreated: () => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]), [coachId, setCoachId] = useState(''), [courseId, setCourseId] = useState('');
  const [query, setQuery] = useState(''), [members, setMembers] = useState<Member[]>([]), [member, setMember] = useState<Member | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]), [time, setTime] = useState(''), [loading, setLoading] = useState(false);
  const [payment, setPayment] = useState(emptyDeskPayment), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const retry = useRef({ payload: '', key: '' });
  const course = courses.find(item => item.id === courseId);
  const coaches = [...new Map(courses.flatMap(item => item.coaches).map(coach => [coach.id, coach])).values()];
  useEffect(() => { let live = true; void get<{ courses: Course[] }>('/staff/private-courses/catalog').then(data => { if (live) setCourses(data.courses); }).catch(error => { if (live) setError(error.message); }); return () => { live = false; }; }, []);
  useEffect(() => {
    let live = true;
    if (member || query.trim().length < 2) return;
    const timer = setTimeout(() => { void get<Member[]>(`/staff/private-courses/members?q=${encodeURIComponent(query.trim())}`).then(data => { if (live) setMembers(data); }).catch(error => { if (live) setError(error.message); }); }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query, member]);
  useEffect(() => {
    if (!course || !coachId) return;
    let live = true;
    const search = new URLSearchParams({ courseId: course.id, coachId, courtId: court.id, date, durationMinutes: String(course.duration) });
    void get<{ slots: Slot[] }>(`/private-courses/availability?${search}`).then(data => {
      if (!live) return;
      setSlots(data.slots);
      const initial = data.slots.find(slot => slot.available && slot.time.split(' — ')[0] === initialTime.split(' — ')[0]);
      setTime(initial?.time || '');
    }).catch(error => { if (live) setError(error.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [course, coachId, court.id, date, initialTime]);
  const resetAvailability = () => { setSlots([]); setTime(''); setLoading(true); setError(''); setPayment(emptyDeskPayment()); };
  const submit = async () => {
    if (!course || !member || !deskPaymentReady(payment) || !slots.some(slot => slot.time === time && slot.available)) return;
    const payload = { memberId: member.id, coachId, courseId, courtId: court.id, date, time, expectedPrice: course.price, payment };
    const serialized = JSON.stringify(payload);
    if (retry.current.payload !== serialized) retry.current = { payload: serialized, key: crypto.randomUUID() };
    setSaving(true); setError('');
    try { await post('/staff/court-desk/private-courses', { ...payload, requestKey: retry.current.key }); onCreated(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not record this booking.'); }
    finally { setSaving(false); }
  };
  return <DialogSurface title="Desk private course" onClose={() => { if (!saving) onClose(); }} className="desk-reservation-dialog desk-private-dialog">
    <header className="desk-reservation-dialog__header"><div><p className="text-xs text-zawana-500">Private course</p><h2 className="mt-1 text-xl font-semibold">Coach booking</h2></div><button className="desk-close" disabled={saving} aria-label="Close dialog" onClick={onClose}><X size={18} /></button></header>
    <div className="desk-reservation-dialog__body">
      <div className="desk-selection"><span><small>Court</small><strong>{court.name}</strong></span><span><small>Date</small><strong>{date}</strong></span><span><small>Time</small><strong>{time || initialTime || 'Choose below'}</strong></span></div>
      {error && <p className="desk-load-error" role="alert">{error}</p>}
      <fieldset disabled={saving} className="desk-private-fields">
        <label>Coach<Select value={coachId} onChange={event => { setCoachId(event.target.value); setCourseId(''); resetAvailability(); }}><option value="">Choose coach</option>{coaches.map(coach => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</Select></label>
        <label>Package<Select value={courseId} disabled={!coachId} onChange={event => { setCourseId(event.target.value); resetAvailability(); }}><option value="">Choose package</option>{courses.filter(course => course.coaches.some(coach => coach.id === coachId)).map(course => <option key={course.id} value={course.id}>{course.title} · {course.duration} min · {course.price.toLocaleString()} MMK</option>)}</Select></label>
        {course && <label>Session time<Select value={time} disabled={loading} onChange={event => { setTime(event.target.value); setPayment(emptyDeskPayment()); }}><option value="">{loading ? 'Checking availability…' : 'Choose available time'}</option>{slots.map(slot => <option key={slot.time} value={slot.time} disabled={!slot.available}>{slot.time}{!slot.available ? ` · ${slot.reason}` : ''}</option>)}</Select></label>}
        <label>Member name<input value={query} maxLength={100} placeholder="Search existing member (2+ characters)" onChange={event => { setQuery(event.target.value); setMember(null); setMembers([]); setPayment(emptyDeskPayment()); }} /></label>
        {!member && members.length > 0 && <div className="desk-member-results" aria-label="Matching members">{members.map(result => <button type="button" key={result.id} onClick={() => { setPayment(emptyDeskPayment()); setMember(result); setQuery(result.name); setMembers([]); }}><strong>{result.name}</strong><small>{result.phone || result.email}</small></button>)}</div>}
        {member && <p className="text-xs text-zawana-500">Selected member: {member.name}</p>}
        <DeskPaymentFields value={payment} onChange={setPayment} disabled={saving} />
      </fieldset>
      <p className="desk-recurrence">Payment is recorded now. The assigned coach must confirm before the session is approved.</p>
    </div>
    <footer className="desk-reservation-dialog__footer"><div><p>Package total</p><strong>{course ? `${course.price.toLocaleString()} MMK` : 'Choose a package'}</strong></div><Button loading={saving} disabled={saving || loading || !member || !time || !deskPaymentReady(payment)} onClick={() => void submit()}>Record & request coach</Button></footer>
  </DialogSurface>;
}
