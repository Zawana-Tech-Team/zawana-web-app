import type { AuthResponse } from '../api';
type Identity = { uid: string; getIdToken(forceRefresh: boolean): Promise<string> };
export function createFirebaseSessionExchange(request: (token: string, signal: AbortSignal) => Promise<AuthResponse>, currentUid: () => string | undefined, timeoutMs = 25000) {
  let epoch = 0;
  let flight: { uid: string; controller: AbortController; promise: Promise<AuthResponse> } | null = null;
  const cancel = () => { ++epoch; flight?.controller.abort(Object.assign(new Error('The sign-in request was superseded.'), { code: 'SESSION_EXCHANGE_SUPERSEDED' })); flight = null; };
  const exchange = (identity: Identity) => {
    if (flight?.uid === identity.uid) return flight.promise;
    cancel();
    const generation = epoch, controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const promise = (async () => {
      try {
        const result = await Promise.race([
          (async () => request(await identity.getIdToken(true), controller.signal))(),
          new Promise<never>((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason?.code === 'SESSION_EXCHANGE_SUPERSEDED' ? controller.signal.reason : Object.assign(new Error('Sign-in verification was interrupted. Please retry.'), { code: 'SESSION_EXCHANGE_INTERRUPTED', retryable: true })), { once: true })),
        ]);
        if (generation !== epoch || currentUid() !== identity.uid) throw Object.assign(new Error('The signed-in account changed. Please retry.'), { code: 'SESSION_EXCHANGE_SUPERSEDED' });
        return result;
      } finally { clearTimeout(timer); if (flight?.controller === controller) flight = null; }
    })();
    flight = { uid: identity.uid, controller, promise };
    return promise;
  };
  return { exchange, cancel };
}
