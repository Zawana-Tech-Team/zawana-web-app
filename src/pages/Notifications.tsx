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
import { patch, post } from '../api';
import type { Notification, UserRole } from '../types';
import { useLanguage } from '../context/LanguageContext';

const roleConfig: Record<
  UserRole,
  { title: string; description: string; emptyTitle: string; emptyBody: string }
> = {
  member: {
    title: 'Notifications',
    description: 'Bookings, memberships and personal updates.',
    emptyTitle: 'You are all caught up',
    emptyBody: 'There are no new notifications for you right now.'
  },
  coach: {
    title: 'Coach Notifications',
    description: 'Client bookings, assessments and training updates.',
    emptyTitle: 'No coach notifications',
    emptyBody: 'There are no new coaching updates right now.'
  },
  admin: {
    title: 'Admin Notifications',
    description: 'Important updates from across Zawana operations.',
    emptyTitle: 'No operational alerts',
    emptyBody: 'There are no new administrative notifications right now.'
  },
  owner: {
    title: 'Owner Notifications',
    description: 'Important updates from across all Zawana businesses.',
    emptyTitle: 'No owner alerts',
    emptyBody: 'There are no new business-wide notifications right now.'
  },
  gym_fo: {
    title: 'Notifications',
    description: 'Check-ins, memberships, attendance and desk tasks.',
    emptyTitle: 'Gym desk is clear',
    emptyBody: 'There are no new gym front-office notifications.'
  },
  clinic_fo: {
    title: 'Notifications',
    description: 'Appointments, treatment requests and clinic tasks.',
    emptyTitle: 'Clinic desk is clear',
    emptyBody: 'There are no new Revive Clinic notifications.'
  },
  badminton_fo: {
    title: 'Notifications',
    description: 'Badminton bookings, packages and court activity.',
    emptyTitle: 'Badminton desk is clear',
    emptyBody: 'There are no new badminton operations notifications.'
  },
  store_fo: {
    title: 'Notifications',
    description: 'Store orders, payment and inventory updates.',
    emptyTitle: 'Store desk is clear',
    emptyBody: 'There are no new store notifications.'
  },
  cafe_fo: {
    title: 'Notifications',
    description: 'Paid orders and cafe service updates.',
    emptyTitle: 'Cafe desk is clear',
    emptyBody: 'There are no new cafe notifications.'
  },
  doctor: {
    title: 'Notifications',
    description: 'Clinic appointments and patient updates.',
    emptyTitle: 'No doctor notifications',
    emptyBody: 'There are no new clinical updates.'
  },
};

function getNotificationIcon(notification: Notification, role: UserRole) {
  switch (notification.type) {
    case 'booking':
      return <CalendarDays size={18} />;
    case 'checkin':
      return <ClipboardCheck size={18} />;
    case 'clinic':
      return <HeartPulse size={18} />;
    case 'assessment':
      return <Activity size={18} />;
    case 'member':
      return <UserRound size={18} />;
    case 'payment':
    case 'membership':
    case 'success':
      return <CheckCircle2 size={18} />;
    case 'alert':
      return <ShieldAlert size={18} />;
    case 'system':
      return <Info size={18} />;
    default:
      return role === 'clinic_fo' ?
        <HeartPulse size={18} /> : role === 'gym_fo' ?
        <ClipboardCheck size={18} /> :
        <Bell size={18} />;
  }
}

