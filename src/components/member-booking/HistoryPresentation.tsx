import { ArrowRight, CalendarDays } from 'lucide-react';
import { formatBookingDate } from '../../utils/bookingDates';
import { normalizeBookingTime } from '../../utils/bookingTime';
import { useLanguage } from '../../context/LanguageContext';
type Schedule = { court?: string | null; date: string; time: string };
export function HistorySchedule({ original, proposed }: { original: Schedule; proposed?: Schedule | null }) {
  const { locale } = useLanguage();
  const render = (schedule: Schedule, label: string) => <div className="history-schedule-slot"><span>{label}</span>{schedule.court && <strong>{schedule.court}</strong>}<p><CalendarDays size={13} aria-hidden="true"/>{formatBookingDate(schedule.date, { day: 'numeric', month: 'short', year: 'numeric' }, locale)}</p><p>{normalizeBookingTime(schedule.time)}</p></div>;
  return <div className={`history-schedule ${proposed ? 'history-schedule--comparison' : ''}`}>{render(original, 'Original booking')}{proposed && <><ArrowRight className="history-schedule-arrow" size={17} aria-hidden="true"/>{render(proposed, 'Requested booking')}</>}</div>;
}
export function HistoryLoading({ label }: { label: string }) {
  return <div className="booking-history-loading" role="status"><span className="sr-only">{label}</span>{[0, 1].map(item => <div key={item} className="booking-history-skeleton" aria-hidden="true"><span/><div><i/><i/></div></div>)}</div>;
}
