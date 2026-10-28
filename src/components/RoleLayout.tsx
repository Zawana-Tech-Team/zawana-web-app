import { LayoutGroup } from "framer-motion";
import { WorkspaceNavLink } from "./Interactions";
import { useEffect, useId, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Boxes,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Dumbbell,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingBag,
  Stethoscope,
  UserRound,
  Users,
  X,
  BarChart3,
} from "lucide-react";
import { Logo } from "./UI";
import { useAuth } from "../context/AuthContext";
import { NotificationBell } from "./NotificationBell";
import {
  LanguageSwitcher,
  LocalizedTree,
  useLanguage,
} from "../context/LanguageContext";
import type { UserRole } from "../types";
import WorkspaceCover from "./WorkspaceCover";
import { useWorkspaceNavigation } from "./useWorkspaceNavigation";

type Item = { to: string; label: string; icon: LucideIcon; children?: Item[] };
type RoleConfig = { label: string; eyebrow: string; items: Item[] };

const configs: Record<Exclude<UserRole, "member">, RoleConfig> = {
  admin: {
    label: "Zawana Admin",
    eyebrow: "Central Management",
    items: [
      { to: "/admin/course-finance", label: "Course Bookings & Finance", icon: CalendarDays },
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { to: "/admin/attendance", label: "Attendance", icon: CalendarDays },
      { to: "/admin/users", label: "Users", icon: Users },
      {
        to: "/admin/badminton",
        label: "Badminton",
        icon: CalendarDays,
        children: [
          {
            to: "/admin/court-rentals",
            label: "Court Rentals",
            icon: CalendarDays,
          },
          {
            to: "/admin/badminton-packages",
            label: "Badminton Packages",
            icon: Package,
          },
          { to: "/admin/coaches", label: "Coach Packages", icon: UserRound },
          {
            to: "/admin/private-courses",
            label: "Private Courses",
            icon: CalendarDays,
          },
        ],
      },
      {
        to: "/admin/gym",
        label: "Gym",
        icon: Dumbbell,
        children: [
          {
            to: "/admin/gym-coaches",
            label: "Coach Management",
            icon: UserRound,
          },
          { to: "/admin/gym-packages", label: "Gym Packages", icon: Dumbbell },
        ],
      },
      { to: "/admin/finance", label: "Finance", icon: BarChart3 },
      { to: "/admin/cms", label: "Content & Achievements", icon: FileText },
    ],
  },
  owner: {
    label: "Zawana Owner",
    eyebrow: "All Business Overview",
    items: [
      { to: "/owner", label: "Overview", icon: LayoutDashboard },
      { to: "/owner/finance", label: "Finance", icon: BarChart3 },
    ],
  },
  badminton_fo: {
    label: "Badminton Front Office",
    eyebrow: "Court Operations",
    items: [
      { to: "/badminton-fo/course-finance", label: "Course Bookings & Finance", icon: CalendarDays },
      { to: "/badminton-fo", label: "Dashboard", icon: LayoutDashboard },
      { to: "/badminton-fo/attendance", label: "Attendance", icon: CalendarDays },
      {
        to: "/badminton-fo/check-in",
        label: "Package Check-In & Sales",
        icon: ClipboardList,
      },
      {
        to: "/badminton-fo/courts",
        label: "Court Rental Desk",
        icon: CalendarDays,
      },
      {
        to: "/badminton-fo/bookings",
        label: "Court Bookings",
        icon: CalendarDays,
      },
      {
        to: "/badminton-fo/active-packages",
        label: "Active Packages",
        icon: ClipboardList,
      },
      {
        to: "/badminton-fo/transactions",
        label: "Transactions",
        icon: CreditCard,
      },
    ],
  },
  gym_fo: {
    label: "HPC Gym Front Office",
    eyebrow: "Membership Operations",
    items: [
      { to: "/gym-fo", label: "Dashboard", icon: LayoutDashboard },
      { to: "/gym-fo/check-in", label: "Check-In", icon: ClipboardList },
      { to: "/gym-fo/members", label: "Members", icon: Users },
      { to: "/gym-fo/memberships", label: "Memberships", icon: Package },
      {
        to: "/gym-fo/private-training",
        label: "Private Training",
        icon: CalendarDays,
      },
      { to: "/gym-fo/appointments", label: "Appointments", icon: CalendarDays },
      { to: "/gym-fo/coaches", label: "Coaches", icon: Dumbbell },
      { to: "/gym-fo/payments", label: "Payments", icon: CreditCard },
    ],
  },
  clinic_fo: {
    label: "Revive Clinic Front Office",
    eyebrow: "Clinical Operations",
    items: [
      { to: "/clinic-fo", label: "Dashboard", icon: LayoutDashboard },
      { to: "/clinic-fo/patients", label: "Patients", icon: Users },
      {
        to: "/clinic-fo/appointments",
        label: "Appointments",
        icon: CalendarDays,
      },
      { to: "/clinic-fo/doctors", label: "Doctors", icon: Stethoscope },
      {
        to: "/clinic-fo/schedule",
        label: "Doctor Schedule",
        icon: CalendarDays,
      },
      { to: "/clinic-fo/records", label: "Records", icon: HeartPulse },
      { to: "/clinic-fo/payments", label: "Payments", icon: CreditCard },
    ],
  },
  store_fo: {
    label: "Lining Store",
    eyebrow: "Retail Operations",
    items: [
      { to: "/store-fo", label: "Dashboard", icon: LayoutDashboard },
      { to: "/store-fo/products", label: "Products", icon: Package },
      { to: "/store-fo/categories", label: "Categories", icon: Boxes },
      { to: "/store-fo/inventory", label: "Inventory", icon: Boxes },
      { to: "/store-fo/pos", label: "POS / Barcode", icon: ShoppingBag },
      {
        to: "/store-fo/orders",
        label: "Orders & Pay Later",
        icon: ClipboardList,
      },
      { to: "/store-fo/transactions", label: "Transactions", icon: CreditCard },
    ],
  },
  cafe_fo: {
    label: "Zawana Cafe",
    eyebrow: "Cafe Operations",
    items: [
      { to: "/cafe", label: "Dashboard", icon: LayoutDashboard },
      { to: "/cafe/orders", label: "Orders", icon: ClipboardList },
      { to: "/cafe/menu", label: "Menu", icon: FileText },
      { to: "/cafe/pos", label: "POS", icon: ShoppingBag },
      { to: "/cafe/transactions", label: "Transactions", icon: CreditCard },
    ],
  },
  doctor: {
    label: "Doctor Portal",
    eyebrow: "My Clinical Workspace",
    items: [
      { to: "/doctor", label: "Dashboard", icon: LayoutDashboard },
      { to: "/doctor/schedule", label: "My Schedule", icon: CalendarDays },
      { to: "/doctor/appointments", label: "Bookings", icon: ClipboardList },
      { to: "/doctor/patients", label: "Patients", icon: Users },
      { to: "/doctor/profile", label: "Profile", icon: UserRound },
    ],
  },
  coach: {
    label: "Coach Portal",
    eyebrow: "My Coaching Workspace",
    items: [
      { to: "/coach/course-finance", label: "Course Bookings & Finance", icon: CalendarDays },
      { to: "/coach", label: "Dashboard", icon: LayoutDashboard },
      { to: "/coach/attendance", label: "Attendance", icon: CalendarDays },
      { to: "/coach/schedule", label: "My Calendar", icon: CalendarDays },
      { to: "/coach/training", label: "Gym Training", icon: Dumbbell },
      { to: "/coach/bookings", label: "Bookings", icon: ClipboardList },
      { to: "/coach/clients", label: "Customers", icon: Users },
    ],
  },
};

