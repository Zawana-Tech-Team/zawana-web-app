import { CalendarDays, Clock3, Phone } from 'lucide-react';
import { formatBookingDate } from '../../utils/bookingDates';
import { normalizeBookingTime } from '../../utils/bookingTime';
import { rentalCourtLabel } from '../court-desk/RentalReschedulePresentation';
import './refund.css';

export type RefundBookingDetail = {
  booking: { code: string; date: string; time: string };
  customer: { name: string | null; phone?: string | null };
  court: { name: string; floor?: string | null } | null;
  coach?: { name: string } | null; paidAmount: number | null;
};
export const refundMoney = (amount: number) => `${amount.toLocaleString('en-GB')} MMK`;
export const refundMethodLabel = (method: string) => method === 'CASH' ? 'Cash' : 'Online Payment';
export const refundTimestamp = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Yangon', dateStyle: 'medium', timeStyle: 'short' });

export function RefundBookingCard({ detail, compact = false }: { detail: RefundBookingDetail; compact?: boolean }) {
  return <section className="refund-booking-card" aria-label="Refund booking summary" data-compact={compact || undefined}>
    <header><div><strong>{detail.customer.name || 'Customer'}</strong>{detail.customer.phone && <a href={`tel:${detail.customer.phone.replace(/[^+\d]/g, '')}`}><Phone size={13} aria-hidden="true"/>{detail.customer.phone}</a>}</div><span>{detail.booking.code}</span></header>
    <h3>{rentalCourtLabel(detail.court)}</h3>
    <div className="refund-booking-schedule"><span><CalendarDays size={15} aria-hidden="true"/>{formatBookingDate(detail.booking.date, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB')}</span><span><Clock3 size={15} aria-hidden="true"/>{normalizeBookingTime(detail.booking.time)}</span></div>
    {detail.coach && <p className="refund-caption">Coach · {detail.coach.name}</p>}
    <div className="refund-paid"><span>Original payment</span><strong>{detail.paidAmount == null ? 'Needs reconciliation' : refundMoney(detail.paidAmount)}</strong></div>
  </section>;
}

export function RefundPaymentDetails({ payments, reason }: { payments: { id: string; method: string; amount: number }[]; reason?: string }) {
  return <details className="refund-disclosure"><summary>Original payment details</summary>{payments.length ? <dl className="refund-receipts">{payments.map(payment => <div key={payment.id}><dt>{payment.method} · {refundMoney(payment.amount)}</dt><dd>{payment.id}</dd></div>)}</dl> : <p className="refund-caption">No linked paid receipt.</p>}{reason&&<p className="refund-caption">Request reason: {reason}</p>}</details>;
}
