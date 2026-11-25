import '../components/member-booking/court-booking-review.css';
import { useBookingRevision } from '../hooks/useBookingRevision';
import { SegmentedControl } from '../components/Interactions';
import { courtBlockOccurs } from '../utils/bookingTime';
import { CourtBookingSteps } from '../components/CourtBookingSteps';
import { CourtRescheduleSummary } from '../components/CourtRescheduleSummary';
import type { CourtChangeDetail } from '../types/courtChanges';
import {
  bookingClock,
  bookingHasStarted,
  normalizeBookingTime,
} from "../utils/bookingTime";
import { useBookingClock } from "../hooks/useBookingClock";
import { courtFloor } from '../components/court-desk/timetable';
import { DeskDialog } from '../components/court-desk/DeskDialog';
import { BookingActionBar } from '../components/member-booking/BookingActionBar';
import { AnimatePresence, useReducedMotion } from "framer-motion";
import { motionTokens } from "../design/motion";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  ShoppingCart,
  ChevronDown,
  ArrowRight,
  X,
} from "lucide-react";
import { Button, Card, Empty, Page, Toast } from "../components/UI";
import { get, post } from "../api";
import { LocalizedTree, useLanguage } from "../context/LanguageContext";

export type SlotPick = {
  date: string;
  courtId: string;
  courtName: string;
  time: string;
  price: number;
};
type Conflict = {
  date?: string;
  courtId?: string;
  courtName?: string;
  time?: string;
  reason?: string;
};
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDate = (value: string) => new Date(`${value}T00:00:00`);
const todayKey = () => bookingClock().date;
const times = Array.from({ length: 15 }, (_, i) => {
  const hour = 6 + i,
    fmt = (n: number) => `${n % 12 || 12}:00 ${n >= 12 ? "PM" : "AM"}`;
  return `${fmt(hour)} — ${fmt(hour + 1)}`;
});
const minute = (value: string) => {
  const m = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return NaN;
  let h = Number(m[1]),
    min = Number(m[2]);
  if (m[3]) {
    if (h === 12) h = 0;
    if (m[3].toUpperCase() === "PM") h += 12;
  }
  return h * 60 + min;
};
const span = (value: string) => {
  const p = normalizeBookingTime(String(value || "")).split(
    /\s*(?:—|–|-|to)\s*/,
  );
  if (p.length !== 2) return null;
  const start = minute(p[0]),
    end = minute(p[1]);
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
};
const overlaps = (a: string, b: string) => {
  const x = span(a),
    y = span(b);
  return !!x && !!y && x.start < y.end && y.start < x.end;
};
const pickKey = (p: Pick<SlotPick, "date" | "courtId" | "time">) =>
  `${p.date}|${p.courtId}|${p.time}`;

