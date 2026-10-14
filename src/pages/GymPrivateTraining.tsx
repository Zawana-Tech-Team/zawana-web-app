import { Select } from '../components/Select';
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock3, Dumbbell, Search, UserRound } from "lucide-react";
import { Badge, Button, Card, Empty, Pagination } from "../components/UI";
import { get, patch, post } from "../api";
import { mediaImageSrc } from "../components/ImageUpload";

type Person = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar?: string | null
};
type CoachProfile = {
  id: string;
  name: string;
  specialty: string;
  imageUrl?: string | null;
  user?: Person
};
type TrainingSession = {
  id: string;
  member: Person;
  coach: CoachProfile;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: string;
  notes?: string | null
};
const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const moneyTime = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
};

export default function GymPrivateTraining() {
  const [coaches, setCoaches] = useState<CoachProfile[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [form, setForm] = useState({
    memberId: "",
    coachId: "",
    date: localToday(),
    startTime: "16:00",
    durationMinutes: 60,
    notes: ""
  });
  const [scope, setScope] = useState("today");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [coachRows, memberRows, sessionRows] = await Promise.all([
        get<CoachProfile[]>("/gym/private-training/coaches"),
        get<Person[]>(
          `/gym/private-training/members${memberSearch ? `?q=${encodeURIComponent(memberSearch)}` : ""}`
        ),
        get<TrainingSession[]>(`/gym/private-training?scope=${scope}`),
      ]);
      setCoaches(coachRows);
      setMembers(memberRows);
      setSessions(sessionRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load private training.");
    } finally {
      setLoading(false);
    }
  }, [memberSearch, scope]);
  useEffect(() => {
    void load();
  }, [load]);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));
  const visible = useMemo(
    () => sessions.slice((page - 1) * pageSize, page * pageSize),
    [sessions, page]
  );
  const selectedCoach = coaches.find(coach => coach.id === form.coachId);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await post("/gym/private-training", {
        ...form,
        durationMinutes: Number(form.durationMinutes),
        notes: form.notes || null
      });
      setNotice("Private training session booked. The member and coach were notified.");
      setForm(current => ({ ...current, notes: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not book this session.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setError("");
    try {
      await patch(`/gym/private-training/${id}/status`, { status });
      setNotice(`Session updated: ${status.replaceAll("_", " ").toLowerCase()}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this session.");
    }
  };

  return <div className="space-y-6">
    <Card className="overflow-hidden">
      <div className="bg-zawana-950 px-6 py-5 text-white">
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-zawana-gold">Gym · coached sessions</p>
        <h2 className="mt-1 text-2xl font-black">Book private training</h2>
        <p className="mt-1 text-sm text-white/55">Choose a member, linked Gym coach, and session time.</p>
      </div>
      <form onSubmit={create} className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs font-black uppercase tracking-wider text-zawana-500">Member
          <span className="relative mt-2 block">
            <Search className="absolute left-3 top-3.5 text-zawana-400" size={16} />
            <input
              aria-label="Search members"
              className="w-full pl-10"
              placeholder="Search name, email or phone"
              value={memberSearch}
              onChange={event => {
                setPage(1);
                setMemberSearch(event.target.value);
              }}
            />
          </span>
          <Select
            required
            className="mt-2 w-full"
            value={form.memberId}
            onChange={event => setForm({ ...form, memberId: event.target.value })}
          >
            <option value="">Choose member</option>
            {members.map(member =>
              <option key={member.id} value={member.id}>
                {member.name} · {member.email}
              </option>
            )}
          </Select>
        </label>
        <label className="text-xs font-black uppercase tracking-wider text-zawana-500">Gym Coach
          <Select
            required
            className="mt-2 w-full"
            value={form.coachId}
            onChange={event => setForm({ ...form, coachId: event.target.value })}
          >
            <option value="">Choose linked coach</option>
            {coaches.map(coach =>
              <option key={coach.id} value={coach.id}>
                {coach.name} · {coach.specialty}
              </option>
            )}
          </Select>
          {selectedCoach &&
            <span className="mt-2 flex items-center gap-2 rounded-xl bg-zawana-50 p-2 text-xs font-bold normal-case tracking-normal text-zawana-700">
              {selectedCoach.imageUrl || selectedCoach.user?.avatar ?
                <img
                  src={mediaImageSrc(selectedCoach.imageUrl || selectedCoach.user?.avatar)}
                  alt=""
                  className="h-9 w-9 rounded-lg object-cover"
                /> :
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-zawana-950 text-white">
                  {selectedCoach.name
                    .split(" ")
                    .map(part => part[0])
                    .join("")
                    .slice(0, 2)}
                </span>}
              {selectedCoach.name}
            </span>}
        </label>
        <label className="text-xs font-black uppercase tracking-wider text-zawana-500">Date<input
            required
            type="date"
            min={localToday()}
            className="mt-2 w-full"
            value={form.date}
            onChange={event => setForm({ ...form, date: event.target.value })}
          />
        </label>
        <label className="text-xs font-black uppercase tracking-wider text-zawana-500">Start time<input
            required
            type="time"
            className="mt-2 w-full"
            value={form.startTime}
            onChange={event => setForm({ ...form, startTime: event.target.value })}
          />
        </label>
        <label className="text-xs font-black uppercase tracking-wider text-zawana-500">Duration<Select
            className="mt-2 w-full"
            value={form.durationMinutes}
            onChange={event => setForm({ ...form, durationMinutes: Number(event.target.value) })}
          >
            {[30, 45, 60, 90, 120].map(minutes =>
              <option key={minutes} value={minutes}>
                {minutes} minutes</option>
            )}
          </Select>
        </label>
        <label className="text-xs font-black uppercase tracking-wider text-zawana-500 md:col-span-2 xl:col-span-1">Notes<textarea
            maxLength={1000}
            className="mt-2 w-full"
            placeholder="Session focus or coach notes"
            value={form.notes}
            onChange={event => setForm({ ...form, notes: event.target.value })}
          />
        </label>
        <div className="md:col-span-2 xl:col-span-3">
          <Button disabled={saving || !coaches.length || !members.length}>
            <Dumbbell size={16} />
            {saving ? "Booking session…" : "Book private session"}
          </Button>
        </div>
      </form>
    </Card>

    {error &&
      <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">
        {error}
      </p>}
    {notice &&
      <p
        role="status"
        className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"
      >
        {notice}
      </p>}
    {!coaches.length && !loading &&
      <Card className="p-4 text-sm text-amber-800">No active, linked Gym coach accounts are available. Create a coach user and link its Gym coach profile first.</Card>}

    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">Attendance and schedule</p>
          <h2 className="text-xl font-black">Private training sessions</h2>
        </div>
        <div className="flex gap-2">
          {[
            ["today", "Today"],
            ["upcoming", "Upcoming"],
            ["completed", "History"],
            ["all", "All"]
          ].map(([value, label]) =>
            <button
              key={value}
              onClick={() => {
                setPage(1);
                setScope(value);
              }}
              className={`rounded-full px-4 py-2 text-xs font-black ${scope === value ? "bg-zawana-950 text-white" : "border bg-white"}`}
            >
              {label}
            </button>
          )}
        </div>
      </div>
      {loading ?
        <Card className="p-6">Loading sessions…</Card> : visible.length ?
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map(session =>
            <Card key={session.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">
                    {session.date} · {moneyTime(session.startTime)}–{moneyTime(session.endTime)}
                  </p>
                  <h3 className="mt-2 text-lg font-black">{session.member.name}</h3>
                  <p className="mt-1 text-sm text-zawana-500">Coach {session.coach.name} · {session.durationMinutes} min</p>
                </div>
                <Badge good={session.status === "COMPLETED" || session.status === "CHECKED_IN"}>
                  {session.status.replaceAll("_", " ")}
                </Badge>
              </div>
              {session.notes &&
                <p className="mt-3 rounded-xl bg-zawana-50 p-3 text-sm">{session.notes}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {session.status === "SCHEDULED" &&
                  <>
                    <Button
                      className="px-3 py-2"
                      onClick={() => void updateStatus(session.id, "CHECKED_IN")}
                    >
                      <Check size={14} /> Check in</Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-2"
                      onClick={() => void updateStatus(session.id, "CANCELLED")}
                    >Cancel</Button>
                  </>}
                {session.status === "CHECKED_IN" &&
                  <>
                    <Button
                      className="px-3 py-2"
                      onClick={() => void updateStatus(session.id, "COMPLETED")}
                    >Complete session</Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-2"
                      onClick={() => void updateStatus(session.id, "NO_SHOW")}
                    >No show</Button>
                  </>}
              </div>
            </Card>
          )}
        </div> :
        <Empty
          title="No sessions in this view"
          body="Scheduled private training sessions will show here with the member, coach, time, and attendance status."
        />}
      {!loading &&
        <Pagination
          page={page}
          totalPages={totalPages}
          total={sessions.length}
          onPage={setPage}
        />}
    </section>
  </div>;
}
