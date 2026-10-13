import type { FormEvent, JSXElementConstructor, ReactElement, ReactNode, ReactPortal } from 'react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  HeartPulse,
  Plus,
  Search,
  Stethoscope,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';

import { Badge, Button, Card, Empty, Page, Stat } from '../components/UI';
import { useApp } from '../context/AppContext';

type Member = {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  membership: string;
  lastVisit: string;
  careNotes: string;
  treatments: { date: string; treatment: string; practitioner: string; notes: string }[];
};

const members: Member[] = [
  {
    id: 'u1',
    code: 'ZW-1201',
    name: 'Sai Zay',
    phone: '09 765 432 100',
    email: 'saizay@zawana.test',
    membership: 'Performance',
    lastVisit: '25 Sep 2026',
    careNotes: 'Athlete recovery focus. Ask about training load before treatment.',
    treatments: [
      {
        date: '25 Sep 2026',
        treatment: 'Sports Massage',
        practitioner: 'May Thu',
        notes: 'Lower-body recovery after high-volume training.'
      },
      {
        date: '18 Sep 2026',
        treatment: 'Mobility & Recovery',
        practitioner: 'Thiri',
        notes: 'Hip and ankle mobility work.'
      },
      {
        date: '05 Sep 2026',
        treatment: 'Sports Massage',
        practitioner: 'May Thu',
        notes: 'Posterior chain tightness.'
      },
    ],
  },
  {
    id: 'u2',
    code: 'ZW-1202',
    name: 'Htet Aung',
    phone: '09 432 118 210',
    email: 'htetaung@zawana.test',
    membership: 'Premium',
    lastVisit: '27 Sep 2026',
    careNotes: 'Regular recovery client.',
    treatments: [
      {
        date: '27 Sep 2026',
        treatment: 'Physio Assessment',
        practitioner: 'Dr. Lin',
        notes: 'Movement screen and exercise prescription.'
      },
      {
        date: '12 Sep 2026',
        treatment: 'Dry Needling',
        practitioner: 'Dr. Lin',
        notes: 'Follow-up session.'
      },
    ],
  },
  {
    id: 'u3',
    code: 'ZW-1203',
    name: 'Su Myat Thiri',
    phone: '09 900 111 221',
    email: 'sumyat@zawana.test',
    membership: 'Active',
    lastVisit: '21 Sep 2026',
    careNotes: 'Prefers afternoon appointments when possible.',
    treatments: [
      {
        date: '21 Sep 2026',
        treatment: 'Recovery Session',
        practitioner: 'Thiri',
        notes: 'General recovery and stretching.'
      },
      {
        date: '29 Aug 2026',
        treatment: 'Sports Massage',
        practitioner: 'May Thu',
        notes: 'Upper-back and neck work.'
      },
    ],
  },
  {
    id: 'u4',
    code: 'ZW-1204',
    name: 'Nandar',
    phone: '09 778 222 341',
    email: 'nandar@zawana.test',
    membership: 'Active',
    lastVisit: '22 Sep 2026',
    careNotes: 'Regular sports massage client.',
    treatments: [
      {
        date: '22 Sep 2026',
        treatment: 'Sports Massage',
        practitioner: 'May Thu',
        notes: 'General recovery treatment.'
      }
    ],
  },
];

const services = [
  {
    name: 'Sports Massage',
    practitioner: 'May Thu',
    practitionerRole: 'Sports Therapist',
    price: 30000
  },
  {
    name: 'Physiotherapy',
    practitioner: 'Dr. Lin',
    practitionerRole: 'Physiotherapist',
    price: 45000
  },
  {
    name: 'Mobility Assessment',
    practitioner: 'Dr. Lin',
    practitionerRole: 'Physiotherapist',
    price: 25000
  },
  {
    name: 'Recovery Session',
    practitioner: 'Thiri',
    practitionerRole: 'Recovery Specialist',
    price: 20000
  },
  {
    name: 'Injury Assessment',
    practitioner: 'Dr. Lin',
    practitionerRole: 'Physiotherapist',
    price: 35000
  },
  {
    name: 'Ice Recovery',
    practitioner: 'Thiri',
    practitionerRole: 'Recovery Specialist',
    price: 15000
  },
];

