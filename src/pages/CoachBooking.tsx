import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Badge,
  Check,
  Dumbbell,
  Trophy,
} from 'lucide-react';
import { Button, Card, Page } from '../components/UI';
import { useState } from 'react';
import { useApp } from '../context/AppContext';

export function CoachBooking() {
  const [date, setDate] = useState('28 Sep 2026');
  const [coach, setCoach] = useState('Available Coach');
  const [time, setTime] = useState('6:30 PM — 7:30 PM');
  const [done, setDone] = useState(false);

  const { addBooking, addNotification } = useApp();

  const coaches = [
    {
      id: 'coach-1',
      name: 'Coach Alex',
      specialty: 'Strength & Conditioning',
      price: 30000,
    },
    {
      id: 'coach-2',
      name: 'Coach Daniel',
      specialty: 'Personal Training',
      price: 25000,
    },
  ];

  const selectedCoach =
    coaches.find((c) => c.name === coach) ?? coaches[0];

  const confirm = () => {
    const id = `ZW-${Date.now()}`;

    addBooking({
      id,
      kind: 'pt',
      title: `Session with ${selectedCoach.name}`,
      date,
      time,
      location: 'High Performance Gym',
      status: 'confirmed',
      price: selectedCoach.price,
    });

    addNotification({
      id: `n-${Date.now()}`,
      title: 'Coach booking confirmed',
      body: `${selectedCoach.name} is booked for ${time}.`,
      time: 'Just now',
      read: false,
    });

    setDone(true);
  };

  if (done) {
    return (
      <Page title="Booking confirmed" eyebrow="You're in">
        <Card className="mx-auto max-w-xl p-8 text-center">

          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-zawana-accent text-zawana-950">
            <Check />
          </div>

          <h2 className="mt-5 text-3xl font-black">
            {selectedCoach.name}
          </h2>

          <p className="mt-2 text-zawana-500">
            {date} · {time}
          </p>

          <p className="mt-5 text-xs tracking-widest text-zawana-500">
            BOOKING ID
          </p>

          <p className="mt-1 font-bold">
            ZW-{Date.now().toString().slice(-8)}
          </p>

          <div className="mt-7 flex justify-center gap-2">
            <Link to="/bookings">
              <Button>
                View booking
              </Button>
            </Link>

            <Link to="/dashboard">
              <Button variant="secondary">
                Dashboard
              </Button>
            </Link>
          </div>

        </Card>
      </Page>
    );
  }

  return (
    <Page title="Book with a Coach" eyebrow="Personal Training">

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">

        <div className="space-y-6">

          {/* DATE */}
          <Card className="p-6">
            <h3 className="text-lg font-black">
              1. Select date
            </h3>

            <div className="mt-4 grid grid-cols-4 gap-2 md:grid-cols-7">
              {[
                '28 Sep',
                '29 Sep',
                '30 Sep',
                '01 Oct',
                '02 Oct',
                '03 Oct',
                '04 Oct',
              ].map((d, i) => (
                <button
                  key={d}
                  onClick={() => setDate(`${d} 2026`)}
                  className={`rounded-xl border p-3 text-left ${
                    date.startsWith(d)
                      ? 'border-zawana-accent bg-zawana-accent/10'
                      : 'border-zawana-950/8'
                  }`}
                >
                  <span className="block text-[10px] text-zawana-500">
                    {['MON','TUE','WED','THU','FRI','SAT','SUN'][i]}
                  </span>

                  <b className="mt-2 block text-sm">
                    {d}
                  </b>
                </button>
              ))}
            </div>
          </Card>

          {/* COACH */}
          <Card className="p-6">
            <h3 className="text-lg font-black">
              2. Select coach
            </h3>

            <div className="mt-4 grid gap-3">
              {coaches.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCoach(c.name)}
                  className={`rounded-xl border p-4 text-left ${
                    coach === c.name
                      ? 'border-zawana-accent bg-zawana-accent/10'
                      : 'border-zawana-950/8'
                  }`}
                >
                  <div className="flex justify-between">
                    <b>{c.name}</b>

                    <Badge>
                      {c.price.toLocaleString()} MMK
                    </Badge>
                  </div>

                  <p className="mt-2 text-sm text-zawana-500">
                    {c.specialty}
                  </p>
                </button>
              ))}
            </div>
          </Card>

          {/* TIME */}
          <Card className="p-6">
            <h3 className="text-lg font-black">
              3. Select time
            </h3>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                '5:00 PM — 6:00 PM',
                '5:30 PM — 6:30 PM',
                '6:00 PM — 7:00 PM',
                '6:30 PM — 7:30 PM',
                '7:00 PM — 8:00 PM',
                '7:30 PM — 8:30 PM',
              ].map((t) => (
                <button
                  key={t}
                  onClick={() => setTime(t)}
                  className={`rounded-xl border p-3 text-sm font-bold ${
                    time === t
                      ? 'border-zawana-accent bg-zawana-accent/10'
                      : 'border-zawana-950/8'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Card>

        </div>

        {/* SUMMARY */}
        <Card className="h-fit p-6 lg:sticky lg:top-24">

          <p className="text-xs font-bold tracking-widest text-zawana-accent">
            SUMMARY
          </p>

          <h2 className="mt-3 text-2xl font-black">
            {selectedCoach.name}
          </h2>

          <div className="mt-5 space-y-3 border-y border-zawana-950/8 py-5 text-sm">

            <div className="flex justify-between">
              <span className="text-zawana-500">
                Date
              </span>
              <b>{date}</b>
            </div>

            <div className="flex justify-between">
              <span className="text-zawana-500">
                Time
              </span>
              <b>{time}</b>
            </div>

            <div className="flex justify-between">
              <span className="text-zawana-500">
                Session
              </span>
              <b>
                {selectedCoach.price.toLocaleString()} MMK
              </b>
            </div>

          </div>

          <Button
            onClick={confirm}
            className="mt-5 w-full"
          >
            Confirm booking
          </Button>

        </Card>

      </div>
    </Page>
  );
}