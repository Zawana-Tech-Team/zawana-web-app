import type { UserRole } from '../types';
import { bookingStart } from './bookingTime';

/** UI policy preparation only. Does not authorize or call any mutation endpoint. */
export function deskRescheduleEligibility(role: UserRole | undefined, date: string, time: string, now = new Date()) {
  if (role === 'admin' || role === 'badminton_fo') return { eligible: true, message: 'Staff have no 24-hour restriction.' };
  if (role !== 'member') return { eligible: false, message: 'This role cannot request rescheduling.' };
  const start = new Date(`${date}T00:00:00+06:30`).getTime() + bookingStart(time) * 60_000;
  const eligible = Number.isFinite(start) && start - now.getTime() > 24 * 60 * 60_000;
  return { eligible, message: eligible ? 'More than 24 hours remain before the session.' : 'Members must request changes more than 24 hours before the session.' };
}
