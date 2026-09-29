import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Stethoscope,
  UsersRound,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Logo } from './UI';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

type FrontOfficeKind = 'gym' | 'clinic';
type ClinicView = 'overview' | 'appointments' | 'doctors' | 'customers';

export default function FrontOfficeLayout({
  kind,
  children,
}: {
  kind: FrontOfficeKind;
  children: ReactNode;
}) {
  const { logout, user } = useAuth();
  const { notifications } = useApp();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isGym = kind === 'gym';
  const basePath = isGym ? '/front-office/gym' : '/front-office/revive-clinic';
  const notificationPath = `${basePath}/notifications`;
  const frontOfficeRole = isGym ? 'gym_fo' : 'clinic_fo';

  const unreadCount = notifications.filter(
    notification =>
      !notification.read &&
      (notification.audience === frontOfficeRole || notification.audience === 'all'),
  ).length;

  const clinicItems = [
    { key: 'overview' as ClinicView, label: 'Overview', icon: LayoutDashboard },
    { key: 'appointments' as ClinicView, label: 'Appointment Management', icon: CalendarDays },
    { key: 'doctors' as ClinicView, label: 'Doctor Management', icon: Stethoscope },
    { key: 'customers' as ClinicView, label: 'Customer Records', icon: UsersRound },
  ];

  const gymItems = [
    { key: 'overview' as ClinicView, label: 'Overview', icon: LayoutDashboard },
    { key: 'appointments' as ClinicView, label: 'Check-in & Attendance', icon: ClipboardCheck },
    { key: 'customers' as ClinicView, label: 'Member Records', icon: UsersRound },
  ];

  const items = isGym ? gymItems : clinicItems;
  const currentView = new URLSearchParams(location.search).get('view') as ClinicView | null;

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition ${
      isActive
        ? 'bg-zawana-950 text-white shadow-sm'
        : 'text-zawana-600 hover:bg-zawana-950/5 hover:text-zawana-950'
    }`;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-zawana-50 text-zawana-950">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          onClick={closeMobile}
          className="fixed inset-0 z-40 bg-zawana-950/35 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-zawana-950/8 bg-white transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-[76px] items-center justify-between border-b border-zawana-950/8 px-5">
          <Link to={basePath} onClick={closeMobile} className="shrink-0">
            <Logo />
          </Link>
          <button
            onClick={closeMobile}
            className="rounded-lg p-2 text-zawana-500 hover:bg-zawana-950/5 lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-5">
          <div className="rounded-2xl bg-zawana-950 px-4 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10">
                {isGym ? <ClipboardCheck size={18} /> : <HeartPulse size={18} />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/55">
                  Front Office
                </p>
                <p className="mt-1 truncate text-sm font-black">
                  {isGym ? 'Gym Operations' : 'Revive Clinic'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-5">
          <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-zawana-400">
            Workspace
          </p>

          <div className="space-y-1">
            {items.map(item => {
              const Icon = item.icon;
              const to = `${basePath}?view=${item.key}`;
              const active = isGym
                ? (currentView ?? 'overview') === item.key
                : location.pathname === basePath && (currentView ?? 'overview') === item.key;

              return (
                <NavLink
                  key={item.key}
                  to={to}
                  end
                  onClick={closeMobile}
                  className={() => navClass({ isActive: active })}
                >
                  <Icon size={17} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <ChevronRight
                    size={14}
                    className={`shrink-0 transition ${active ? 'opacity-80' : 'opacity-0 group-hover:opacity-50'}`}
                  />
                </NavLink>
              );
            })}

            <NavLink
              to={notificationPath}
              onClick={closeMobile}
              className={({ isActive }) => navClass({ isActive })}
            >
              <Bell size={17} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">Notifications</span>
              {unreadCount > 0 && (
                <span className="grid min-h-5 min-w-5 place-items-center rounded-full bg-zawana-accent px-1 text-[10px] font-black text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </NavLink>
          </div>
        </nav>

        <div className="border-t border-zawana-950/8 p-4">
          <div className="mb-3 rounded-xl bg-zawana-950/4 px-3 py-3">
            <p className="truncate text-sm font-black">{user?.name ?? 'Front Office Staff'}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-zawana-500">
              {isGym ? 'Gym Front Office' : 'Clinic Front Office'}
            </p>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-zawana-500 transition hover:bg-zawana-950/5 hover:text-zawana-950"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main shell */}
      <div className="min-h-screen lg:pl-[272px]">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-zawana-950/8 bg-white/90 px-5 backdrop-blur-xl lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-xl border border-zawana-950/10 p-2.5 text-zawana-600 hover:bg-zawana-950/5 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zawana-accent">
                {isGym ? 'Gym Front Office' : 'Revive Clinic Front Office'}
              </p>
              <p className="mt-0.5 truncate text-sm font-bold text-zawana-950">
                {isGym ? 'Membership, check-ins & attendance' : 'Appointments, doctors & customer care'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NavLink
              to={notificationPath}
              className="relative rounded-xl p-2.5 text-zawana-500 transition hover:bg-zawana-950/5 hover:text-zawana-950"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-zawana-accent px-0.5 text-[9px] font-black text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </NavLink>
            <div className="hidden border-l border-zawana-950/10 pl-3 sm:block">
              <p className="text-xs font-black">{user?.name}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zawana-500">Staff</p>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8 lg:py-9">
          {children}
        </main>

        <footer className="border-t border-zawana-950/8 bg-white px-5 py-4 lg:px-8">
          <div className="flex items-center gap-2 text-xs font-bold text-zawana-500">
            <CalendarDays size={14} />
            Staff workspace · Zawana Operations
          </div>
        </footer>
      </div>
    </div>
  );
}
