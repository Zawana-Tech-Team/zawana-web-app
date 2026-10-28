import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock3,
  CreditCard,
  Download,
  Filter,
  Globe2,
  HandCoins,
  LockKeyhole,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { get, post } from "../api";
import { useAuth } from "../context/AuthContext";
import { Button, Card, Empty, Page } from "../components/UI";
import { DialogSurface } from "../components/Interactions";
import { Select } from "../components/Select";
import { bookingClock } from "../utils/bookingTime";
import "./staff-private-courses.css";
type Person = { id: string; name: string; email?: string; phone?: string };
type Course = {
  id: string;
  title: string;
  duration: number;
  price: number;
  coaches: Person[];
};
type Payment = {
  id: string;
  transactionId: string | null;
  amount: number;
  collectedByUserId: string | null;
  paymentMethod: string;
  status: string;
  providerReference: string | null;
  externalReceiptReference: string | null;
  notes: string | null;
};
type Row = {
  id: string;
  code: string;
  title: string;
  user: Person;
  coach: Person | null;
  date: string;
  time: string;
  status: string;
  paymentStatus: string;
  price: number;
  source: string;
  method: string | null;
  verificationStatus: string;
  payment: Payment | null;
  availableForHandover: number;
  cashHeld: number;
  received: number;
};
type Settlement = {
  id: string;
  collectorId: string;
  receivedById: string | null;
  amount: number;
  status: string;
  submittedAt: string;
  receivedAt: string | null;
};
type Report = {
  rows: Row[];
  actors: Person[];
  settlements: Settlement[];
  summary: Record<string, number>;
};
type Attempt = {
  id: string;
  reference: string;
  provider: string;
  providerReference: string;
  amount: number;
  status: string;
};
const base = "/staff/private-courses";
const money = (n: number) => `${n.toLocaleString()} MMK`;
const labels: Record<string, string> = {
  BADMINTON_FO: "Paid at Badminton Front Office",
  COACH: "Paid directly to Coach",
  ONLINE: "Paid Online / Existing Online Payment",
  UNPAID: "Not Yet Paid",
  LEGACY_UNKNOWN: "Legacy Payment — Source Unknown",
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Request failed.";

function printReceipt(row: Row, collector: string) {
  const receipt = window.open("", "_blank", "width=700,height=850");
  if (!receipt) return;
  receipt.opener = null;
  receipt.document.title = `ZAWANA receipt ${row.code}`;
  const heading = receipt.document.createElement("h1");
  heading.textContent = "ZAWANA · Private course receipt";
  const details = receipt.document.createElement("pre");
  details.style.cssText = "white-space:pre-wrap;font:16px/1.8 sans-serif";
  details.textContent = [
    `Receipt: ${row.payment?.id || row.code}`,
    `Booking: ${row.code}`,
    `Member: ${row.user.name}`,
    `Course: ${row.title}`,
    `Coach: ${row.coach?.name || "—"}`,
    `Session: ${row.date} · ${row.time} (Asia/Yangon)`,
    `Amount: ${money(row.price)}`,
    `Source: ${labels[row.source]}`,
    `Method: ${row.method || "Unknown"}`,
    `Collected by: ${collector}`,
    `Status: ${row.paymentStatus}`,
    `Reference: ${row.payment?.providerReference || row.payment?.externalReceiptReference || "—"}`,
  ].join("\n");
  receipt.document.body.append(heading, details);
  receipt.focus();
  receipt.print();
}

const readable: Record<string, string> = {
  PENDING_COACH_CONFIRMATION: "Awaiting coach",
  AWAITING_PAYMENT: "Payment due",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  COACH_DECLINED: "Declined",
  SUBMITTED: "Awaiting receipt",
  RECEIVED: "Received",
  paid: "Paid",
  pending: "Unpaid",
  refunded: "Refunded",
  VERIFIED: "Verified",
  VERIFIED_PROVIDER: "Provider verified",
  LEGACY_UNVERIFIED: "Needs review",
  PENDING: "Not verified",
};
const shortSources: Record<string, string> = {
  BADMINTON_FO: "Front office",
  COACH: "Coach cash",
  ONLINE: "Online",
  UNPAID: "Not paid",
  LEGACY_UNKNOWN: "Source unknown",
};
const sourceIcons = {
  BADMINTON_FO: Banknote,
  COACH: HandCoins,
  ONLINE: Globe2,
  UNPAID: Clock3,
};
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
const avatar = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
function Status({ value }: { value: string }) {
  return (
    <span
      className={`pc-status ${["paid", "CONFIRMED", "COMPLETED", "RECEIVED", "VERIFIED", "VERIFIED_PROVIDER"].includes(value) ? "pc-status--good" : ["pending", "PENDING_COACH_CONFIRMATION", "AWAITING_PAYMENT", "SUBMITTED"].includes(value) ? "pc-status--waiting" : ""}`}
    >
      <span />
      {readable[value] || value.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}

type Confirmation = {
  title: string;
  description: string;
  amount?: number;
  path: string;
  reason?: boolean;
};
export default function StaffPrivateCourses() {
  const { user } = useAuth();
  const isCoach = user?.role === "coach";
  const [view, setView] = useState("book");
  const [catalog, setCatalog] = useState<{
    courses: Course[];
    courts: Person[];
  }>({ courses: [], courts: [] });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    paymentSource: "",
    paymentMethod: "",
    coachId: "",
    status: "",
    paymentStatus: "",
  });
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [reason, setReason] = useState("");
  const [handovers, setHandovers] = useState<Record<string, string>>({});
  const handoverKey = useRef(crypto.randomUUID());
  const loadSequence = useRef(0);
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v),
  ).toString();
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const data = await get<Report>(`${base}/finance?${params}`);
      if (sequence === loadSequence.current) {
        setReport(data);
        setError("");
      }
    } catch (e) {
      if (sequence === loadSequence.current) setError(message(e));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [params]);
  useEffect(() => {
    let active = true;
    get<typeof catalog>(`${base}/catalog`)
      .then((v) => {
        if (active) setCatalog(v);
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    void load();
    const sequenceRef = loadSequence;
    return () => {
      ++sequenceRef.current;
    };
  }, [load]);
  const action = async (path: string, data: unknown) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await post(`${base}${path}`, data);
      setNotice("Saved successfully.");
      await load();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const actorName = (id: string | null) =>
    report?.actors.find((p) => p.id === id)?.name || "—";
  const ask = (next: Confirmation) => {
    setReason("");
    setConfirmation(next);
  };
  const summary = report?.summary || {};
  const metrics = isCoach
    ? [
        {
          label: "Personally collected",
          value: summary.personallyCollected,
          icon: Wallet,
          caption: "Cash received by you",
        },
        {
          label: "Cash to hand over",
          value: summary.cashHeld,
          icon: HandCoins,
          caption: "Still in your custody",
        },
        {
          label: "Received by ZAWANA",
          value: summary.received,
          icon: ShieldCheck,
          caption: "Acknowledged handovers",
        },
        {
          label: "Unpaid sessions",
          value: summary.unpaid,
          icon: Clock3,
          caption: "Awaiting payment",
        },
      ]
    : [
        {
          label: "Confirmed revenue",
          value: summary.revenue,
          icon: Wallet,
          caption: "Paid private sessions",
        },
        {
          label: "Front office cash",
          value: summary.foCash,
          icon: Banknote,
          caption: `${money(summary.personallyCollected || 0)} collected by you`,
        },
        {
          label: "Coach cash held",
          value: summary.cashHeld,
          icon: HandCoins,
          caption: "Awaiting handover receipt",
        },
        {
          label: "Online payments",
          value: summary.online,
          icon: Globe2,
          caption: "Verified payment records",
        },
      ];
  const rows = (report?.rows || []).filter((b) =>
    `${b.user.name} ${b.title} ${b.code} ${b.coach?.name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const ownCollections = (report?.rows || []).filter(
    (b) =>
      b.payment?.collectedByUserId === user?.id && b.availableForHandover > 0,
  );
  const selectedAmount = Object.values(handovers).reduce(
    (sum, amount) => sum + Number(amount || 0),
    0,
  );
  const validHandover =
    selectedAmount > 0 &&
    Object.entries(handovers).every(
      ([id, amount]) =>
        !amount ||
        (Number.isInteger(Number(amount)) &&
          Number(amount) >= 0 &&
          Number(amount) <=
            (ownCollections.find((b) => b.payment?.id === id)
              ?.availableForHandover || 0)),
    );
  const pendingCount =
    report?.settlements.filter((s) => s.status === "SUBMITTED").length || 0;
  return (
    <Page
      title={isCoach ? "My private coaching" : "Private coaching"}
      eyebrow="Badminton · Staff workspace"
      actions={
        <span className="pc-role">
          <ShieldCheck size={14} />
          {isCoach
            ? "Coach workspace"
            : user?.role === "admin"
              ? "Admin workspace"
              : "Front office"}
        </span>
      }
    >
      <div className="pc-workspace">
        <section className="pc-hero">
          <div>
            <span className="pc-overline">
              <span /> THE PRIVATE COURT
            </span>
            <h2>
              Your coaching day,
              <br />
              <em>beautifully organised.</em>
            </h2>
            <p>Sessions, payments and cash handovers. All in one place.</p>
          </div>
          <div className="pc-court-art" aria-hidden="true">
            <svg viewBox="0 0 300 180" fill="none">
              <path
                d="M30 145 100 26h170l-70 119H30Z"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="m44 122 70-96m72 119 70-119M64 87h170M89 46h170M40 128h170M149 26 79 145"
                stroke="currentColor"
                strokeWidth=".7"
              />
              <path
                d="M71 80h170v-30H71v30Z"
                fill="currentColor"
                fillOpacity=".06"
                stroke="currentColor"
                strokeWidth=".7"
              />
              <path
                d="M71 50v53m170-53v53"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="174" cy="112" r="5" fill="currentColor" />
              <circle
                cx="174"
                cy="112"
                r="15"
                stroke="currentColor"
                strokeOpacity=".25"
              />
            </svg>
            <span>DESIGNED FOR BETTER PLAY</span>
          </div>
        </section>
        <div className="pc-metrics">
          {metrics.map(({ label, value, icon: Icon, caption }) => (
            <div className="pc-metric" key={label}>
              <div className="pc-metric-top">
                <span>{label}</span>
                <Icon size={17} />
              </div>
              <strong>
                {loading && !report ? (
                  <span className="pc-skeleton" />
                ) : (
                  (value || 0).toLocaleString()
                )}
                <small>MMK</small>
              </strong>
              <p>{caption}</p>
            </div>
          ))}
        </div>
        <nav className="pc-tabs" aria-label="Private coaching views">
          {[
            { id: "book", label: "Book a session", icon: Plus },
            {
              id: "bookings",
              label: "Bookings & payments",
              icon: CalendarDays,
            },
            { id: "handovers", label: "Cash handovers", icon: HandCoins },
          ].map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              aria-current={view === id ? "page" : undefined}
              className={view === id ? "is-active" : ""}
              onClick={() => {
                setView(id);
                setNotice("");
              }}
            >
              <Icon size={17} />
              <span>{label}</span>
              {id === "handovers" && pendingCount > 0 && <b>{pendingCount}</b>}
            </button>
          ))}
        </nav>
        {error && (
          <div role="alert" className="pc-alert pc-alert--error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="pc-alert">
            <CheckCircle2 size={18} />
            {notice}
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div hidden={view !== "book"}>
          <StaffCourseForm
            catalog={catalog}
            loading={catalogLoading}
            isCoach={isCoach}
            collectorName={user?.name || ""}
            onCreated={load}
            onViewBookings={() => setView("bookings")}
          />
        </div>
        {view === "bookings" && (
          <section className="pc-bookings">
            <div className="pc-section-heading">
              <div>
                <span className="pc-overline">SESSION REGISTER</span>
                <h2>Bookings & payments</h2>
                <p>
                  {report?.rows.length || 0} sessions · select a booking for
                  payment details
                </p>
              </div>
              <Button onClick={() => setView("book")}>
                <Plus size={16} />
                New booking
              </Button>
            </div>
            <div className="pc-toolbar">
              <label className="pc-search">
                <Search size={17} />
                <span className="sr-only">Search bookings</span>
                <input
                  placeholder="Find a member, course or booking…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <Button
                variant="secondary"
                aria-expanded={showFilters}
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter size={15} />
                Filters
                {Object.values(filters).filter(Boolean).length > 0 && (
                  <span>{Object.values(filters).filter(Boolean).length}</span>
                )}
              </Button>
            </div>
            {showFilters && (
              <div className="pc-filter-panel">
                <div className="pc-filter-fields">
                  {(["from", "to"] as const).map((k) => (
                    <label key={k}>
                      {k === "from" ? "Session date from" : "Session date to"}
                      <input
                        type="date"
                        value={filters[k]}
                        onChange={(e) =>
                          setFilters({ ...filters, [k]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    Payment source
                    <Select
                      value={filters.paymentSource}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          paymentSource: e.target.value,
                        })
                      }
                    >
                      <option value="">All sources</option>
                      {Object.entries(shortSources).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label>
                    Payment status
                    <Select
                      value={filters.paymentStatus}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          paymentStatus: e.target.value,
                        })
                      }
                    >
                      <option value="">All payment statuses</option>
                      {["paid", "pending", "refunded"].map((s) => (
                        <option key={s} value={s}>
                          {readable[s]}
                        </option>
                      ))}
                    </Select>
                  </label>
                  {!isCoach && (
                    <label>
                      Coach
                      <Select
                        value={filters.coachId}
                        onChange={(e) =>
                          setFilters({ ...filters, coachId: e.target.value })
                        }
                      >
                        <option value="">All coaches</option>
                        {Array.from(
                          new Map(
                            catalog.courses
                              .flatMap((c) => c.coaches)
                              .map((c) => [c.id, c]),
                          ).values(),
                        ).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  <label>
                    Booking status
                    <Select
                      value={filters.status}
                      onChange={(e) =>
                        setFilters({ ...filters, status: e.target.value })
                      }
                    >
                      <option value="">All booking statuses</option>
                      {[
                        "PENDING_COACH_CONFIRMATION",
                        "AWAITING_PAYMENT",
                        "CONFIRMED",
                        "COMPLETED",
                        "CANCELLED",
                        "EXPIRED",
                        "COACH_DECLINED",
                      ].map((s) => (
                        <option key={s} value={s}>
                          {readable[s]}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label>
                    Payment method
                    <input
                      placeholder="Cash, KPay…"
                      value={filters.paymentMethod}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          paymentMethod: e.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="pc-text-button"
                  onClick={() =>
                    setFilters({
                      from: "",
                      to: "",
                      paymentSource: "",
                      paymentMethod: "",
                      coachId: "",
                      status: "",
                      paymentStatus: "",
                    })
                  }
                >
                  Clear filters
                </button>
              </div>
            )}
            {loading ? (
              <div className="pc-loading" role="status">
                Loading sessions…
              </div>
            ) : !rows.length ? (
              <Empty
                title="No sessions here yet"
                body="Create a booking or try another search or filter."
              />
            ) : (
              <div className="pc-register">
                <div className="pc-register-head">
                  <span>Member & session</span>
                  <span>Schedule</span>
                  <span>Payment</span>
                  <span>Amount</span>
                  <span />
                </div>
                {rows.map((b) => (
                  <details className="pc-booking-row" key={b.id}>
                    <summary>
                      <div className="pc-member-cell">
                        <span className="pc-avatar">{avatar(b.user.name)}</span>
                        <div>
                          <strong>{b.user.name}</strong>
                          <small>
                            {b.title} · {b.coach?.name || "Coach"}
                          </small>
                        </div>
                      </div>
                      <div className="pc-schedule-cell">
                        <strong>{dateLabel(b.date)}</strong>
                        <small>{b.time}</small>
                      </div>
                      <div className="pc-payment-cell">
                        <Status value={b.paymentStatus} />
                        <small>{shortSources[b.source]}</small>
                      </div>
                      <strong className="pc-amount-cell">
                        {money(b.price)}
                      </strong>
                      <ChevronDown className="pc-row-chevron" size={17} />
                    </summary>
                    <div className="pc-booking-detail">
                      <div className="pc-detail-top">
                        <span>Booking {b.code}</span>
                        <Status value={b.status} />
                      </div>
                      <div className="pc-details-grid">
                        <div>
                          <span>Payment method</span>
                          <strong>{b.method || "Not recorded"}</strong>
                        </div>
                        <div>
                          <span>Collected by</span>
                          <strong>
                            {actorName(b.payment?.collectedByUserId || null)}
                          </strong>
                        </div>
                        <div>
                          <span>Verification</span>
                          <strong>
                            {readable[b.verificationStatus] || "Needs review"}
                          </strong>
                        </div>
                        <div>
                          <span>Cash held / handed over</span>
                          <strong>
                            {money(b.cashHeld)} / {money(b.received)}
                          </strong>
                        </div>
                      </div>
                      {b.payment && (
                        <div className="pc-receipt-ref">
                          <span>Receipt {b.payment.id}</span>
                          <span>
                            Reference:{" "}
                            {b.payment.providerReference ||
                              b.payment.externalReceiptReference ||
                              "—"}
                          </span>
                          {b.payment.notes && <p>{b.payment.notes}</p>}
                        </div>
                      )}
                      <div className="pc-row-actions">
                        {b.paymentStatus === "pending" &&
                          [
                            "PENDING_COACH_CONFIRMATION",
                            "AWAITING_PAYMENT",
                          ].includes(b.status) && (
                            <>
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  ask({
                                    title: "Record cash payment",
                                    description: `Confirm you personally received this cash from ${b.user.name}. The session will be confirmed.`,
                                    amount: b.price,
                                    path: `/bookings/${b.id}/cash`,
                                  })
                                }
                              >
                                <Banknote size={16} />
                                Record cash
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  ask({
                                    title: "Cancel this session?",
                                    description:
                                      "The reservation will be released. Add a reason for the booking history.",
                                    reason: true,
                                    path: `/bookings/${b.id}/cancel`,
                                  })
                                }
                              >
                                Cancel session
                              </Button>
                            </>
                          )}
                        {b.paymentStatus === "paid" && (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              printReceipt(
                                b,
                                actorName(b.payment?.collectedByUserId || null),
                              )
                            }
                          >
                            <Download size={15} />
                            Receipt / PDF
                          </Button>
                        )}
                      </div>
                      {!isCoach && (
                        <details className="pc-advanced">
                          <summary>
                            Payment lookup & admin actions
                            <ChevronDown size={14} />
                          </summary>
                          <PaymentReview
                            row={b}
                            admin={user?.role === "admin"}
                            onSaved={load}
                          />
                        </details>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
            <div className="pc-finance-footnote">
              <ShieldCheck size={15} />
              <span>
                Revenue {money(summary.revenue || 0)} · Unpaid{" "}
                {money(summary.unpaid || 0)} · Refunds{" "}
                {money(summary.refunds || 0)}. Totals follow session date
                filters.
              </span>
            </div>
          </section>
        )}
        {view === "handovers" && (
          <section>
            <div className="pc-section-heading">
              <div>
                <span className="pc-overline">CASH IN GOOD HANDS</span>
                <h2>
                  {isCoach
                    ? "Your cash handovers"
                    : "Collection & handover history"}
                </h2>
                <p>
                  {isCoach
                    ? "Choose collections to hand over. ZAWANA confirms when cash arrives."
                    : "Acknowledge cash only after you have received it."}
                </p>
              </div>
            </div>
            <div className="pc-handover-flow">
              {[
                { icon: Wallet, title: "Collected", text: "Payment recorded" },
                {
                  icon: ArrowUpRight,
                  title: "Submitted",
                  text: "Handover requested",
                },
                {
                  icon: ShieldCheck,
                  title: "Received",
                  text: "Cash acknowledged",
                },
              ].map(({ icon: Icon, title, text }, i) => (
                <div key={title}>
                  <span>
                    <Icon size={20} />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </div>
                  {i < 2 && <ArrowRight size={16} className="pc-flow-arrow" />}
                </div>
              ))}
            </div>
            {isCoach && (
              <Card className="pc-handover-composer">
                <div className="pc-section-heading">
                  <div>
                    <h3>Prepare a handover</h3>
                    <p>Enter an amount or select the full available balance.</p>
                  </div>
                </div>
                {!ownCollections.length ? (
                  <p className="pc-muted">
                    No collections available for handover. Submitted amounts are
                    already reserved.
                  </p>
                ) : (
                  ownCollections.map((b) => (
                    <div className="pc-handover-item" key={b.id}>
                      <span className="pc-avatar">{avatar(b.user.name)}</span>
                      <div>
                        <strong>{b.user.name}</strong>
                        <small>
                          {b.title} · {money(b.availableForHandover)} available
                        </small>
                      </div>
                      <label>
                        <span className="sr-only">
                          Handover amount for {b.user.name}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={b.availableForHandover}
                          placeholder="0"
                          value={handovers[b.payment!.id] || ""}
                          onChange={(e) => {
                            setHandovers({
                              ...handovers,
                              [b.payment!.id]: e.target.value,
                            });
                            handoverKey.current = crypto.randomUUID();
                          }}
                        />
                        <span>MMK</span>
                      </label>
                      <button
                        type="button"
                        className="pc-text-button"
                        onClick={() => {
                          setHandovers({
                            ...handovers,
                            [b.payment!.id]: String(b.availableForHandover),
                          });
                          handoverKey.current = crypto.randomUUID();
                        }}
                      >
                        Use full amount
                      </button>
                    </div>
                  ))
                )}
                <div className="pc-handover-footer">
                  <div>
                    <small>Total handover</small>
                    <strong>{money(selectedAmount)}</strong>
                  </div>
                  <Button
                    disabled={busy || !validHandover}
                    loading={busy}
                    onClick={async () => {
                      const success = await action("/settlements", {
                        requestKey: handoverKey.current,
                        items: Object.entries(handovers)
                          .filter(([, v]) => Number(v) > 0)
                          .map(([paymentId, v]) => ({
                            paymentId,
                            amount: Number(v),
                          })),
                      });
                      if (success) {
                        setHandovers({});
                        handoverKey.current = crypto.randomUUID();
                      }
                    }}
                  >
                    <HandCoins size={16} />
                    Submit handover
                  </Button>
                </div>
              </Card>
            )}
            <h3 className="pc-list-title">
              Settlement history <span>{report?.settlements.length || 0}</span>
            </h3>
            {!report?.settlements.length ? (
              <Empty
                title="No handovers yet"
                body="Submitted and received handovers will appear here, with a clear record of who collected and received the cash."
              />
            ) : (
              <div className="pc-settlements">
                {report.settlements.map((s) => (
                  <div className="pc-settlement" key={s.id}>
                    <span
                      className={`pc-settlement-icon ${s.status === "RECEIVED" ? "is-received" : ""}`}
                    >
                      {s.status === "RECEIVED" ? (
                        <Check size={19} />
                      ) : (
                        <ArrowUpRight size={19} />
                      )}
                    </span>
                    <div>
                      <strong>{actorName(s.collectorId)}</strong>
                      <small>
                        {dateLabel(s.submittedAt.slice(0, 10))} ·{" "}
                        {s.status === "RECEIVED"
                          ? `Received by ${actorName(s.receivedById)}`
                          : "Waiting for receiving staff"}
                      </small>
                      <details>
                        <summary>Reference</summary>
                        <span className="pc-break">{s.id}</span>
                      </details>
                    </div>
                    <strong>{money(s.amount)}</strong>
                    <Status value={s.status} />
                    {!isCoach && s.status === "SUBMITTED" && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          ask({
                            title: "Acknowledge cash receipt",
                            description: `Confirm you have received this cash from ${actorName(s.collectorId)}.`,
                            amount: s.amount,
                            path: `/settlements/${s.id}/receive`,
                          })
                        }
                      >
                        Confirm receipt
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {confirmation && (
          <DialogSurface
            title={confirmation.title}
            onClose={() => {
              if (!busy) setConfirmation(null);
            }}
            className="pc-confirm-dialog"
          >
            <div className="pc-confirm-icon">
              {confirmation.reason ? (
                <CalendarDays size={24} />
              ) : (
                <HandCoins size={24} />
              )}
            </div>
            <h2>{confirmation.title}</h2>
            <p>{confirmation.description}</p>
            {confirmation.amount !== undefined && (
              <strong className="pc-confirm-amount">
                {money(confirmation.amount)}
              </strong>
            )}
            {confirmation.reason && (
              <label>
                Cancellation reason
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Tell us why this session is being cancelled…"
                  maxLength={2000}
                />
                <small>At least 10 characters</small>
              </label>
            )}
            <div className="pc-confirm-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Go back
              </Button>
              <Button
                loading={busy}
                disabled={
                  busy || (!!confirmation.reason && reason.trim().length < 10)
                }
                onClick={async () => {
                  if (
                    await action(
                      confirmation.path,
                      confirmation.reason ? { reason: reason.trim() } : {},
                    )
                  )
                    setConfirmation(null);
                }}
              >
                Confirm
              </Button>
            </div>
            {error && (
              <p role="alert" className="pc-error">
                {error}
              </p>
            )}
          </DialogSurface>
        )}
      </div>
    </Page>
  );
}

function StaffCourseForm({
  catalog,
  loading,
  isCoach,
  collectorName,
  onCreated,
  onViewBookings,
}: {
  catalog: { courses: Course[]; courts: Person[] };
  loading: boolean;
  isCoach: boolean;
  collectorName: string;
  onCreated: () => Promise<void>;
  onViewBookings: () => void;
}) {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Person[]>([]);
  const [member, setMember] = useState<Person | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState("");
  const [form, setForm] = useState({
    courseId: "",
    coachId: "",
    courtId: "",
    date: bookingClock().date,
    time: "",
    paymentSource: "UNPAID",
    reference: "",
    notes: "",
  });
  const [slots, setSlots] = useState<
    { time: string; available: boolean; reason: string | null }[]
  >([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const successHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (success) successHeading.current?.focus();
  }, [success]);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const key = useRef(crypto.randomUUID());
  const submitLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const course = catalog.courses.find((c) => c.id === form.courseId);
  const coach = course?.coaches.find((c) => c.id === form.coachId);
  const court = catalog.courts.find((c) => c.id === form.courtId);
  const cash = ["COACH", "BADMINTON_FO"].includes(form.paymentSource);
  const edit = (changes: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...changes }));
    key.current = crypto.randomUUID();
    setError("");
  };
  const move = (next: number) => {
    setStep(next);
    setError("");
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
  };
  useEffect(() => {
    let active = true;
    if (query.trim().length < 2) {
      setMembers([]);
      setSearching(false);
      setSearched("");
      return;
    }
    setSearching(true);
    setSearched("");
    setMembers([]);
    const timer = setTimeout(() => {
      get<Person[]>(`${base}/members?q=${encodeURIComponent(query.trim())}`)
        .then((v) => {
          if (active) {
            setMembers(v);
            setSearched(query);
          }
        })
        .catch((e) => {
          if (active) setError(message(e));
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    let active = true;
    setSlots([]);
    if (!course || !form.coachId || !form.courtId || !form.date) {
      setSlotsLoading(false);
      return;
    }
    setSlotsLoading(true);
    const p = new URLSearchParams({
      courseId: course.id,
      coachId: form.coachId,
      courtId: form.courtId,
      date: form.date,
      durationMinutes: String(course.duration),
    });
    get<{ slots: typeof slots }>(`/private-courses/availability?${p}`)
      .then((v) => {
        if (active) setSlots(v.slots);
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [course, form.coachId, form.courtId, form.date]);
  const submit = async () => {
    if (!member || !course || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError("");
    try {
      const b = await post<{ code: string }>(`${base}/bookings`, {
        ...form,
        memberId: member.id,
        expectedPrice: course.price,
        requestKey: key.current,
      });
      setSuccess(b.code);
      await onCreated();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  };
  const ready = [
    !!member && !!course && !!coach,
    !!form.time &&
      slots.some((s) => s.time === form.time && s.available) &&
      !slotsLoading,
    true,
    true,
  ];
  const dates = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(`${bookingClock().date}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
  const titles = [
    "Who’s playing?",
    "Find the right moment.",
    "Keep payment clear.",
    "Everything look right?",
  ];
  const subtitles = [
    "Choose the member, their course and coach.",
    "Choose a court and an available session in Yangon time.",
    "Tell us where the member paid. We’ll record who collected it.",
    "Review the details before creating the session.",
  ];
  const reset = () => {
    setSuccess("");
    setStep(0);
    setMember(null);
    setQuery("");
    setForm({
      courseId: "",
      coachId: "",
      courtId: "",
      date: bookingClock().date,
      time: "",
      paymentSource: "UNPAID",
      reference: "",
      notes: "",
    });
    key.current = crypto.randomUUID();
  };
  if (success)
    return (
      <div className="pc-success-panel">
        <span className="pc-success-mark">
          <Check size={32} />
        </span>
        <span className="pc-overline">YOU’RE ALL SET</span>
        <h2 ref={successHeading} tabIndex={-1}>
          {cash ? "Session confirmed." : "Booking request sent."}
        </h2>
        <p>
          {member?.name} · {course?.title}
          <br />
          {dateLabel(form.date)} · {form.time} · {court?.name}
        </p>
        <span className="pc-success-code">Booking {success}</span>
        <p className="pc-muted">
          {cash
            ? `${money(course?.price || 0)} cash recorded, collected by ${collectorName}.`
            : "The coach will review the request. The existing payment window applies after acceptance."}
        </p>
        <div>
          <Button onClick={onViewBookings}>
            View bookings
            <ArrowRight size={16} />
          </Button>
          <Button variant="secondary" onClick={reset}>
            Book another session
          </Button>
        </div>
      </div>
    );
  return (
    <div className="pc-booking-layout">
      <section
        className="pc-booking-panel"
        aria-label="Create a private course booking"
      >
        <div className="pc-booking-intro">
          <span className="pc-overline">A SESSION MADE PERSONAL</span>
          <h2>
            {isCoach
              ? "Book a session for member"
              : "Create private course booking"}
          </h2>
          <p>Four simple steps. We’ll keep the details together.</p>
        </div>
        <ol className="pc-steps" aria-label="Booking progress">
          {["Member & course", "Session", "Payment", "Review"].map(
            (label, i) => (
              <li
                key={label}
                className={
                  i === step ? "is-current" : i < step ? "is-complete" : ""
                }
              >
                <button
                  type="button"
                  aria-current={i === step ? "step" : undefined}
                  disabled={i > step || busy}
                  onClick={() => move(i)}
                >
                  <span>{i < step ? <Check size={14} /> : `0${i + 1}`}</span>
                  <b>{label}</b>
                </button>
              </li>
            ),
          )}
        </ol>
        <div className="pc-step-body">
          <div className="pc-step-heading">
            <h3 ref={heading} tabIndex={-1}>
              {titles[step]}
            </h3>
            <p>{subtitles[step]}</p>
          </div>
          {error && (
            <div className="pc-alert pc-alert--error" role="alert">
              {error}
            </div>
          )}
          {step === 0 && (
            <>
              <div className="pc-field-heading">
                <UserRound size={16} />
                <h4>Member</h4>
                {member && (
                  <button
                    type="button"
                    className="pc-text-button"
                    onClick={() => {
                      setMember(null);
                      setQuery("");
                      key.current = crypto.randomUUID();
                    }}
                  >
                    Change member
                  </button>
                )}
              </div>
              {member ? (
                <div className="pc-selected-member">
                  <span className="pc-avatar">{avatar(member.name)}</span>
                  <div>
                    <strong>{member.name}</strong>
                    <small>{member.phone || member.email}</small>
                  </div>
                  <CheckCircle2 size={20} />
                </div>
              ) : (
                <>
                  <label className="pc-search">
                    <Search size={18} />
                    <span className="sr-only">
                      Find member by name, phone or email
                    </span>
                    <input
                      placeholder="Search name, phone or email"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        key.current = crypto.randomUUID();
                      }}
                      autoComplete="off"
                    />
                  </label>
                  {searching && (
                    <p role="status" className="pc-muted">
                      Searching members…
                    </p>
                  )}
                  {searched === query && members.length > 0 && (
                    <div className="pc-member-results">
                      {members.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          aria-label={`${m.name} · ${m.phone || m.email}`}
                          onClick={() => {
                            setMember(m);
                            key.current = crypto.randomUUID();
                          }}
                        >
                          <span className="pc-avatar">{avatar(m.name)}</span>
                          <span>
                            <strong>{m.name}</strong>
                            <small>{m.phone || m.email}</small>
                          </span>
                          <Plus size={17} />
                        </button>
                      ))}
                    </div>
                  )}
                  {searched === query &&
                    query.length >= 2 &&
                    !members.length && (
                      <p className="pc-muted">
                        No matching members. Try another name, email or phone
                        number.
                      </p>
                    )}
                  <p className="pc-field-help">
                    Choose an existing member to keep their booking history
                    together.{" "}
                    {!isCoach &&
                      (location.pathname.startsWith("/admin") ? (
                        <Link to="/admin/users">
                          Member management
                          <ArrowUpRight size={12} />
                        </Link>
                      ) : (
                        "Ask an admin to create an account if needed."
                      ))}
                  </p>
                </>
              )}
              <div className="pc-field-heading">
                <Sparkles size={16} />
                <h4>Private course</h4>
              </div>
              {loading ? (
                <div role="status" className="pc-loading">
                  Loading eligible courses…
                </div>
              ) : !catalog.courses.length ? (
                <div className="pc-inline-empty">
                  No active courses are available for your profile. Contact an
                  admin to check course assignments.
                </div>
              ) : (
                <div className="pc-course-grid">
                  {catalog.courses.map((c) => (
                    <button
                      type="button"
                      className={`pc-course-option ${course?.id === c.id ? "is-selected" : ""}`}
                      key={c.id}
                      aria-label={`Select ${c.title}`}
                      aria-pressed={course?.id === c.id}
                      onClick={() =>
                        edit({
                          courseId: c.id,
                          coachId:
                            c.coaches.length === 1 || isCoach
                              ? c.coaches[0]?.id || ""
                              : "",
                          time: "",
                        })
                      }
                    >
                      <span className="pc-option-top">
                        <span className="pc-course-icon">
                          <Sparkles size={20} />
                        </span>
                        <span className="pc-radio">
                          {course?.id === c.id && <Check size={12} />}
                        </span>
                      </span>
                      <strong>{c.title}</strong>
                      <span className="pc-course-meta">
                        <Clock3 size={13} />
                        {c.duration} minutes · {c.coaches.length}{" "}
                        {c.coaches.length === 1 ? "coach" : "coaches"}
                      </span>
                      <b>
                        {money(c.price)}
                        <small> / session</small>
                      </b>
                    </button>
                  ))}
                </div>
              )}
              {course && (
                <>
                  <div className="pc-field-heading">
                    <Users size={16} />
                    <h4>{isCoach ? "Your coach profile" : "Choose a coach"}</h4>
                    {isCoach && (
                      <span className="pc-locked">
                        <LockKeyhole size={12} />
                        Only you
                      </span>
                    )}
                  </div>
                  <div className="pc-coach-options">
                    {course.coaches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={form.coachId === c.id ? "is-selected" : ""}
                        aria-pressed={form.coachId === c.id}
                        aria-label={`Select coach ${c.name}`}
                        disabled={isCoach}
                        onClick={() => edit({ coachId: c.id, time: "" })}
                      >
                        <span className="pc-avatar">{avatar(c.name)}</span>
                        <span>
                          <strong>{c.name}</strong>
                          <small>Badminton coach</small>
                        </span>
                        {form.coachId === c.id && <CheckCircle2 size={17} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <div className="pc-field-heading">
                <CalendarDays size={16} />
                <h4>Session date</h4>
                <span className="pc-muted">Asia/Yangon</span>
              </div>
              <div className="pc-date-strip">
                {dates.map((d, i) => (
                  <button
                    type="button"
                    key={d}
                    aria-label={`Choose ${d}`}
                    aria-pressed={form.date === d}
                    className={form.date === d ? "is-selected" : ""}
                    onClick={() => edit({ date: d, time: "" })}
                  >
                    <small>
                      {i === 0
                        ? "Today"
                        : new Date(`${d}T12:00:00`).toLocaleDateString(
                            "en-GB",
                            { weekday: "short" },
                          )}
                    </small>
                    <strong>{new Date(`${d}T12:00:00`).getDate()}</strong>
                  </button>
                ))}
              </div>
              <label className="pc-custom-date">
                Or choose another date
                <input
                  type="date"
                  aria-label="Session date · Asia/Yangon"
                  min={bookingClock().date}
                  value={form.date}
                  onChange={(e) => edit({ date: e.target.value, time: "" })}
                />
              </label>
              <div className="pc-field-heading">
                <MapPin size={16} />
                <h4>Your court</h4>
              </div>
              <div className="pc-court-grid">
                {catalog.courts.map((c) => (
                  <button
                    type="button"
                    aria-label={`Select ${c.name}`}
                    aria-pressed={form.courtId === c.id}
                    className={form.courtId === c.id ? "is-selected" : ""}
                    key={c.id}
                    onClick={() => edit({ courtId: c.id, time: "" })}
                  >
                    <span className="pc-mini-court" aria-hidden="true">
                      <i />
                    </span>
                    <strong>{c.name}</strong>
                    {form.courtId === c.id && <Check size={13} />}
                  </button>
                ))}
              </div>
              <div className="pc-field-heading">
                <Clock3 size={16} />
                <h4>Available times</h4>
                {slots.length > 0 && (
                  <span className="pc-available-count">
                    {slots.filter((s) => s.available).length} available
                  </span>
                )}
              </div>
              {!form.courtId ? (
                <div className="pc-inline-empty">
                  <MapPin size={20} />
                  Choose a court to see session times.
                </div>
              ) : slotsLoading ? (
                <div role="status" className="pc-loading">
                  Checking court & coach availability…
                </div>
              ) : (
                <>
                  <div className="pc-time-grid">
                    {slots
                      .filter((s) => s.available || showUnavailable)
                      .map((s) => (
                        <button
                          key={s.time}
                          type="button"
                          aria-pressed={form.time === s.time}
                          disabled={!s.available}
                          title={s.reason || "Available"}
                          className={form.time === s.time ? "is-selected" : ""}
                          onClick={() => edit({ time: s.time })}
                        >
                          <strong>{s.time.split(" — ")[0]}</strong>
                          <small>
                            {s.available
                              ? `until ${s.time.split(" — ")[1]}`
                              : s.reason}
                          </small>
                          {form.time === s.time && <Check size={13} />}
                        </button>
                      ))}
                  </div>
                  {slots.length > 0 && !slots.some((s) => s.available) && (
                    <p className="pc-muted">
                      No times available. Try another court or date.
                    </p>
                  )}
                  {slots.some((s) => !s.available) && (
                    <button
                      type="button"
                      className="pc-text-button pc-unavailable-toggle"
                      aria-expanded={showUnavailable}
                      onClick={() => setShowUnavailable(!showUnavailable)}
                    >
                      {showUnavailable
                        ? "Hide unavailable times"
                        : "Show unavailable times"}
                      <ChevronDown size={13} />
                    </button>
                  )}
                </>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <h4 className="pc-payment-question">Where did the member pay?</h4>
              <div className="pc-payment-options">
                {(["BADMINTON_FO", "COACH", "ONLINE", "UNPAID"] as const).map(
                  (source) => {
                    const Icon = sourceIcons[source];
                    const disabled =
                      (source === "COACH" && !isCoach) ||
                      (source === "BADMINTON_FO" && isCoach);
                    return (
                      <button
                        type="button"
                        key={source}
                        aria-pressed={form.paymentSource === source}
                        disabled={disabled}
                        className={
                          form.paymentSource === source ? "is-selected" : ""
                        }
                        onClick={() => edit({ paymentSource: source })}
                      >
                        <span className="pc-payment-icon">
                          <Icon size={22} />
                        </span>
                        <span>
                          <strong>
                            {source === "BADMINTON_FO"
                              ? "Front office cash"
                              : source === "COACH"
                                ? "Coach cash"
                                : source === "ONLINE"
                                  ? "Online payment"
                                  : "Not yet paid"}
                          </strong>
                          <small>
                            {disabled
                              ? `Must be recorded by the ${source === "COACH" ? "collecting coach" : "receiving front office staff"}.`
                              : source === "UNPAID"
                                ? "Send for coach acceptance, then payment."
                                : source === "ONLINE"
                                  ? "Verify an existing payment after booking."
                                  : `Cash personally received by ${collectorName}.`}
                          </small>
                        </span>
                        <span className="pc-radio">
                          {form.paymentSource === source && <Check size={12} />}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
              <div className="pc-payment-note">
                <ShieldCheck size={18} />
                <p>
                  {cash
                    ? `This records ${money(course?.price || 0)} cash collected by ${collectorName} and confirms the session.`
                    : form.paymentSource === "ONLINE"
                      ? "Online selection keeps the booking unpaid until a successful provider payment is verified. It does not record cash."
                      : "The coach will accept the request first. The member then has the existing 24-hour payment window."}
                </p>
              </div>
              <details className="pc-optional">
                <summary>
                  Add a reference or note <span>Optional</span>
                  <Plus size={15} />
                </summary>
                <label>
                  Receipt / external reference
                  <input
                    value={form.reference}
                    onChange={(e) => edit({ reference: e.target.value })}
                    maxLength={200}
                    placeholder="e.g. receipt number"
                  />
                </label>
                <label>
                  Notes
                  <textarea
                    value={form.notes}
                    onChange={(e) => edit({ notes: e.target.value })}
                    maxLength={2000}
                    placeholder="Anything the team should know?"
                  />
                </label>
              </details>
            </>
          )}
          {step === 3 && (
            <>
              <div className="pc-review-member">
                <span className="pc-avatar">{avatar(member?.name || "")}</span>
                <div>
                  <strong>{member?.name}</strong>
                  <small>{member?.phone || member?.email}</small>
                </div>
                <ShieldCheck size={20} />
              </div>
              <div className="pc-review-grid">
                {[
                  {
                    icon: Sparkles,
                    label: "Private course",
                    value: course?.title,
                  },
                  { icon: UserRound, label: "Coach", value: coach?.name },
                  {
                    icon: CalendarDays,
                    label: "Date",
                    value: dateLabel(form.date),
                  },
                  { icon: Clock3, label: "Time", value: form.time },
                  { icon: MapPin, label: "Court", value: court?.name },
                  {
                    icon: CreditCard,
                    label: "Payment",
                    value: shortSources[form.paymentSource],
                  },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label}>
                    <Icon size={17} />
                    <span>
                      <small>{label}</small>
                      <strong>{value}</strong>
                    </span>
                  </div>
                ))}
              </div>
              <div className="pc-review-total">
                <span>
                  Session total<small>{course?.duration} minutes · MMK</small>
                </span>
                <strong>{money(course?.price || 0)}</strong>
              </div>
              <div className="pc-payment-note">
                <ShieldCheck size={18} />
                <p>
                  {cash
                    ? `Confirm only if you personally received ${money(course?.price || 0)} in cash. Collector: ${collectorName}.`
                    : "This creates an unpaid booking request. Coach acceptance and payment confirmation will follow."}
                </p>
              </div>
            </>
          )}
        </div>
        <div className="pc-step-footer">
          <Button
            variant="ghost"
            disabled={step === 0 || busy}
            onClick={() => move(step - 1)}
          >
            <ChevronLeft size={16} />
            Back
          </Button>
          <span>Step {step + 1} of 4</span>
          <Button
            loading={busy}
            disabled={busy || !ready[step]}
            onClick={() => (step === 3 ? void submit() : move(step + 1))}
          >
            {step === 3
              ? cash
                ? "Confirm paid booking"
                : "Send booking request"
              : [
                  "Continue to session",
                  "Continue to payment",
                  "Review booking",
                ][step]}
            {step < 3 && <ArrowRight size={16} />}
          </Button>
        </div>
      </section>
      <aside className="pc-live-summary">
        <div className="pc-summary-top">
          <span className="pc-overline">YOUR SESSION</span>
          <span className="pc-summary-icon">
            <CalendarDays size={22} />
          </span>
          <h3>{course?.title || "A little time for better play."}</h3>
          <p>
            {course
              ? `${course.duration} minutes of personal coaching`
              : "Choose a course to start building the session."}
          </p>
        </div>
        <div className="pc-summary-body">
          {[
            {
              icon: UserRound,
              label: "Member",
              value: member?.name || "Choose a member",
            },
            {
              icon: Users,
              label: "Coach",
              value: coach?.name || "Choose a coach",
            },
            {
              icon: CalendarDays,
              label: "Date & time",
              value: form.time
                ? `${dateLabel(form.date)} · ${form.time}`
                : "Find an available time",
            },
            {
              icon: MapPin,
              label: "Court",
              value: court?.name || "Choose a court",
            },
          ].map(({ icon: Icon, label, value }) => (
            <div className="pc-summary-item" key={label}>
              <Icon size={16} />
              <span>
                <small>{label}</small>
                <strong>{value}</strong>
              </span>
            </div>
          ))}
          <div className="pc-summary-total">
            <span>Session total</span>
            <strong>{course ? money(course.price) : "—"}</strong>
          </div>
        </div>
        <p className="pc-summary-assurance">
          <ShieldCheck size={14} />
          Availability and price checked at confirmation.
        </p>
      </aside>
    </div>
  );
}
function PaymentReview({
  row,
  admin,
  onSaved,
}: {
  row: Row;
  admin: boolean;
  onSaved: () => Promise<void>;
}) {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("");
  const [details, setDetails] = useState({
    reference: "",
    reason: "",
    evidence: "",
    method: "Legacy online",
    transactionId: "",
  });
  const save = async (path: string, data: unknown) => {
    setBusy(true);
    setError("");
    try {
      await post(`${base}/bookings/${row.id}/${path}`, data);
      setMode("");
      await onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 border-t pt-3">
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setAttempts(
              await get<Attempt[]>(`${base}/bookings/${row.id}/online`),
            );
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Look up online payment
      </Button>
      {attempts &&
        (attempts.length ? (
          attempts.map((p) => (
            <div key={p.id} className="break-all text-sm">
              {p.provider} · {p.reference} · {money(p.amount)} · {p.status}
              <Button
                disabled={busy || p.status !== "SUCCEEDED" || !!row.payment}
                onClick={() =>
                  void save("reconcile-online", { paymentAttemptId: p.id })
                }
              >
                Link verified receipt
              </Button>
            </div>
          ))
        ) : (
          <p>No provider records for this booking.</p>
        ))}
      {admin &&
        row.source === "LEGACY_UNKNOWN" &&
        row.paymentStatus === "paid" && (
          <Button variant="secondary" onClick={() => setMode("verify-legacy")}>
            Verify historical online evidence
          </Button>
        )}
      {admin && row.payment && !row.payment.transactionId && (
        <Button variant="secondary" onClick={() => setMode("link-transaction")}>
          Link original sales transaction
        </Button>
      )}
      {admin && row.payment?.status === "PAID" && (
        <Button variant="secondary" onClick={() => setMode("refund")}>
          Record completed refund
        </Button>
      )}
      {mode && (
        <div className="space-y-2">
          <p className="text-sm">
            {mode === "refund"
              ? "Record a refund already issued, with supporting evidence. This does not send money through the gateway."
              : "Admin historical review preserves the original revenue and does not infer a cash collector."}
          </p>
          {Object.entries(details)
            .filter(([k]) =>
              mode === "link-transaction"
                ? ["transactionId", "reason", "evidence"].includes(k)
                : k !== "transactionId" &&
                  (mode !== "refund" || k !== "method"),
            )
            .map(([k, v]) => (
              <label className="block" key={k}>
                {k}
                <input
                  className="w-full"
                  value={v}
                  onChange={(e) =>
                    setDetails({ ...details, [k]: e.target.value })
                  }
                />
              </label>
            ))}
          <Button
            disabled={
              busy ||
              details.reason.length < 10 ||
              details.evidence.length < 10 ||
              (mode === "link-transaction"
                ? !details.transactionId
                : details.reference.length < 3)
            }
            onClick={() =>
              void save(
                mode,
                mode === "refund"
                  ? {
                      reason: details.reason,
                      evidence: details.evidence,
                      reference: details.reference,
                    }
                  : mode === "link-transaction"
                    ? {
                        transactionId: details.transactionId,
                        reason: details.reason,
                        evidence: details.evidence,
                      }
                    : {
                        reference: details.reference,
                        reason: details.reason,
                        evidence: details.evidence,
                        method: details.method,
                      },
              )
            }
          >
            Save audited record
          </Button>
          <Button variant="secondary" onClick={() => setMode("")}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
