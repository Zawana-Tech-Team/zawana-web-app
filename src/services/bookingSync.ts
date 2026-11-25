/** One visible-tab timer shared by booking consumers. No optimistic financial state. */
export const BOOKING_SYNC_INTERVAL = 15_000;
export const BOOKING_CHANGED = 'zawana-bookings-changed';
export function bookingMutation(path: string, method: string) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) return false;
  if (/\/(?:quote|preview|availability|details)(?:\?|$)/.test(path)) return false;
  return /^\/(?:bookings|court-booking|courts|court-blocks|holidays|rescheduling|schedules|coaches|private-courses|staff\/(?:court-desk|private-courses)|payments|member\/private-courses|coach\/private-courses)(?:\/|$|\?)/.test(path);
}
let revision = 0;
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;
export const bookingSnapshot = () => revision;
export function subscribeBookings(listener: () => void) {
  listeners.add(listener);
  if (!stop) {
    let pending: ReturnType<typeof setTimeout> | undefined;
    let channel: BroadcastChannel | undefined;
    try { if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel('zawana-booking-invalidation'); } catch { /* Polling remains available. */ }
    const update = (event?: Event) => {
      if (event?.type === BOOKING_CHANGED) channel?.postMessage('changed');
      if (document.hidden || pending) return;
      pending = setTimeout(() => { pending = undefined; revision++; listeners.forEach(fn => fn()); }, 100);
    };
    if (channel) channel.onmessage = () => update();
    const timer = setInterval(update, BOOKING_SYNC_INTERVAL);
    window.addEventListener(BOOKING_CHANGED, update);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    stop = () => {
      clearInterval(timer); clearTimeout(pending); channel?.close();
      window.removeEventListener(BOOKING_CHANGED, update);
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
      document.removeEventListener('visibilitychange', update);
    };
  }
  return () => { listeners.delete(listener); if (!listeners.size) { stop?.(); stop = undefined; } };
}