const CourtDateCalendar = memo(function CourtDateCalendar({
  month,
  setMonth,
  locale,
  calendarCells,
  dates,
  loadingMonth,
  dateLabel,
  toggleDate,
  singleDate = false,
}: {
  month: Date;
  setMonth: (month: Date) => void;
  locale: string;
  calendarCells: any[];
  dates: string[];
  loadingMonth: boolean;
  dateLabel: (day: string) => string;
  toggleDate: (day: string) => void;
  singleDate?: boolean;
}) {
  return (
    <LocalizedTree>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zawana-border p-5 sm:p-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Make time to play.
            </h2>
            <p className="mt-1 text-sm text-zawana-500">
              {singleDate ? "Select a new date for your court session." : "Select one or more dates for your next sessions."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
              className="grid h-10 w-10 place-items-center rounded-full border hover:bg-zawana-950/5"
            >
              <ChevronLeft size={16} />
            </button>
            <span
              aria-live="polite"
              className="min-w-32 text-center text-sm font-semibold"
            >
              {month.toLocaleDateString(locale, {
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              aria-label="Next month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
              className="grid h-10 w-10 place-items-center rounded-full border hover:bg-zawana-950/5"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="p-3 sm:p-6">
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => (
              <div
                key={x}
                className="py-2 text-center text-[9px] font-black uppercase tracking-wider text-zawana-500 sm:text-[11px]"
              >
                {x}
              </div>
            ))}
            {calendarCells.map((cell: any, i) => (
              <div key={cell?.value || `blank-${i}`} className="min-w-0">
                {cell &&
                  (() => {
                    const hasPicks = dates.includes(cell.value);
                    return (
                      <button
                        disabled={
                          cell.isPast ||
                          cell.closed ||
                          !cell.hasCourt ||
                          loadingMonth
                        }
                        aria-pressed={hasPicks}
                        aria-label={dateLabel(cell.value)}
                        onClick={() => toggleDate(cell.value)}
                        className={`flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-xl border text-xs transition sm:min-h-[62px] sm:text-sm ${hasPicks ? "border-zawana-gold bg-zawana-gold/15 font-black text-zawana-950" : "border-transparent hover:border-zawana-950/10"} ${cell.today ? "ring-1 ring-zawana-gold" : ""} ${cell.isPast || cell.closed || !cell.hasCourt ? "cursor-not-allowed text-zawana-400 opacity-45" : ""}`}
                      >
                        <span>{cell.day}</span>
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${cell.closed ? "bg-red-500" : hasPicks ? "bg-zawana-accent" : cell.hasCourt ? "bg-emerald-500" : cell.anyBooked ? "bg-zawana-950/30" : "bg-transparent"}`}
                        />
                      </button>
                    );
                  })()}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold text-zawana-500">
            <span>
              <i className="mr-1 inline-block h-2 w-2 rounded-full bg-zawana-gold" />
              Selected dates
            </span>
            <span>
              <i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
              Available
            </span>
            <span>
              <i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />
              Closed
            </span>
            <span className="opacity-60">
              Faded dates are past or fully booked
            </span>
          </div>
        </div>
        {dates.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-zawana-border px-5 py-4">
            {dates.map((day) => (
              <button
                key={day}
                aria-label={`Remove date ${dateLabel(day)}`}
                onClick={() => toggleDate(day)}
                className="flex min-h-9 items-center gap-2 rounded-full bg-zawana-950/5 px-3 text-xs font-medium"
              >
                {parseDate(day).toLocaleDateString(locale, {
                  month: "short",
                  day: "numeric",
                })}
                <X size={12} />
              </button>
            ))}
          </div>
        )}
      </Card>
    </LocalizedTree>
  );
});

type RescheduleOptions = {
  detail: Pick<CourtChangeDetail,'booking'|'customer'|'eligibility'>;
  backTo: string;
  step: 1 | 2;
  onStepChange: (step: 1 | 2) => void;
  onReview: (selection: SlotPick) => Promise<void>;
  exceptionReason: string;
  onExceptionReason: (reason: string) => void;
  availabilityVersion: number;
  error: string;
  calendarPath?: string;
  priceSummary?: ReactNode;
  onSelectionChange?: (selection: SlotPick | undefined) => void;
};

export function CourtBooking({ reschedule }: { reschedule?: RescheduleOptions } = {}) {
  const [visibleFloor, setVisibleFloor] = useState('all');
  const isRescheduling = !!reschedule;
  const originalSpan=reschedule?span(reschedule.detail.booking.time):null;
  const duration=originalSpan?originalSpan.end-originalSpan.start:60;
  const sessionTimes=times.map(time=>{const start=span(time)!.start;const label=(n:number)=>`${Math.floor(n/60)%12||12}:${String(n%60).padStart(2,'0')} ${n>=720?'PM':'AM'}`;return {start,time:`${label(start)} — ${label(start+duration)}`};}).filter(s=>s.start+duration<=1260).map(s=>s.time);
  const { locale } = useLanguage();
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [locale],
  );
  const dateLabel = useCallback(
    (value: string) => dateFormatter.format(new Date(`${value}T00:00:00`)),
    [dateFormatter],
  );

  const [month, setMonth] = useState(() => {
    const d = parseDate(reschedule?.detail.booking.date || todayKey());
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [date, setDate] = useState(reschedule?.detail.booking.date || todayKey());
  const [localStep, setLocalStep] = useState<1 | 2>(1);
  const step = reschedule?.step || localStep;
  const setStep = (next: 1 | 2) => reschedule ? reschedule.onStepChange(next) : setLocalStep(next);
  const [dates, setDates] = useState<string[]>([]);
  const [preferredTimes, setPreferredTimes] = useState<string[]>([]);
  const [openCourt, setOpenCourt] = useState("");
  const reduceMotion = useReducedMotion();
  const transition = {
    duration: reduceMotion ? 0 : 0.14,
    ease: motionTokens.ease,
  };
  const changeDate = (value: string) => {
    setDate(value);
    const next = parseDate(value);
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    setOpenCourt("");
  };
  const [monthData, setMonthData] = useState<any>(null);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [selected, setSelected] = useState<SlotPick[]>([]);
  const toggleDate = useCallback(
    (day: string) => {
      setDate(day);
      setError("");
      setConflicts([]);
      if (isRescheduling) {
        setDates(prev => prev.includes(day) ? [] : [day]);
        setSelected([]);
        return;
      }
      if (dates.includes(day)) {
        setDates((prev) => prev.filter((d) => d !== day));
        setSelected((prev) => prev.filter((pick) => pick.date !== day));
      } else setDates((prev) => [...prev, day].sort());
    },
    [dates, isRescheduling],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [toast, setToast] = useState("");
  const [done, setDone] = useState<any[] | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;

  const bookingRevision = useBookingRevision();
  const availabilityRequest = useRef(0);
  const loadMonth = async () => {
    const request = ++availabilityRequest.current;
    setLoadingMonth(true);
    try {
      const data = await get<any>(
        `${reschedule?.calendarPath||'/bookings/month-availability'}?month=${monthKey}`,
      );
      if (request === availabilityRequest.current) { setMonthData(data); setError(''); }
    } catch (e: any) {
      if (request !== availabilityRequest.current) return;
      setError(e.message || "Could not load court availability.");
      setMonthData(null);
    } finally {
      if (request === availabilityRequest.current) setLoadingMonth(false);
    }
  };
  useEffect(() => {
    void loadMonth();
  }, [monthKey, reschedule?.availabilityVersion, reschedule?.calendarPath, bookingRevision]);

  const courts = monthData?.courts || [];
  const pickedDate = parseDate(date);
  const dateOverride = (monthData?.overrides || []).find(
    (x: any) => x.date === date,
  );
  const holiday = (monthData?.holidays || []).find((x: any) => x.date === date);
  const dayBookings = (monthData?.bookings || []).filter(
    (x: any) => x.date === date,
  );
  const dayBlocks = (monthData?.blocks || []).filter(
    (x: any) => courtBlockOccurs(x, date, dateOverride),
  );
  const blocksForDate =
    dateOverride?.type === "open" && !dateOverride.weeklyOnly
      ? dayBlocks.filter((x: any) => x.date === date)
      : dayBlocks;
  const courtOf = (id: string) => courts.find((c: any) => c.id === id);
  const dayBlocksFor = (courtId: string) =>
    blocksForDate.filter(
      (b: any) => b.courtId === courtId && b.active !== false,
    );
  const now = useBookingClock();
  const hasPassed = (day: string, time: string) => {
    return bookingHasStarted(day, time, now);
  };
  const selectionChanged=reschedule?.onSelectionChange;
  useEffect(()=>{selectionChanged?.(selected[0]);},[selected,selectionChanged]);
  const stateFor = (court: any, time: string) => {
    if(reschedule&&date===reschedule.detail.booking.date&&court.id===reschedule.detail.booking.courtId&&normalizeBookingTime(time)===normalizeBookingTime(reschedule.detail.booking.time))return 'Reserved';
    if (hasPassed(date, time)) return "Elapsed";
    if (dateOverride?.type === "closed") return "Closed";
    if (court.status !== "available") return "Unavailable";
    if (
      dayBlocksFor(court.id).some((b: any) =>
        overlaps(`${b.start} — ${b.end}`, time),
      )
    )
      return "Reserved";
    const booking = dayBookings.find(
      (b: any) => b.courtId === court.id && overlaps(b.time, time),
    );
    if (booking)
      return ["PENDING_COACH_CONFIRMATION", "AWAITING_PAYMENT"].includes(
        booking.status,
      )
        ? "Reserved"
        : "Booked";
    return "Available";
  };
  const priceFor = (court: any, time: string) => {
    const start = span(time)?.start ?? 0;
    return Array.from({length:Math.ceil(duration/60)},(_,i)=>holiday?.active?Number(holiday.price):Number(court.price)+(start+i*60>=900?5000:0)).reduce((sum,value)=>sum+value,0);
  };
  const toggle = (court: any, time: string, price: number) => {
    if (bookingHasStarted(date, time)) return;
    const candidate = {
      date,
      courtId: court.id,
      courtName: court.name,
      time,
      price,
    };
    setSelected((prev) =>
      prev.some((x) => pickKey(x) === pickKey(candidate))
        ? prev.filter((x) => pickKey(x) !== pickKey(candidate))
        : isRescheduling ? [candidate] : [...prev, candidate],
    );
    setConflicts((prev) =>
      prev.filter(
        (x) => !(x.date === date && x.courtId === court.id && x.time === time),
      ),
    );
  };

  const calendarCells = useMemo(() => {
    const firstOffset = new Date(
      month.getFullYear(),
      month.getMonth(),
      1,
    ).getDay();
    const mondayOffset = (firstOffset + 6) % 7;
    const daysInMonth = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
    ).getDate();
    return Array.from(
      { length: Math.ceil((mondayOffset + daysInMonth) / 7) * 7 },
      (_, i) => {
        const day = i - mondayOffset + 1;
        if (day < 1 || day > daysInMonth) return null;
        const d = new Date(month.getFullYear(), month.getMonth(), day),
          value = key(d),
          override = (monthData?.overrides || []).find(
            (x: any) => x.date === value,
          );
        const isPast = value < now.date,
          closed = override?.type === "closed";
        const blocks = (monthData?.blocks || []).filter(
          (x: any) => courtBlockOccurs(x, value, override),
        );
        const effectiveBlocks =
          override?.type === "open" && !override.weeklyOnly
            ? blocks.filter((x: any) => x.date === value)
            : blocks;
        const bookings = (monthData?.bookings || []).filter(
          (x: any) => x.date === value,
        );
        const hasCourt = courts.some(
          (c: any) =>
            c.status === "available" &&
            sessionTimes.some(
              (time) =>
                !hasPassed(value, time) &&
                !effectiveBlocks.some(
                  (b: any) =>
                    b.courtId === c.id &&
                    b.active !== false &&
                    overlaps(`${b.start} — ${b.end}`, time),
                ) &&
                !bookings.some(
                  (b: any) => b.courtId === c.id && overlaps(b.time, time),
                ),
            ),
        );
        const anyBooked =
          courts.length > 0 &&
          courts.every(
            (c: any) =>
              c.status !== "available" ||
              sessionTimes.every(
                (time: string) =>
                  effectiveBlocks.some(
                    (b: any) =>
                      b.courtId === c.id &&
                      b.active !== false &&
                      overlaps(`${b.start} — ${b.end}`, time),
                  ) ||
                  bookings.some(
                    (b: any) => b.courtId === c.id && overlaps(b.time, time),
                  ),
              ),
          );
        return {
          value,
          day,
          isPast,
          closed,
          hasCourt,
          anyBooked,
          today: value === now.date,
          override,
        };
      },
    );
  }, [monthKey, monthData, now.date, now.minute]);
  const slotsByCourt = useMemo(
    () =>
      new Map<string, { time: string; state: string; price: number }[]>(
        courts.map((court: any) => [
          court.id,
          sessionTimes.map((time) => ({
            time,
            state: stateFor(court, time),
            price: priceFor(court, time),
          })),
        ]),
      ),
    [monthData, date, now.date, now.minute],
  );
  const hasElapsedSelection = selected.some((pick) =>
    hasPassed(pick.date, pick.time),
  );
  const total = selected.reduce((sum, s) => sum + s.price, 0);
  const grouped = useMemo(() => {
    const byDate = new Map<string, Map<string, SlotPick[]>>();
    for (const pick of selected) {
      if (!byDate.has(pick.date)) byDate.set(pick.date, new Map());
      const byCourt = byDate.get(pick.date)!;
      if (!byCourt.has(pick.courtId)) byCourt.set(pick.courtId, []);
      byCourt.get(pick.courtId)!.push(pick);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, courts]) => ({ date: day, courts: [...courts.entries()] }));
  }, [selected]);

  const confirm = async () => {
    if (isRescheduling || !selected.length || busy) return;
    const elapsed = selected.filter((pick) =>
      bookingHasStarted(pick.date, pick.time),
    );
    if (elapsed.length) {
      setError(
        "Some selected sessions have already started. Remove them and choose a future time.",
      );
      setConflicts(
        elapsed.map((pick) => ({
          ...pick,
          reason: "This time has already passed.",
        })),
      );
      return;
    }
    setBusy(true);
    setError("");
    setConflicts([]);
    try {
      const result = await post<any>("/bookings", {
        kind: "court",
        date: selected[0].date,
        bookings: selected.map(({ date, courtId, time }) => {
          const slot = span(time)!;
          const clock = (minutes: number) =>
            `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
          return {
            date,
            courtId,
            time: `${clock(slot.start)} - ${clock(slot.end)}`,
          };
        }),
      });
      const bookings = result.bookings || [result.booking];
      setDone(bookings);
      setToast(
        `${bookings.length} court session${bookings.length === 1 ? "" : "s"} confirmed.`,
      );
      setSelected([]);
      await loadMonth();
    } catch (e: any) {
      setError(
        e.message ||
          "Your booking could not be confirmed. Refresh availability and try again.",
      );
      setConflicts(
        Array.isArray(e.details?.conflicts) ? e.details.conflicts : [],
      );
      setToast(e.message || "Some selected slots are no longer available.");
      await loadMonth();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { if (reschedule?.error) setError(reschedule.error); }, [reschedule?.error]);
  const reviewSelection = async () => {
    if (!reschedule || selected.length !== 1 || busy || hasElapsedSelection) return;
    setBusy(true); setError('');
    try { await reschedule.onReview(selected[0]); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not review this change. Try another slot.'); await loadMonth(); }
    finally { setBusy(false); }
  };
  const rescheduleDisabled = busy || loadingMonth || hasElapsedSelection || selected.length !== 1 ||
    (!!reschedule && !reschedule.detail.eligibility.eligible && reschedule.exceptionReason.trim().length < 5);

  if (done)
    return (
      <Page title="Court booking confirmed" eyebrow="Zawana Badminton Arena">
        <Card className="mx-auto max-w-3xl overflow-hidden p-0">
          <div className="border-b border-zawana-border p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-zawana-gold text-zawana-950">
                <Check />
              </span>
              <div>
                <p className="text-xs font-semibold text-zawana-500">CONFIRMED</p>
                <h2 className="text-2xl font-black">
                  Your court time is secured
                </h2>
              </div>
            </div>
            <p className="mt-3 text-sm text-zawana-500">
              {done.length} session{done.length === 1 ? "" : "s"} across{" "}
              {[...new Set(done.map((b: any) => b.date))].length} date
              {new Set(done.map((b: any) => b.date)).size === 1 ? "" : "s"}
            </p>
          </div>
          <div className="p-6">
            <div className="divide-y">
              {done.map((b: any) => (
                <div
                  key={b.id}
                  className="flex flex-wrap justify-between gap-3 py-3"
                >
                  <div>
                    <b>{b.title}</b>
                    <p className="text-sm text-zawana-500">
                      {dateLabel(b.date)} · {normalizeBookingTime(b.time || "")}{" "}
                      · Ref {b.code}
                    </p>
                  </div>
                  <b>{Number(b.price).toLocaleString(locale)} MMK</b>
                </div>
              ))}
            </div>
            <p className="mt-4 flex justify-between border-t pt-4 font-black">
              <span>Total</span>
              <span>
                {done
                  .reduce((sum: number, b: any) => sum + Number(b.price), 0)
                  .toLocaleString(locale)}{" "}
                MMK
              </span>
            </p>
            <p className="mt-3 text-xs text-zawana-500">
              Your booking and simulated payment were saved together. No external charge was made.
            </p>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            <p className="mt-4 text-sm font-semibold text-emerald-800">Payment recorded with your booking.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setDone(null);
                  setToast("");
                  setStep(1);
                  setDates([]);
                  setPreferredTimes([]);
                  setOpenCourt("");
                  setCheckoutOpen(false);
                }}
              >
                Book more court time
              </Button>
              <Link to="/bookings?kind=court">
                <Button variant="secondary">
                  My bookings <ChevronRight size={15} />
                </Button>
              </Link>
            </div>
          </div>
        </Card>
        <AnimatePresence>
          {toast && <Toast message={toast} onClose={() => setToast("")} />}
        </AnimatePresence>
      </Page>
    );

  return (
    <Page
      title={isRescheduling ? "Reschedule your court" : "Book a court"}
      eyebrow="Zawana Badminton Arena"
      actions={<Link className="inline-flex min-h-11 items-center text-sm underline underline-offset-4" to={reschedule ? reschedule.backTo : "/bookings?kind=court"}>{reschedule ? "Back to bookings" : "Booking history"}</Link>}
    >
      {hasElapsedSelection && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          A selected session has already started. Remove it from your booking
          summary to continue.
        </p>
      )}
      <div className={reschedule ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_370px]" : "mx-auto max-w-4xl"}>
        <div className="space-y-5">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              <p className="font-bold">{error}</p>
              {conflicts.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {conflicts.map((c, i) => (
                    <li
                      key={`${c.date}-${c.courtId}-${normalizeBookingTime(c.time || "")}-${i}`}
                    >
                      <b>
                        {c.courtName ||
                          courtOf(c.courtId || "")?.name ||
                          "Court"}
                      </b>{" "}
                      · {c.date ? dateLabel(c.date) : ""} ·{" "}
                      {normalizeBookingTime(c.time || "")} —{" "}
                      {c.reason || "No longer available."}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <CourtBookingSteps step={step} includeReview={isRescheduling} canChooseCourts={dates.length > 0} canReview={isRescheduling && !rescheduleDisabled} busy={busy} onChange={n => {
            if (n === 3) { void reviewSelection(); return; }
            if (n === 2) changeDate(dates.includes(date) ? date : dates[0]);
            setStep(n);
          }} />
          <motion.div
            key={step}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
            transition={transition}
            className="space-y-5"
          >
            {step === 1 ? (
              <>
                <CourtDateCalendar
                  month={month}
                  setMonth={setMonth}
                  locale={locale}
                  calendarCells={calendarCells}
                  dates={dates}
                  loadingMonth={loadingMonth}
                  dateLabel={dateLabel}
                  toggleDate={toggleDate}
                  singleDate={isRescheduling}
                />
                <Card className="p-5 sm:p-6">
                  <details>
                  <summary className="member-booking-disclosure">Preferred times (optional){preferredTimes.length ? ` · ${preferredTimes.length} selected` : ''}</summary>
                  <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {sessionTimes.map((time) => (
                      <button
                        key={time}
                        type="button"
                        aria-label={`Preferred time ${time}`}
                        aria-pressed={preferredTimes.includes(time)}
                        onClick={() =>
                          setPreferredTimes((prev) =>
                            prev.includes(time)
                              ? prev.filter((t) => t !== time)
                              : isRescheduling ? [time] : [...prev, time],
                          )
                        }
                        className={`min-h-11 rounded-xl border px-2 py-3 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-zawana-gold ${preferredTimes.includes(time) ? "border-zawana-950 bg-zawana-950 text-white" : "border-zawana-border text-zawana-500 hover:border-zawana-500"}`}
                      >
                        {time.split(" — ")[0]}
                      </button>
                    ))}
                  </div>
                  </details>
                </Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-zawana-500">
                    {dates.length} date{dates.length === 1 ? "" : "s"} ·{" "}
                    {preferredTimes.length
                      ? `${preferredTimes.length} preferred times`
                      : "Any time"}
                  </p>
                  <Button
                    disabled={!dates.length || loadingMonth}
                    onClick={() => {
                      changeDate(dates.includes(date) ? date : dates[0]);
                      setStep(2);
                    }}
                  >
                    Choose courts <ArrowRight size={16} />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">
                      Find your court.
                    </h2>
                    <p className="mt-1 text-sm text-zawana-500">
                      {isRescheduling ? "Open a court, then choose one replacement session." : "Choose a date, open a court, then select your sessions."}
                    </p>
                  </div>
                  <button
                    onClick={() => setStep(1)}
                    className="min-h-11 text-xs font-semibold text-zawana-500 underline underline-offset-4"
                  >
                    Edit dates & times
                  </button>
                </div>
                <div
                  role="group"
                  aria-label="Booking dates"
                  className="flex flex-wrap gap-2"
                >
                  {dates.map((day) => (
                    <button
                      key={day}
                      aria-pressed={day === date}
                      onClick={() => changeDate(day)}
                      className={`min-h-11 rounded-xl border px-4 py-3 text-sm font-medium transition ${date === day ? "border-zawana-950 bg-zawana-950 text-white" : "border-zawana-border bg-white text-zawana-500"}`}
                    >
                      {parseDate(day).toLocaleDateString(locale, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                      {selected.some((p) => p.date === day) && (
                        <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-zawana-gold" />
                      )}
                    </button>
                  ))}
                </div>
                <SegmentedControl className="member-booking-floors" label="Court floor" value={visibleFloor} onChange={setVisibleFloor} options={[{value:'all',label:'All floors'}, ...Array.from(new Set<string>(courts.map((court: any) => courtFloor(court)))).map(label => ({value:label,label}))]} />
                {holiday?.active && (
                  <p className="text-xs text-zawana-500">
                    Holiday rate ·{" "}
                    {Number(holiday.price).toLocaleString(locale)} MMK / session
                  </p>
                )}
                {dateOverride?.type === "open" && !dateOverride.weeklyOnly && (
                  <p className="text-xs text-emerald-700">
                    {dateOverride.title} · Special opening hours
                  </p>
                )}
                {loadingMonth ? (
                  <div
                    role="status"
                    className="animate-pulse motion-reduce:animate-none space-y-4"
                  >
                    <span className="sr-only">Loading court availability</span>
                    {[1, 2].map((n) => (
                      <div
                        key={n}
                        className="h-32 rounded-2xl bg-zawana-950/5"
                      />
                    ))}
                  </div>
                ) : dateOverride?.type === "closed" ? (
                  <Card className="p-6">
                    <p className="text-sm text-red-700">
                      Courts are unavailable on this date:{" "}
                      {dateOverride.reason || dateOverride.title}.
                    </p>
                  </Card>
                ) : courts.length ? (
                  <>

                    {[
                      {
                        label: "2nd floor",
                        color: "green",
                        courts: courts.filter((c: any) => {
                          return courtFloor(c) === "2nd floor";
                        }),
                      },
                      {
                        label: "6th floor",
                        color: "red",
                        courts: courts.filter((c: any) => {
                          return courtFloor(c) === "6th floor";
                        }),
                      },
                      {
                        label: "Other courts",
                        color: "neutral",
                        courts: courts.filter((c: any) => {
                          return courtFloor(c) === "Other courts";
                        }),
                      },
                    ]
                      .filter((floor) => floor.courts.length && (visibleFloor === 'all' || floor.label === visibleFloor))
                      .map((floor) => (
                        <section
                          key={floor.label}
                          aria-label={floor.label}
                          className="space-y-3"
                        >
                          <div className="flex items-center gap-2 px-1">
                            <MapPin
                              size={14}
                              className={
                                floor.color === "green"
                                  ? "text-emerald-600"
                                  : floor.color === "red"
                                    ? "text-rose-600"
                                    : "text-zawana-500"
                              }
                            />
                            <h3 className="text-sm font-semibold">
                              {floor.label}
                            </h3>
                            <span className="ml-auto text-xs text-zawana-500">
                              {floor.courts.length} courts
                            </span>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {floor.courts
                              .sort((a: any, b: any) =>
                                a.name.localeCompare(b.name, undefined, {
                                  numeric: true,
                                }),
                              )
                              .map((court: any) => {
                                const slots = slotsByCourt.get(court.id) || [];
                                const open = slots.filter(
                                  (slot) => slot.state === "Available",
                                ).length;
                                const visibleSlots = preferredTimes.length
                                  ? slots.filter((slot) =>
                                      preferredTimes.includes(slot.time),
                                    )
                                  : slots;
                                const expanded = openCourt === court.id;
                                const count = selected.filter(
                                  (p) =>
                                    p.date === date && p.courtId === court.id,
                                ).length;
                                return (
                                  <Card
                                    key={court.id}
                                    className={`overflow-hidden p-0 ${expanded ? "sm:col-span-2" : ""} ${floor.color === "green" ? "!border-emerald-200/70" : floor.color === "red" ? "!border-rose-200/70" : ""}`}
                                  >
                                    <button
                                      type="button"
                                      aria-expanded={expanded}
                                      aria-controls={`court-times-${court.id}`}
                                      onClick={() =>
                                        setOpenCourt(expanded ? "" : court.id)
                                      }
                                      className="flex min-h-16 w-full items-center gap-3 p-3 text-left transition hover:bg-zawana-950/[.015] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zawana-gold sm:p-5"
                                    >
                                      <span
                                        aria-hidden="true"
                                        className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-lg font-semibold ${floor.color === "green" ? "bg-emerald-100 text-emerald-800" : floor.color === "red" ? "bg-rose-100 text-rose-800" : "bg-zawana-950/5 text-zawana-950"}`}
                                      >
                                        {court.name.match(/(\d+)\D*$/)?.[1] || (
                                          <MapPin size={20} />
                                        )}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold">
                                          {court.name}
                                        </span>
                                        <span className="mt-1 block text-xs text-zawana-500">
                                          {courtFloor(court)} ·{" "}
                                          {open
                                            ? `${open} times available`
                                            : court.status === "available"
                                              ? "Fully booked"
                                              : "Unavailable"}
                                        </span>
                                      </span>
                                      <span className="hidden text-xs font-medium text-zawana-500 xl:block">
                                        {count
                                          ? `${count} selected`
                                          : `From ${Number(court.price).toLocaleString(locale)} MMK`}
                                      </span>
                                      <motion.span
                                        animate={{
                                          rotate: expanded ? 180 : 0,
                                        }}
                                        transition={transition}
                                      >
                                        <ChevronDown
                                          size={16}
                                          className="text-zawana-500"
                                        />
                                      </motion.span>
                                    </button>
                                    <AnimatePresence initial={false}>
                                      {expanded && (
                                        <motion.div
                                          id={`court-times-${court.id}`}
                                          initial={
                                            reduceMotion
                                              ? false
                                              : { opacity: 0, y: 4 }
                                          }
                                          animate={{
                                            opacity: 1,
                                          }}
                                          exit={{ opacity: 0, y: 4 }}
                                          transition={transition}
                                          className="overflow-hidden"
                                        >
                                          <div className="border-t border-zawana-border p-4 sm:p-5">
                                            <div className="mb-4 flex items-center justify-between gap-2">
                                              <p className="text-xs text-zawana-500">
                                                {dateLabel(date)} · One-hour
                                                sessions
                                              </p>
                                              {preferredTimes.length > 0 && (
                                                <button
                                                  onClick={() =>
                                                    setPreferredTimes([])
                                                  }
                                                  className="min-h-9 text-xs font-semibold underline underline-offset-4"
                                                >
                                                  Show all times
                                                </button>
                                              )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                              {visibleSlots.map(
                                                ({
                                                  time,
                                                  state,
                                                  price,
                                                }: any) => {
                                                  const isSelected =
                                                    selected.some(
                                                      (x) =>
                                                        x.date === date &&
                                                        x.courtId ===
                                                          court.id &&
                                                        x.time === time,
                                                    );
                                                  const enabled =
                                                    state === "Available" ||
                                                    (isSelected &&
                                                      state !== "Elapsed");
                                                  return (
                                                    <button
                                                      key={time}
                                                      type="button"
                                                      disabled={!enabled}
                                                      aria-label={`${court.name}, ${time}, ${isSelected ? "Selected" : state}`}
                                                      aria-pressed={isSelected}
                                                      onClick={() =>
                                                        toggle(
                                                          court,
                                                          time,
                                                          price,
                                                        )
                                                      }
                                                      className={`min-w-0 rounded-xl border p-3 text-left transition focus-visible:ring-2 focus-visible:ring-zawana-gold ${isSelected ? "border-zawana-950 bg-zawana-950 text-white" : !enabled ? "border-transparent bg-zawana-950/[.035] text-zawana-400" : "border-zawana-border hover:border-zawana-500"}`}
                                                    >
                                                      <span className="flex items-center justify-between gap-1 text-xs font-semibold">
                                                        {time.split(" — ")[0]}
                                                        {isSelected && (
                                                          <Check size={12} />
                                                        )}
                                                      </span>
                                                      <span
                                                        className={`mt-1 block text-[10px] ${isSelected ? "text-white/70" : state === "Available" ? "text-emerald-700" : "text-zawana-500"}`}
                                                      >
                                                        {isSelected
                                                          ? "Selected"
                                                          : state === "Elapsed"
                                                            ? "Time passed"
                                                            : state}
                                                      </span>
                                                      {(state === "Available" ||
                                                        isSelected) && (
                                                        <span
                                                          className={`mt-2 block text-[10px] ${isSelected ? "text-white/70" : "text-zawana-500"}`}
                                                        >
                                                          {price.toLocaleString(
                                                            locale,
                                                          )}{" "}
                                                          MMK
                                                        </span>
                                                      )}
                                                    </button>
                                                  );
                                                },
                                              )}
                                            </div>
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </Card>
                                );
                              })}
                          </div>
                        </section>
                      ))}
                  </>
                ) : (
                  <Empty
                    title="No courts configured"
                    body="Court availability will appear here once the badminton courts are set up."
                  />
                )}
              </>
            )}
          </motion.div>
        </div>

        {reschedule && <aside id="reschedule-summary" aria-label="Rescheduling summary"><CourtRescheduleSummary detail={reschedule.detail} selection={selected[0]} backTo={reschedule.backTo} busy={busy} disabled={rescheduleDisabled} exceptionReason={reschedule.exceptionReason} onExceptionReason={reschedule.onExceptionReason} onReview={() => void reviewSelection()} priceSummary={reschedule.priceSummary}/></aside>}
        {!reschedule && step === 2 && <BookingActionBar hidden={checkoutOpen} action={<Button disabled={!selected.length || busy || loadingMonth || hasElapsedSelection} onClick={() => setCheckoutOpen(true)}>Review booking <ChevronRight size={16} /></Button>}>
          <span>{selected.length} session{selected.length === 1 ? '' : 's'}</span><strong>{total.toLocaleString(locale)} MMK</strong>
        </BookingActionBar>}

      </div>
      {reschedule && step === 2 && selected.length === 1 && <>
        <div className="h-24 lg:hidden" aria-hidden="true" />
        <div role="region" aria-label="Selected replacement" className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-zawana-border bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(23,25,28,.04)] lg:hidden">
          <div className="min-w-0"><p className="truncate text-xs font-semibold">{selected[0].courtName}</p><p className="mt-1 truncate text-[11px] text-zawana-500">{selected[0].time}</p></div>
          <Button aria-label="Review selected reschedule" disabled={rescheduleDisabled} loading={busy} onClick={() => void reviewSelection()}>Review change<ArrowRight size={14} /></Button>
        </div>
      </>}
      <AnimatePresence>
        {!isRescheduling && checkoutOpen && (
          <DeskDialog title="Review booking" eyebrow="Court rental" description="Check your courts, dates and times before confirming." className="court-booking-review" onClose={() => setCheckoutOpen(false)} closeLabel="Close checkout" cancelLabel="Back to selection" busy={busy}
            summary={<div className="court-review-total"><span>{selected.length} {selected.length===1?'session':'sessions'} · Total</span><strong>{total.toLocaleString(locale)} <small>MMK</small></strong></div>}
            actions={<Button disabled={!selected.length || busy || loadingMonth || hasElapsedSelection} onClick={confirm}>{busy ? "Confirming…" : "Confirm booking"}</Button>}>
            <div>

              {selected.length ? (
                grouped.map((day) => (
                  <section key={day.date} className="court-review-day" aria-label={dateLabel(day.date)}>
                    <h3><CalendarDays size={15} aria-hidden="true"/>{dateLabel(day.date)}</h3>
                    {day.courts.map(([courtId, picks]) => {
                      const court=courts.find((item:any)=>item.id===courtId);
                      const floor=court?courtFloor(court):'Floor not specified';
                      const courtName=picks[0].courtName;
                      return <div key={courtId} className="court-review-court">
                        <h4>{courtName} <span>({floor==='Other courts'?'Floor not specified':floor})</span></h4>
                        <ul>{picks.map(p=><li key={pickKey(p)} className="court-review-session">
                          <span className="court-review-time">{normalizeBookingTime(p.time)}</span>
                          <span className="court-review-price">{p.price.toLocaleString(locale)} <small>MMK</small></span>
                          <button type="button" disabled={busy} aria-label={`Remove ${courtName} ${p.time} on ${p.date}`} onClick={()=>setSelected(previous=>previous.filter(item=>pickKey(item)!==pickKey(p)))}><X size={16} aria-hidden="true"/></button>
                        </li>)}</ul>
                      </div>;
                    })}
                  </section>
                ))
              ) : (
                <div className="py-14 text-center">
                  <ShoppingCart size={28} className="mx-auto text-zawana-400" />
                  <p className="mt-3 font-black">No sessions selected</p>
                  <p className="mt-1 text-sm text-zawana-500">
                    Choose an available court and time to add it here.
                  </p>
                </div>
              )}
              {selected.length>0&&<p className="court-review-payment-note">Payment is simulated. No money is charged.</p>}
              {hasElapsedSelection && (
                <p role="alert" className="mb-3 text-sm text-red-700">
                  A selected session has already started. Remove it to continue.
                </p>
              )}
              {error && (
                <div
                  role="alert"
                  className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
                >
                  <p>{error}</p>
                  {conflicts.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {conflicts.map((conflict, i) => (
                        <li
                          key={`${conflict.date}-${conflict.courtId}-${normalizeBookingTime(conflict.time || "")}-${i}`}
                        >
                          <b>{conflict.courtName || "Court"}</b> ·{" "}
                          {conflict.date ? dateLabel(conflict.date) : ""} ·{" "}
                          {normalizeBookingTime(conflict.time || "")} —{" "}
                          {conflict.reason || "No longer available."}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </DeskDialog>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <Toast
            message={toast}
            type={error ? "error" : "success"}
            onClose={() => setToast("")}
          />
        )}
      </AnimatePresence>
    </Page>
  );
}