function initials(name?: string | null) {
  return (
    name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "Z"
  );
}

function NavGroup({
  item,
  onNavigate,
}: {
  item: Item;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const active =
    item.children!.some((child) => child.to === pathname) ||
    (item.label === "Badminton" && pathname === "/admin/courts");
  const [open, setOpen] = useState(active);
  const id = useId();
  useEffect(() => {
    if (active) setOpen(true);
  }, [pathname, active]);
  const Icon = item.icon;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-zawana-gold ${active ? "text-zawana-accent" : "text-zawana-600 hover:bg-zawana-800"}`}
      >
        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        <span className="flex-1">{t(item.label)}</span>
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      <div
        id={id}
        hidden={!open}
        className="ml-5 border-l border-zawana-border pl-2"
      >
        <NavItems items={item.children!} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function NavItems({
  items,
  onNavigate,
}: {
  items: Item[];
  onNavigate?: () => void;
}) {
  const { t } = useLanguage();
  const navigationId = useId();
  return (
    <LayoutGroup id={navigationId}>
      {items.map((item) => {
        const { to, label, icon: Icon } = item;
        return item.children ? (
          <NavGroup key={to} item={item} onNavigate={onNavigate} />
        ) : (
          <WorkspaceNavLink
            key={to}
            to={to}
            end
            onClick={onNavigate}
            className={({ isActive }) =>
              `group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zawana-gold ${isActive ? "bg-zawana-gold-soft text-zawana-950 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-zawana-accent" : "text-zawana-600 hover:bg-zawana-800 hover:text-zawana-950"}`
            }
          >
            <Icon
              size={18}
              strokeWidth={1.8}
              className="shrink-0"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{t(label)}</span>
            <ChevronRight
              size={14}
              aria-hidden="true"
              className="shrink-0 text-zawana-400 transition group-hover:translate-x-0.5 group-hover:text-zawana-600"
            />
          </WorkspaceNavLink>
        );
      })}
    </LayoutGroup>
  );
}

export default function RoleLayout({
  role,
  children,
}: {
  role: Exclude<UserRole, "member">;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { drawerRef, triggerRef } = useWorkspaceNavigation(
    mobileOpen,
    setMobileOpen,
  );
  const { t } = useLanguage();
  const config = configs[role];
  const notificationPath = `${config.items[0].to}/notifications`;

  return (
    <LocalizedTree>
      <div className="zawana-workspace min-h-screen bg-zawana-page text-zawana-950">
        <a href="#main-content" className="workspace-skip">
          {t("Skip to content")}
        </a>
        <div
          aria-hidden={!mobileOpen}
          inert={!mobileOpen}
          data-open={mobileOpen}
          className="workspace-mobile-backdrop fixed inset-0 z-50 bg-zawana-950/30 lg:hidden"
        >
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 z-0 h-full w-full cursor-default"
          />
          <aside
            ref={drawerRef}
            id="role-mobile-navigation"
            role={mobileOpen ? "dialog" : undefined}
            aria-modal={mobileOpen ? true : undefined}
            aria-label="Mobile navigation"
            className="workspace-sidebar relative z-10 flex h-full w-[min(320px,88vw)] flex-col border-r border-zawana-border bg-white p-4 shadow-2xl"
          >
            <div className="flex h-12 items-center justify-between px-1">
              <Logo />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl text-zawana-500 hover:bg-zawana-800"
              >
                <X size={19} />
              </button>
            </div>
            <div className="mt-7 rounded-2xl border border-zawana-border bg-zawana-900 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-zawana-accent">
                {t(config.eyebrow)}
              </p>
              <p className="mt-1 text-sm font-semibold">{t(config.label)}</p>
            </div>
            <nav
              aria-label="Workspace navigation"
              className="mt-6 flex-1 space-y-1 overflow-y-auto"
            >
              <NavItems
                items={config.items}
                onNavigate={() => setMobileOpen(false)}
              />
              <NavLink
                to={notificationPath}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${isActive ? "bg-zawana-gold-soft text-zawana-950" : "text-zawana-600 hover:bg-zawana-800"}`
                }
              >
                <Bell size={18} aria-hidden="true" />
                {t("Notifications")}
              </NavLink>
              <NavLink
                to="/settings"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${isActive ? "bg-zawana-gold-soft text-zawana-950" : "text-zawana-600 hover:bg-zawana-800"}`
                }
              >
                <Settings size={18} aria-hidden="true" />
                {t("Security & settings")}
              </NavLink>
            </nav>
            <div className="border-t border-zawana-border pt-4">
              <div className="mb-3 flex items-center gap-3 px-2 py-1">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zawana-gold-soft text-xs font-bold text-zawana-accent">
                  {initials(user?.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {user?.name || "Team member"}
                  </p>
                  <p className="mt-0.5 text-xs capitalize text-zawana-500">
                    {role.replaceAll("_", " ")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-zawana-600 transition hover:bg-zawana-800"
              >
                <LogOut size={18} aria-hidden="true" />
                {t("Sign out")}
              </button>
            </div>
          </aside>
        </div>

        <aside className="workspace-sidebar fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-zawana-border bg-white lg:flex">
          <div className="flex h-[68px] items-center border-b border-zawana-border px-5">
            <Logo />
          </div>
          <div className="mx-4 mt-5 rounded-2xl border border-zawana-border bg-zawana-900 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-zawana-accent">
              {t(config.eyebrow)}
            </p>
            <p className="mt-1 text-sm font-semibold text-zawana-950">
              {t(config.label)}
            </p>
          </div>
          <nav
            aria-label="Workspace navigation"
            className="mt-5 flex-1 space-y-1 overflow-y-auto px-3 pb-4"
          >
            <NavItems items={config.items} />
            <div className="my-4 border-t border-zawana-border" />
            <NavLink
              to={notificationPath}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${isActive ? "bg-zawana-gold-soft text-zawana-950" : "text-zawana-600 hover:bg-zawana-800"}`
              }
            >
              <Bell size={18} aria-hidden="true" />
              {t("Notifications")}
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${isActive ? "bg-zawana-gold-soft text-zawana-950" : "text-zawana-600 hover:bg-zawana-800"}`
              }
            >
              <Settings size={18} aria-hidden="true" />
              {t("Security & settings")}
            </NavLink>
          </nav>
          <div className="border-t border-zawana-border p-4">
            <div className="mb-3 flex items-center gap-3 px-1">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zawana-gold-soft text-xs font-bold text-zawana-accent">
                {initials(user?.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {user?.name || "Team member"}
                </p>
                <p className="mt-0.5 truncate text-xs capitalize text-zawana-500">
                  {role.replaceAll("_", " ")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-zawana-600 transition hover:bg-zawana-800"
            >
              <LogOut size={17} aria-hidden="true" />
              {t("Sign out")}
            </button>
          </div>
        </aside>

        <div className="workspace-main min-h-screen lg:pl-[260px]">
          <header className="workspace-header sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-zawana-border bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
            <button
              ref={triggerRef}
              type="button"
              aria-label={t("Open navigation")}
              aria-expanded={mobileOpen}
              aria-controls="role-mobile-navigation"
              onClick={() => setMobileOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-xl text-zawana-600 hover:bg-zawana-800 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-[.16em] text-zawana-accent">
                {t(config.eyebrow)}
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-zawana-950">
                {t(config.label)}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <LanguageSwitcher />
              <NotificationBell />
              <div className="hidden items-center gap-2 border-l border-zawana-border pl-3 sm:flex">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-zawana-gold-soft text-xs font-bold text-zawana-accent">
                  {initials(user?.name)}
                </span>
                <div className="max-w-40">
                  <p className="truncate text-xs font-semibold">{user?.name}</p>
                  <p className="text-[10px] capitalize text-zawana-500">
                    {t(role.replaceAll("_", " "))}
                  </p>
                </div>
              </div>
            </div>
          </header>
          <div id="main-content" tabIndex={-1}>
            <WorkspaceCover role={role} />
            {children}
          </div>
        </div>
      </div>
    </LocalizedTree>
  );
}
