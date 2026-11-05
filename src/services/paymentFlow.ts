import { get, post } from '../api';

export type PaymentAttempt = {
  id: string;
  status: string;
  checkoutUrl?: string | null;
  qrCode?: string | null;
};

export function providerPaymentUrl(attempt: PaymentAttempt): string | null {
  if (!['PENDING', 'INITIATING'].includes(attempt.status) || !attempt.checkoutUrl) return null;
  const url = new URL(attempt.checkoutUrl);
  if (url.protocol !== 'https:') throw new Error('The payment provider returned an invalid payment link. Please contact support.');
  return url.href;
}

// Shared across entry points: repeated clicks share one initialization and redirect.
const starting = new Map<string, Promise<void>>();
export function startPayment(endpoint: string, body: object = {}): Promise<void> {
  const existing = starting.get(endpoint);
  if (existing) return existing;
  const request = (async () => {
    const result = await post<{ payment?: PaymentAttempt; attempt?: PaymentAttempt }>(endpoint, body);
    let attempt = result.payment || result.attempt;
    if (!attempt?.id) throw new Error('Could not start secure payment. Please try again.');
    const statusPath = `/payment/${encodeURIComponent(attempt.id)}`;
    // Another tab may have created the attempt while its provider request is running.
    // Wait for that request rather than creating a second provider session.
    for (let count = 0; attempt.status === 'INITIATING' && count < 40; count++) {
      await new Promise(resolve => window.setTimeout(resolve, 500));
      attempt = await get<PaymentAttempt>(`/payments/${encodeURIComponent(attempt.id)}`);
    }
    if (attempt.status === 'INITIATING') {
      throw new Error('Payment initialization is still pending. Please retry to resume the existing payment, or contact support.');
    }
    const providerUrl = providerPaymentUrl(attempt);
    if (providerUrl) {
      // Back/return lands on read-only verification, never another payment request.
      window.history.replaceState(null, '', statusPath);
      window.location.assign(providerUrl);
    } else {
      // QR-only providers use the actual in-app payment interface immediately.
      window.location.assign(statusPath);
    }
  })();
  starting.set(endpoint, request);
  // Keep a successful handoff locked until navigation completes. Errors allow retry.
  void request.catch(() => { starting.delete(endpoint); });
  return request;
}
