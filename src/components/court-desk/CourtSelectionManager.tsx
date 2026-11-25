import { formatBookingDate } from '../../utils/bookingDates';
import { normalizeBookingTime } from '../../utils/bookingTime';
import { BookingContextSummary } from '../BookingRequestWorkflow';
import { Button } from '../UI';
import { DeskDialog } from './DeskDialog';

export type CourtSelectionEntry = { key: string; court: string; date: string; time: string; customer?: string; bookingId?: string; invalid?: boolean; remove: () => void };

/** Selection details are requested explicitly instead of repeated below the timetable. */
export function CourtSelectionManager({ entries, onClose }: { entries: CourtSelectionEntry[]; onClose: () => void }) {
  return <DeskDialog title="Selection details" size="standard" className="desk-selection-manager" onClose={onClose} cancelLabel="Done">
    <ul aria-label="Selection tray" className="desk-selection-manager__list">{entries.map(entry => <li key={entry.key}>
      <div><strong>{entry.court}</strong>{entry.customer && <p>{entry.customer}</p>}<p>{formatBookingDate(entry.date, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB')} · {normalizeBookingTime(entry.time)}</p>{entry.invalid && <p className="desk-selection-manager__invalid">Unavailable — remove or choose another session</p>}</div>
      <div className="desk-selection-manager__actions">{entry.bookingId && <BookingContextSummary bookingId={entry.bookingId} compact/>}<Button variant="ghost" aria-label={`Remove ${entry.court} ${entry.date} ${entry.time}`} onClick={entry.remove}>Remove</Button></div>
    </li>)}</ul>
  </DeskDialog>;
}
