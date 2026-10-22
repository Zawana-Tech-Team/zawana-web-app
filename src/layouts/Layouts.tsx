import { LayoutGroup } from 'framer-motion';
import { WorkspaceNavLink } from '../components/Interactions';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Dumbbell,
  Home,
  LogOut,
  Menu,
  Settings,
  ShoppingBag,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Logo } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from '../components/NotificationBell';
import { LanguageSwitcher, LocalizedTree, useLanguage } from '../context/LanguageContext';
import WorkspaceCover from '../components/WorkspaceCover';
import { useWorkspaceNavigation } from '../components/useWorkspaceNavigation';

type SidebarItem = readonly [string, string, LucideIcon];

const member: readonly SidebarItem[] = [
  ['/member', 'Overview', Home],
  ['/book/court', 'Badminton courts', CalendarDays],
  ['/private-course', 'Private course', Dumbbell],
  ['/bookings', 'Bookings', ClipboardList],
  ['/membership', 'Packages', Users],
  ['/payments', 'Payments', CreditCard],
];

const coach: readonly SidebarItem[] = [
  ['/coach', 'Overview', Home],
  ['/coach/schedule', 'Schedule', CalendarDays],
  ['/coach/bookings', 'Requests', ClipboardList],
  ['/coach/clients', 'Clients', Users],
];

const admin: readonly SidebarItem[] = [
  ['/admin', 'Overview', Home],
  ['/admin/users', 'Users', Users],
  ['/admin/bookings', 'Bookings', CalendarDays],
  ['/admin/courts', 'Courts', Building2],
  ['/admin/classes', 'Classes', Dumbbell],
  ['/admin/coaches', 'Coaches', Users],
  ['/admin/payments', 'Payments', ClipboardList],
  ['/admin/checkins', 'Check-ins', Activity],
  ['/admin/analytics', 'Analytics', BarChart3],
];

const accountItems: readonly SidebarItem[] = [
  ['/profile', 'Profile', UserRound],
  ['/notifications', 'Notifications', Bell],
  ['/settings', 'Settings', Settings],
];

function initials(name?: string | null) {
  return name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase() || 'Z';
}

function SidebarLinks({
  items,
  collapsed = false,
  onNavigate
}: {
  items: readonly SidebarItem[];
  collapsed?: boolean;
  onNavigate?: () => void
}) {
  const { t } = useLanguage();
  const navigationId = useId();
  return (
    <LayoutGroup id={navigationId}>
      {items.map(([to, label, Icon]) => (
        <WorkspaceNavLink
          key={to}
          to={to}
          end={to === '/member' || to === '/coach' || to === '/admin'}
          onClick={onNavigate}
          title={collapsed ? t(label) : undefined}
          aria-label={collapsed ? t(label) : undefined}
          className={({ isActive }) =>
            `group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zawana-gold ${isActive ? 'bg-zawana-gold-soft text-zawana-950 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-zawana-accent' : 'text-zawana-600 hover:bg-zawana-800 hover:text-zawana-950'}`
          }
        >
          <Icon size={18} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
          <span className="workspace-nav-label truncate" data-collapsed={collapsed} aria-hidden={collapsed}>{t(label)}</span>
        </WorkspaceNavLink>
      ))}
    </LayoutGroup>
  );
}

function AccountLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { logout } = useAuth();
  const { t } = useLanguage();

  return (
    <>
      {accountItems.map(([to, label, Icon]) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${isActive ? 'bg-zawana-gold-soft text-zawana-950' : 'text-zawana-600 hover:bg-zawana-800 hover:text-zawana-950'}`
          }
        >
          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>{t(label)}</span>
        </NavLink>
      ))}
      <button
        type="button"
        onClick={logout}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-zawana-600 transition-colors hover:bg-zawana-800 hover:text-zawana-950"
      >
        <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
        <span>{t('Sign out')}</span>
      </button>
    </>
  );
}

export function AppLayout({
  children,
  role
}: {
  children: ReactNode;
  role: 'member' | 'coach' | 'admin'
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { drawerRef, triggerRef } = useWorkspaceNavigation(mobileOpen, setMobileOpen);
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const items = role === 'admin' ? admin : role === 'coach' ? coach : member;

  return (
    <LocalizedTree>
      <div className="zawana-workspace min-h-screen bg-zawana-page text-zawana-950">
        <a href="#main-content" className="workspace-skip">{t('Skip to content')}</a>
        <aside
          className={`workspace-sidebar fixed inset-y-0 left-0 z-40 hidden border-r border-zawana-border bg-white lg:block ${collapsed ? 'w-[76px]' : 'w-[260px]'}`}
        >
          <div className="flex h-full flex-col px-3 py-4">
            <div
              className={`flex h-12 items-center ${collapsed ? 'justify-center' : 'justify-between px-1'}`}
            >
              <Logo compact={collapsed} />
              <button
                type="button"
                onClick={() => setCollapsed(value => !value)}
                aria-label={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zawana-500 transition hover:bg-zawana-800 hover:text-zawana-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zawana-gold ${collapsed ? 'absolute right-[-18px] top-5 border border-zawana-border bg-white shadow-sm' : ''}`}
              >
                {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
              </button>
            </div>

            <div
              className={`mt-8 mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-zawana-400 ${collapsed ? 'sr-only' : ''}`}
            >
              {t('Workspace')}
            </div>
            <nav aria-label="Workspace navigation" className="space-y-1">
              <SidebarLinks items={items} collapsed={collapsed} />
            </nav>

            <div className="mt-auto border-t border-zawana-border pt-4">
              {!collapsed && (
                <div className="mb-3 flex items-center gap-3 rounded-xl px-2 py-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zawana-gold-soft text-xs font-bold text-zawana-accent">
                    {initials(user?.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {user?.name || 'Zawana member'}
                    </span>
                    <span className="mt-0.5 block text-xs capitalize text-zawana-500">
                      {role.replaceAll('_', ' ')}
                    </span>
                  </span>
                </div>
              )}
              <nav aria-label="Account navigation" className="space-y-1">
                {collapsed ? (
                  <>
                    <NavLink
                      to="/profile"
                      aria-label={t('Profile')}
                      title={t('Profile')}
                      className="grid h-11 place-items-center rounded-xl text-zawana-600 hover:bg-zawana-800"
                    >
                      <UserRound size={18} />
                    </NavLink>
                    <NavLink
                      to="/notifications"
                      aria-label={t('Notifications')}
                      title={t('Notifications')}
                      className="grid h-11 place-items-center rounded-xl text-zawana-600 hover:bg-zawana-800"
                    >
                      <Bell size={18} />
                    </NavLink>
                    <button
                      type="button"
                      aria-label={t('Sign out')}
                      title={t('Sign out')}
                      onClick={logout}
                      className="grid h-11 w-full place-items-center rounded-xl text-zawana-600 hover:bg-zawana-800"
                    >
                      <LogOut size={18} />
                    </button>
                  </>
                ) :
                  <AccountLinks />}
              </nav>
            </div>
          </div>
        </aside>

        <div
          aria-hidden={!mobileOpen}
          inert={!mobileOpen}
          data-open={mobileOpen}
          className="workspace-mobile-backdrop fixed inset-0 z-50 bg-zawana-950/30 lg:hidden"
        >
          <button
            type="button"
            aria-label={t('Close navigation')}
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 z-0 h-full w-full cursor-default"
          />
          <aside
            ref={drawerRef}
            id="member-mobile-navigation"
            role={mobileOpen ? 'dialog' : undefined}
            aria-modal={mobileOpen ? true : undefined}
            aria-label="Mobile navigation"
            className="workspace-sidebar relative z-10 flex h-full w-[min(320px,88vw)] flex-col bg-white p-4 shadow-2xl"
          >
            <div className="flex h-12 items-center justify-between px-1">
              <Logo />
              <button
                type="button"
                aria-label={t('Close menu')}
                onClick={() => setMobileOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl text-zawana-500 hover:bg-zawana-800"
              >
                <X size={19} />
              </button>
            </div>
            <p className="mb-2 mt-8 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-zawana-400">
              {t('Workspace')}
            </p>
            <nav aria-label="Workspace navigation" className="space-y-1">
              <SidebarLinks items={items} onNavigate={() => setMobileOpen(false)} />
            </nav>
            <div className="mt-auto border-t border-zawana-border pt-4">
              <div className="mb-3 flex items-center gap-3 rounded-xl px-2 py-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zawana-gold-soft text-xs font-bold text-zawana-accent">
                  {initials(user?.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {user?.name || 'Zawana member'}
                  </span>
                  <span className="mt-0.5 block text-xs capitalize text-zawana-500">
                    {role.replaceAll('_', ' ')}
                  </span>
                </span>
              </div>
              <nav aria-label="Account navigation" className="space-y-1">
                <AccountLinks onNavigate={() => setMobileOpen(false)} />
              </nav>
            </div>
          </aside>
        </div>

        <div className={`workspace-main min-h-screen ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-[260px]'}`}>
          <header className="workspace-header sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-zawana-border bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
            <button
              ref={triggerRef}
              type="button"
              aria-label={t('Open navigation')}
              aria-expanded={mobileOpen}
              aria-controls="member-mobile-navigation"
              onClick={() => setMobileOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-xl text-zawana-600 transition hover:bg-zawana-800 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="lg:hidden">
              <Logo compact />
            </div>
            <div className="hidden text-xs font-semibold text-zawana-500 lg:block">
              {t(
                role === 'member'
                  ? 'MEMBER SPACE'
                  : `${role.replaceAll('_', ' ').toUpperCase()} WORKSPACE`
              )}
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <span className="hidden max-w-48 truncate text-sm font-medium text-zawana-600 sm:block">
                {user?.name}
              </span>
              <LanguageSwitcher />
              <NotificationBell />
              <NavLink
                to="/profile"
                aria-label={t('Open profile')}
                className="grid h-9 w-9 place-items-center rounded-xl border border-zawana-border bg-white text-xs font-bold text-zawana-accent transition hover:bg-zawana-gold-soft"
              >
                {initials(user?.name)}
              </NavLink>
            </div>
          </header>
          <div id="main-content" tabIndex={-1}><WorkspaceCover role={role} />{children}</div>
        </div>
      </div>
    </LocalizedTree>
  );
}
