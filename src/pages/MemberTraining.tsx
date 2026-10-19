import { useEffect, useState } from "react";
import { CalendarDays, Dumbbell } from "lucide-react";
import { Badge, Card, Empty, Page } from "../components/UI";
import { get } from "../api";
import GymEnrollments from "./GymEnrollments";

type TrainingSession = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: string;
  notes?: string | null;
  coach: {
    name: string;
    specialty: string;
    imageUrl?: string | null;
    user?: { avatar?: string | null }
  }
};
type Membership = {
  id: string;
  package: string;
  startDate: string;
  expiryDate: string;
  status: string
};
const formatTime = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
};

export default function MemberTraining() {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      get<TrainingSession[]>("/gym/private-training?scope=all"),
      get<Membership[]>("/memberships")
    ])
      .then(([rows, packages]) => {
        if (active) {
          setSessions(rows);
          setMemberships(packages);
        }
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Could not load your training history."
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const upcoming = sessions.filter(
    session => session.status === "SCHEDULED" || session.status === "CHECKED_IN"
  );
  const history = sessions.filter(session => !upcoming.includes(session));
  return <Page title="My Gym Training" eyebrow="Coaching & membership">
    {error &&
      <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
        {error}
      </p>}
    <div className="mb-6"><GymEnrollments memberView /></div>
    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-zawana-gold/15">
            <Dumbbell />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">Gym membership</p>
            <h2 className="text-xl font-black">Your access</h2>
          </div>
        </div>
        {memberships.length ?
          <div className="mt-5 space-y-3">
            {memberships.map(item =>
              <div key={item.id} className="rounded-xl bg-zawana-50 p-4">
                <div className="flex justify-between gap-2">
                  <b>{item.package}</b>
                  <Badge good={item.status === 'active'}>{item.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-zawana-500">
                  {item.startDate} – {item.expiryDate}
                </p>
              </div>
            )}
          </div> :
          <p className="mt-5 text-sm text-zawana-500">No gym membership is linked to your account yet.</p>}
      </Card>
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <CalendarDays className="text-zawana-gold" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">My training</p>
            <h2 className="text-xl font-black">Upcoming private sessions</h2>
          </div>
        </div>
        {loading ?
          <p className="mt-5 text-sm text-zawana-500">Loading training sessions…</p> : upcoming.length ?
          <div className="mt-5 divide-y">
            {upcoming.map(session =>
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <b>{session.coach.name}</b>
                  <p className="mt-1 text-sm text-zawana-500">
                    {session.date} · {formatTime(session.startTime)}–{formatTime(session.endTime)} · {session.durationMinutes} min</p>
                  {session.notes &&
                    <p className="mt-1 text-xs text-zawana-500">{session.notes}</p>}
                </div>
                <Badge good>{session.status.replaceAll("_", " ")}</Badge>
              </div>
            )}
          </div> :
          <Empty
            title="No private training booked"
            body="When Gym Front Office books a session for you, it will appear here."
          />}
      </Card>
    </div>
    <Card className="mt-5 p-6">
      <h2 className="text-lg font-black">Previous sessions</h2>
      {history.length ?
        <div className="mt-3 divide-y">
          {history.map(session =>
            <div
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <b>{session.coach.name}</b>
                <p className="text-xs text-zawana-500">
                  {session.date} · {formatTime(session.startTime)} · {session.durationMinutes} min</p>
              </div>
              <Badge>{session.status.replaceAll("_", " ")}</Badge>
            </div>
          )}
        </div> :
        <p className="mt-3 text-sm text-zawana-500">No completed training sessions yet. Performance metrics will appear when they are recorded.</p>}
    </Card>
  </Page>;
}