const practitioners = [
  {
    name: 'Dr. Lin',
    role: 'Physiotherapist',
    specialty: 'Assessment, physiotherapy & rehabilitation',
    initials: 'DL',
    availability: 'Mon–Sat · 10:00 AM–6:00 PM'
  },
  {
    name: 'May Thu',
    role: 'Sports Therapist',
    specialty: 'Sports massage & recovery',
    initials: 'MT',
    availability: 'Mon–Sat · 10:00 AM–6:00 PM'
  },
  {
    name: 'Thiri',
    role: 'Recovery Specialist',
    specialty: 'Mobility, stretching & recovery',
    initials: 'TH',
    availability: 'Tue–Sun · 11:00 AM–7:00 PM'
  },
];

const timeSlots = ['10:00 AM', '11:30 AM', '1:00 PM', '2:00 PM', '4:30 PM', '6:00 PM'];
const today = '2026-09-29';

const viewCopy = {
  overview: [
    'Overview',
    'Today at a glance. Keep the front desk moving without unnecessary detail.'
  ],
  appointments: [
    'Appointment Management',
    'Review requests, schedule visits and manage today’s patient flow.'
  ],
  doctors: [
    'Doctor Management',
    'See practitioners, specialties and current availability in one place.'
  ],
  customers: [
    'Customer Records',
    'Search a customer and see appointments, previous treatments and care notes.'
  ],
} as const;

type View = keyof typeof viewCopy;