export function Notifications() {
  const { locale } = useLanguage();
  const { user } = useAuth();
  const { notifications } = useApp();
  const role: UserRole = user?.role ?? 'member';
  const config = roleConfig[role];
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [acted, setActed] = useState<string[]>([]);

  const roleNotifications = notifications.filter(
    notification =>
      !acted.includes(notification.id) &&
      (!notification.audience || notification.audience === role || notification.audience === 'all')
  );
  const unreadCount = roleNotifications.filter(notification => !notification.read).length;
  const visibleNotifications =
    filter === 'unread'
      ? roleNotifications.filter(notification => !notification.read)
      : roleNotifications;
  const actOnCourse = async (
    notification: Notification,
    action: 'accept' | 'decline' | 'pay' | 'cancel'
  ) => {
    if (!notification.entityId || busy) return;
    setBusy(notification.id);
    setError('');
    try {
      let result: any;
      if (action === 'accept' || action === 'decline')
        result = await post(`/coach/private-courses/${notification.entityId}/decision`, {
          decision: action
        });
      else if (action === 'pay')
        result = await post(`/member/private-courses/${notification.entityId}/pay`, {});
      else result = await post(`/member/private-courses/${notification.entityId}/cancel`, {});
      await patch(`/notifications/${notification.id}/read`, {}).catch(() => {});
      setActed(items => [...items, notification.id]);
      window.dispatchEvent(
        new CustomEvent('zawana-toast', {
          detail:
            result?.message ||
            (action === 'accept'
              ? 'Request accepted. The member can now confirm the booking.'
              : action === 'decline'
                ? 'Request declined; the reservation was released.'
                : action === 'pay'
                  ? 'Booking confirmed. Payment is due at the venue.'
                  : 'Booking cancelled and the reservation released.')
        })
      );
    } catch (e: any) {
      setError(e.message || 'Could not update this booking.')
    } finally {
      setBusy('')
    }
  };

  return (
    <Page
      title={config.title}
      eyebrow={role === 'clinic_fo' ? 'Revive Clinic · Front Office' : 'Front Office'}
    >
      <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight md:text-3xl">Stay on top of the desk</h1>
          <p className="mt-1 max-w-2xl text-sm text-zawana-500">{config.description}</p>
        </div>
        {unreadCount > 0 && <Badge good>{unreadCount} unread</Badge>}
      </div>

      <Card className="overflow-hidden">
        {error &&
          <p role="alert" className="m-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>}
        <div className="flex items-center justify-between border-b border-zawana-950/8 p-4 sm:p-5">
          <div className="flex rounded-xl bg-zawana-950/5 p-1">
            <button
              onClick={() => setFilter('all')}
              className={`rounded-lg px-3 py-2 text-xs font-black transition ${filter === 'all' ? 'bg-white shadow-sm' : 'text-zawana-500'}`}
            >All <span className="ml-1 opacity-60">{roleNotifications.length}</span>
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`rounded-lg px-3 py-2 text-xs font-black transition ${filter === 'unread' ? 'bg-white shadow-sm' : 'text-zawana-500'}`}
            >Unread <span className="ml-1 opacity-60">{unreadCount}</span>
            </button>
          </div>
        </div>

        {visibleNotifications.length > 0 ? (
          <div className="divide-y divide-zawana-950/8">
            {visibleNotifications.map(notification => {
              const request =
                role === 'coach' &&
                notification.type === 'booking' &&
                notification.entityType === 'booking' &&
                notification.title.toLowerCase().includes('private course request');
              const memberPay =
                role === 'member' &&
                notification.type === 'booking' &&
                notification.entityType === 'booking' &&
                notification.title === 'Coach confirmed your private course';
              return (
                <div
                  key={notification.id}
                  className={`p-5 transition ${!notification.read ? 'bg-zawana-accent/[0.035]' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${!notification.read ? 'bg-zawana-accent/15 text-zawana-950' : 'bg-zawana-950/5 text-zawana-500'}`}
                    >
                      {getNotificationIcon(notification, role)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black">{notification.title}</h3>
                          {!notification.read && <Badge good>New</Badge>}
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-zawana-400">
                          {new Date(notification.time).toLocaleString(locale)}
                        </span>
                      </div>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-zawana-500">
                        {notification.body}
                      </p>
                    </div>
                  </div>
                  {(request || memberPay) &&
                    <div className="mt-4 flex flex-wrap gap-2 pl-0 sm:pl-[60px]">
                      {request ?
                        <>
                          <button
                            disabled={!!busy}
                            onClick={() => void actOnCourse(notification, 'decline')}
                            className="min-h-11 rounded-xl border border-red-200 px-4 text-sm font-black text-red-700 disabled:opacity-50"
                          >
                            {busy === notification.id ? 'Saving…' : 'Decline'}
                          </button>
                          <button
                            disabled={!!busy}
                            onClick={() => void actOnCourse(notification, 'accept')}
                            className="min-h-11 rounded-xl bg-zawana-950 px-4 text-sm font-black text-white disabled:opacity-50"
                          >
                            {busy === notification.id ? 'Saving…' : 'Confirm request'}
                          </button>
                        </> :
                        <>
                          <button
                            disabled={!!busy}
                            onClick={() => void actOnCourse(notification, 'cancel')}
                            className="min-h-11 rounded-xl border border-red-200 px-4 text-sm font-black text-red-700 disabled:opacity-50"
                          >
                            {busy === notification.id ? 'Saving…' : 'Cancel booking'}
                          </button>
                          <button
                            disabled={!!busy}
                            onClick={() => void actOnCourse(notification, 'pay')}
                            className="min-h-11 rounded-xl bg-zawana-950 px-4 text-sm font-black text-white disabled:opacity-50"
                          >
                            {busy === notification.id ? 'Confirming…' : 'Pay now'}
                          </button>
                        </>}</div>}
                    </div>
                  )})}
          </div>
        ) : (
          <div className="p-10">
            <Empty
              title={filter === 'unread' ? 'No unread notifications' : config.emptyTitle}
              body={
                filter === 'unread' ? 'Everything currently needs no attention.' : config.emptyBody
              }
            />
          </div>
        )}
      </Card>
    </Page>
  );
}
