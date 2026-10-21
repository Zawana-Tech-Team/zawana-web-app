import { SegmentedControl } from '../components/Interactions';
import { Select } from '../components/Select';
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Badge, Page, Empty, Pagination } from "../components/UI";
import { get, patch, post } from "../api";
import { formatBookingDate, localDateKey, type BookingDatePreset } from "../utils/bookingDates";
import { useLanguage } from "../context/LanguageContext";

type BookingFilter = {
  datePreset: BookingDatePreset;
  q: string;
  kind: string;
  status: string;
  courtId: string;
  coachId: string;
  from: string;
  to: string
};
type PageInfo = { page: number; limit: number; total: number; totalPages: number };
type DateCounts = Record<BookingDatePreset, number>;
const EMPTY_COUNTS: DateCounts = { today: 0, yesterday: 0, upcoming: 0, all: 0 };
const EMPTY_PAGE: PageInfo = { page: 1, limit: 20, total: 0, totalPages: 0 };
const ACTIVE_STATUSES = [
  "confirmed",
  "CONFIRMED",
  "pending",
  "PENDING_COACH_CONFIRMATION",
  "AWAITING_PAYMENT"
];

export function Bookings() {
  const navigate = useNavigate();
  const { locale } = useLanguage();
  const [bookings, setBookings] = useState<any[]>([]);
  const [courts, setCourts] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cancelling, setCancelling] = useState("");
  const [paying, setPaying] = useState("");
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<PageInfo>(EMPTY_PAGE);
  const [dateCounts, setDateCounts] = useState<DateCounts>(EMPTY_COUNTS);
  const [filters, setFilters] = useState<BookingFilter>({
    datePreset: "all",
    q: "",
    kind: "",
    status: "",
    courtId: "",
    coachId: "",
    from: "",
    to: ""
  });

  useEffect(() => {
    get<any>("/member/booking-filters")
      .then(data => {
        setCourts(data.courts || []);
        setCoaches(data.coaches || []);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
      referenceDate: localDateKey(),
      datePreset: filters.datePreset
    });
    for (const [key, value] of Object.entries(filters))
      if (value && key !== "datePreset") params.set(key, value);
    const result = await get<any>(`/bookings?${params}`);
    setBookings(result.data || []);
    setPageInfo(result.pagination || EMPTY_PAGE);
    setDateCounts({ ...EMPTY_COUNTS, ...(result.dateCounts || {}) });
  }, [filters, page]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(
      () => {
        load()
          .catch((e: any) => {
            if (active) setError(e.message || "Could not load bookings.");
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      filters.q ? 250 : 0
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [load, filters.q]);

  const updateFilters = (next: Partial<BookingFilter>) => {
    setPage(1);
    setFilters(current => ({ ...current, ...next }));
  };
  const setPreset = (datePreset: BookingDatePreset) =>
    updateFilters({ datePreset, from: "", to: "" });

  const cancel = async (booking: any) => {
    if (!window.confirm("Cancel this booking?")) return;
    setCancelling(booking.id);
    setError("");
    setMessage("");
    try {
      if (booking.kind === "private_course")
        await post(`/member/private-courses/${booking.id}/cancel`, {});
      else await patch(`/bookings/${booking.id}/status`, { status: "cancelled" });
      setMessage("Booking cancelled.");
      await load();
    } catch (e: any) {
      setError(e.message || "Could not cancel this booking.");
    } finally {
      setCancelling("");
    }
  };

  const confirmCourse = async (booking: any) => {
    setPaying(booking.id);
    setError("");
    setMessage("");
    try {
      const result = await post<any>(`/member/private-courses/${booking.id}/pay`, {});
      if (!result.payment?.id) throw new Error("Could not start secure checkout.");
      navigate(`/payment/${encodeURIComponent(result.payment.id)}`);
    } catch (e: any) {
      setError(e.message || "Could not confirm this private course.");
    } finally {
      setPaying("");
    }
  };

  const statusLabel = (value: string) =>
    ({
        PENDING_COACH_CONFIRMATION: "Waiting for coach",
        AWAITING_PAYMENT: "Payment required",
        COACH_DECLINED: "Coach declined",
        EXPIRED: "Expired",
        CONFIRMED: "Confirmed",
        COMPLETED: "Completed",
        CANCELLED: "Cancelled"
      } as Record<string, string>
    )[value] || String(value).replaceAll("_", " ");
  const presets: { id: BookingDatePreset; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "upcoming", label: "Upcoming" },
    { id: "all", label: "All" }
  ];

  return <Page title="Booking history" eyebrow="Badminton schedule">
    {error &&
      <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
        {error}
      </p>}
    {message &&
      <p
        role="status"
        className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"
      >
        {message}
      </p>}
    <Card className="mb-5 space-y-4 p-4 sm:p-5">
      <SegmentedControl label="Booking dates" className="premium-date-presets"
        value={filters.from || filters.to ? '' : filters.datePreset} onChange={value => setPreset(value as BookingDatePreset)}
        options={presets.map(preset => ({ value: preset.id, label: <><span>{preset.label}</span><b>{dateCounts[preset.id]}</b></> }))} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input
          aria-label="Search bookings"
          placeholder="Search booking, court or coach"
          value={filters.q}
          onChange={e => updateFilters({ q: e.target.value })}
        />
        <Select
          aria-label="Booking type"
          value={filters.kind}
          onChange={e => updateFilters({ kind: e.target.value })}
        >
          <option value="">All booking types</option>
          <option value="court">Court rental</option>
          <option value="private_course">Private course</option>
          <option value="class">Class</option>
          <option value="pt">Personal training</option>
        </Select>
        <Select
          aria-label="Booking status"
          value={filters.status}
          onChange={e => updateFilters({ status: e.target.value })}
        >
          <option value="">All statuses</option>
          {[
            "CONFIRMED",
            "COMPLETED",
            "CANCELLED",
            "pending",
            "PENDING_COACH_CONFIRMATION",
            "AWAITING_PAYMENT",
            "COACH_DECLINED",
            "EXPIRED"
          ].map(s =>
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          )}
        </Select>
        <Select
          aria-label="Court"
          value={filters.courtId}
          onChange={e => updateFilters({ courtId: e.target.value })}
        >
          <option value="">All courts</option>
          {courts.map(c =>
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          )}
        </Select>
        <Select
          aria-label="Coach"
          value={filters.coachId}
          onChange={e => updateFilters({ coachId: e.target.value })}
        >
          <option value="">All coaches</option>
          {coaches.map(c =>
            <option key={c.id} value={c.id}>
              {c.name}
            </option>)}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <input
            aria-label="From date"
            type="date"
            value={filters.from}
            onChange={e => updateFilters({ from: e.target.value, datePreset: "all" })}
          />
          <input
            aria-label="To date"
            type="date"
            value={filters.to}
            onChange={e => updateFilters({ to: e.target.value, datePreset: "all" })}
          />
        </div>
      </div>
      {(filters.q ||
        filters.kind ||
        filters.status ||
        filters.courtId ||
        filters.coachId ||
        filters.from ||
        filters.to) &&
        <button
          className="text-sm font-bold text-zawana-accent"
          onClick={() => {
            setPage(1);
            setFilters({
              datePreset: "all",
              q: "",
              kind: "",
              status: "",
              courtId: "",
              coachId: "",
              from: "",
              to: ""
            });
          }}
        >Clear filters</button>}
    </Card>
    {loading ?
      <Card className="p-8">Loading bookings…</Card> :
      <div className="space-y-3">
        {bookings.map(booking =>
          <Card key={booking.id} className="p-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black">{booking.title}</h3>
                  <Badge good={["confirmed", "CONFIRMED", "COMPLETED"].includes(booking.status)}>
                    {statusLabel(booking.status)}
                  </Badge>
                  {booking.kind === "private_course" &&
                    <Badge>
                      {booking.paymentStatus === "paid"
                        ? "Paid"
                        : booking.status === "AWAITING_PAYMENT"
                          ? "Payment required"
                          : booking.status === "CONFIRMED" && booking.paymentStatus !== "paid"
                            ? "Payment due at venue"
                            : booking.status === "PENDING_COACH_CONFIRMATION"
                              ? "Court reserved"
                              : "Private course"}
                    </Badge>}
                </div>
                <p className="mt-2 text-sm text-zawana-500">
                  {formatBookingDate(
                    booking.date,
                    { month: "long", day: "numeric", year: "numeric" },
                    locale
                  )} · {booking.time} · {booking.court?.name || booking.location}
                  {booking.coach ? ` · ${booking.coach.name}` : ""}
                </p>
                <p className="mt-1 text-xs text-zawana-500">
                  {booking.code} · {Number(booking.price).toLocaleString(locale)} MMK</p>
                {booking.kind === "private_course" && booking.status === "AWAITING_PAYMENT" &&
                  <p className="mt-2 text-sm font-bold text-amber-800">Coach accepted. Complete verified payment within 24 hours to confirm your session.</p>}
                {booking.kind === "private_course" &&
                  booking.status === "CONFIRMED" &&
                  booking.paymentStatus !== "paid" &&
                    <p className="mt-2 text-sm text-zawana-500">Your coach, court and time are confirmed. Payment has not been collected; please arrange it at the venue.</p>}
                {booking.kind === "private_course" &&
                  booking.status === "PENDING_COACH_CONFIRMATION" &&
                    <p className="mt-2 text-sm text-amber-800">Waiting for coach confirmation. Your selected court and time are reserved.</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {booking.kind === "private_course" && booking.status === "AWAITING_PAYMENT" &&
                  <Button disabled={paying === booking.id} onClick={() => confirmCourse(booking)}>
                    {paying === booking.id ? "Starting checkout…" : "Pay & confirm"}
                  </Button>}
                {ACTIVE_STATUSES.includes(booking.status) &&
                  <Button
                    variant="danger"
                    disabled={cancelling === booking.id}
                    onClick={() => cancel(booking)}
                  >
                    {cancelling === booking.id ? "Cancelling…" : "Cancel"}
                  </Button>}
              </div>
            </div>
          </Card>)}
        {!bookings.length &&
          <Empty
            title="No bookings match these filters"
            body="Try another date or clear a filter. New court rentals and private courses will appear here."
            action={
              <Link to="/book/court">
                <Button>Book a court</Button>
              </Link>
            }
          />}
        <Pagination
          page={pageInfo.page || page}
          totalPages={pageInfo.totalPages || 0}
          total={pageInfo.total || 0}
          onPage={setPage}
        />
      </div>}
  </Page>;
}
