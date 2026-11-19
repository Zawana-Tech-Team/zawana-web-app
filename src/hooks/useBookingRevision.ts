import { useSyncExternalStore } from 'react';
import { bookingSnapshot, subscribeBookings } from '../services/bookingSync';
const inactive = () => () => {};
export function useBookingRevision(enabled = true) {
  return useSyncExternalStore(enabled ? subscribeBookings : inactive, bookingSnapshot, () => 0);
}