export function ReviveClinicFO() {
  const { reviveBookings, addReviveBooking, updateReviveBookingStatus } = useApp();
  const [searchParams] = useSearchParams();
  const requestedView = searchParams.get('view') as View | null;
  const view: View = requestedView && requestedView in viewCopy ? requestedView : 'overview';

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('u1');
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [scheduleMemberId, setScheduleMemberId] = useState('u1');
  const [scheduleService, setScheduleService] = useState('Sports Massage');
  const [schedulePractitioner, setSchedulePractitioner] = useState('May Thu');
  const [scheduleDate, setScheduleDate] = useState(today);
  const [scheduleTime, setScheduleTime] = useState('4:30 PM');
  const [scheduleNotes, setScheduleNotes] = useState('');

  const filteredMembers = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return members;
    return members.filter(member =>
      [member.name, member.code, member.phone, member.email].some(item =>
        item.toLowerCase().includes(value)
      )
    );
  }, [query]);

  const selectedMember = members.find(member => member.id === selectedId) ?? members[0];
  const pendingBookings = reviveBookings.filter(booking => booking.status === 'pending');
  const todayBookings = reviveBookings.filter(booking => booking.date === today);
  const checkedInCount = todayBookings.filter(booking => booking.status === 'checked_in').length;
  const confirmedCount = todayBookings.filter(booking => booking.status === 'confirmed').length;
  const completedCount = todayBookings.filter(booking => booking.status === 'completed').length;
  const openSlots = Math.max(timeSlots.length * practitioners.length - todayBookings.length, 0);
  const memberBookings = reviveBookings
    .filter(
      booking => booking.memberId === selectedMember.id || booking.memberId === selectedMember.code
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3500);
  };

  const handleConfirm = (id: string) => {
    updateReviveBookingStatus(id, 'confirmed');
    showNotice('Appointment confirmed. Member notification sent.');
  };
  const handleReject = (id: string) => {
    updateReviveBookingStatus(id, 'rejected');
    showNotice('Booking request rejected.');
  };
  const handleCheckIn = (id: string) => {
    updateReviveBookingStatus(id, 'checked_in');
    showNotice('Member checked in successfully.');
  };
  const handleComplete = (id: string) => {
    updateReviveBookingStatus(id, 'completed');
    showNotice('Appointment marked as completed.');
  };

  const handleSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const member = members.find(item => item.id === scheduleMemberId) ?? members[0];
    const service = services.find(item => item.name === scheduleService) ?? services[0];
    const practitioner =
      practitioners.find(item => item.name === schedulePractitioner) ?? practitioners[0];

    addReviveBooking({
      memberId: member.id,
      memberName: member.name,
      memberPhone: member.phone,
      service: service.name,
      practitioner: practitioner.name,
      practitionerRole: practitioner.role,
      date: scheduleDate,
      time: scheduleTime,
      status: 'confirmed',
      source: 'front_desk',
      notes: scheduleNotes,
    });
    setShowScheduleForm(false);
    setScheduleNotes('');
    setSelectedId(member.id);
    showNotice(`${member.name}'s appointment has been scheduled.`);
  };

  const handleVisit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setShowVisitForm(false);
    showNotice(`Treatment record saved for ${selectedMember.name}.`);
  };

  const selectService = (serviceName: string) => {
    setScheduleService(serviceName);
    const service = services.find(item => item.name === serviceName);
    if (service) setSchedulePractitioner(service.practitioner);
  };

  const openSchedule = (memberId = selectedMember.id) => {
    setScheduleMemberId(memberId);
    setShowScheduleForm(true);
  };

  return (
    <Page title={viewCopy[view][0]} eyebrow="Revive Clinic · Front Office">
      {notice && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-zawana-accent/30 bg-zawana-accent/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Check size={16} />
            {notice}
          </div>
          <button onClick={() => setNotice('')} className="rounded-lg p-1 hover:bg-zawana-950/5">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="mb-7 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-black tracking-tight md:text-3xl">{viewCopy[view][0]}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zawana-500">{viewCopy[view][1]}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => openSchedule()}>
            <CalendarDays size={15} /> Schedule</Button>
          <Button onClick={() => setShowVisitForm(true)}>
            <Plus size={15} /> Add treatment</Button>
        </div>
      </div>

      {view === 'overview' && (
        <Overview
          todayBookings={todayBookings}
          pendingBookings={pendingBookings}
          confirmedCount={confirmedCount}
          checkedInCount={checkedInCount}
          completedCount={completedCount}
          openSlots={openSlots}
          onConfirm={handleConfirm}
          onReject={handleReject}
          onCheckIn={handleCheckIn}
          onComplete={handleComplete}
          onSchedule={() => openSchedule()}
        />
      )}

      {view === 'appointments' && (
        <Appointments
          pendingBookings={pendingBookings}
          todayBookings={todayBookings}
          onConfirm={handleConfirm}
          onReject={handleReject}
          onCheckIn={handleCheckIn}
          onComplete={handleComplete}
          onSchedule={() => openSchedule()}
        />
      )}

      {view === 'doctors' && <Doctors todayBookings={todayBookings} onSchedule={openSchedule} />}

      {view === 'customers' && (
        <Customers
          query={query}
          setQuery={setQuery}
          filteredMembers={filteredMembers}
          selectedMember={selectedMember}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          memberBookings={memberBookings}
          onSchedule={() => openSchedule(selectedMember.id)}
          onAddVisit={() => setShowVisitForm(true)}
          onCheckIn={handleCheckIn}
          onComplete={handleComplete}
        />
      )}

      {showScheduleForm && (
        <Modal
          title="Schedule appointment"
          eyebrow="Front desk"
          onClose={() => setShowScheduleForm(false)}
        >
          <form onSubmit={handleSchedule} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Customer">
                <select
                  value={scheduleMemberId}
                  onChange={e => setScheduleMemberId(e.target.value)}
                  className={inputClass}
                >
                  {members.map(member =>
                    <option key={member.id} value={member.id}>
                      {member.name} · {member.code}
                    </option>
                  )}
                </select>
              </Field>
              <Field label="Service">
                <select
                  value={scheduleService}
                  onChange={e => selectService(e.target.value)}
                  className={inputClass}
                >
                  {services.map(service =>
                    <option key={service.name} value={service.name}>
                      {service.name} · {service.price.toLocaleString()} MMK</option>)}
                </select>
              </Field>
              <Field label="Practitioner">
                <select
                  value={schedulePractitioner}
                  onChange={e => setSchedulePractitioner(e.target.value)}
                  className={inputClass}
                >
                  {practitioners.map(practitioner =>
                    <option key={practitioner.name} value={practitioner.name}>
                      {practitioner.name} · {practitioner.role}
                    </option>
                  )}
                </select>
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  min={today}
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Time" className="md:col-span-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {timeSlots.map(time =>
                    <button
                      key={time}
                      type="button"
                      onClick={() => setScheduleTime(time)}
                      className={`rounded-xl border p-3 text-sm font-bold transition ${scheduleTime === time ? 'border-zawana-950 bg-zawana-950 text-white' : 'border-zawana-950/10 hover:bg-zawana-950/5'}`}
                    >
                      {time}
                    </button>
                  )}
                </div>
              </Field>
            </div>
            <Field label="Appointment notes">
              <textarea
                rows={3}
                value={scheduleNotes}
                onChange={e => setScheduleNotes(e.target.value)}
                placeholder="Reason, request or preparation notes..."
                className={inputClass}
              />
            </Field>
            <ModalActions
              onClose={() => setShowScheduleForm(false)}
              submitLabel="Confirm appointment"
              icon={<CalendarDays size={15} />}
            />
          </form>
        </Modal>
      )}

      {showVisitForm && (
        <Modal
          title="Record treatment"
          eyebrow="Customer record"
          onClose={() => setShowVisitForm(false)}
        >
          <form onSubmit={handleVisit} className="space-y-5">
            <div className="rounded-2xl bg-zawana-950/4 p-4">
              <p className="text-xs font-black uppercase tracking-[0.15em] text-zawana-accent">Customer</p>
              <p className="mt-1 text-lg font-black">{selectedMember.name}</p>
              <p className="text-sm text-zawana-500">
                {selectedMember.code} · {selectedMember.phone}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Treatment">
                <select name="treatment" className={inputClass}>
                  {services.map(service =>
                    <option key={service.name}>{service.name}</option>
                  )}
                </select>
              </Field>
              <Field label="Practitioner">
                <select name="practitioner" className={inputClass}>
                  {practitioners.map(practitioner =>
                    <option key={practitioner.name}>{practitioner.name}</option>
                  )}
                </select>
              </Field>
              <Field label="Date">
                <input name="date" type="date" defaultValue={today} className={inputClass} />
              </Field>
              <Field label="Visit status">
                <select name="status" className={inputClass}>
                  <option>Completed</option>
                  <option>Checked in</option>
                  <option>Scheduled</option>
                </select>
              </Field>
            </div>
            <Field label="Treatment notes">
              <textarea
                name="notes"
                rows={4}
                placeholder="Observations, treatment provided and follow-up notes..."
                className={inputClass}
              />
            </Field>
            <ModalActions
              onClose={() => setShowVisitForm(false)}
              submitLabel="Save treatment"
              icon={<Check size={15} />}
            />
          </form>
        </Modal>
      )}
    </Page>
  );
}

