import { useEffect, useState } from 'react';

/** Re-read finance/history only after a completed backend payment operation. */
export function usePaymentRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const update = () => setRevision(value => value + 1);
    window.addEventListener('zawana-payments-refresh', update);
    return () => window.removeEventListener('zawana-payments-refresh', update);
  }, []);
  return revision;
}
