import { useEffect, useState } from 'react';
import { get } from '../api';

export function usePublicData<T>(path: string) {
  const [state, setState] = useState<{ data: T | null; error: string; status: number; loading: boolean }>({
    data: null, error: '', status: 0, loading: true
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const data = await get<T>(path);
        if (active) setState({ data, error: '', status: 200, loading: false });
      } catch (cause) {
        if (active) setState({ data: null, error: cause instanceof Error ? cause.message : 'Please try again.', status: (cause as { status?: number }).status || 0, loading: false });
      } finally { pending = false; }
    };
    setState({ data: null, error: '', status: 0, loading: true });
    void load();
    const onFocus = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', onFocus);
    return () => { active = false; window.removeEventListener('focus', onFocus); };
  }, [path, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}