const inputClass =
  'mt-2 w-full rounded-xl border border-zawana-950/10 bg-white px-3 py-3 text-sm outline-none transition focus:border-zawana-950 focus:ring-2 focus:ring-zawana-950/5';

function Field({
  label,
  children,
  className = ''
}: {
  label: string;
  children: ReactNode;
  className?: string
}) {
  return <label className={`block text-sm font-bold ${className}`}>
    {label}
    {children}
  </label>;
}

function Modal({
  title,
  eyebrow,
  onClose,
  children
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zawana-950/40 p-4 backdrop-blur-sm">
      <Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-zawana-accent">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-2xl font-black">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-zawana-950/5">
            <X size={19} />
          </button>
        </div>
        {children}
      </Card>
    </div>
  );
}

function ModalActions({
  onClose,
  submitLabel,
  icon
}: {
  onClose: () => void;
  submitLabel: string;
  icon: ReactNode
}) {
  return <div className="flex justify-end gap-2">
    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
    <Button type="submit">
      {icon}
      {submitLabel}
    </Button>
  </div>;
}

function Overview({
  todayBookings,
  pendingBookings,
  confirmedCount,
  checkedInCount,
  completedCount,
  openSlots,
  onConfirm,
  onReject,
  onCheckIn,
  onComplete,
  onSchedule
}: any) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Today's appointments"
          value={String(todayBookings.length)}
          sub={`${pendingBookings.length} pending requests`}
        />
        <Stat label="Confirmed" value={String(confirmedCount)} />
        <Stat label="Checked in" value={String(checkedInCount)} />
        <Stat label="Completed" value={String(completedCount)} />
        <Stat label="Open slots" value={String(openSlots)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="overflow-hidden">
          <SectionHeader
            eyebrow="Today"
            title="Clinic schedule"
            icon={<CalendarDays size={17} />}
          />
          {todayBookings.length ?
            <div className="divide-y divide-zawana-950/8">
              {todayBookings.slice(0, 6).map((booking: any) =>
                <AppointmentRow
                  key={booking.id}
                  booking={booking}
                  onCheckIn={onCheckIn}
                  onComplete={onComplete}
                />
              )}
            </div> :
            <Empty title="No appointments today" body="Your clinic schedule is currently clear." />}
        </Card>

        <Card className="overflow-hidden">
          <SectionHeader
            eyebrow="Needs attention"
            title="Booking requests"
            icon={<Activity size={17} />}
            badge={pendingBookings.length ? `${pendingBookings.length}` : undefined}
          />
          {pendingBookings.length ?
            <div className="divide-y divide-zawana-950/8">
              {pendingBookings.slice(0, 4).map((booking: any) =>
                <div key={booking.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zawana-accent/15">
                      <HeartPulse size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="block truncate">{booking.memberName}</b>
                      <p className="mt-1 text-sm font-semibold">{booking.service}</p>
                      <p className="mt-1 text-xs text-zawana-500">
                        {booking.date} · {booking.time} · {booking.practitioner}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button variant="secondary" onClick={() => onReject(booking.id)}>
                          <X size={14} /> Reject</Button>
                        <Button onClick={() => onConfirm(booking.id)}>
                          <Check size={14} /> Confirm</Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div> :
            <Empty title="All clear" body="There are no appointment requests waiting for review." />}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-zawana-accent">Quick action</p>
            <h3 className="mt-1 text-lg font-black">Keep the desk moving</h3>
            <p className="mt-1 text-sm text-zawana-500">Schedule a visit directly when a customer calls or arrives.</p>
          </div>
          <Button onClick={onSchedule}>
            <CalendarDays size={15} /> Schedule appointment</Button>
        </div>
      </Card>
    </div>
  );
}

function Appointments({
  pendingBookings,
  todayBookings,
  onConfirm,
  onReject,
  onCheckIn,
  onComplete,
  onSchedule
}: any) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Requests"
          value={String(pendingBookings.length)}
          sub="Waiting for confirmation"
        />
        <Stat label="Today" value={String(todayBookings.length)} sub="Scheduled visits" />
        <Stat
          label="Available slots"
          value={String(Math.max(18 - todayBookings.length, 0))}
          sub="Across all practitioners"
        />
      </div>
      <Card className="overflow-hidden">
        <SectionHeader
          eyebrow="Requests"
          title="Appointment requests"
          icon={<Clock3 size={17} />}
        />
        <div className="divide-y divide-zawana-950/8">
          {pendingBookings.length ?
            pendingBookings.map((booking: any) =>
              <div
                key={booking.id}
                className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{booking.memberName}</b>
                    <Badge>{booking.source}</Badge>
                  </div>
                  <p className="mt-1 text-sm font-semibold">{booking.service}</p>
                  <p className="mt-1 text-sm text-zawana-500">
                    {booking.date} · {booking.time} · {booking.practitioner}
                  </p>
                  {booking.notes && <p className="mt-2 text-sm text-zawana-500">{booking.notes}</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => onReject(booking.id)}>
                    <X size={14} /> Reject</Button>
                  <Button onClick={() => onConfirm(booking.id)}>
                    <Check size={14} /> Confirm</Button>
                </div>
              </div>
            ) :
            <Empty
              title="No pending requests"
              body="New online appointment requests will appear here."
            />}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <SectionHeader
          eyebrow="Today · 29 Sep 2026"
          title="Front desk schedule"
          icon={<CalendarDays size={17} />}
          action={
            <Button variant="secondary" onClick={onSchedule}>
              <Plus size={14} /> New appointment</Button>
          }
        />
        {todayBookings.length ?
          <div className="divide-y divide-zawana-950/8">
            {todayBookings.map((booking: any) =>
              <AppointmentRow
                key={booking.id}
                booking={booking}
                onCheckIn={onCheckIn}
                onComplete={onComplete}
              />
            )}
          </div> :
          <Empty title="No appointments today" body="Your schedule is clear." />}
      </Card>
    </div>
  );
}

