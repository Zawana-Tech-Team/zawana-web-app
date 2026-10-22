import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { motionTokens } from "../design/motion";
import { bookingClock, bookingHasStarted } from "../utils/bookingTime";
import { useBookingClock } from "../hooks/useBookingClock";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock3,
  MapPin,
  UserRound,
} from "lucide-react";
import { Button, Card, Empty, Page } from "../components/UI";
import { get, post } from "../api";
import { mediaImageSrc } from "../components/ImageUpload";
import { useLanguage } from "../context/LanguageContext";

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const minute = (v: string) => {
  const m = String(v || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return NaN;
  let h = +m[1];
  if (m[3]) {
    if (h === 12) h = 0;
    if (m[3].toUpperCase() === "PM") h += 12;
  }
  return h * 60 + +m[2];
};
const span = (v: string) => {
  const p = String(v || "").split(/\s*(?:—|–|-)\s*/);
  const a = minute(p[0] || ""),
    b = minute(p[1] || "");
  return p.length === 2 && b > a ? { start: a, end: b } : null;
};
const slot = (start: number, duration: number) => {
  const label = (n: number) =>
    `${Math.floor((n % 1440) / 60) % 12 || 12}:${String(n % 60).padStart(2, "0")} ${n % 1440 >= 720 ? "PM" : "AM"}`;
  return `${label(start)} — ${label(start + duration)}`;
};

export function PrivateCourse() {
  const { locale } = useLanguage();
  const now = useBookingClock();
  const reduceMotion = useReducedMotion();
  const transition = {
    duration: reduceMotion ? 0 : 0.14,
    ease: motionTokens.ease,
  };
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale],
  );
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short" }),
    [locale],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [locale],
  );
  const dateLabel = (value: string) =>
    dateFormatter.format(new Date(`${value}T00:00:00`));

  const [courses, setCourses] = useState<any[]>([]),
    [coaches, setCoaches] = useState<any[]>([]),
    [courts, setCourts] = useState<any[]>([]),
    [availabilityResult, setAvailabilityResult] = useState<any>(null);
  const [course, setCourse] = useState<any>(null),
    [coach, setCoach] = useState<any>(null),
    [court, setCourt] = useState<any>(null);
  const [date, setDate] = useState(bookingClock().date),
    [time, setTime] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const days = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = new Date(`${bookingClock().date}T12:00:00`);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [],
  );
  const courseSlots = useMemo(
    () =>
      Array.from(
        {
          length: Math.max(
            0,
            Math.floor((15 * 60 - (course?.duration || 60)) / 60) + 1,
          ),
        },
        (_, i) => slot((6 + i) * 60, course?.duration || 60),
      ),
    [course],
  );

  useEffect(() => {
    Promise.all([get<any[]>("/private-courses"), get<any[]>("/courts")])
      .then(([c, ct]) => {
        setCourses(c);
        setCoaches([
          ...new Map(
            c
              .flatMap((course: any) => course.coaches || [])
              .map((coach: any) => [coach.id, coach]),
          ).values(),
        ]);
        setCourts(ct);
      })
      .catch((e: any) =>
        setError(e.message || "Could not load private course options."),
      )
      .finally(() => setLoading(false));
  }, []);
  const availability =
    availabilityResult?.date === date ? availabilityResult.data : null;
  const needsAvailability = step >= 2;
  useEffect(() => {
    if (!needsAvailability) return;
    let active = true;
    setAvailabilityResult(null);
    setLoadingAvailability(true);
    get<any>(`/bookings/availability?date=${date}`)
      .then((data) => {
        if (active) setAvailabilityResult({ date, data });
      })
      .catch((e: any) => {
        if (active) setError(e.message || "Could not load court availability.");
      })
      .finally(() => {
        if (active) setLoadingAvailability(false);
      });
    return () => {
      active = false;
    };
  }, [date, needsAvailability]);

  const courseOptions = courses;
  const eligibleCoaches = useMemo(
    () =>
      coaches.filter(
        (c) =>
          c.status === "active" &&
          c.user?.active &&
          course?.coaches?.some((x: any) => x.id === c.id),
      ),
    [coaches, course],
  );
  const coursePrice = Number(course?.price ?? 0);
  const calculateCoachAt = (c: any, t: string) => {
    const wanted = span(t);
    return (
      !!wanted &&
      !availability?.bookings?.some(
        (b: any) =>
          b.coachId === c.id &&
          (() => {
            const booked = span(b.time);
            return (
              !!booked && wanted.start < booked.end && booked.start < wanted.end
            );
          })(),
      )
    );
  };
  const calculateFreeAt = (c: any, t: string) => {
    const wanted = span(t);
    if (
      c.status !== "available" ||
      !wanted ||
      !availability ||
      availability.closed
    )
      return false;
    if (bookingHasStarted(date, t, now)) return false;
    const booked = (availability.bookings || []).some(
      (b: any) =>
        b.courtId === c.id &&
        (() => {
          const r = span(b.time);
          return !!r && wanted.start < r.end && r.start < wanted.end;
        })(),
    );
    const blocked = (availability.blocks || []).some(
      (b: any) =>
        b.courtId === c.id &&
        b.active !== false &&
        (() => {
          const r = span(`${b.start} — ${b.end}`);
          return !!r && wanted.start < r.end && r.start < wanted.end;
        })(),
    );
    return !booked && !blocked;
  };
  const courtTimes = useMemo(
    () =>
      new Map<string, Map<string, boolean>>(
        courts.map((c) => [
          c.id,
          new Map(courseSlots.map((t) => [t, calculateFreeAt(c, t)])),
        ]),
      ),
    [courts, courseSlots, availability, date, now],
  );
  const coachTimes = useMemo(
    () =>
      new Map<string, Map<string, boolean>>(
        eligibleCoaches.map((c) => [
          c.id,
          new Map(courseSlots.map((t) => [t, calculateCoachAt(c, t)])),
        ]),
      ),
    [eligibleCoaches, courseSlots, availability],
  );
  const freeAt = (c: any, t: string) => courtTimes.get(c.id)?.get(t) === true;
  const coachAt = (c: any, t: string) => coachTimes.get(c.id)?.get(t) === true;
  const submit = async () => {
    if (
      !course ||
      !coach ||
      !court ||
      !time ||
      busy ||
      !freeAt(court, time) ||
      !coachAt(coach, time)
    )
      return;
    setBusy(true);
    setError("");
    try {
      await post("/member/private-courses", {
        courseId: course.id,
        courtId: court.id,
        coachId: coach.id,
        date,
        time,
        expectedPrice: coursePrice,
      });
      navigate("/bookings");
    } catch (e: any) {
      setError(
        e.message ||
          "Could not confirm this booking. Check availability and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const floors = [
    {
      label: "2nd floor",
      color: "green",
      courts: courts.filter((c) => {
        const n = Number(c.name.match(/(\d+)\D*$/)?.[1]);
        return n >= 1 && n <= 4;
      }),
    },
    {
      label: "6th floor",
      color: "red",
      courts: courts.filter((c) => {
        const n = Number(c.name.match(/(\d+)\D*$/)?.[1]);
        return n >= 5 && n <= 8;
      }),
    },
    {
      label: "Other courts",
      color: "neutral",
      courts: courts.filter((c) => {
        const n = Number(c.name.match(/(\d+)\D*$/)?.[1]);
        return !(n >= 1 && n <= 8);
      }),
    },
  ].filter((f) => f.courts.length);
  const ready =
    !!course &&
    !!coach &&
    !!court &&
    !!time &&
    !loadingAvailability &&
    freeAt(court, time) &&
    coachAt(coach, time);

  return (
    <Page
      title="Private course"
      eyebrow="Badminton coaching"
      actions={
        <Link
          to="/book/court"
          className="flex min-h-11 items-center gap-2 text-sm font-medium text-zawana-500"
        >
          Court rental <ArrowRight size={15} />
        </Link>
      }
    >
      <p className="mb-6 max-w-xl text-sm leading-relaxed text-zawana-500">
        Personal coaching, at your pace. Choose your course, find your coach,
        and make time to improve.
      </p>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <nav
            aria-label="Private course steps"
            className="grid grid-cols-3 gap-2 rounded-2xl border border-zawana-border bg-white p-3 sm:p-5"
          >
            {([1, 2, 3] as const).map((n) => (
              <button
                type="button"
                key={n}
                disabled={busy || (n > 1 && (!course || !coach))}
                aria-current={step === n ? "step" : undefined}
                onClick={() => setStep(n)}
                className={`flex min-h-11 items-center gap-2 rounded-lg text-left text-xs focus-visible:ring-2 focus-visible:ring-zawana-gold disabled:opacity-40 sm:gap-3 sm:text-sm ${step === n ? "text-zawana-950" : "text-zawana-500"}`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold ${step === n ? "border-zawana-950 bg-zawana-950 text-white" : "border-zawana-border"}`}
                >
                  {step > n ? <Check size={13} /> : n}
                </span>
                <span className="font-semibold">
                  {n === 1
                    ? "Course & coach"
                    : n === 2
                      ? "Date"
                      : "Court & time"}
                </span>
              </button>
            ))}
          </nav>
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              {error}
            </p>
          )}
          <motion.div
            key={step}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
            transition={transition}
            className="space-y-5"
          >
            {step === 1 && (
              <>
                <Card className="p-5 sm:p-6">
                  <h2 className="text-xl font-semibold tracking-tight">
                    A little guidance. A better game.
                  </h2>
                  <p className="mt-1 text-sm text-zawana-500">
                    Choose a course that suits your next step.
                  </p>
                  {loading ? (
                    <p
                      role="status"
                      className="py-10 text-center text-sm text-zawana-500"
                    >
                      Loading courses…
                    </p>
                  ) : courseOptions.length ? (
                    <div
                      role="group"
                      aria-label="Private courses"
                      className="mt-5 grid gap-3 sm:grid-cols-2"
                    >
                      {courseOptions.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          disabled={busy}
                          aria-label={`Select ${c.title}`}
                          aria-pressed={course?.id === c.id}
                          onClick={() => {
                            setCourse(c);
                            setCoach(null);
                            setCourt(null);
                            setTime("");
                            setError("");
                          }}
                          className={`overflow-hidden rounded-2xl border text-left transition focus-visible:ring-2 focus-visible:ring-zawana-gold ${course?.id === c.id ? "border-zawana-950 bg-zawana-950/[.025] ring-1 ring-zawana-950" : "border-zawana-border hover:border-zawana-500"}`}
                        >
                          {c.imageUrl && (
                            <img
                              src={mediaImageSrc(c.imageUrl)}
                              alt=""
                              className="h-32 w-full object-cover"
                            />
                          )}
                          <span className="block p-5">
                            <span className="flex items-start justify-between gap-3">
                              <span className="text-sm font-semibold">
                                {c.title}
                              </span>
                              {course?.id === c.id && (
                                <Check size={16} className="shrink-0" />
                              )}
                            </span>
                            <span className="mt-2 block text-xs leading-relaxed text-zawana-500">
                              {c.description || "Badminton private coaching"}
                            </span>
                            <span className="mt-4 flex flex-wrap items-end justify-between gap-2">
                              <span className="text-lg font-semibold tracking-tight">
                                {Number(c.price).toLocaleString(locale)} MMK
                              </span>
                              <span className="flex items-center gap-1 text-xs text-zawana-500">
                                <Clock3 size={12} />
                                {c.duration} min
                              </span>
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5">
                      <Empty
                        title="No private courses available"
                        body="Please check back soon for new coaching sessions."
                      />
                    </div>
                  )}
                </Card>
                <AnimatePresence>
                  {course && (
                    <motion.div
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={transition}
                    >
                      <Card className="p-5 sm:p-6">
                        <h2 className="text-base font-semibold">
                          Find your coach
                        </h2>
                        <p className="mt-1 text-sm text-zawana-500">
                          Personal attention, with a coach assigned to your
                          course.
                        </p>
                        {eligibleCoaches.length ? (
                          <div
                            role="group"
                            aria-label="Assigned coaches"
                            className="mt-5 grid gap-3 sm:grid-cols-2"
                          >
                            {eligibleCoaches.map((c) => (
                              <button
                                type="button"
                                key={c.id}
                                aria-label={`Select coach ${c.user?.name || c.name}`}
                                aria-pressed={coach?.id === c.id}
                                onClick={() => {
                                  setCoach(c);
                                  setCourt(null);
                                  setTime("");
                                  setError("");
                                }}
                                className={`flex min-w-0 items-center gap-4 rounded-2xl border p-4 text-left transition focus-visible:ring-2 focus-visible:ring-zawana-gold ${coach?.id === c.id ? "border-zawana-950 bg-zawana-950/[.025] ring-1 ring-zawana-950" : "border-zawana-border hover:border-zawana-500"}`}
                              >
                                <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-zawana-950/5 text-zawana-500">
                                  {c.imageUrl || c.user?.avatar ? (
                                    <img
                                      src={mediaImageSrc(
                                        c.imageUrl || c.user?.avatar,
                                      )}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <UserRound size={22} />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold">
                                    {c.user?.name || c.name}
                                  </span>
                                  <span className="mt-1 block text-xs text-zawana-500">
                                    {c.specialty || "Badminton coach"}
                                  </span>
                                </span>
                                {coach?.id === c.id && (
                                  <Check size={15} className="shrink-0" />
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                            No coaches are currently available for this course.
                            Please choose another course.
                          </p>
                        )}
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex justify-end">
                  <Button
                    disabled={!course || !coach}
                    onClick={() => setStep(2)}
                  >
                    Choose a date <ArrowRight size={16} />
                  </Button>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <Card className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">
                        Make time for your game.
                      </h2>
                      <p className="mt-1 text-sm text-zawana-500">
                        Choose a date for your {course?.duration}-minute
                        session.
                      </p>
                    </div>
                    <CalendarDays
                      size={20}
                      className="mt-1 shrink-0 text-zawana-500"
                    />
                  </div>
                  <div
                    role="group"
                    aria-label="Session dates"
                    className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7"
                  >
                    {days.map((d) => (
                      <button
                        type="button"
                        key={dateKey(d)}
                        aria-label={dateLabel(dateKey(d))}
                        aria-pressed={date === dateKey(d)}
                        onClick={() => {
                          setDate(dateKey(d));
                          setCourt(null);
                          setTime("");
                          setError("");
                        }}
                        className={`min-h-20 rounded-xl border p-2 text-center transition focus-visible:ring-2 focus-visible:ring-zawana-gold ${date === dateKey(d) ? "border-zawana-950 bg-zawana-950 text-white" : "border-zawana-border text-zawana-500 hover:border-zawana-500"}`}
                      >
                        <span className="block text-[10px] uppercase tracking-wide">
                          {weekdayFormatter.format(d)}
                        </span>
                        <span className="mt-1 block text-lg font-semibold">
                          {d.getDate()}
                        </span>
                        <span className="mt-0.5 block text-[10px]">
                          {monthFormatter.format(d)}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-5 flex items-center gap-2 text-xs text-zawana-500">
                    <Clock3 size={13} />
                    Court and coach availability appear in the next step.
                  </p>
                </Card>
                <div className="flex items-center justify-between gap-3">
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    <ChevronLeft size={16} /> Back
                  </Button>
                  <Button onClick={() => setStep(3)}>
                    Choose a court <ArrowRight size={16} />
                  </Button>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">
                      Your court. Your session.
                    </h2>
                    <p className="mt-1 text-sm text-zawana-500">
                      {dateLabel(date)} · {course?.duration} minutes
                    </p>
                  </div>
                  <button
                    onClick={() => setStep(2)}
                    className="min-h-11 text-xs font-semibold text-zawana-500 underline underline-offset-4"
                  >
                    Change date
                  </button>
                </div>
                <p className="text-xs text-zawana-500">
                  Open a court to see times that work for you and your coach.
                  Court access is included.
                </p>
                {loadingAvailability && (
                  <p role="status" className="text-sm text-zawana-500">
                    Checking availability…
                  </p>
                )}
                {!courts.length && (
                  <Empty
                    title="No courts available"
                    body="Please check back for court availability."
                  />
                )}
                {floors.map((floor) => (
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
                      <h3 className="text-sm font-semibold">{floor.label}</h3>
                      <span className="ml-auto text-xs text-zawana-500">
                        {floor.courts.length} courts
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {floor.courts
                        .sort((a, b) =>
                          a.name.localeCompare(b.name, undefined, {
                            numeric: true,
                          }),
                        )
                        .map((c) => {
                          const expanded = court?.id === c.id;
                          const availableCount = courseSlots.filter(
                            (t) => freeAt(c, t) && coachAt(coach, t),
                          ).length;
                          return (
                            <Card
                              key={c.id}
                              className={`overflow-hidden p-0 ${expanded ? "sm:col-span-2" : ""} ${floor.color === "green" ? "!border-emerald-200/70" : floor.color === "red" ? "!border-rose-200/70" : ""}`}
                            >
                              <button
                                type="button"
                                disabled={c.status !== "available"}
                                aria-expanded={expanded}
                                aria-controls={`private-times-${c.id}`}
                                onClick={() => {
                                  setCourt(expanded ? null : c);
                                  setTime("");
                                  setError("");
                                }}
                                className="flex min-h-24 w-full items-center gap-4 p-4 text-left transition hover:bg-zawana-950/[.015] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zawana-gold disabled:cursor-not-allowed disabled:opacity-40 sm:p-5"
                              >
                                <span
                                  aria-hidden="true"
                                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-lg font-semibold ${floor.color === "green" ? "bg-emerald-100 text-emerald-800" : floor.color === "red" ? "bg-rose-100 text-rose-800" : "bg-zawana-950/5 text-zawana-950"}`}
                                >
                                  {c.name.match(/(\d+)\D*$/)?.[1] || (
                                    <MapPin size={18} />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold">
                                    {c.name}
                                  </span>
                                  <span className="mt-1 block text-xs text-zawana-500">
                                    {c.status !== "available"
                                      ? "Unavailable"
                                      : loadingAvailability || !availability
                                        ? "Checking availability"
                                        : `${availableCount} times available`}
                                  </span>
                                </span>
                                <motion.span
                                  animate={{ rotate: expanded ? 180 : 0 }}
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
                                    id={`private-times-${c.id}`}
                                    initial={
                                      reduceMotion
                                        ? false
                                        : { opacity: 0, y: 4 }
                                    }
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 4 }}
                                    transition={transition}
                                    className="overflow-hidden"
                                  >
                                    <div className="border-t border-zawana-border p-4 sm:p-5">
                                      <p className="mb-4 text-xs text-zawana-500">
                                        {coach?.user?.name || coach?.name} ·{" "}
                                        {course?.duration} minutes per session
                                      </p>
                                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                        {courseSlots.map((t) => {
                                          const free =
                                            !loadingAvailability &&
                                            freeAt(c, t) &&
                                            coachAt(coach, t);
                                          const selected = time === t;
                                          const status =
                                            loadingAvailability || !availability
                                              ? "Checking…"
                                              : bookingHasStarted(date, t, now)
                                                ? "Time passed"
                                                : availability.closed
                                                  ? "Closed"
                                                  : !coachAt(coach, t)
                                                    ? "Coach unavailable"
                                                    : !freeAt(c, t)
                                                      ? "Court unavailable"
                                                      : "Available";
                                          return (
                                            <button
                                              type="button"
                                              key={t}
                                              disabled={!free}
                                              aria-pressed={selected}
                                              aria-label={`${c.name}, ${t}, ${selected ? "Selected" : status}`}
                                              onClick={() => setTime(t)}
                                              className={`rounded-xl border p-3 text-left transition focus-visible:ring-2 focus-visible:ring-zawana-gold ${selected && free ? "border-zawana-950 bg-zawana-950 text-white" : free ? "border-zawana-border hover:border-zawana-500" : "border-transparent bg-zawana-950/[.035] text-zawana-400"}`}
                                            >
                                              <span className="flex items-start justify-between gap-1 text-xs font-semibold">
                                                {t}
                                                <span>
                                                  {selected && (
                                                    <Check size={12} />
                                                  )}
                                                </span>
                                              </span>
                                              <span
                                                className={`mt-2 block text-[10px] ${selected && free ? "text-white/70" : free ? "text-emerald-700" : "text-zawana-500"}`}
                                              >
                                                {selected && free
                                                  ? "Selected"
                                                  : status}
                                              </span>
                                            </button>
                                          );
                                        })}
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
                <Button variant="ghost" onClick={() => setStep(2)}>
                  <ChevronLeft size={16} /> Back to dates
                </Button>
              </>
            )}
          </motion.div>
        </div>
        <Card className="overflow-hidden p-0 xl:sticky xl:top-24">
          <div className="border-b border-zawana-border p-5 sm:p-6">
            <p className="text-xs font-medium uppercase tracking-[.14em] text-zawana-500">
              Your session
            </p>
            <h2 className="mt-3 text-lg font-semibold">
              {course?.title || "A session made for you"}
            </h2>
            <p className="mt-1 text-xs text-zawana-500">
              {course
                ? `${course.duration} minutes · Private coaching`
                : "Choose a course to get started"}
            </p>
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            <dl className="space-y-4 text-sm">
              {[
                ["Coach", coach?.user?.name || coach?.name],
                ["Date", course && coach ? dateLabel(date) : ""],
                ["Court", court?.name],
                ["Time", time],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-4"
                >
                  <dt className="shrink-0 text-zawana-500">{label}</dt>
                  <dd className="text-right text-xs font-medium leading-5">
                    {value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-zawana-border pt-5">
              <p className="text-xs text-zawana-500">
                Course price · court included
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {course ? `${coursePrice.toLocaleString(locale)} MMK` : "—"}
              </p>
            </div>
            <Button
              loading={busy}
              disabled={!ready}
              onClick={submit}
              className="w-full"
            >
              {busy ? "Sending request…" : "Request private course"}
              {!busy && <ArrowRight size={15} />}
            </Button>
            <p className="text-xs leading-relaxed text-zawana-500">
              Your coach will review this request. Your court and time stay
              reserved. Once accepted, you have 24 hours to pay and confirm.
            </p>
          </div>
        </Card>
      </div>
    </Page>
  );
}
