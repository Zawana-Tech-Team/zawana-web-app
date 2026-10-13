import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, Clock3, Dumbbell } from "lucide-react";
import { Badge, Button, Card, Empty } from "../components/UI";
import { get, patch } from "../api";

type Training = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: string;
  notes?: string | null;
  member: { name: string; email: string; phone?: string | null }
};
const scopes = [
  ["today", "Today"],
  ["upcoming", "Upcoming"],
  ["completed", "Completed"]
] as const;
const formatTime = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
};

export default function CoachTraining() {
  const [scope, setScope] = useState<(typeof scopes)[number][0]>("today");
  const [sessions, setSessions] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSessions(await get<Training[]>(`/coach/private-training?scope=${scope}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load assigned Gym training.");
    } finally {
      setLoading(false);
    }
  }, [scope]);
  useEffect(() => {
    void load();
  }, [load]);
  const update = async (session: Training, status: string) => {
    setBusy(session.id);
    setError("");
    try {
      await patch(`/gym/private-training/${session.id}/status`, { status });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update attendance.");
    } finally {
      setBusy("");
    }
  };
  return <div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">Gym coach schedule</p>
        <h2 className="text-xl font-black">Private training sessions</h2>
      </div>
      <div className="flex gap-2">
        {scopes.map(([value, label]) =>
          <button
            key={value}
            onClick={() => setScope(value)}
            className={`rounded-full px-4 py-2 text-xs font-black ${scope === value ? "bg-zawana-950 text-white" : "border bg-white"}`}
          >
            {label}
          </button>
        )}
      </div>
    </div>
    {error &&
      <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
        {error}
      </p>}
    {loading ?
      <Card className="p-6">Loading sessions…</Card> : sessions.length ?
      <div className="grid gap-3 lg:grid-cols-2">
        {sessions.map(session =>
          <Card key={session.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-zawana-gold">
                  <CalendarDays size={13} />
                  {session.date}
                </p>
                <h3 className="mt-2 text-xl font-black">{session.member.name}</h3>
                <p className="mt-1 text-sm text-zawana-500">{session.member.email}</p>
                <p className="mt-2 flex items-center gap-1 text-sm font-bold">
                  <Clock3 size={14} />
                  {formatTime(session.startTime)}–{formatTime(session.endTime)} · {session.durationMinutes} min</p>
              </div>
              <Badge good={session.status === "CHECKED_IN" || session.status === "COMPLETED"}>
                {session.status.replaceAll("_", " ")}
              </Badge>
            </div>
            {session.notes &&
              <p className="mt-4 rounded-xl bg-zawana-50 p-3 text-sm">{session.notes}</p>}
            <div className="mt-4 flex gap-2">
              {session.status === "SCHEDULED" && scope === "today" &&
                <Button
                  className="px-3 py-2"
                  disabled={!!busy}
                  onClick={() => void update(session, "CHECKED_IN")}
                >
                  <Check size={14} /> Check in</Button>}
              {session.status === "CHECKED_IN" &&
                <Button
                  className="px-3 py-2"
                  disabled={!!busy}
                  onClick={() => void update(session, "COMPLETED")}
                >
                  <Dumbbell size={14} /> Complete</Button>}
            </div>
          </Card>
        )}
      </div> :
      <Empty
        title="No sessions in this view"
        body="Gym Front Office bookings assigned to your linked Gym coach profile will appear here."
      />}
  </div>;
}