function AppointmentRow({ booking, onCheckIn, onComplete }: any) {
  return <div className="grid gap-3 p-5 md:grid-cols-[105px_1fr_auto] md:items-center">
    <div className="flex items-center gap-2 font-bold">
      <Clock3 size={15} className="text-zawana-accent" />
      {booking.time}
    </div>
    <div>
      <b>{booking.memberName}</b>
      <p className="mt-1 text-sm text-zawana-500">
        {booking.service} · {booking.practitioner}
      </p>
    </div>
    <div className="flex items-center gap-2">
      <Badge>{booking.status}</Badge>
      {booking.status === 'confirmed' &&
        <Button variant="secondary" onClick={() => onCheckIn(booking.id)}>Check in</Button>}
      {booking.status === 'checked_in' &&
        <Button onClick={() => onComplete(booking.id)}>Complete</Button>}
    </div>
  </div>;
}

function Doctors({
  todayBookings,
  onSchedule
}: {
  todayBookings: any[];
  onSchedule: (memberId?: string) => void
}) {
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat
        label="Practitioners"
        value={String(practitioners.length)}
        sub="Active in Revive Clinic"
      />
      <Stat label="Today's visits" value={String(todayBookings.length)} sub="Across the team" />
      <Stat label="Services" value={String(services.length)} sub="Available to schedule" />
    </div>
    <div className="grid gap-5 lg:grid-cols-3">
      {practitioners.map(practitioner => {
        const todayCount = todayBookings.filter(
          booking => booking.practitioner === practitioner.name
        ).length;
        return <Card key={practitioner.name} className="p-5">
          <div className="flex items-start justify-between">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-zawana-950 text-sm font-black text-white">
              {practitioner.initials}
            </div>
            <Badge good>Active</Badge>
          </div>
          <h3 className="mt-5 text-xl font-black">{practitioner.name}</h3>
          <p className="mt-1 text-sm font-bold text-zawana-accent">{practitioner.role}</p>
          <p className="mt-3 text-sm leading-6 text-zawana-500">{practitioner.specialty}</p>
          <div className="mt-5 border-t border-zawana-950/8 pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zawana-500">Today's appointments</span>
              <b>{todayCount}</b>
            </div>
            <p className="mt-2 text-xs font-semibold text-zawana-500">
              {practitioner.availability}
            </p>
          </div>
          <Button variant="secondary" className="mt-5 w-full" onClick={() => onSchedule()}>
            <CalendarDays size={14} /> Schedule with {practitioner.name}
          </Button>
        </Card>;
      })}
    </div>
  </div>;
}

