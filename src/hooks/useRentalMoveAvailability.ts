import { useEffect, useState } from 'react';
import { post } from '../api';
import { useBookingRevision } from './useBookingRevision';

export type RentalAvailabilityRow = { bookingId: string; courtId: string; date: string; durationMinutes: number; slots: { time: string }[] };
type Target = { id: string; courtId: string; date: string };

export function useRentalMoveAvailability(enabled: boolean, bookingIds: string[], targets: Target[]) {
  const revision = useBookingRevision(enabled);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; rows: RentalAvailabilityRow[]; loading: boolean; error: string }>({ key: '', rows: [], loading: true, error: '' });
  const payload = JSON.stringify({ bookingIds, targets: targets.filter(target => target.courtId && target.date).map(target => ({ bookingId: target.id, courtId: target.courtId, date: target.date })) });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState({ key: payload, rows: [], loading: true, error: '' });
    const input = JSON.parse(payload);
    if (!input.targets.length) { setState({ key: payload, rows: [], loading: false, error: '' }); return; }
    void post<{ rows: RentalAvailabilityRow[] }>('/rescheduling/moves/availability', input)
      .then(result => { if (live) setState({ key: payload, rows: result.rows, loading: false, error: '' }); })
      .catch((cause: unknown) => { if (live) setState({ key: payload, rows: [], loading: false, error: cause instanceof Error ? cause.message : 'Could not load available times.' }); });
    return () => { live = false; };
  }, [enabled, payload, revision, retry]);
  const current = enabled && state.key === payload;
  return { rows: current ? state.rows : [], loading: !current || state.loading, error: current ? state.error : '', ready: current && !state.loading && !state.error, refresh: () => setRetry(value => value + 1) };
}
