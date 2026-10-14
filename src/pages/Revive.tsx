import { Select } from '../components/Select';
import { useState } from 'react';
import { CalendarDays, Check, Clock3, HeartPulse, X,
} from 'lucide-react';

import { Badge, Button, Card, Page,
} from '../components/UI';

import { useApp } from '../context/AppContext';
import ServiceIntro from '../components/ServiceIntro';

const services = [
  {
    name: 'Sports Massage',
    price: 30000,
    category: 'Recovery',
  },
  {
    name: 'Physiotherapy',
    price: 45000,
    category: 'Assessment',
  },
  {
    name: 'Mobility Assessment',
    price: 25000,
    category: 'Assessment',
  },
  {
    name: 'Recovery Session',
    price: 20000,
    category: 'Recovery',
  },
  {
    name: 'Injury Assessment',
    price: 35000,
    category: 'Assessment',
  },
  {
    name: 'Ice Recovery',
    price: 15000,
    category: 'Recovery',
  },
];

const practitioners = [
  {
    name: 'Dr. Lin',
    role: 'Physiotherapist',
  },
  {
    name: 'May Thu',
    role: 'Sports Therapist',
  },
  {
    name: 'Thiri',
    role: 'Recovery Specialist',
  },
];

const timeSlots = ['10:00 AM', '11:30 AM', '1:00 PM', '2:00 PM', '4:30 PM', '6:00 PM',
];

export function Revive() {
  const { addReviveBooking, reviveBookings } = useApp();

  const [selectedService, setSelectedService] = useState<(typeof services)[number] | null>(null);

  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    practitioner: 'May Thu',
    date: '2026-09-30',
    time: '4:30 PM',
    notes: '',
  });

  const submitBooking = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedService) return;

    const practitioner =
      practitioners.find(
        (item) => item.name === form.practitioner) ?? practitioners[0];

    addReviveBooking({
      memberId: 'u1',
      memberName: 'Sai Zay',
      memberPhone: '09 765 432 100',
      service: selectedService.name,
      practitioner: practitioner.name,
      practitionerRole: practitioner.role,
      date: form.date,
      time: form.time,
      source: 'online',
      notes: form.notes,
    });

    setSelectedService(null);
    setSubmitted(true);
  };

  return (
    <Page title="Revive Clinic" eyebrow="Recover deliberately">
      <ServiceIntro image="revive" label="CARE / RECOVERY" title="Come back stronger." body="Give recovery the space it deserves, on and off the court." />
      {submitted && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-zawana-accent/30 bg-zawana-accent/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <Check size={18} />
            <div>
              <p className="font-black">
                Booking request submitted
              </p>
              <p className="text-sm text-zawana-500">
                Revive Clinic will confirm your appointment.
              </p>
            </div>
          </div>

          <button onClick={() => setSubmitted(false)}>
            <X size={18} />
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {services.map((service) => (
          <Card key={service.name} className="p-6">
            <Badge>{service.category}</Badge>

            <div className="mt-5 grid h-11 w-11 place-items-center rounded-xl bg-zawana-950 text-white">
              <HeartPulse size={20} />
            </div>

            <h3 className="mt-4 text-xl font-black">{service.name}</h3>

            <p className="mt-2 text-sm text-zawana-500">
              Professional recovery support for training
              and performance.
            </p>

            <p className="mt-5 text-lg font-black">{service.price.toLocaleString()} MMK
            </p>

            <Button className="mt-5 w-full" onClick={() => setSelectedService(service)}>
              Book service
            </Button>
          </Card>
        ))}
      </div>

      {reviveBookings.filter(
        (booking) => booking.memberId === 'u1').length > 0 && (
        <Card className="mt-8 overflow-hidden">
          <div className="border-b border-zawana-950/10 p-5">
            <p className="text-xs font-black tracking-widest text-zawana-accent">
              MY REVIVE APPOINTMENTS
            </p>

            <h3 className="mt-1 text-lg font-black">
              Upcoming recovery
            </h3>
          </div>

          <div className="divide-y divide-zawana-950/10">
            {reviveBookings
              .filter((booking) => booking.memberId === 'u1')
              .map((booking) => (
                <div
                  key={booking.id}
                  className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <b>{booking.service}</b>

                    <p className="mt-1 text-sm text-zawana-500">
                      {booking.practitioner} ·{' '}
                      {booking.date} · {booking.time}
                    </p>
                  </div>

                  <Badge>
                    {booking.status === 'pending' ? 'Awaiting confirmation' : booking.status}
                  </Badge>
                </div>
              ))}
          </div>
        </Card>
      )}

      {selectedService && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-zawana-950/40 p-4">
          <Card className="w-full max-w-xl p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-black tracking-widest text-zawana-accent">
                  REVIVE CLINIC
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  Book {selectedService.name}</h2>
              </div>

              <button onClick={() => setSelectedService(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={submitBooking} className="mt-6 space-y-5">
              <label className="block text-sm font-bold">
                Practitioner

                <Select
                  value={form.practitioner}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      practitioner: event.target.value,
                    })
                  }
                  className="mt-2 w-full rounded-xl border border-zawana-950/10 bg-white p-3"
                >
                  {practitioners.map((person) => (
                    <option key={person.name}>{person.name}</option>
                  ))}
                </Select>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-bold">
                  Date

                  <div className="mt-2 flex items-center rounded-xl border border-zawana-950/10 px-3">
                    <CalendarDays size={16} />

                    <input
                      type="date"
                      value={form.date}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          date: event.target.value,
                        })
                      }
                      className="w-full bg-transparent p-3 outline-none"
                    />
                  </div>
                </label>

                <label className="text-sm font-bold">
                  Time

                  <div className="mt-2 flex items-center rounded-xl border border-zawana-950/10 px-3">
                    <Clock3 size={16} />

                    <Select
                      value={form.time}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          time: event.target.value,
                        })
                      }
                      className="w-full bg-transparent p-3 outline-none"
                    >
                      {timeSlots.map((time) => (
                        <option key={time}>{time}</option>
                      ))}
                    </Select>
                  </div>
                </label>
              </div>

              <label className="block text-sm font-bold">
                Notes

                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      notes: event.target.value,
                    })
                  }
                  placeholder="Anything the clinic should know?"
                  className="mt-2 w-full rounded-xl border border-zawana-950/10 p-3"
                />
              </label>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setSelectedService(null)}>
                  Cancel
                </Button>

                <Button type="submit">
                  Request appointment
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </Page>
  );
}