function Customers({
  query,
  setQuery,
  filteredMembers,
  selectedMember,
  selectedId,
  setSelectedId,
  memberBookings,
  onSchedule,
  onAddVisit,
  onCheckIn,
  onComplete
}: any) {
  return <div className="grid gap-6 xl:grid-cols-[330px_1fr]">
    <Card className="h-fit p-4">
      <div className="flex items-center gap-2 rounded-xl border border-zawana-950/10 bg-zawana-950/4 px-3 py-2.5">
        <Search size={16} className="text-zawana-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name, ID or phone"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>
      <div className="mt-4 flex items-center justify-between px-1">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zawana-500">Customer records</p>
        <span className="text-xs font-bold text-zawana-500">{filteredMembers.length}</span>
      </div>
      <div className="mt-3 space-y-1.5">
        {filteredMembers.map((member: Member) =>
          <button
            key={member.id}
            onClick={() => setSelectedId(member.id)}
            className={`w-full rounded-xl border p-3 text-left transition ${member.id === selectedId ? 'border-zawana-accent bg-zawana-accent/10' : 'border-transparent hover:bg-zawana-950/4'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <b className="truncate">{member.name}</b>
              <span className="text-[9px] font-black tracking-wider text-zawana-500">
                {member.code}
              </span>
            </div>
            <p className="mt-1 text-xs text-zawana-500">{member.phone}</p>
          </button>
        )}
        {!filteredMembers.length &&
          <Empty title="No customer found" body="Try a name, customer ID or phone number." />}
      </div>
    </Card>

    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-zawana-accent text-zawana-950">
              <UserRound size={22} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zawana-accent">Customer profile</p>
              <h2 className="mt-1 text-2xl font-black">{selectedMember.name}</h2>
              <p className="mt-1 text-sm text-zawana-500">
                {selectedMember.code} · {selectedMember.phone} · {selectedMember.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{selectedMember.membership}</Badge>
            <Button variant="secondary" onClick={onSchedule}>
              <CalendarDays size={14} /> Schedule</Button>
            <Button onClick={onAddVisit}>
              <Plus size={14} /> Add treatment</Button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <InfoTile label="Last visit" value={selectedMember.lastVisit} />
          <InfoTile
            label="Next appointment"
            value={
              memberBookings.find((booking: any) => booking.status === 'confirmed')?.date ??
              'None scheduled'
            }
          />
          <InfoTile label="Care note" value={selectedMember.careNotes} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <Card className="overflow-hidden">
          <SectionHeader
            eyebrow="Appointments"
            title="Customer appointments"
            icon={<CalendarDays size={17} />}
          />
          {memberBookings.length ?
            <div className="divide-y divide-zawana-950/8">
              {memberBookings.map((booking: any) =>
                <div key={booking.id} className="p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{booking.service}</b>
                        <Badge>{booking.status}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-zawana-500">
                        {booking.date} · {booking.time}
                      </p>
                      <p className="mt-1 text-sm text-zawana-500">
                        {booking.practitioner} · {booking.practitionerRole}
                      </p>
                      {booking.notes &&
                        <p className="mt-2 text-sm text-zawana-500">{booking.notes}</p>}
                    </div>
                    {booking.status === 'confirmed' &&
                      <Button variant="secondary" onClick={() => onCheckIn(booking.id)}>Check in</Button>}
                    {booking.status === 'checked_in' &&
                      <Button onClick={() => onComplete(booking.id)}>Complete</Button>}
                  </div>
                </div>
              )}
            </div> :
            <Empty
              title="No appointments"
              body="This customer does not have any Revive appointments yet."
            />}
        </Card>

        <Card className="overflow-hidden">
          <SectionHeader
            eyebrow="Care history"
            title="Previous treatments"
            icon={<FileText size={17} />}
          />
          {selectedMember.treatments.length ?
            <div className="divide-y divide-zawana-950/8">
              {selectedMember.treatments.map(
                (item: {
                  date: string
                    | number
                    | bigint
                    | boolean
                    | ReactElement<unknown, string | JSXElementConstructor<any>>
                    | Iterable<ReactNode>
                    | ReactPortal
                    | Promise<string
                        | number
                        | bigint
                        | boolean
                        | ReactPortal
                        | ReactElement<unknown, string | JSXElementConstructor<any>>
                        | Iterable<ReactNode>
                        | null
                        | undefined
                      >
                    | null
                    | undefined;
                  treatment: string
                    | number
                    | bigint
                    | boolean
                    | ReactElement<unknown, string | JSXElementConstructor<any>>
                    | Iterable<ReactNode>
                    | ReactPortal
                    | Promise<string
                        | number
                        | bigint
                        | boolean
                        | ReactPortal
                        | ReactElement<unknown, string | JSXElementConstructor<any>>
                        | Iterable<ReactNode>
                        | null
                        | undefined
                      >
                    | null
                    | undefined;
                  practitioner: string
                    | number
                    | bigint
                    | boolean
                    | ReactElement<unknown, string | JSXElementConstructor<any>>
                    | Iterable<ReactNode>
                    | ReactPortal
                    | Promise<string
                        | number
                        | bigint
                        | boolean
                        | ReactPortal
                        | ReactElement<unknown, string | JSXElementConstructor<any>>
                        | Iterable<ReactNode>
                        | null
                        | undefined
                      >
                    | null
                    | undefined;
                  notes: string
                    | number
                    | bigint
                    | boolean
                    | ReactElement<unknown, string | JSXElementConstructor<any>>
                    | Iterable<ReactNode>
                    | ReactPortal
                    | Promise<string
                        | number
                        | bigint
                        | boolean
                        | ReactPortal
                        | ReactElement<unknown, string | JSXElementConstructor<any>>
                        | Iterable<ReactNode>
                        | null
                        | undefined
                      >
                    | null
                    | undefined;
                }) =>
                  <div key={`${item.date}-${item.treatment}`} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <b>{item.treatment}</b>
                        <p className="mt-1 text-xs text-zawana-500">
                          {item.date} · {item.practitioner}
                        </p>
                      </div>
                      <FileText size={16} className="text-zawana-400" />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zawana-500">{item.notes}</p>
                  </div>
                )}
            </div> :
            <Empty
              title="No treatment history"
              body="Treatment records will appear here after the first visit."
            />}
        </Card>
      </div>
    </div>
  </div>;
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-zawana-950/4 p-4">
    <p className="text-xs text-zawana-500">{label}</p>
    <p className="mt-1 text-sm font-black leading-5">{value}</p>
  </div>;
}

function SectionHeader({
  eyebrow,
  title,
  icon,
  badge,
  action
}: {
  eyebrow: string;
  title: string;
  icon?: ReactNode;
  badge?: string;
  action?: ReactNode
}) {
  return <div className="flex flex-col gap-3 border-b border-zawana-950/8 p-5 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-zawana-950/5 text-zawana-600">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zawana-accent">
          {eyebrow}
        </p>
        <h3 className="mt-0.5 text-lg font-black">{title}</h3>
      </div>
      {badge && <Badge>{badge}</Badge>}
    </div>
    {action}
  </div>;
}
