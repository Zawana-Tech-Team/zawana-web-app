import { Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { CourtBooking, ManagedCourt } from '../../types';
import { courtFloor, timetablePositions } from './timetable';
import './court-desk.css';

export type DeskBlock = {
  id: string; courtId: string; start: string; end: string; type: string;
  title?: string; active?: boolean; note?: string;
  coach?: { name?: string }; coaches?: { name?: string }[];
  participants?: { name?: string }[]; participantCount?: number;
  status?: string; paymentStatus?: string;
};
type Range = { start: number; end: number };
export type DeskStatus = 'all' | 'open' | 'booked' | 'pending' | 'weekly' | 'private' | 'blocked' | 'maintenance';
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase();

export function CourtTimetable({ courts, bookings, blocks, slots, date, statusFilter, parseRange, slotStatus, loading,
  selectedCourtIds = [], selectedTime = '', selectedRecordId, selectedCells, selectedRecordIds, onSelectSlot, onSelectCourt, onSelectBooking, onSelectBlock }: {
  selectedCells?: string[]; selectedRecordIds?: string[];
  selectedCourtIds?: string[]; selectedTime?: string; selectedRecordId?: string;
  courts: ManagedCourt[]; bookings: CourtBooking[]; blocks: DeskBlock[]; slots: readonly string[]; date: string;
  statusFilter: DeskStatus; parseRange: (value: string) => Range | null;
  slotStatus: (court: ManagedCourt, time: string) => string; loading: boolean;
  onSelectSlot: (court: ManagedCourt, time: string) => void; onSelectCourt: (court: ManagedCourt) => void;
  onSelectBooking: (booking: CourtBooking) => void; onSelectBlock: (court: ManagedCourt, block: DeskBlock) => void;
}) {
  const ranges = slots.flatMap(time => { const range = parseRange(time); return range ? [{ ...range, time }] : []; });
  if (!ranges.length) return <p className="desk-empty">No operating times configured.</p>;
  const start = Math.min(...ranges.map(range => range.start)), end = Math.max(...ranges.map(range => range.end));
  const sizing = { '--desk-default-day-height': `${ranges.length * 88}px`, '--desk-court-count': courts.length } as CSSProperties;
  return <section className="court-timetable" aria-label="Daily court timetable" aria-busy={loading} style={sizing}>
    <div className="desk-timetable-caption"><span>{courts.length} courts · {slots[0].split(' — ')[0]} – {slots.at(-1)?.split(' — ')[1]}</span><span>Yangon time<span className="desk-scroll-hint"> · Scroll to see all courts</span></span></div>
    <div className="court-timetable__scroll" tabIndex={0} role="region" aria-label={`Court timetable for ${date}`}>
      <div className="court-timetable__grid">
        <div className="court-timetable__corner">Time</div>
        {courts.map(court => <button type="button" key={court.id} className="court-timetable__heading" aria-pressed={selectedCourtIds.includes(court.id)} onClick={() => onSelectCourt(court)} aria-label={`${court.name} ${court.type} court`}>
          <span>{courtFloor(court)}</span><strong>{court.name}</strong><small>{court.type} · {court.surface} · {court.status}</small>
        </button>)}
        <div className="court-timetable__times">
          {ranges.map(range => <div key={range.time} style={{ top: `${(range.start - start) / (end - start) * 100}%`, height: `${(range.end - range.start) / (end - start) * 100}%` }}><span>{range.time.split(' — ')[0]}</span></div>)}
        </div>
        {courts.map(court => {
          const events = [
            ...bookings.filter(booking => (booking.courtId ? booking.courtId === court.id : booking.court === court.name) && !['cancelled', 'expired', 'coach_declined'].includes(booking.status.toLowerCase())).flatMap(booking => {
              const range = parseRange(booking.time);
              return range ? [{ id: `booking-${booking.id}`, ...range, booking, block: null as DeskBlock | null,
                kind: label(booking.status).includes('pending') || label(booking.status) === 'awaiting payment' ? 'pending' : 'booked' }] : [];
            }),
            ...blocks.filter(block => block.courtId === court.id && block.active !== false).flatMap(block => {
              const range = parseRange(`${block.start} — ${block.end}`);
              return range ? [{ id: `block-${block.id}`, ...range, booking: null as CourtBooking | null, block, kind: block.type === 'class' ? 'weekly' : block.type === 'private' ? block.status === 'PENDING_COACH_CONFIRMATION' ? 'pending' : 'private' : 'blocked' }] : [];
            }),
          ];
          const positions = timetablePositions(events, start, end);
          return <div key={court.id} className="court-timetable__column" aria-label={court.name}>
            {ranges.map(range => {
              const state = slotStatus(court, range.time);
              const occupied = events.some(event => event.start < range.end && range.start < event.end);
              const available = state === 'open' && !occupied && !loading;
              const stateLabel = loading ? 'Loading availability' : available ? 'Available' : occupied ? 'Reserved' : state === 'elapsed' ? 'Time passed' : state === 'maintenance' ? 'Maintenance' : 'Unavailable';
              return <button key={range.time} type="button" disabled={!available} className="court-timetable__slot" data-state={available ? 'open' : state}
                aria-pressed={selectedCells ? selectedCells.includes(`${date}|${court.id}|${range.time}`) : selectedCourtIds.includes(court.id) && selectedTime === range.time}
                data-muted={statusFilter !== 'all' && statusFilter !== state} aria-label={`${court.name}, ${date}, ${range.time}, ${stateLabel}`}
                onClick={() => onSelectSlot(court, range.time)}
                style={{ top: `${(range.start - start) / (end - start) * 100}%`, height: `${(range.end - range.start) / (end - start) * 100}%` }}>
                {!occupied && <span>{available ? <><Plus size={15} aria-hidden="true" /><span>Available</span></> : stateLabel}</span>}
              </button>;
            })}
            {positions.map(position => {
              const event = events.find(event => event.id === position.id)!;
              const { booking, block } = event;
              const title = booking?.customer || block?.title || 'Reserved period';
              const time = booking?.time || `${block?.start} – ${block?.end}`;
              const type = booking ? 'Court rental' : block?.type === 'private' ? 'Private course' : event.kind === 'weekly' ? 'Weekly class' : 'Blocked period';
              const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
              const extra = block ? [block.coach?.name, ...(block.coaches?.map(coach => coach.name) || []), block.participantCount != null ? `${block.participantCount} participants` : block.participants?.length ? `${block.participants.length} participants` : null].filter(Boolean).join(' · ') : null;
              const style = { top: `${position.top}%`, height: `${position.height}%`, left: `calc(${position.lane / position.lanes * 100}% + 4px)`, width: `calc(${100 / position.lanes}% - 8px)` } as CSSProperties;
              return <button type="button" key={event.id} className="court-timetable__event" data-kind={event.kind} style={style}
                aria-pressed={selectedRecordIds ? selectedRecordIds.includes(`${booking?.id || block?.id}|${date}`) : selectedRecordId === (booking?.id || block?.id)} data-muted={statusFilter !== 'all' && statusFilter !== event.kind}
                title={`${title}\n${time}\n${type}${extra ? ` · ${extra}` : ''}${block?.note ? `\n${block.note}` : ''}${booking ? `\nBooking: ${label(booking.status)}\nPayment: ${label(booking.paymentStatus)}` : ''}`}
                aria-label={`${title}, ${court.name}, ${time}, ${type}${block?.note ? `, ${block.note}` : ''}${booking ? `, Booking ${label(booking.status)}, Payment ${label(booking.paymentStatus)}` : ''}`}
                onClick={() => booking ? onSelectBooking(booking) : block && onSelectBlock(court, block)}>
                <strong>{title}</strong><span className="desk-event-time-full">{time}</span><span className="desk-event-time-compact" aria-hidden="true">{clock(event.start)}–{clock(event.end)}</span><small>{type}{extra ? ` · ${extra}` : ''}</small>
                {booking && <span className="desk-event-status"><span>Booking: {label(booking.status)}</span><span>Payment: {label(booking.paymentStatus)}</span></span>}
              </button>;
            })}
          </div>;
        })}
      </div>
    </div>
    <div className="desk-timetable-caption"><span>End of day · {slots.at(-1)?.split(' — ')[1]}</span><span>Filtered reservations remain occupied.</span></div>
  </section>;
}
