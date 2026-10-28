import type { UserRole } from './index';

export type CourtChangeSlot = { id: string; courtId: string; courtName: string; date: string; time: string; price: number; available: boolean };
export type CourtChangeDetail = {
  booking: { id: string; code: string; title: string; date: string; time: string; status: string; paymentStatus: string; price: number };
  customer: string;
  eligibility: { eligible: boolean; message: string; deadline?: string };
  revision: string;
  history: { id: string; action: string; reason: string; createdAt: string; previous: string; current: string; approvedById: string | null; policyException: boolean }[];
  cancellations: { id: string; status: string; reason: string; refundStatus: string; reviewReason: string | null }[];
  cancellationPolicy: { message: string };
  exceptionsEnabled: boolean;
};
export type CourtChangeQuote = { revision: string; difference: number; proposed: CourtChangeSlot };
export function courtBookingsPath(role?: UserRole) {
  return role === 'admin' ? '/admin/court-rentals' : role === 'badminton_fo' ? '/badminton-fo/bookings' : '/bookings';
}
export function courtReschedulePath(id: string, role?: UserRole) {
  return `${courtBookingsPath(role)}/${encodeURIComponent(id)}/reschedule`;
}
