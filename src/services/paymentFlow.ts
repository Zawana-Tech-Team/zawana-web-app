import { post } from '../api';

// Explicit confirmation only. Never redirects, opens a popup or claims provider verification.
const starting = new Map<string, Promise<void>>();
export function startPayment(endpoint: string, body: object = {}): Promise<void> {
  const key = JSON.stringify([endpoint, body]);
  const existing = starting.get(key);
  if (existing) return existing;
  const request = (async () => {
    const result = await post<{ transaction?: { id: string; status: string }; message?: string }>(endpoint, { ...body, confirmed: true });
    if (!result.transaction?.id || result.transaction.status.toLowerCase() !== 'paid') throw new Error('Payment was not confirmed. Refresh and try again.');
    window.dispatchEvent(new CustomEvent('zawana-toast', { detail: result.message || 'Manual payment confirmed.' }));
  })();
  starting.set(key, request);
  void request.finally(() => { starting.delete(key); }).catch(() => {});
  return request;
}
