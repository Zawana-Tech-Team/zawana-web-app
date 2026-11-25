import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { get } from '../api';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { useAuth } from './AuthContext';

export type OperationalAction = { id: string; bookingId: string; kind: string; state: string; label: string; required: boolean; action: 'refund' | 'request' | 'reschedule' | 'coach-booking' | 'coach-proposal' | null; requestId?: string; proposalId?: string };
type Counts = { total: number; court: number; private_course: number; requests: number; refunds: number; coachRequests: number };
type Snapshot = { generatedAt: string; items: OperationalAction[]; counts: Counts };
const empty: Snapshot = { generatedAt: '', items: [], counts: { total: 0, court: 0, private_course: 0, requests: 0, refunds: 0, coachRequests: 0 } };
const ActionsContext = createContext({ ...empty, loading: false, error: '', refresh: () => {} });
/** One role-scoped reader, shared by navigation, calendars and action surfaces. */
export function OperationalActionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id, role = user?.role;
  const enabled = !!role && ['admin', 'badminton_fo', 'coach'].includes(role);
  const revision = useBookingRevision(enabled);
  const [snapshot, setSnapshot] = useState(empty), [owner, setOwner] = useState('');
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const version = useRef(0);
  const refresh = useCallback(() => setRetry(value => value + 1), []);
  useEffect(() => { setSnapshot(empty); setOwner(''); setError(''); setLoading(false); }, [enabled, userId, role]);
  useEffect(() => {
    if (!enabled || !userId) return;
    let alive = true; const request = ++version.current;
    setLoading(true);
    void get<Snapshot>('/rescheduling/actions').then(result => {
      if (!result?.counts || !Array.isArray(result.items)) throw new Error('Invalid operational action response.');
      if (alive && request === version.current) { setSnapshot(result); setOwner(`${userId}:${role}`); setError(''); }
    }).catch(() => { if (alive && request === version.current) setError('Pending actions could not refresh.'); })
      .finally(() => { if (alive && request === version.current) setLoading(false); });
    return () => { alive = false; };
  }, [enabled, userId, role, revision, retry]);
  const own = enabled && owner === `${userId}:${role}` ? snapshot : empty;
  return <ActionsContext.Provider value={{ ...own, loading: enabled && loading, error: enabled ? error : '', refresh }}>{children}<span className="sr-only" role="status">{enabled && own.generatedAt ? `${own.counts.total} operational actions require attention.` : ''}</span></ActionsContext.Provider>;
}
export const useOperationalActions = () => useContext(ActionsContext);
