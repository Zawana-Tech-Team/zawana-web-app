import { DeskDialog } from '../components/court-desk/DeskDialog';
import { BookingActionBar } from '../components/member-booking/BookingActionBar';
import { bookingClock, bookingHasStarted } from "../utils/bookingTime";
import { useBookingClock } from "../hooks/useBookingClock";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Button, Card, Page, Badge } from "../components/UI";
import { get, post } from "../api";
import { mediaImageSrc } from "../components/ImageUpload";

const days = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(`${bookingClock().date}T12:00:00`);
  d.setDate(d.getDate() + i);
  return d
});
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const label = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const slots = [
  "5:00 PM — 6:00 PM",
  "5:30 PM — 6:30 PM",
  "6:00 PM — 7:00 PM",
  "6:30 PM — 7:30 PM",
  "7:00 PM — 8:00 PM",
  "7:30 PM — 8:30 PM"
];

export function CoachBooking() {
  const now = useBookingClock();
  const [step, setStep] = useState(1);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [date, setDate] = useState(fmt(days[0]));
  const [coaches, setCoaches] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [time, setTime] = useState(slots[3]);
  const [busy, setBusy] = useState<any[]>([]);
  const [done, setDone] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    get<any[]>("/coaches")
      .then(c => setCoaches(c.filter(x => x.status === "active")))
      .catch(e => setError(e.message))
  }, []);
  useEffect(() => {
    get<any>(`/bookings/availability?date=${date}`)
      .then(data => setBusy(data.bookings || []))
      .catch(() => setBusy([]))
  }, [date]);
  useEffect(() => {
    if (coaches.length && !selected) setSelected(coaches[0])
  }, [coaches]);
  const available = (c: any, t: string) => !bookingHasStarted(date, t, now) && !busy.some(b => b.coachId === c.id && b.time === t);
  const confirm = async () => {
    if (!selected || submitting) return;
    if (bookingHasStarted(date, time) || !available(selected, time)) {
      setError("Choose an available session that has not started yet.");
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await post<any>("/bookings", {
        kind: "pt",
        title: `Session with ${selected.name}`,
        date,
        time,
        location: "High Performance Gym",
        price: 30000,
        coachId: selected.id
      });
      setDone(result.booking)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false);
    }
  };
  if (done)
    return <Page title="Booking confirmed" eyebrow="You're in">
      <Card className="mx-auto max-w-xl p-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-zawana-accent text-zawana-950">
          <Check />
        </div>
        <h2 className="mt-5 text-3xl font-black">{selected.name}</h2>
        <p className="mt-2 text-zawana-500">
          {date} · {time}
        </p>
        <p className="mt-5 text-xs tracking-widest text-zawana-500">BOOKING ID</p>
        <p className="mt-1 font-bold">{done.code}</p>
        <div className="mt-7 flex justify-center gap-2">
          <Link to="/bookings">
            <Button>View booking</Button>
          </Link>
          <Link to="/dashboard">
            <Button variant="secondary">Dashboard</Button>
          </Link>
        </div>
      </Card>
    </Page>;
  return <Page title="Book with a Coach" eyebrow="Personal Training">
    <div className="mx-auto max-w-4xl">
      <div className="space-y-6">
        <nav aria-label="Personal training steps" className="flex flex-wrap gap-3 border-b pb-4">{['Date','Coach','Time'].map((label,index) => <button type="button" key={label} aria-current={step === index+1 ? 'step' : undefined} className={`min-h-11 px-3 text-sm ${step === index+1 ? 'font-bold underline underline-offset-8' : 'text-zawana-500'}`} onClick={() => setStep(index+1)}>{index+1}. {label}</button>)}</nav>
        {step === 1 && <Card className="p-6">
          <h3 className="text-lg font-black">Select date</h3>
          <div className="mt-4 grid grid-cols-4 gap-2 md:grid-cols-7">
            {days.map(d =>
              <button
                key={fmt(d)}
                aria-label={fmt(d)}
                aria-pressed={date === fmt(d)}
                onClick={() => setDate(fmt(d))}
                className={`rounded-xl border p-3 text-left ${date === fmt(d) ? "border-zawana-accent bg-zawana-accent/10" : "border-zawana-950/8"}`}
              >
                <span className="block text-[10px] text-zawana-500">
                  {d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                </span>
                <b className="mt-2 block text-sm">{label(d)}</b>
              </button>
            )}
          </div>
        </Card>}
        {step === 2 && <Card className="p-6">
          <h3 className="text-lg font-black">Select coach</h3>
          <div className="mt-4 grid gap-3">
            {!coaches.length && <p className="text-sm text-zawana-500">No personal trainers are available. Please check back later.</p>}
            {coaches.map(c =>
              <button
                key={c.id}
                aria-pressed={selected?.id === c.id}
                onClick={() => setSelected(c)}
                className={`rounded-xl border p-4 text-left ${selected?.id === c.id ? "border-zawana-accent bg-zawana-accent/10" : "border-zawana-950/8"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-zawana-950 text-white">
                      {c.imageUrl ?
                        <img
                          src={mediaImageSrc(c.imageUrl)}
                          alt=""
                          className="h-full w-full object-cover"
                        /> : c.user?.avatar ?
                        <img src={c.user.avatar} alt="" className="h-full w-full object-cover" /> :
                        c.name.slice(0, 1)}
                    </span>
                    <b>{c.name}</b>
                  </span>
                  <Badge>30,000 MMK</Badge>
                </div>
                <p className="mt-2 text-sm text-zawana-500">{c.specialty}</p>
              </button>
            )}
          </div>
        </Card>}
        {step === 3 && <Card className="p-6">
          <h3 className="text-lg font-black">Select time</h3>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {slots.map(t =>
              <button
                key={t}
                aria-pressed={time === t}
                disabled={bookingHasStarted(date, t, now) || !!selected && !available(selected, t)}
                onClick={() => setTime(t)}
                className={`rounded-xl border p-3 text-sm font-bold disabled:opacity-40 ${time === t ? "border-zawana-accent bg-zawana-accent/10" : "border-zawana-950/8"}`}
              >
                {t}
              </button>
            )}
          </div>
        </Card>}
        {step < 3 && <div className="flex justify-between gap-3"><Button variant="secondary" disabled={step === 1} onClick={() => setStep(step-1)}>Back</Button><Button disabled={step === 2 && !selected} onClick={() => setStep(step+1)}>Continue</Button></div>}
        {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</p>}
      </div>
      {step === 3 && <BookingActionBar hidden={reviewOpen} action={<Button disabled={!selected || !available(selected,time)} onClick={() => setReviewOpen(true)}>Review booking</Button>}><span>Personal training</span><strong>30,000 MMK</strong></BookingActionBar>}
      {reviewOpen && <DeskDialog title="Review personal training" busy={submitting} onClose={() => setReviewOpen(false)} cancelLabel="Back to selection" summary={<strong>30,000 MMK</strong>} actions={<Button loading={submitting} disabled={!selected || !available(selected,time) || submitting} onClick={confirm}>Confirm booking</Button>}><p className="font-semibold">{selected?.name}</p><p className="mt-3 text-sm">{date} · {time}</p><p className="mt-3 text-sm text-zawana-500">High Performance Gym</p>{error && <p role="alert" className="mt-4 text-red-700">{error}</p>}</DeskDialog>}
    </div>
  </Page>
}
