import {
  bookingClock,
  bookingHasStarted,
  normalizeBookingTime,
} from "../utils/bookingTime";
import { useBookingClock } from "../hooks/useBookingClock";
import { DialogSurface } from "../components/Interactions";
import { AnimatePresence, useReducedMotion } from "framer-motion";
import { motionTokens } from "../design/motion";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  ShoppingCart,
  ChevronDown,
  ArrowRight,
  X,
} from "lucide-react";
import { Button, Card, Empty, Page, Toast } from "../components/UI";
import { get, post } from "../api";
import { LocalizedTree, useLanguage } from "../context/LanguageContext";

type SlotPick = {
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
}: {
  month: Date;
  setMonth: (month: Date) => void;
  locale: string;
  calendarCells: any[];
  dates: string[];
  loadingMonth: boolean;
  dateLabel: (day: string) => string;
  toggleDate: (day: string) => void;
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
              Select one or more dates for your next sessions.
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

export function CourtBooking() {
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
    const d = parseDate(todayKey());
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [date, setDate] = useState(todayKey());
  const [step, setStep] = useState<1 | 2>(1);
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
      if (dates.includes(day)) {
        setDates((prev) => prev.filter((d) => d !== day));
        setSelected((prev) => prev.filter((pick) => pick.date !== day));
      } else setDates((prev) => [...prev, day].sort());
    },
    [dates],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [toast, setToast] = useState("");
  const [done, setDone] = useState<any[] | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;

  const availabilityRequest = useRef(0);
  const loadMonth = async () => {
    const request = ++availabilityRequest.current;
    setLoadingMonth(true);
    try {
      const data = await get<any>(
        `/bookings/month-availability?month=${monthKey}`,
      );
      if (request === availabilityRequest.current) setMonthData(data);
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
  }, [monthKey]);

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
    (x: any) => x.date === date || x.dayOfWeek === pickedDate.getDay(),
  );
  const blocksForDate =
    dateOverride?.type === "open"
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
  const stateFor = (court: any, time: string) => {
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
    return holiday?.active
      ? Number(holiday.price)
      : Number(court.price) + (start >= 900 ? 5000 : 0);
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
        : [...prev, candidate],
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
          (x: any) => x.date === value || x.dayOfWeek === d.getDay(),
        );
        const effectiveBlocks =
          override?.type === "open"
            ? blocks.filter((x: any) => x.date === value)
            : blocks;
        const bookings = (monthData?.bookings || []).filter(
          (x: any) => x.date === value,
        );
        const hasCourt = courts.some(
          (c: any) =>
            c.status === "available" &&
            times.some(
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
              times.every(
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
          times.map((time) => ({
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
      if (!byCourt.has(pick.courtName)) byCourt.set(pick.courtName, []);
      byCourt.get(pick.courtName)!.push(pick);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, courts]) => ({ date: day, courts: [...courts.entries()] }));
  }, [selected]);

  const confirm = async () => {
    if (!selected.length || busy) return;
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

  if (done)
    return (
      <Page title="Court booking confirmed" eyebrow="Zawana Badminton Arena">
        <Card className="mx-auto max-w-3xl overflow-hidden p-0">
          <div className="bg-zawana-950 p-7 text-white md:p-9">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-zawana-gold text-zawana-950">
                <Check />
              </span>
              <div>
                <p className="eyebrow text-zawana-gold">CONFIRMED</p>
                <h2 className="text-2xl font-black">
                  Your court time is secured
                </h2>
              </div>
            </div>
            <p className="mt-5 text-sm text-white/65">
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
              Your court sessions are confirmed. Payment checkout is currently
              unavailable.
            </p>
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
              <Link to="/bookings">
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
      title="Book a court"
      eyebrow="Zawana Badminton Arena"
      actions={
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full bg-zawana-900 px-4 py-2 text-xs font-black sm:flex">
            <CalendarDays size={14} /> Live availability
          </div>
          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            aria-label={`Open checkout, ${selected.length} selected sessions`}
            className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-zawana-950 text-white shadow-lg transition hover:bg-zawana-purple focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zawana-gold"
          >
            <ShoppingCart size={19} />
            {selected.length > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-zawana-gold px-1 text-[10px] font-black text-zawana-950">
                {selected.length}
              </span>
            )}
          </button>
        </div>
      }
    >
      {hasElapsedSelection && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          A selected session has already started. Remove it from your booking
          summary to continue.
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
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
          <nav
            aria-label="Booking steps"
            className="flex items-center gap-3 rounded-2xl border border-zawana-border bg-white p-4 sm:gap-5 sm:p-5"
          >
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                aria-current={step === n ? "step" : undefined}
                disabled={n === 2 && !dates.length}
                onClick={() => {
                  if (n === 2)
                    changeDate(dates.includes(date) ? date : dates[0]);
                  setStep(n);
                }}
                className={`flex min-h-11 flex-1 items-center gap-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zawana-gold disabled:opacity-40 ${step === n ? "text-zawana-950" : "text-zawana-500"}`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold ${step === n ? "border-zawana-950 bg-zawana-950 text-white" : "border-zawana-border"}`}
                >
                  {n === 1 && step === 2 ? <Check size={14} /> : n}
                </span>
                <span className="font-semibold">
                  {n === 1 ? "Dates & times" : "Courts & sessions"}
                </span>
                {n === 1 && (
                  <ChevronRight
                    size={16}
                    className="ml-auto shrink-0 text-zawana-500"
                  />
                )}
              </button>
            ))}
          </nav>
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
                />
                <Card className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">
                        When would you like to play?
                      </h2>
                      <p className="mt-1 text-sm text-zawana-500">
                        Choose multiple hourly times, or leave open to see every
                        time.
                      </p>
                    </div>
                    <Clock3
                      size={18}
                      className="mt-1 shrink-0 text-zawana-500"
                    />
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {times.map((time) => (
                      <button
                        key={time}
                        type="button"
                        aria-label={`Preferred time ${time}`}
                        aria-pressed={preferredTimes.includes(time)}
                        onClick={() =>
                          setPreferredTimes((prev) =>
                            prev.includes(time)
                              ? prev.filter((t) => t !== time)
                              : [...prev, time],
                          )
                        }
                        className={`min-h-11 rounded-xl border px-2 py-3 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-zawana-gold ${preferredTimes.includes(time) ? "border-zawana-950 bg-zawana-950 text-white" : "border-zawana-border text-zawana-500 hover:border-zawana-500"}`}
                      >
                        {time.split(" — ")[0]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-zawana-500">
                    Each session is one hour. Availability is shown when you
                    choose a court.
                  </p>
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
                      Choose a date, open a court, then select your sessions.
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
                {holiday?.active && (
                  <p className="text-xs text-zawana-500">
                    Holiday rate ·{" "}
                    {Number(holiday.price).toLocaleString(locale)} MMK / session
                  </p>
                )}
                {dateOverride?.type === "open" && (
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
                    <p className="text-xs text-zawana-500">
                      Green and red identify floors. Each time shows its
                      availability.
                    </p>
                    {[
                      {
                        label: "2nd floor",
                        color: "green",
                        courts: courts.filter((c: any) => {
                          const n = Number(c.name.match(/(\d+)\D*$/)?.[1]);
                          return n >= 1 && n <= 4;
                        }),
                      },
                      {
                        label: "6th floor",
                        color: "red",
                        courts: courts.filter((c: any) => {
                          const n = Number(c.name.match(/(\d+)\D*$/)?.[1]);
                          return n >= 5 && n <= 8;
                        }),
                      },
                      {
                        label: "Other courts",
                        color: "neutral",
                        courts: courts.filter((c: any) => {
                          const n = Number(c.name.match(/(\d+)\D*$/)?.[1]);
                          return !(n >= 1 && n <= 8);
                        }),
                      },
                    ]
                      .filter((floor) => floor.courts.length)
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
                                      className="flex min-h-24 w-full items-center gap-4 p-4 text-left transition hover:bg-zawana-950/[.015] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zawana-gold sm:p-5"
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
                                          {court.surface} ·{" "}
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

        <div id="booking-summary">
          <Card className="h-fit overflow-hidden p-0 xl:sticky xl:top-24">
            <div className="bg-zawana-950 p-5 text-white">
              <p className="eyebrow text-zawana-gold">BOOKING SUMMARY</p>
              <h2 className="mt-1 text-xl font-black">Review your sessions</h2>
            </div>
            <div className="p-5">
              {selected.length ? (
                <>
                  <div className="my-4 space-y-4">
                    {grouped.map((day) => (
                      <div
                        key={day.date}
                        className="rounded-xl bg-zawana-900 p-3"
                      >
                        <div className="mb-3 flex items-center gap-2 text-sm font-black">
                          <MapPin size={14} className="text-zawana-gold" />
                          {dateLabel(day.date)}
                        </div>
                        {day.courts.map(([courtName, picks]) => (
                          <div
                            key={courtName}
                            className="mb-2 border-t border-zawana-950/8 pt-2 last:mb-0"
                          >
                            <div className="mb-1 text-xs font-black">
                              {courtName}
                            </div>
                            {picks.map((p) => (
                              <div
                                key={pickKey(p)}
                                className="flex items-center justify-between gap-2 py-1 text-xs"
                              >
                                <span>{p.time}</span>
                                <span className="flex items-center gap-2">
                                  <b>{p.price.toLocaleString(locale)} MMK</b>
                                  <button
                                    aria-label={`Remove ${courtName} ${p.time} on ${p.date}`}
                                    onClick={() =>
                                      setSelected((prev) =>
                                        prev.filter(
                                          (x) => pickKey(x) !== pickKey(p),
                                        ),
                                      )
                                    }
                                    className="rounded p-1 hover:bg-red-50 hover:text-red-600"
                                  >
                                    <X size={13} />
                                  </button>
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between border-t pt-4 text-sm">
                    <span>
                      {selected.length} session
                      {selected.length === 1 ? "" : "s"}
                    </span>
                    <b>{total.toLocaleString(locale)} MMK</b>
                  </div>
                  <Button
                    disabled={busy || loadingMonth || hasElapsedSelection}
                    onClick={confirm}
                    className="mt-5 w-full"
                  >
                    {busy ? "Confirming bookings…" : "Confirm all bookings"}{" "}
                    <ChevronRight size={16} />
                  </Button>
                  <p className="mt-3 text-center text-[11px] leading-5 text-zawana-500">
                    Your selected sessions will be confirmed together.
                  </p>
                </>
              ) : (
                <div className="py-7 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-zawana-900">
                    <CalendarDays className="text-zawana-500" size={19} />
                  </div>
                  <p className="mt-3 text-sm font-bold">No sessions selected</p>
                  <p className="mt-1 text-xs leading-5 text-zawana-500">
                    Choose your dates, then add available court sessions.
                  </p>
                </div>
              )}
              <Link
                to="/bookings"
                className="mt-5 block border-t pt-4 text-center text-xs font-bold text-zawana-500"
              >
                View booking history{" "}
                <ChevronRight className="inline" size={13} />
              </Link>
            </div>
          </Card>
        </div>
      </div>
      <AnimatePresence>
        {checkoutOpen && (
          <DialogSurface
            title="Review checkout"
            labelledBy="mobile-checkout-title"
            drawer
            onClose={() => setCheckoutOpen(false)}
            className="flex h-full w-full max-w-md flex-col bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl"
          >
            <header className="flex items-center justify-between border-b p-5">
              <div>
                <p className="eyebrow text-zawana-accent">COURT RENTAL</p>
                <h2
                  id="mobile-checkout-title"
                  className="mt-1 text-xl font-black"
                >
                  Review checkout
                </h2>
                <p className="mt-1 text-xs text-zawana-500">
                  {selected.length} selected session
                  {selected.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={() => setCheckoutOpen(false)}
                aria-label="Close checkout"
                className="grid h-11 w-11 place-items-center rounded-full bg-zawana-950/5"
              >
                <X size={19} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {selected.length ? (
                grouped.map((day) => (
                  <div key={day.date} className="mb-4 rounded-2xl border p-4">
                    <h3 className="font-black">{dateLabel(day.date)}</h3>
                    {day.courts.map(([courtName, picks]) => (
                      <div key={courtName} className="mt-3 border-t pt-3">
                        <b className="text-sm">{courtName}</b>
                        {picks.map((p) => (
                          <div
                            key={pickKey(p)}
                            className="flex items-center justify-between gap-3 py-2 text-sm"
                          >
                            <span className="min-w-0">{p.time}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <b>{p.price.toLocaleString(locale)} MMK</b>
                              <button
                                aria-label={`Remove ${courtName} ${p.time} on ${p.date}`}
                                onClick={() =>
                                  setSelected((prev) =>
                                    prev.filter(
                                      (x) => pickKey(x) !== pickKey(p),
                                    ),
                                  )
                                }
                                className="grid h-9 w-9 place-items-center rounded-full text-zawana-500 hover:bg-red-50 hover:text-red-700"
                              >
                                <X size={15} />
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
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
            <footer className="border-t bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-zawana-500">Total</span>
                <b className="text-xl">{total.toLocaleString(locale)} MMK</b>
              </div>
              <Button
                disabled={
                  !selected.length ||
                  busy ||
                  loadingMonth ||
                  hasElapsedSelection
                }
                onClick={confirm}
                className="w-full"
              >
                {busy ? "Confirming bookings…" : "Confirm all bookings"}
                <ChevronRight size={16} />
              </Button>
              <p className="mt-3 text-center text-[11px] leading-5 text-zawana-500">
                Your selected sessions will be confirmed together.
              </p>
            </footer>
          </DialogSurface>
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
