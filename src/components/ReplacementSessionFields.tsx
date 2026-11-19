import { useEffect, useState } from 'react';
import { get } from '../api';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { Select } from './Select';
import { bookingClock } from '../utils/bookingTime';
export type ReplacementTarget = { courtId: string; date: string; time: string };
export function ReplacementSessionFields({ target, onChange, availabilityPath, disabled = false }: {
  target: ReplacementTarget; onChange: (next: Partial<ReplacementTarget>) => void; availabilityPath: string; disabled?: boolean;
}) {
  const revision = useBookingRevision();
  const [courts, setCourts] = useState<{ id: string; name: string }[]>([]);
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => { let live = true; void get<typeof courts>('/courts').then(rows => { if (live) setCourts(rows); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  useEffect(() => {
    let live = true; setLoading(true); setError(''); setSlots([]);
    if (!target.date || !target.courtId) { setLoading(false); return; }
    const query = new URLSearchParams({ date: target.date, courtId: target.courtId });
    void get<{ slots: typeof slots }>(`${availabilityPath}?${query}`).then(data => { if (live) setSlots(data.slots); }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [availabilityPath, target.date, target.courtId, revision]);
  // A stale selected time cannot be submitted through the field after refetch.
  const selectedAvailable = !loading && slots.some(slot => slot.time === target.time && slot.available);
  useEffect(() => { if (!loading && target.time && !selectedAvailable) onChange({ time: '' }); }, [loading, target.time, selectedAvailable, onChange]);
  return <fieldset disabled={disabled} className="desk-form-section space-y-4"><legend>Replacement session</legend>
    <label className="block">Replacement court<Select aria-label="Replacement court" value={target.courtId} onChange={e => onChange({ courtId: e.target.value, time: '' })}><option value="">Choose court</option>{courts.map(court => <option key={court.id} value={court.id}>{court.name}</option>)}</Select></label>
    <label className="block">Replacement date<input className="mt-1" type="date" min={bookingClock().date} value={target.date} onChange={e => onChange({ date: e.target.value, time: '' })}/></label>
    <label className="block">Available session<Select aria-label="Available replacement time" disabled={loading || !!error} value={target.time} onChange={e => onChange({ time: e.target.value })}><option value="">{loading ? 'Checking court and coach availability…' : 'Choose available time'}</option>{slots.map(slot => <option key={slot.time} value={slot.time} disabled={!slot.available}>{slot.time}{!slot.available ? ' · Unavailable' : ''}</option>)}</Select></label>
    {error && <p role="alert" className="desk-load-error">{error}</p>}
    {!loading && !error && slots.length > 0 && !slots.some(slot => slot.available) && <p role="status">No available sessions. Choose another date or court.</p>}
  </fieldset>;
}
