import { ArrowRight, CalendarDays, Clock3, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card } from './UI';
import type { CourtChangeDetail } from '../types/courtChanges';
import type { SlotPick } from '../pages/CourtBooking';
const day = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Asia/Yangon', day: 'numeric', month: 'short', year: 'numeric' });
export function CourtRescheduleSummary({ detail, selection, backTo, busy, disabled, exceptionReason, onExceptionReason, onReview }: {
  detail: CourtChangeDetail; selection?: SlotPick; backTo: string; busy: boolean; disabled: boolean;
  exceptionReason: string; onExceptionReason: (reason: string) => void; onReview: () => void;
}) {
  return <Card className="h-fit overflow-hidden p-0 xl:sticky xl:top-24">
    <div className="border-b border-zawana-border bg-zawana-900 p-5"><p className="eyebrow text-zawana-accent">RESCHEDULING</p><h2 className="mt-2 text-xl font-semibold">Your court session</h2><p className="mt-2 break-all text-xs text-zawana-500">{detail.booking.code} · {detail.customer}</p></div>
    <div className="space-y-5 p-5">
      <section><p className="text-[10px] font-semibold uppercase tracking-wider text-zawana-500">Current reservation</p><h3 className="mt-2 text-sm font-semibold">{detail.booking.title}</h3><p className="mt-2 flex items-center gap-2 text-xs text-zawana-500"><CalendarDays size={13} />{day(detail.booking.date)}</p><p className="mt-2 flex items-center gap-2 text-xs text-zawana-500"><Clock3 size={13} />{detail.booking.time}</p></section>
      <section className="border-t border-zawana-border pt-5"><p className="text-[10px] font-semibold uppercase tracking-wider text-zawana-500">New reservation</p>{selection ? <><h3 className="mt-2 text-sm font-semibold">{selection.courtName}</h3><p className="mt-2 text-xs text-zawana-500">{day(selection.date)}</p><p className="mt-2 text-xs text-zawana-500">{selection.time}</p><p className="mt-3 text-sm font-medium">{selection.price.toLocaleString()} MMK</p></> : <p className="mt-3 text-xs leading-6 text-zawana-500">Choose a date and time, then select one available court session.</p>}</section>
      <div className="flex items-start gap-2 rounded-xl bg-zawana-900 p-3 text-xs leading-6 text-zawana-500"><Info size={14} className="mt-1 shrink-0" /><p>{detail.eligibility.message}<span className="mt-2 block">This changes this one-hour session only. Other court sessions stay reserved.</span></p></div>
      {!detail.eligibility.eligible && <label className="block text-xs text-zawana-500">Manager exception approval reason<textarea aria-label="Manager exception approval reason" rows={3} maxLength={1000} disabled={busy} className="mt-2" value={exceptionReason} onChange={e => onExceptionReason(e.target.value)} /></label>}
      <Button className="w-full" disabled={disabled} loading={busy} onClick={onReview}>Review change<ArrowRight size={15} /></Button>
      <Link to={backTo} className="block text-center text-xs text-zawana-500 underline underline-offset-4">Back to bookings</Link>
    </div>
  </Card>;
}
