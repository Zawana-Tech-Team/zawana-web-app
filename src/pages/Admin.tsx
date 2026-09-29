import { Activity, CalendarDays, Users } from 'lucide-react';
import { Card, Page, Stat } from '../components/UI';
import { revenue } from '../data';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';

export function Admin() {
  const peakHours = [
    { name: '8AM', value: 42 },
    { name: '10AM', value: 55 },
    { name: '12PM', value: 38 },
    { name: '4PM', value: 71 },
    { name: '6PM', value: 94 },
    { name: '8PM', value: 86 },
  ];

  return (
    <Page title="Admin overview" eyebrow="Zawana operations">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Active members" value="342" sub="+32 this month" />
        <Stat label="Today's check-ins" value="127" />
        <Stat label="Monthly revenue" value="48.5M" sub="MMK" />
        <Stat label="Court occupancy" value="78%" />
        <Stat label="New members" value="32" />
        <Stat label="Expiring" value="12" />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <Users size={18} className="text-zawana-accent" />
            <b>Member management</b>
          </div>
          <p className="mt-2 text-sm text-zawana-500">
            Manage member records, memberships and account status from the admin workspace.
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <CalendarDays size={18} className="text-zawana-accent" />
            <b>Bookings & facilities</b>
          </div>
          <p className="mt-2 text-sm text-zawana-500">
            Review bookings, courts, classes and coach schedules without operating the front desk.
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <Activity size={18} className="text-zawana-accent" />
            <b>Operations analytics</b>
          </div>
          <p className="mt-2 text-sm text-zawana-500">
            Monitor revenue, utilization and high-level activity while front-office staff handle daily service.
          </p>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div>
            <p className="text-xs font-bold tracking-widest text-zawana-500">FINANCIAL</p>
            <h3 className="mt-1 font-black">Revenue · MMK millions</h3>
          </div>

          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenue}>
                <CartesianGrid stroke="rgba(29,27,71,.08)" />
                <XAxis dataKey="name" stroke="#7d8886" />
                <YAxis stroke="#7d8886" />
                <Tooltip
                  contentStyle={{
                    background: '#FFFFFF',
                    border: '1px solid rgba(29,27,71,.1)',
                    borderRadius: 12,
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="#C4AF49" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div>
            <p className="text-xs font-bold tracking-widest text-zawana-500">FACILITY USAGE</p>
            <h3 className="mt-1 font-black">Peak hours</h3>
          </div>

          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peakHours}>
                <CartesianGrid stroke="rgba(29,27,71,.08)" />
                <XAxis dataKey="name" stroke="#7d8886" />
                <YAxis stroke="#7d8886" />
                <Tooltip
                  contentStyle={{
                    background: '#FFFFFF',
                    border: '1px solid rgba(29,27,71,.1)',
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="value" fill="#C4AF49" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </Page>
  );
}
