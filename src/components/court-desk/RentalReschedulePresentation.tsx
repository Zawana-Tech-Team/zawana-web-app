import { CalendarDays, Clock3 } from 'lucide-react';
import { operationalReasonLabel, operationalReasons } from '../../../backend/src/domain/rescheduleReasons';
import { normalizeBookingTime } from '../../utils/bookingTime';
import { formatBookingDate } from '../../utils/bookingDates';
import { courtFloor } from './timetable';
import './rental-reschedule.css';

export type RentalCourt = { id?: string; name: string; floor?: string | null };
export const rentalCourtLabel = (court?: RentalCourt | null) => !court ? 'Court unavailable' : courtFloor(court) === 'Other courts' ? court.name : `${court.name} (${courtFloor(court)})`;

export function RentalScheduleCard({ label, court, date, time, replacement = false }: {
  label: string; court?: RentalCourt | null; date: string; time: string; replacement?: boolean;
}) {
  return <section aria-label={label} className="rental-change-schedule" data-replacement={replacement || undefined}>
    <span>{label}</span><strong>{rentalCourtLabel(court)}</strong>
    <p><CalendarDays size={15} aria-hidden="true"/>{formatBookingDate(date, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB')}</p>
    <p><Clock3 size={15} aria-hidden="true"/>{normalizeBookingTime(time)}</p>
  </section>;
}

export function RentalChangeReason({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="rental-change-field">Reason<select aria-label="Reason" value={value} disabled={disabled} required onChange={event => onChange(event.target.value)}>
    <option value="">Choose a reason</option>{operationalReasons.map(reason => <option key={reason} value={reason}>{operationalReasonLabel(reason)}</option>)}
  </select></label>;
}
