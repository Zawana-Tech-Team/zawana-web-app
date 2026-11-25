import { ActionRequiredIndicator } from './operational-actions/OperationalActionUI';
import { CalendarDays, Clock3, MapPin, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BookingStatusBadge } from './BookingStatusBadge';
import { Button } from './UI';
import { formatBookingDate } from '../utils/bookingDates';
import { normalizeBookingTime } from '../utils/bookingTime';
import './staff-booking-history.css';

type HistoryBooking = {
  id: string; kind: string; title: string; customer: string; court: string;
  date: string; time: string; price: number; status: string; paymentStatus: string;
  coach?: { name: string };
};

/** One responsive record keeps its identity, schedule and actions together. */
export function StaffBookingHistoryList({ rows, onDetails, onCancel, reschedulePath }: {
  rows: HistoryBooking[]; onDetails: (booking: HistoryBooking) => void;
  onCancel: (id: string) => void; reschedulePath: (id: string) => string;
}) {
  return <section className="staff-history-list" aria-label="Booking history records">{rows.map(booking => {
    const weekly = booking.kind === 'weekly';
    const privateCourse = booking.kind === 'private_course';
    const state = booking.status.toLowerCase();
    const title = weekly ? booking.customer : privateCourse ? booking.title : booking.court;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(booking.date)
      ? formatBookingDate(booking.date, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB') : booking.date;
    return <article key={booking.id} className="staff-history-record" aria-label={`${title}, ${booking.date}, ${booking.time}`}>
      <div className="staff-history-identity"><h3>{title || 'Booking'}</h3>
        {!weekly && <p><UserRound size={14} aria-hidden="true"/>{booking.customer}</p>}
        {(weekly || privateCourse) && booking.court !== title && <p><MapPin size={14} aria-hidden="true"/>{booking.court || 'Court unavailable'}</p>}
        {privateCourse && booking.coach && <p className="staff-history-coach">Coach · {booking.coach.name}</p>}
      </div>
      <div className="staff-history-session"><p><CalendarDays size={16} aria-hidden="true"/><strong>{date}</strong></p><p><Clock3 size={15} aria-hidden="true"/>{normalizeBookingTime(booking.time)}</p></div>
      <div className="staff-history-state"><BookingStatusBadge status={booking.status}/><ActionRequiredIndicator bookingId={booking.id}/>{!weekly && <p className="staff-history-payment"><strong>{booking.price.toLocaleString()} MMK</strong><span>{booking.paymentStatus.replaceAll('_', ' ')}</span></p>}</div>
      <div className="staff-history-actions"><Button variant="secondary" onClick={() => onDetails(booking)}>View Details</Button>
        {booking.kind === 'court' && state === 'confirmed' && <Link to={reschedulePath(booking.id)}><Button variant="secondary">Reschedule</Button></Link>}
        {booking.kind === 'court' && !['cancelled', 'completed'].includes(state) && <Button variant="danger" onClick={() => onCancel(booking.id)}>Cancel</Button>}
      </div>
    </article>;
  })}</section>;
}
