import {
  Activity,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  HeartPulse,
  Info,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';

import { Badge, Card, Empty, Page } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import type { Notification, UserRole } from '../types';

const roleConfig: Record<UserRole, { title: string; description: string; emptyTitle: string; emptyBody: string }> = {
  member: { title: 'Notifications', description: 'Bookings, memberships and personal updates.', emptyTitle: 'You are all caught up', emptyBody: 'There are no new notifications for you right now.' },
  coach: { title: 'Coach Notifications', description: 'Client bookings, assessments and training updates.', emptyTitle: 'No coach notifications', emptyBody: 'There are no new coaching updates right now.' },
  admin: { title: 'Admin Notifications', description: 'Important updates from across Zawana operations.', emptyTitle: 'No operational alerts', emptyBody: 'There are no new administrative notifications right now.' },
  gym_fo: { title: 'Notifications', description: 'Check-ins, memberships, attendance and desk tasks.', emptyTitle: 'Gym desk is clear', emptyBody: 'There are no new gym front-office notifications.' },
  clinic_fo: { title: 'Notifications', description: 'Appointments, treatment requests and clinic tasks.', emptyTitle: 'Clinic desk is clear', emptyBody: 'There are no new Revive Clinic notifications.' },
  badminton_fo: { title: 'Notifications', description: 'Badminton bookings, packages and court activity.', emptyTitle: 'Badminton desk is clear', emptyBody: 'There are no new badminton operations notifications.' },
  store_fo: { title: 'Notifications', description: 'Store orders, payment and inventory updates.', emptyTitle: 'Store desk is clear', emptyBody: 'There are no new store notifications.' },
  cafe_fo: { title: 'Notifications', description: 'Paid orders and cafe service updates.', emptyTitle: 'Cafe desk is clear', emptyBody: 'There are no new cafe notifications.' },
  doctor: { title: 'Notifications', description: 'Clinic appointments and patient updates.', emptyTitle: 'No doctor notifications', emptyBody: 'There are no new clinical updates.' },
};

function getNotificationIcon(notification: Notification, role: UserRole) {
  switch (notification.type) {
    case 'booking': return <CalendarDays size={18} />;
    case 'checkin': return <ClipboardCheck size={18} />;
    case 'clinic': return <HeartPulse size={18} />;
    case 'assessment': return <Activity size={18} />;
    case 'member': return <UserRound size={18} />;
    case 'payment':
    case 'membership':
    case 'success': return <CheckCircle2 size={18} />;
    case 'alert': return <ShieldAlert size={18} />;
    case 'system': return <Info size={18} />;
    default: return role === 'clinic_fo' ? <HeartPulse size={18} /> : role === 'gym_fo' ? <ClipboardCheck size={18} /> : <Bell size={18} />;
  }
}

export function Notifications() {
  const { user } = useAuth();
  const { notifications } = useApp();
  const role: UserRole = user?.role ?? 'member';
  const config = roleConfig[role];
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const roleNotifications = notifications.filter(notification => !notification.audience || notification.audience === role || notification.audience === 'all');
  const unreadCount = roleNotifications.filter(notification => !notification.read).length;
  const visibleNotifications = filter === 'unread' ? roleNotifications.filter(notification => !notification.read) : roleNotifications;

  return (
    <Page title={config.title} eyebrow={role === 'clinic_fo' ? 'Revive Clinic · Front Office' : 'Front Office'}>
      <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight md:text-3xl">Stay on top of the desk</h1>
          <p className="mt-1 max-w-2xl text-sm text-zawana-500">{config.description}</p>
        </div>
        {unreadCount > 0 && <Badge good>{unreadCount} unread</Badge>}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-zawana-950/8 p-4 sm:p-5">
          <div className="flex rounded-xl bg-zawana-950/5 p-1">
            <button onClick={() => setFilter('all')} className={`rounded-lg px-3 py-2 text-xs font-black transition ${filter === 'all' ? 'bg-white shadow-sm' : 'text-zawana-500'}`}>All <span className="ml-1 opacity-60">{roleNotifications.length}</span></button>
            <button onClick={() => setFilter('unread')} className={`rounded-lg px-3 py-2 text-xs font-black transition ${filter === 'unread' ? 'bg-white shadow-sm' : 'text-zawana-500'}`}>Unread <span className="ml-1 opacity-60">{unreadCount}</span></button>
          </div>
        </div>

        {visibleNotifications.length > 0 ? (
          <div className="divide-y divide-zawana-950/8">
            {visibleNotifications.map(notification => (
              <div key={notification.id} className={`p-5 transition ${!notification.read ? 'bg-zawana-accent/[0.035]' : ''}`}>
                <div className="flex items-start gap-4">
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${!notification.read ? 'bg-zawana-accent/15 text-zawana-950' : 'bg-zawana-950/5 text-zawana-500'}`}>
                    {getNotificationIcon(notification, role)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black">{notification.title}</h3>
                        {!notification.read && <Badge good>New</Badge>}
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-zawana-400">{notification.time}</span>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-zawana-500">{notification.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10"><Empty title={filter === 'unread' ? 'No unread notifications' : config.emptyTitle} body={filter === 'unread' ? 'Everything currently needs no attention.' : config.emptyBody} /></div>
        )}
      </Card>
    </Page>
  );
}
