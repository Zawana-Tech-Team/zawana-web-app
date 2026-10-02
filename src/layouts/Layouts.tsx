import { useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Dumbbell, Home, LogOut, Menu, ShoppingBag, UserRound, Users, BarChart3, Activity, HeartPulse, Settings, ClipboardList, Building2, X, CreditCard } from 'lucide-react';
import { Logo, Button } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from '../components/NotificationBell';

const member = [['/member', 'Overview', Home], ['/book/court', 'Courts', CalendarDays], ['/private-course', 'Private Course', Dumbbell], ['/bookings', 'Bookings', ClipboardList], ['/membership', 'Packages', Users], ['/payments', 'Payments', CreditCard]] as const;
const coach = [['/coach', 'Overview', Home], ['/coach/schedule', 'Schedule', CalendarDays], ['/coach/bookings', 'Requests', ClipboardList], ['/coach/clients', 'Clients', Users]] as const;
const admin = [['/admin', 'Overview', Home], ['/admin/users', 'Users', Users], ['/admin/bookings', 'Bookings', CalendarDays], ['/admin/courts', 'Courts', Building2], ['/admin/classes', 'Classes', Dumbbell], ['/admin/coaches', 'Coaches', Users], ['/admin/payments', 'Payments', ClipboardList], ['/admin/checkins', 'Check-ins', Activity], ['/admin/analytics', 'Analytics', BarChart3]] as const;

function Sidebar({ items, collapsed, onCollapse }: { items: readonly (readonly [string, string, typeof Home])[]; collapsed: boolean; onCollapse: () => void }) {
  const { logout } = useAuth();
  return (
    <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-zawana-950/10 bg-white lg:block ${collapsed ? 'w-20' : 'w-64'}`}>
      <div className="flex h-full flex-col p-4">
        <div className="flex h-14 items-center justify-between px-1">
          {!collapsed && <Logo />}
          <button onClick={onCollapse} className="rounded-full p-2 text-zawana-500 hover:bg-zawana-950/5 hover:text-zawana-950">
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <nav className="mt-7 space-y-1">
          {items.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === '/member' || to === '/coach' || to === '/admin'} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${isActive ? 'bg-zawana-950 text-white' : 'text-zawana-500 hover:bg-zawana-950/5 hover:text-zawana-950'}`}>
              <Icon size={18} />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-1 border-t border-zawana-950/10 pt-4">
          {([
            ['/profile', 'Profile', UserRound],
            ['/notifications', 'Notifications', Bell],
            ['/settings', 'Settings', Settings],
          ] as const).map(([to, label, Icon]) => (
            <NavLink key={to} to={to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-zawana-500 hover:bg-zawana-950/5 hover:text-zawana-950">
              <Icon size={18} />
              {!collapsed && label}
            </NavLink>
          ))}
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-zawana-500 hover:bg-zawana-950/5 hover:text-zawana-950">
            <LogOut size={18} />
            {!collapsed && 'Logout'}
          </button>
        </div>
      </div>
    </aside>
  );
}

export function AppLayout({ children, role }: { children: ReactNode; role: 'member' | 'coach' | 'admin' }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const { user } = useAuth();
  const items = role === 'admin' ? admin : role === 'coach' ? coach : member;

  return (
    <div className="min-h-screen bg-white">
      <Sidebar items={items} collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} />
      {mobile && (
        <div className="fixed inset-0 z-50 bg-zawana-950/35 lg:hidden" onClick={() => setMobile(false)}>
          <aside className="h-full w-72 bg-white p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <Logo />
              <button onClick={() => setMobile(false)} className="rounded-full p-2 hover:bg-zawana-950/5"><X /></button>
            </div>
            <nav className="mt-8 space-y-1">
              {items.map(([to, label, Icon]) => (
                <NavLink onClick={() => setMobile(false)} key={to} to={to} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-zawana-500 hover:bg-zawana-950/5 hover:text-zawana-950">
                  <Icon size={18} />{label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-8">
              <Button variant="secondary" className="w-full" onClick={() => setMobile(false)}>Close menu</Button>
            </div>
          </aside>
        </div>
      )}
      <div className={`${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zawana-950/10 bg-white/90 px-4 backdrop-blur md:px-8">
          <button className="rounded-full p-2 lg:hidden" onClick={() => setMobile(true)}><Menu size={20} /></button>
          <div className="lg:hidden"><Logo compact /></div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm font-semibold text-zawana-500 md:block">{user?.name}</span>
            <NotificationBell />
            <NavLink to="/profile" className="grid h-9 w-9 place-items-center rounded-full bg-zawana-gold text-xs font-black text-zawana-950">{user?.name?.slice(0, 2).toUpperCase()}</NavLink>
          </div>
        </header>
        {children}
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-6 border-t border-zawana-950/10 bg-white/95 p-2 backdrop-blur lg:hidden">
        {member.map(([to, label, Icon]) => <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold ${isActive ? 'text-zawana-950' : 'text-zawana-500'}`}><Icon size={18} />{label}</NavLink>)}
      </nav>
    </div>
  );
}
