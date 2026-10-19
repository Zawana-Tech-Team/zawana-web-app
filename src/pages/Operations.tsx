import { SegmentedControl, useDialog } from '../components/Interactions';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { motionTokens } from '../design/motion';
import { Select } from '../components/Select';
import { Children, useMemo, useState, useEffect, type ReactNode } from 'react';

import { Link, useLocation } from 'react-router-dom';

import {
  Plus,
  Check,
  X,
  Search,
  ScanLine,
  Minus,
  ShoppingCart,
  Printer,
  ArrowRight,
  CalendarDays,
  UserPlus,
  PackagePlus,
  Pencil,
  Clock3,
  MapPin,
  UsersRound,
  Wrench,
  MoreHorizontal,
  Trash2,
  Edit3,
  Eye,
  XCircle,
  RotateCcw,
  LockKeyhole,
  Ban,
  ClipboardList
} from 'lucide-react';

import { Badge, Button, Card, Empty, Page, Pagination, Stat, Toast } from '../components/UI';

import { useOperations } from '../context/OperationsContext';

import { useAuth } from '../context/AuthContext';

import type { UserRole, Appointment, CourtBooking, Transaction, ContentItem } from '../types';
import { publicImageSrc, publicationDate } from '../utils/publicContent';

import { get, post, patch, put, del } from '../api';

import { ImageUpload, mediaImageSrc } from '../components/ImageUpload';

import { CAFE_LOCATIONS, CAFE_PAYMENT_METHODS } from '../constants/cafe';

import GymPrivateTraining from './GymPrivateTraining';
import GymPackageManager from './GymPackageManager';
import GymEnrollments from './GymEnrollments';
import { gymToday } from '../types/gym';

import CoachTraining from './CoachTraining';

const money = (n: number) => `${n.toLocaleString()} MMK`;

const localNow = new Date();
const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;

function Table({
  headers,
  children,
  paginate = true
}: {
  headers: string[];
  children: ReactNode;
  paginate?: boolean
}) {
  const [page, setPage] = useState(1);

  const rows = Children.toArray(children);

  const pageSize = 20,
    totalPages = Math.max(1, Math.ceil(rows.length / pageSize)),
    currentPage = Math.min(page, totalPages);

  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <>
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-zawana-950/8 bg-zawana-950/[.02]">
            {headers.map(h =>
              <th
                key={h}
                className="px-5 py-4 text-[10px] font-black uppercase tracking-[.16em] text-zawana-500"
              >
                {h}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-zawana-950/8">{visibleRows}</tbody>
      </table>
    </Card>
    {paginate &&
      <Pagination
        page={currentPage}
        totalPages={totalPages}
        total={rows.length}
        onPage={setPage}
      />}
  </>
}

const Cell = ({ children }: { children: ReactNode }) =>
  <td className="px-5 py-4 align-middle">{children}</td>;

function OpsModal({
  title,
  subtitle,
  children,
  onClose,
  wide = false
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean
}) {
  const dialogRef = useDialog(onClose);
  const reduced = useReducedMotion();
  return <motion.div
    initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: motionTokens.popover }}
    className="premium-dialog-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-zawana-950/55 p-4"
    onMouseDown={e => {
      if (e.target === e.currentTarget) onClose()
    }}
  >
    <motion.div
      ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      initial={reduced ? false : { opacity: 0, y: 16, scale: .98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .99 }}
      transition={reduced ? { duration: 0 } : motionTokens.spring}
      className={`premium-dialog-panel premium-dialog-panel--control w-full ${wide ? 'max-w-5xl' : 'max-w-2xl'} overflow-hidden rounded-[30px] border border-white/60 bg-white shadow-[0_40px_120px_rgba(29,27,71,.28)]`}
    >
      <div className="relative overflow-hidden bg-zawana-950 px-6 py-5 text-white">
        <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full border border-zawana-gold/25" />

        <div className="relative flex items-start justify-between gap-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-zawana-gold">Zawana control</p>
            <h3 className="mt-1 text-2xl font-black">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-white/50">{subtitle}</p>}
          </div>
          <button
            type="button" aria-label="Close dialog"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="max-h-[78vh] overflow-y-auto p-6">{children}</div>
    </motion.div>
  </motion.div>
}

function ConfirmDelete({
  name,
  onCancel,
  onConfirm
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void
}) {
  return <OpsModal title="Delete record?" subtitle="This cannot be undone." onClose={onCancel}>
    <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
      <b>{name}</b> will be permanently removed.</div>

    <div className="mt-5 flex justify-end gap-2">
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button variant="danger" onClick={onConfirm}>
        <Trash2 size={15} /> Delete</Button>
    </div>
  </OpsModal>
}

function parseSlot(value: string) {
  const v = value.trim();

  const twentyFour = v.match(/^(\d{2}):(\d{2})$/);

  if (twentyFour) {
    const h = Number(twentyFour[1]);
    const min = Number(twentyFour[2]);

    return h >= 0 && h <= 23 && min >= 0 && min <= 59 ? h * 60 + min : NaN;
  }

  const m = v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return NaN;

  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3].toUpperCase();

  if (h < 1 || h > 12 || min > 59) return NaN;

  if (h === 12) h = 0;
  if (ap === 'PM') h += 12;
  return h * 60 + min;
}

function rangeOf(value: string) {
  const parts = value.split(/\s*(?:â€”|â€“|-)\s*/);
  if (parts.length !== 2) return null;
  const a = parseSlot(parts[0]),
    b = parseSlot(parts[1]);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? { start: a, end: b } : null;
}

function slotOverlaps(a: string, b: string) {
  const x = rangeOf(a),
    y = rangeOf(b);
  return !!x && !!y && x.start < y.end && y.start < x.end;
}

const courtSlots = Array.from({ length: 15 }, (_, i) => {
  const h = 6 + i;
  const f = (x: number) => `${x % 12 || 12}:00 ${x >= 12 ? 'PM' : 'AM'}`;
  return `${f(h)} â€” ${f(h + 1)}`
});

const escapeReceiptText = (value: string) =>
  value.replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));

function openReceiptWindow() {
  // Open synchronously from the cashier's click so browsers allow the later
  // print dialog after the sale API has returned.
  return window.open('', '_blank', 'popup,width=420,height=720');
}

async function printReceipt(
  receipt: {
    business: string;
    customer: string;
    items: { name: string; qty: number; price: number }[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paymentMethod: string;
    reference?: string;
    location?: string;
    court?: string;
    staff?: string
  },
  target?: Window | null
) {
  const printWindow = target || window.open('', '_blank', 'popup,width=420,height=720');
  if (!printWindow)
    throw new Error(
      'Sale saved, but the receipt window was blocked. Allow pop-ups for this site and print the receipt again.'
    );
  const doc = printWindow.document;

  const rows = receipt.items
    .map(
      i =>
        `<tr><td>${escapeReceiptText(i.name)}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${(i.price * i.qty).toLocaleString()}</td></tr>`
    )
    .join('');

  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeReceiptText(receipt.business)} Receipt</title><style>@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;width:74mm;margin:0 auto;color:#111;font-size:12px;line-height:1.35}h1{font-size:19px;text-align:center;margin:0 0 2px;letter-spacing:2px}.muted{color:#555;font-size:10px}.center{text-align:center}.rule{border-top:1px dashed #777;margin:7px 0}table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}td:first-child{overflow-wrap:anywhere}.total{font-size:15px;font-weight:800}.no-print{margin-top:16px;width:100%;padding:10px;border:0;border-radius:6px;background:#17152f;color:white;font-weight:bold}@media print{.no-print{display:none}body{width:74mm}}</style></head><body><h1>ZAWANA</h1><div class="center"><b>${escapeReceiptText(receipt.business)}</b></div><p class="muted center">${new Date().toLocaleString()}</p><p>Customer: ${escapeReceiptText(receipt.customer)}</p>${receipt.location ? `<p>Location: ${escapeReceiptText(receipt.location)}</p>` : ''}${receipt.court ? `<p>Court: ${escapeReceiptText(receipt.court)}</p>` : ''}<div class="rule"/><table>${rows}</table><div class="rule"/><table><tr><td>Subtotal</td><td style="text-align:right">${receipt.subtotal.toLocaleString()}</td></tr><tr><td>Discount</td><td style="text-align:right">-${receipt.discount.toLocaleString()}</td></tr><tr><td>Tax</td><td style="text-align:right">${receipt.tax.toLocaleString()}</td></tr><tr class="total"><td>Total</td><td style="text-align:right">${receipt.total.toLocaleString()} MMK</td></tr></table><div class="rule"/><p>Payment: <b>${escapeReceiptText(receipt.paymentMethod)}</b></p>${receipt.reference ? `<p>Receipt: ${escapeReceiptText(receipt.reference)}</p>` : ''}${receipt.staff ? `<p>Served by: ${escapeReceiptText(receipt.staff)}</p>` : ''}<p class="center muted">Thank you for choosing Zawana.</p><button class="no-print" onclick="window.print()">Print receipt</button><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));window.onafterprint=()=>setTimeout(()=>window.close(),500)</script></body></html>`
  );
  doc.close();
}

export default function OperationsPage({ role }: { role: UserRole }) {
  const { pathname } = useLocation();
  const o = useOperations();

  const { user } = useAuth();

  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState('');

  const [cart, setCart] = useState<{ id: string; name: string; price: number; qty: number }[]>([]);

  const [discount, setDiscount] = useState(0);

  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newQty, setNewQty] = useState('10');

  const notify = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(''), 2500)
  };

  useEffect(() => {
    const h = (e: Event) => notify((e as CustomEvent).detail || 'Done');
    window.addEventListener('zawana-toast', h);
    return () => window.removeEventListener('zawana-toast', h)
  }, []);

  const isAdmin = role === 'admin',
    isBad = role === 'badminton_fo',
    isGym = role === 'gym_fo',
    isClinic = role === 'clinic_fo',
    isStore = role === 'store_fo',
    isCafe = role === 'cafe_fo',
    isDoctor = role === 'doctor',
    isCoach = role === 'coach';

  const pathSegments = pathname.split('/').filter(Boolean);

  const view =
    pathSegments.length === 1 &&
    [
      'admin',
      'owner',
      'badminton-fo',
      'gym-fo',
      'clinic-fo',
      'store-fo',
      'cafe',
      'coach',
      'doctor'
    ].includes(pathSegments[0])
      ? 'dashboard'
      : pathSegments.at(-1) || 'dashboard';

  if (notice) {
    /* visible toast below */
  }

  const titleMap: Record<string, string> = {
    dashboard: 'Dashboard',
    'badminton-packages': 'Badminton Package Management',
    'gym-packages': 'Gym Package Management',
    coaches: 'Coach Management',
    courts: 'Court Rental Management',
    students: 'Students',
    finance: 'Finance',
    cms: 'Content Management',
    bookings: 'Court Bookings',
    packages: 'Badminton Packages',
    pos: 'Point of Sale',
    transactions: 'Transactions',
    'check-in': 'Membership Check-In',
    members: 'Members',
    memberships: 'Memberships',
    'private-training': 'Private Training','training': 'Gym Training',
    appointments: 'Appointments',
    patients: 'Patients',
    doctors: 'Doctors',
    schedule: 'Weekly Schedule',
    records: 'Customer Records',
    payments: 'Payments',
    products: 'Products',
    categories: 'Categories',
    inventory: 'Inventory','orders': 'Orders & Pay Later',
    menu: 'Menu','profile': 'Profile','availability': 'Availability',
    clients: 'Customers',
    notifications: 'Notifications'
  };

  let title = titleMap[view] || 'Operations';

  if (isDoctor || isCoach) title = titleMap[view] || 'Professional Dashboard';

  const commonTop = () => <AnimatePresence>{notice && <Toast message={notice} onClose={() => setNotice('')} />}</AnimatePresence>;

  if (view === 'notifications')
    return <Page title={title} eyebrow={role.replace('_', ' ')}>
      <NotificationCenter role={role} />
    </Page>;

  if ((isAdmin || role === 'owner') && view === 'dashboard')
    return <Page
      title="Zawana Business Overview"
      eyebrow={role === 'owner' ? 'Owner · All businesses' : 'Admin'}
    >
      <>
        {commonTop()}
        <DashboardStats />
        <AdminCommandCenter owner={role === 'owner'} />
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <RecentTransactions owner={role === 'owner'} />
          <OperationalAlerts />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(role === 'owner'
            ? [['Finance overview', '/owner/finance']]
            : [
                ['Private course management', '/admin/private-courses'],
                ['Users & roles', '/admin/users'],
                ['Finance overview', '/admin/finance'],
                ['Court operations', '/admin/courts']
              ]
          ).map(([label, to]) =>
            <Link
              key={to}
              to={to}
              className="rounded-2xl border bg-white p-4 text-sm font-bold shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              {label}
              <ArrowRight size={15} className="ml-2 inline" />
            </Link>
          )}
        </div>
      </>
    </Page>;

  if ((isAdmin || role === 'owner') && view === 'finance')
    return <Page title={title} eyebrow="All Businesses">
      <Finance />
    </Page>;

  if (isAdmin && view === 'cms')
    return <Page title={title} eyebrow="Community & Achievements">
      <>
        {commonTop()}
        <CMS notify={notify} />
      </>
    </Page>;

  if (isAdmin && view === 'badminton-packages')
    return <Page title={title} eyebrow="Badminton">
      <>
        {commonTop()}
        <PackageManager
          kind="badminton"
          showForm={showForm}
          setShowForm={setShowForm}
          notify={notify}
        />
      </>
    </Page>;

  if (isAdmin && view === 'gym-packages')
    return <Page title={title} eyebrow="HPC Gym"><GymPackageManager /></Page>;

  if (isAdmin && view === 'coaches')
    return <Page title={title} eyebrow="People & Scheduling">
      <CoachManager />
    </Page>;

  if (isAdmin && view === 'courts')
    return <Page title={title} eyebrow="Badminton">
      <CourtManager />
    </Page>;

  if (isAdmin && view === 'students')
    return <Page title={title} eyebrow="Academy">
      <>
        {commonTop()}
        <StudentManager showForm={showForm} setShowForm={setShowForm} notify={notify} />
      </>
    </Page>;

  if (isBad && view === 'dashboard')
    return <Page title="Badminton Operations" eyebrow="Front Office">
      <FOStats business="badminton" />
      <BookingQueue notify={notify} />
    </Page>;

  if (isBad && view === 'bookings')
    return <Page title={title} eyebrow="Badminton FO">
      <BookingQueue notify={notify} />
    </Page>;

  if (isBad && view === 'courts')
    return <Page title="Court Rental Desk" eyebrow="Badminton FO">
      <>
        {commonTop()}
        <CourtDesk notify={notify} />
      </>
    </Page>;

  if (isBad && view === 'packages')
    return <Page title={title} eyebrow="Badminton FO">
      <BadmintonPackages />
    </Page>;

  if (isBad && view === 'students')
    return <Page title={title} eyebrow="Badminton FO">
      <>
        {commonTop()}
        <StudentManager showForm={showForm} setShowForm={setShowForm} notify={notify} />
      </>
    </Page>;

  if (isBad && view === 'check-in')
    return <Page title={title} eyebrow="Badminton FO">
      <>
        {commonTop()}
        <BadmintonCheckIn notify={notify} />
      </>
    </Page>;

  if (isBad && view === 'transactions')
    return <Page title={title} eyebrow="Badminton FO">
      <Transactions business="Badminton" />
    </Page>;

  if (isBad && view === 'pos')
    return <Page title={title} eyebrow="Badminton FO">
      <>
        {commonTop()}
        <POS
          mode="badminton"
          cart={cart}
          setCart={setCart}
          discount={discount}
          setDiscount={setDiscount}
          notify={notify}
        />
      </>
    </Page>;

  if (isGym && view === 'dashboard')
    return <Page title="HPC Gym Operations" eyebrow="Front Office">
      <FOStats business="gym" />
      <MembershipTable query={query} setQuery={setQuery} notify={notify} />
    </Page>;

  if (isGym && view === 'check-in')
    return <Page title={title} eyebrow="Fast Desk Workflow">
      <GymCheckInWorkflow query={query} setQuery={setQuery} notify={notify} />
    </Page>;

  if (isGym && view === 'members')
    return <Page title={title} eyebrow="Gym FO">
      <MembershipTable query={query} setQuery={setQuery} notify={notify} />
    </Page>;

  if (isGym && view === 'memberships')
    return <Page title={title} eyebrow="Gym FO">
      <GymEnrollments />
    </Page>;

  if (isGym && view === 'private-training')
    return <Page title={title} eyebrow="Gym FO">
      <GymPrivateTraining />
    </Page>;

  if (isGym && view === 'appointments')
    return <Page title={title} eyebrow="Gym FO">
      <AppointmentTable notify={notify} />
    </Page>;

  if (isGym && view === 'coaches')
    return <Page title={title} eyebrow="Gym FO">
      <CoachManager />
    </Page>;

  if (isGym && view === 'payments')
    return <Page title={title} eyebrow="Gym FO">
      <Transactions business="Gym" />
    </Page>;

  if (isClinic && view === 'dashboard')
    return <Page title="Revive Clinic Operations" eyebrow="Front Office">
      <ClinicStats />
      <AppointmentTable notify={notify} />
    </Page>;

  if (isClinic && view === 'appointments')
    return <Page title={title} eyebrow="Revive Clinic">
      <AppointmentTable notify={notify} />
    </Page>;

  if (isClinic && view === 'patients')
    return <Page title={title} eyebrow="Revive Clinic">
      <PatientList query={query} setQuery={setQuery} />
    </Page>;

  if (isClinic && view === 'doctors')
    return <Page title={title} eyebrow="Revive Clinic">
      <DoctorList />
    </Page>;

  if (isClinic && view === 'schedule')
    return <Page title={title} eyebrow="Revive Clinic">
      <ScheduleTable />
    </Page>;

  if (isClinic && view === 'records')
    return <Page title={title} eyebrow="Restricted Medical Records">
      <MedicalRecords />
    </Page>;

  if (isClinic && view === 'payments')
    return <Page title={title} eyebrow="Revive Clinic">
      <Transactions business="Clinic" />
    </Page>;

  if (isStore && view === 'dashboard')
    return <Page title="Lining Store" eyebrow="Retail">
      <StoreStats />
      <StoreOrders notify={notify} />
    </Page>;

  if (isStore && view === 'products')
    return <Page title={title} eyebrow="Retail">
      <ProductManager notify={notify} />
    </Page>;

  if (isStore && view === 'categories')
    return <Page title="Product Categories" eyebrow="Retail">
      <CategoryManager notify={notify} />
    </Page>;

  if (isStore && view === 'inventory')
    return <Page title={title} eyebrow="Retail">
      <Inventory notify={notify} />
    </Page>;

  if (isStore && view === 'orders')
    return <Page title={title} eyebrow="Retail">
      <StoreOrders notify={notify} />
    </Page>;

  if (isStore && view === 'transactions')
    return <Page title={title} eyebrow="Retail">
      <Transactions business="Store" />
    </Page>;

  if (isStore && view === 'pos')
    return <Page title={title} eyebrow="Barcode-ready POS">
      <>
        {commonTop()}
        <POS
          mode="store"
          cart={cart}
          setCart={setCart}
          discount={discount}
          setDiscount={setDiscount}
          notify={notify}
        />
      </>
    </Page>;

  if (isCafe && view === 'dashboard')
    return <Page title="Zawana Cafe" eyebrow="Front Office">
      <CafeStats />
      <CafeOrders notify={notify} />
    </Page>;

  if (isCafe && view === 'orders')
    return <Page title={title} eyebrow="Cafe">
      <CafeOrders notify={notify} />
    </Page>;

  if (isCafe && view === 'menu')
    return <Page title={title} eyebrow="Cafe">
      <CafeMenu />
    </Page>;

  if (isCafe && view === 'pos')
    return <Page title={title} eyebrow="Cafe">
      <>
        {commonTop()}
        <CafePOS notify={notify} />
      </>
    </Page>;

  if (isCafe && view === 'transactions')
    return <Page title={title} eyebrow="Cafe">
      <Transactions business="Cafe" />
    </Page>;

  if ((isDoctor || isCoach) && view === 'dashboard')
    return <Page title={isDoctor ? 'Doctor Dashboard' : 'Coach Dashboard'} eyebrow="Professional Portal">
      <>
        {commonTop()}
        <Professional role={role} />
      </>
    </Page>;

  if (isCoach && view === 'training')
    return <Page title={title} eyebrow="Gym Coach">
      <CoachTraining />
    </Page>;

  if ((isDoctor || isCoach) && view === 'schedule')
    return <Page title={title} eyebrow="Professional Portal">
      <ScheduleTable />
    </Page>;

  if (isDoctor && view === 'appointments')
    return <Page title={title} eyebrow="Doctor Portal">
      <AppointmentTable notify={notify} professional="own" />
    </Page>;

  if (isDoctor && view === 'patients')
    return <Page title={title} eyebrow="Restricted Medical Records">
      <PatientList query={query} setQuery={setQuery} />
    </Page>;

  if (isCoach && view === 'bookings')
    return <Page title={title} eyebrow="Coach Portal">
      <CoachBookings notify={notify} />
    </Page>;

  if (isCoach && view === 'clients')
    return <Page title={title} eyebrow="Coach Portal">
      <CoachClients />
    </Page>;

  if (isCoach && view === 'availability')
    return <Page title={title} eyebrow="Coach Portal">
      <ScheduleTable />
    </Page>;

  if (isDoctor && view === 'profile')
    return <Page title={title} eyebrow="Doctor Portal">
      <ProfileCard name={user?.name || "Doctor"} role="Doctor" />
    </Page>;

  return <Page title={title} eyebrow="Zawana Life">
    <Card className="p-8">
      <p className="text-zawana-500">This workspace is ready for the next workflow.</p>
    </Card>
  </Page>;
}

function BadmintonCheckIn({ notify }: { notify: (s: string) => void }) {
  const o = useOperations();

  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [packages, setPackages] = useState<any[]>([]);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [purchase, setPurchase] = useState(false);
  const [renew, setRenew] = useState(false);
  const [packageId, setPackageId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [purchaseStudentId, setPurchaseStudentId] = useState('');
  const [memberAccounts, setMemberAccounts] = useState<any[]>([]);
  const [actionError, setActionError] = useState('');
  const [customerType, setCustomerType] = useState<'member' | 'walkin'>('member');
  const [walkIn, setWalkIn] = useState({ name: '', phone: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [e, p] = await Promise.all([
        get<any[]>('/badminton/enrollments'),
        get<any[]>('/packages/badminton')
      ]);
      setEnrollments(e);
      setPackages(p);
      if (selected) {
        const next = e.find(x => x.id === selected.id);
        setSelected(next || null)
      }
    } catch (e: any) {
      notify(e.message || 'Could not load package members.')
    } finally {
      setLoading(false)
    }
  };

  useEffect(() => {
    load()
  }, []);

  useEffect(() => {
    if (purchase)
      get<any[]>('/badminton/member-accounts')
        .then(setMemberAccounts)
        .catch((e: any) => setActionError(e.message || 'Could not load member accounts.'))
  }, [purchase]);

  const filtered = enrollments.filter(x =>
    [x.studentName, x.phone, x.packageName].some((v: string) =>
      v.toLowerCase().includes(query.toLowerCase())
    )
  );

  const selectedStudent = memberAccounts.find((m: any) => m.id === purchaseStudentId);

  const current = selected;

  const selectStudent = (id: string) =>
    setSelected(enrollments.find(x => x.studentId === id) || null);

  const buy = async () => {
    setActionError('');
    const member = selectedStudent;
    if (customerType === 'member' && !member) {
      setActionError('Select an existing member account.');
      return }
    if (
      customerType === 'walkin' &&
      (walkIn.name.trim().length < 2 || walkIn.phone.trim().length < 5)
    ) {
      setActionError('Enter the walk-in customer’s name and phone number.');
      return }
    if (!packageId) {
      setActionError('Please select an active badminton package.');
      return }
    setBusy(true);
    try {
      const created = await post<any>('/badminton/enrollments', {
        ...(customerType === 'member'
          ? { userId: member.id }
          : { walkIn: { name: walkIn.name.trim(), phone: walkIn.phone.trim() } }),
        packageId,
        paymentMethod
      });
      notify(`${created.studentName} package activated.`);
      setPurchase(false);
      setPurchaseStudentId('');
      setWalkIn({ name: '', phone: '' });
      setPackageId('');
      await load();
      setSelected(created)
    } catch (e: any) {
      const message = e?.message || 'Could not activate package.';
      setActionError(message);
      notify(message)
    } finally {
      setBusy(false)
    }
  };

  const doRenew = async () => {
    setActionError('');
    if (!current) {
      setActionError('Select a package holder first.');
      return }
    if (!packageId) {
      setActionError('Please select an active badminton package.');
      return }
    setBusy(true);
    try {
      const updated = await post<any>(`/badminton/enrollments/${current.id}/renew`, {
        packageId,
        startDate: today,
        paymentMethod
      });
      notify(`${current.studentName} package renewed.`);
      setRenew(false);
      await load();
      setSelected(updated)
    } catch (e: any) {
      const message = e?.message || 'Could not renew package.';
      setActionError(message);
      notify(message)
    } finally {
      setBusy(false)
    }
  };

  const checkIn = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const r = await post<any>('/badminton/check-ins', { enrollmentId: current.id });
      notify(
        r.warning
          ? `${current.studentName} checked in. Only ${r.enrollment.sessionsRemaining} sessions remain.`
          : `${current.studentName} checked in successfully.`
      );
      await load();
      setSelected((x: any) =>
        x
          ? {
              ...x,
              sessionsRemaining: r.enrollment.sessionsRemaining,
              lastCheckIn: r.enrollment.lastCheckIn
            }
          : x
      )
    } catch (e: any) {
      notify(e.message || 'Check-in denied.')
    } finally {
      setBusy(false)
    }
  };

  const expired = current && (current.status === 'expired' || current.expiryDate < today);
  const low = current && !expired && Number(current.sessionsRemaining) <= 2;

  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat
        label="Active package holders"
        value={
          enrollments.filter(
            x => x.status === 'active' && x.expiryDate >= today && x.sessionsRemaining > 0
          ).length
        }
      />
      <Stat
        label="Low sessions"
        value={
          enrollments.filter(
            x => x.status === 'active' && x.expiryDate >= today && x.sessionsRemaining <= 2
          ).length
        }
        sub="2 or fewer remaining"
      />
      <Stat
        label="Expired / exhausted"
        value={
          enrollments.filter(
            x => x.status !== 'active' || x.expiryDate < today || x.sessionsRemaining <= 0
          ).length
        }
      />
    </div>

    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">Package members</p>
            <h2 className="mt-1 text-xl font-black">Check-in desk</h2>
          </div>
          <Button
            className="px-3 py-2"
            onClick={() => {
              setActionError('');
              setPurchase(true);
              setPurchaseStudentId('');
              setWalkIn({ name: '', phone: '' });
              setCustomerType('member');
              setPackageId(packages.find((p: any) => p.status === 'active')?.id || '');
              setPaymentMethod('Cash')
            }}
          >
            <PackagePlus size={15} /> Activate package</Button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border px-3 py-2">
          <Search size={16} className="text-zawana-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search student / phone"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div className="mt-4 space-y-2">
          {loading ?
            <p className="p-5 text-sm text-zawana-500">Loading...</p> :
            filtered.map(x =>
              <button
                key={x.id}
                onClick={() => setSelected(x)}
                className={`w-full rounded-2xl border p-4 text-left ${current?.id === x.id ? 'border-zawana-gold bg-zawana-gold/10' : 'border-zawana-950/8'}`}
              >
                <div className="flex items-center justify-between">
                  <b>{x.studentName}</b>
                  <span
                    className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${x.status === 'active' && x.expiryDate >= today && x.sessionsRemaining > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {x.status === 'active' && x.expiryDate >= today && x.sessionsRemaining > 0
                      ? 'ACTIVE'
                      : 'BLOCKED'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zawana-500">
                  {x.phone} · {x.packageName}
                </p>
                <div className="mt-3 flex justify-between text-xs">
                  <span>
                    {x.sessionsRemaining}/{x.sessionsTotal} sessions</span>
                  <span>Expires {x.expiryDate}</span>
                </div>
              </button>
          )}
          {!filtered.length &&
            <Empty
              title="No package holder"
              body="Sell a package to a student or search another name."
            />}
        </div>
      </Card>

      <div className="space-y-6">
        {!current ?
          <Card className="grid min-h-[360px] place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-zawana-gold/15">
                <UserPlus size={26} />
              </div>
              <h2 className="mt-4 text-2xl font-black">Select a package holder</h2>
              <p className="mt-2 max-w-md text-sm text-zawana-500">Check eligibility before allowing the student onto the court or into a package session.</p>
            </div>
          </Card> :
          <>
            <Card
              className={`overflow-hidden p-0 ${expired || Number(current.sessionsRemaining) <= 0 ? 'border-2 border-red-500' : ''}`}
            >
              <div
                className={`p-6 text-white ${expired || Number(current.sessionsRemaining) <= 0 ? 'bg-red-600' : 'bg-zawana-950'}`}
              >
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-white/60">Selected student</p>
                    <h2 className="mt-1 text-3xl font-black">{current.studentName}</h2>
                    <p className="mt-1 text-sm text-white/60">
                      {current.phone} · {current.packageName}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setActionError('');
                        setRenew(true);
                        setPackageId(current.packageId)
                      }}
                    >
                      <RotateCcw size={15} /> Renew</Button>
                    <Button
                      disabled={busy || !!expired || Number(current.sessionsRemaining) <= 0}
                      onClick={checkIn}
                    >
                      <Check size={16} /> Check in</Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-6 md:grid-cols-4">
                <div className="rounded-2xl bg-zawana-950/4 p-4">
                  <p className="text-xs text-zawana-500">Sessions remaining</p>
                  <b className="mt-1 block text-2xl">
                    {current.sessionsRemaining}
                    <span className="text-sm font-normal"> / {current.sessionsTotal}</span>
                  </b>
                </div>
                <div className="rounded-2xl bg-zawana-950/4 p-4">
                  <p className="text-xs text-zawana-500">Valid until</p>
                  <b className="mt-1 block">{current.expiryDate}</b>
                </div>
                <div className="rounded-2xl bg-zawana-950/4 p-4">
                  <p className="text-xs text-zawana-500">Started</p>
                  <b className="mt-1 block">{current.startDate}</b>
                </div>
                <div
                  className={`rounded-2xl p-4 ${expired || Number(current.sessionsRemaining) <= 0 ? 'bg-red-50 text-red-700' : low ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}
                >
                  <p className="text-xs opacity-70">Access status</p>
                  <b className="mt-1 block">
                    {expired
                      ? 'EXPIRED'
                      : Number(current.sessionsRemaining) <= 0
                        ? 'NO SESSIONS'
                        : low
                          ? 'LOW SESSIONS'
                          : 'READY TO CHECK IN'}
                  </b>
                </div>
              </div>

              {(expired || Number(current.sessionsRemaining) <= 0) &&
                <div className="mx-6 mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <b>Check-in blocked.</b> {expired
                    ? 'This package has expired.'
                    : 'This package has no sessions remaining.'} Renew the package before the student can join.</div>}

              {low && !expired && Number(current.sessionsRemaining) > 0 &&
                <div className="mx-6 mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <b>Low-session warning.</b> Only {current.sessionsRemaining} session{Number(current.sessionsRemaining) === 1 ? '' : 's'} remain. Consider renewing after this visit.</div>}
            </Card>
          </>}
      </div>
    </div>

    <AnimatePresence>{(purchase || renew) &&
      <OpsModal
        title={purchase ? 'Activate badminton package' : 'Renew badminton package'}
        subtitle={
          purchase
            ? 'Start package access for an online or walk-in member.'
            : 'Replace the current entitlement with a fresh package term.'
        }
        onClose={() => {
          if (!busy) {
            setPurchase(false);
            setRenew(false);
            setActionError('')
          }
        }}
      >
        <div className="grid gap-4">
          {purchase &&
            <>
              <div className="grid grid-cols-2 rounded-xl bg-zawana-950/5 p-1">
                <button
                  className={`rounded-lg px-3 py-2 text-sm font-bold ${customerType === 'member' ? 'bg-white shadow' : ''}`}
                  onClick={() => setCustomerType('member')}
                >Member account</button>
                <button
                  className={`rounded-lg px-3 py-2 text-sm font-bold ${customerType === 'walkin' ? 'bg-white shadow' : ''}`}
                  onClick={() => setCustomerType('walkin')}
                >Walk-in</button>
              </div>
              {customerType === 'member' ?
                <Select
                  className="rounded-xl border p-3"
                  value={purchaseStudentId}
                  onChange={e => {
                    setPurchaseStudentId(e.target.value);
                    setActionError('')
                  }}
                >
                  <option value="">Select member account</option>
                  {memberAccounts.map((m: any) =>
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.email}
                    </option>
                  )}
                </Select> :
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold">Customer name<input
                      className="mt-1 w-full"
                      value={walkIn.name}
                      onChange={e => setWalkIn({ ...walkIn, name: e.target.value })}
                      placeholder="Name"
                    />
                  </label>
                  <label className="text-xs font-bold">Phone<input
                      className="mt-1 w-full"
                      value={walkIn.phone}
                      onChange={e => setWalkIn({ ...walkIn, phone: e.target.value })}
                      placeholder="09…"
                      inputMode="tel"
                    />
                  </label>
                </div>}
            </>}
          <Select
            className="rounded-xl border p-3"
            value={packageId}
            onChange={e => {
              setPackageId(e.target.value);
              setActionError('')
            }}
          >
            <option value="">Select active package</option>
            {packages
              .filter(p => p.status === 'active')
              .map(p =>
                <option key={p.id} value={p.id}>
                  {p.title} · {p.sessions} sessions · {p.validity} days · {money(p.price)}
                </option>
              )}
          </Select>
          <div className="rounded-xl border bg-zawana-950/[.02] p-3 text-sm">
            <b>Front-desk sale · Cash</b>
            <p className="mt-1 text-xs text-zawana-500">Activation, check-in access and a finance transaction are recorded immediately.</p>
          </div>
          {purchase && customerType === 'member' && !memberAccounts.length &&
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <b>No member accounts found.</b> You can still activate a walk-in package.</p>}
          {!packages.filter(p => p.status === 'active').length &&
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <b>No active packages.</b> Create or activate a badminton package in Admin Package Management.</p>}
          {actionError &&
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
              <b>Activation failed:</b> {actionError}
            </div>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setPurchase(false);
              setRenew(false);
              setActionError('')
            }}
          >Cancel</Button>
          <Button
            disabled={
              busy ||
              !packageId ||
              (purchase && customerType === 'member' && !selectedStudent) ||
              (purchase &&
                customerType === 'walkin' &&
                (walkIn.name.trim().length < 2 || walkIn.phone.trim().length < 5)) ||
              (!purchase && !current)
            }
            onClick={purchase ? buy : doRenew}
          >
            {busy
              ?(purchase
                ? 'Activating…'
                : 'Renewing…'):(purchase
                ? 'Activate package'
                : 'Renew package')}
          </Button>
        </div>
      </OpsModal>}</AnimatePresence>
  </div>;
}

function DashboardStats() {
  const o = useOperations();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState('');
  useEffect(() => {
    get<any>('/dashboard')
      .then(setData)
      .catch((e: any) => setError(e.message || 'Could not load business overview.'))
  }, []);
  return <>
    {error &&
      <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>}
    {o.loading && !data ?
      <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map(x =>
          <Card key={x} className="h-28 bg-zawana-950/5" />
        )}
      </div> :
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Today's revenue" value={money(data?.revenue || 0)} />
        <Stat label="Members" value={data?.members ?? '—'} />
        <Stat label="Bookings today" value={data?.bookingsToday ?? '—'} />
        <Stat label="Courts available" value={data?.activeCourts ?? '—'} />
        <Stat label="Active coaches" value={data?.coaches ?? '—'} />
      </div>}
  </>
}

function AdminCommandCenter({ owner = false }: { owner?: boolean }) {
  const o = useOperations();
  const booked = o.courtBookings.filter(b => b.date === today && b.status !== 'cancelled');
  const capacity = Math.max(1, o.managedCourts.filter(c => c.status === 'available').length * 15);
  const utilization = Math.min(100, Math.round((booked.length / capacity) * 100));
  const hours = [8, 12, 16, 18, 20];
  const startHour = (v: string) => {
    const m = String(v || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return -1;
    let h = +m[1];
    if (h === 12) h = 0;
    if (m[3].toUpperCase() === 'PM') h += 12;
    return h
  };
  const counts = hours.map(
    hour => booked.filter(b => startHour(b.time) <= hour && startHour(b.time) + 1 > hour).length
  );
  const max = Math.max(1, o.managedCourts.length);
  return <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_.75fr]">
    <Card className="overflow-hidden p-0">
      <div className="relative bg-zawana-950 p-6 text-white">
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.22em] text-zawana-gold">Live facility map</p>
            <h2 className="mt-1 text-xl font-black">Court floor · today</h2>
            <p className="mt-1 text-xs text-white/50">Current bookings against each court’s daily capacity.</p>
          </div>
          <Link
            to={owner ? "/owner" : "/admin/courts"}
            className="rounded-full bg-white/10 px-3 py-2 text-xs font-black hover:bg-white/15"
          >
            {owner ? "Overview" : "Manage courts"} <ArrowRight size={13} className="inline" />
          </Link>
        </div>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {o.managedCourts.map(c => {
          const count = booked.filter(b => b.court === c.name).length;
          return <div
            key={c.id}
            className="relative overflow-hidden rounded-2xl border border-zawana-950/8 p-4"
          >
            <div
              className={`absolute inset-y-0 left-0 w-1 ${c.status === 'available' ? 'bg-zawana-gold' : c.status === 'maintenance' ? 'bg-red-400' : 'bg-zawana-700'}`}
            />
            <div className="ml-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-black">{c.name}</p>
                <p className="mt-1 text-[10px] text-zawana-500">
                  {c.type} · {money(c.price)} / 60m · {count} booked</p>
              </div>
              <Badge good={c.status === 'available'}>{c.status}</Badge>
            </div>
            <div className="ml-2 mt-3 h-2 overflow-hidden rounded-full bg-zawana-900">
              <div
                className="h-full rounded-full bg-zawana-gold"
                style={{ width: `${Math.min(100, Math.round(count / 15 * 100))}%` }}
              />
            </div>
          </div>
        })}
      </div>
    </Card>

    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-zawana-gold">Capacity pulse</p>
          <h2 className="mt-1 text-xl font-black">Today’s utilization</h2>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-full border-4 border-zawana-gold text-xs font-black">
          {utilization}%</div>
      </div>
      <div className="mt-8 flex h-40 items-end gap-2">
        {hours.map((hour, i) =>
          <div
            key={hour}
            className="flex h-full flex-1 flex-col justify-end rounded-t-xl bg-zawana-950/5"
          >
            <div
              title={`${counts[i]} court bookings at ${hour}:00`}
              className="rounded-t-xl bg-zawana-gold transition-all"
              style={{ height: counts[i] ? `${Math.max(8,counts[i] / max * 100)}%` : "2px" }}
            />
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-between text-[10px] font-bold text-zawana-500">
        {hours.map(hour =>
          <span key={hour}>{String(hour).padStart(2, '0')}</span>)}
      </div>
      <div className="mt-6 rounded-2xl bg-zawana-900 p-4">
        <div className="flex items-center gap-3">
          <UsersRound size={17} />
          <div>
            <p className="text-sm font-black">Badminton coaches</p>
            <p className="text-xs text-zawana-500">
              {
                o.coaches.filter(
                  c => c.status === 'active' && c.specialty.toLowerCase().includes('badminton')
                ).length
              } active coach profiles linked to bookings.</p>
          </div>
        </div>
      </div>
    </Card>
  </div>
}

function RecentTransactions({ owner = false }: { owner?: boolean }) {
  const o = useOperations();
  return <Card className="p-6">
    <div className="mb-4 flex items-center justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">Finance</p>
        <h2 className="text-xl font-black">Recent transactions</h2>
      </div>
      <Link className="text-sm font-bold" to={owner ? "/owner/finance" : "/admin/finance"}>View finance <ArrowRight size={14} className="inline" />
      </Link>
    </div>
    {o.transactions.slice(0, 5).map(t =>
      <div key={t.id} className="flex items-center justify-between border-t py-3">
        <div>
          <b>{t.item}</b>
          <p className="text-xs text-zawana-500">
            {t.customer} · {t.business}
          </p>
        </div>
        <b>{money(t.finalAmount)}</b>
      </div>
    )}
  </Card>
}

function OperationalAlerts() {
  const o = useOperations();
  return <Card className="p-6">
    <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">Operations</p>
    <h2 className="mb-4 text-xl font-black">Alerts</h2>
    {o.products
      .filter(p => p.stock <= 5)
      .map(p =>
        <div key={p.id} className="mb-2 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">Low stock · {p.name} ({p.stock})</div>)}
    {o.courtBookings
      .filter(b => b.status === 'pending')
      .map(b =>
        <div key={b.id} className="mb-2 rounded-xl bg-zawana-gold/10 p-3 text-sm font-bold">Pending court booking · {b.customer}
        </div>)}
    {!o.products.some(p => p.stock <= 5) &&
      !o.courtBookings.some(b => b.status === 'pending') &&
        <Empty title="No operational alerts" body="Everything is up to date." />}
  </Card>
}

function FOStats({ business }: { business: string }) {
  const o = useOperations();
  const badminton = business === 'badminton';
  const [data, setData] = useState<any>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (badminton)
      get<any>('/dashboard')
        .then(setData)
        .catch((e: any) => setError(e.message || 'Could not load Badminton operations.'))
  }, [badminton]);
  const rev = o.transactions
    .filter(
      t =>
        t.date === today &&
        t.business.toLowerCase() === business.toLowerCase() &&
        t.status === 'paid'
    )
    .reduce((a, t) => a + t.finalAmount, 0);
  const active = o.memberships.filter(m => m.status === 'active').length;
  const count = o.memberships.filter(m => m.status === 'pending').length;
  if (badminton)
    return <div className="mb-6">
      {error &&
        <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>}
      {!data ?
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map(n =>
            <Card key={n} className="h-24 bg-zawana-950/5" />
          )}
        </div> :
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Today's revenue" value={money(data.revenueToday)} />
            <Stat label="Today's bookings" value={data.bookingsToday} />
            <Stat label="Upcoming bookings" value={data.bookingsUpcoming} />
            <Stat
              label="Active packages"
              value={data.activePackages}
              sub={`${data.walkIns} walk-in customers`}
            />
            <Stat
              label="Today's check-ins"
              value={data.checkInsToday}
              sub={`${data.availableCourts} courts currently available`}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/badminton-fo/check-in">
              <Button>
                <PackagePlus size={15} /> Activate package</Button>
            </Link>
            <Link to="/badminton-fo/courts">
              <Button variant="secondary">
                <CalendarDays size={15} /> Court availability</Button>
            </Link>
            <Link to="/badminton-fo/bookings">
              <Button variant="secondary">All court bookings</Button>
            </Link>
          </div>
        </>}
    </div>;
  return <div className="mb-6 grid gap-4 sm:grid-cols-3">
    <Stat label="Today's revenue" value={money(rev)} />
    <Stat label="Pending memberships" value={count} />
    <Stat label="Active memberships" value={active} />
  </div>
}

function ClinicStats() {
  const o = useOperations();
  return <div className="mb-6 grid gap-4 sm:grid-cols-4">
    <Stat label="Today appointments" value={o.metrics.appointmentsToday} />
    <Stat
      label="Pending confirmation"
      value={o.appointments.filter(a => a.status === 'pending').length}
    />
    <Stat
      label="Checked in"
      value={o.appointments.filter(a => a.status === 'checked_in').length}
    />
    <Stat
      label="Doctors"
      value={new Set(o.schedules.filter(s => s.role === 'doctor').map(s => s.person)).size}
    />
  </div>
}

function StoreStats() {
  const o = useOperations();
  return <div className="mb-6 grid gap-4 sm:grid-cols-4">
    <Stat label="Products" value={o.products.length} />
    <Stat label="Low stock" value={o.metrics.lowStock} />
    <Stat label="Orders" value={o.storeOrders.length} />
    <Stat
      label="Revenue"
      value={money(
        o.transactions.filter(t => t.business === 'Store').reduce((a, t) => a + t.finalAmount, 0)
      )}
    />
  </div>
}

function CafeStats() {
  const o = useOperations();
  return <div className="mb-6 grid gap-4 sm:grid-cols-4">
    <Stat
      label="Open orders"
      value={
        o.cafeOrders.filter(
          x => !['COMPLETED', 'CANCELLED', 'completed', 'cancelled'].includes(x.status)
        ).length
      }
    />
    <Stat
      label="Paid sales"
      value={money(
        o.transactions
          .filter(t => t.business === 'Cafe' && t.status === 'paid')
          .reduce((a, t) => a + t.finalAmount, 0)
      )}
    />
    <Stat
      label="Unpaid orders"
      value={o.cafeOrders.filter(x => x.paymentStatus === 'pending').length}
    />
    <Stat
      label="Completed"
      value={
        o.cafeOrders.filter(x => x.status === 'COMPLETED' || x.status === 'completed').length
      }
    />
  </div>
}

function BookingQueue({ notify }: { notify: (s: string) => void }) {
  const o = useOperations();
  const [rows, setRows] = useState<any[]>([]),
    [page, setPage] = useState(1),
    [pageInfo, setPageInfo] = useState<any>({ total: 0, totalPages: 0 }),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const [filters, setFilters] = useState({
    q: '',
    from: '',
    to: '',
    status: '',
    paymentStatus: '',
    courtId: '',
    timeFrom: '',
    timeTo: ''
  });
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        const params = new URLSearchParams({ page: String(page), limit: '20', kind: 'court' });
        for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
        get<any>(`/bookings?${params}`)
          .then(r => {
            setRows(
              (r.data || []).map((b: any) => ({
                ...b,
                customer:
                  b.user?.name ||
                  (() => {
                    try {
                      return JSON.parse(b.meta || '{}').customerName || 'Walk-in'
                    } catch {
                      return 'Walk-in'
                    }
                  })(),
                court: b.court?.name || b.location
              }))
            );
            setPageInfo(r.pagination || { total: 0, totalPages: 0 });
            setError('')
          })
          .catch((e: any) => setError(e.message || 'Could not load court bookings.'))
      },
      filters.q ? 250 : 0
    );
    return () => window.clearTimeout(timer)
  }, [page, filters]);
  const setFilter = (key: string, value: string) => {
    setPage(1);
    setFilters(f => ({ ...f, [key]: value }))
  };
  const update = async (b: any, status: 'cancelled' | 'completed') => {
    setBusy(b.id);
    setError('');
    try {
      await o.updateCourtBooking(b.id, status);
      notify(`Booking ${status}.`);
      const params = new URLSearchParams({ page: String(page), limit: '20', kind: 'court' });
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      const r = await get<any>(`/bookings?${params}`);
      setRows(r.data || []);
      setPageInfo(r.pagination)
    } catch (e: any) {
      setError(e.message || 'Could not update booking.')
    } finally {
      setBusy('')
    }
  };
  return <div>
    <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <input
        aria-label="Search bookings"
        className="rounded-xl border p-3"
        placeholder="Search member, booking, court"
        value={filters.q}
        onChange={e => setFilter('q', e.target.value)}
      />
      <Select
        aria-label="Status"
        className="rounded-xl border p-3"
        value={filters.status}
        onChange={e => setFilter('status', e.target.value)}
      >
        <option value="">All statuses</option>
        {[
          'CONFIRMED',
          'COMPLETED',
          'CANCELLED',
          'PENDING_COACH_CONFIRMATION',
          'AWAITING_PAYMENT'
        ].map(s =>
          <option key={s} value={s}>
            {s.replaceAll('_', ' ')}
          </option>
        )}
      </Select>
      <Select
        aria-label="Payment status"
        className="rounded-xl border p-3"
        value={filters.paymentStatus}
        onChange={e => setFilter('paymentStatus', e.target.value)}
      >
        <option value="">All payment statuses</option>
        {['paid', 'pending', 'refunded'].map(s =>
          <option key={s} value={s}>
            {s}
          </option>
        )}
      </Select>
      <Select
        aria-label="Court"
        className="rounded-xl border p-3"
        value={filters.courtId}
        onChange={e => setFilter('courtId', e.target.value)}
      >
        <option value="">All courts</option>
        {o.managedCourts.map(c =>
          <option key={c.id} value={c.id}>
            {c.name}
          </option>)}
      </Select>
      <input
        aria-label="Specific date"
        type="date"
        className="rounded-xl border p-3"
        value={filters.from && filters.from === filters.to ? filters.from : ''}
        onChange={e => {
          setPage(1);
          setFilters(f => ({ ...f, from: e.target.value, to: e.target.value }))
        }}
      />
      <input
        aria-label="From date"
        type="date"
        className="rounded-xl border p-3"
        value={filters.from}
        onChange={e => setFilter('from', e.target.value)}
      />
      <input
        aria-label="To date"
        type="date"
        className="rounded-xl border p-3"
        value={filters.to}
        onChange={e => setFilter('to', e.target.value)}
      />
      <input
        aria-label="Time from"
        type="time"
        className="rounded-xl border p-3"
        value={filters.timeFrom}
        onChange={e => setFilter('timeFrom', e.target.value)}
      />
      <input
        aria-label="Time to"
        type="time"
        className="rounded-xl border p-3"
        value={filters.timeTo}
        onChange={e => setFilter('timeTo', e.target.value)}
      />
    </div>
    {error &&
      <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>}
    <div className="hidden md:block">
      <Table
        headers={['Customer', 'Court', 'Date', 'Time', 'Price', 'Payment', 'Status', 'Action']}
      >
        {rows.map(b =>
          <tr key={b.id}>
            <Cell>
              <b>{b.customer}</b>
              <p className="text-xs text-zawana-500">{b.code || b.id}</p>
            </Cell>
            <Cell>{b.court}</Cell>
            <Cell>{b.date}</Cell>
            <Cell>{b.time}</Cell>
            <Cell>{money(b.price)}</Cell>
            <Cell>
              <Badge>{b.paymentStatus}</Badge>
            </Cell>
            <Cell>
              <Badge>{String(b.status).replaceAll('_', ' ')}</Badge>
            </Cell>
            <Cell>
              <div className="flex gap-2">
                {b.status !== 'CANCELLED' && b.status !== 'COMPLETED' &&
                  <Button
                    variant="danger"
                    className="px-3 py-2"
                    disabled={busy === b.id}
                    onClick={() => void update(b, 'cancelled')}
                  >Cancel</Button>}
                {b.status === 'CONFIRMED' && b.date <= today &&
                  <Button
                    variant="secondary"
                    className="px-3 py-2"
                    disabled={busy === b.id}
                    onClick={() => void update(b, 'completed')}
                  >Complete</Button>}
              </div>
            </Cell>
          </tr>
        )}
      </Table>
    </div>
    <div className="space-y-3 md:hidden">
      {rows.map(b =>
        <Card key={b.id} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <b>{b.customer}</b>
              <p className="text-xs text-zawana-500">{b.code || b.id}</p>
            </div>
            <Badge>{String(b.status).replaceAll('_', ' ')}</Badge>
          </div>
          <p className="mt-3 text-sm font-bold">
            {b.court} · {b.time}
          </p>
          <p className="mt-1 text-xs text-zawana-500">
            {b.date} · {money(b.price)} · {b.paymentStatus}
          </p>
          <div className="mt-3 flex gap-2">
            {b.status !== 'CANCELLED' && b.status !== 'COMPLETED' &&
              <Button
                variant="danger"
                className="min-h-11 px-4"
                disabled={busy === b.id}
                onClick={() => void update(b, 'cancelled')}
              >Cancel</Button>}
            {b.status === 'CONFIRMED' && b.date <= today &&
              <Button
                variant="secondary"
                className="min-h-11 px-4"
                disabled={busy === b.id}
                onClick={() => void update(b, 'completed')}
              >Complete</Button>}
          </div>
        </Card>)}
    </div>
    {!rows.length && !error &&
      <div className="mt-4">
        <Empty title="No matching court bookings" body="Try changing the search or filters." />
      </div>}
    <Pagination
      page={page}
      totalPages={pageInfo.totalPages || 0}
      total={pageInfo.total || 0}
      onPage={setPage}
    />
  </div>
}

function BadmintonPackages() {
  const o = useOperations();
  const [purchases, setPurchases] = useState<any[]>([]);

  const refreshPurchases = () =>
    get<any[]>('/badminton/package-purchases')
      .then(setPurchases)
      .catch(() => setPurchases([]));

  useEffect(() => {
    void refreshPurchases()
  }, []);

  return <div className="space-y-6">
    {purchases.length > 0 &&
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-black">Legacy pending purchase records</h2>
          <p className="text-sm text-zawana-500">These requests were created before immediate package activation. They remain in history and cannot be manually approved.</p>
        </div>
        <Table headers={['Member', 'Package', 'Requested', 'Amount', 'Status']}>
          {purchases.map(p =>
            <tr key={p.id}>
              <Cell>
                <b>{p.user.name}</b>
                <p className="text-xs text-zawana-500">{p.user.email}</p>
              </Cell>
              <Cell>
                {p.packageName}
                <p className="text-xs text-zawana-500">{p.code}</p>
              </Cell>
              <Cell>{new Date(p.createdAt).toLocaleDateString()}</Cell>
              <Cell>{money(p.price)}</Cell>
              <Cell>
                <Badge>Legacy request</Badge>
              </Cell>
            </tr>
          )}
        </Table>
      </section>}

    <Table
      headers={[
        'Package',
        'Schedule rules',
        'Sessions',
        'Validity',
        'Price',
        'Status',
        'Actions'
      ]}
    >
      {o.badmintonPackages.map((p: any) =>
        <tr key={p.id}>
          <Cell>
            <b>{p.title}</b>
            <p className="text-xs text-zawana-500">{p.description}</p>
          </Cell>
          <Cell>
            <p className="text-xs text-zawana-500">
              {p.availableFrom && p.availableUntil
                ? `${p.availableFrom}–${p.availableUntil} · `
                : ''}
              {p.scheduleNotes || 'Any schedule'}
              {p.courtRules ? ` · ${p.courtRules}` : ''}
            </p>
          </Cell>
          <Cell>{p.sessions}</Cell>
          <Cell>{p.validity} days</Cell>
          <Cell>{money(p.price)}</Cell>
          <Cell>
            <Badge good={p.status === 'active'}>
              {p.status === 'coming_soon' ? 'Coming Soon' : p.status}
            </Badge>
          </Cell>
          <Cell>
            <div className="flex gap-2">
              <PackageEdit item={p} kind="badminton" />
              <PackageDelete id={p.id} name={p.title} kind="badminton" />
            </div>
          </Cell>
        </tr>
      )}
    </Table>
  </div>
}

function PackageEdit({ item, kind }: { item: any; kind: 'badminton' | 'gym' }) {
  const o = useOperations();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    ...item,
    benefits: Array.isArray(item.benefits) ? item.benefits.join(', ') : item.benefits || ''
  });
  const save = async () => {
    try {
      if (kind === 'badminton')
        await o.updateBadmintonPackage(item.id, {
          title: form.title,
          price: +form.price,
          sessions: +form.sessions,
          validity: +form.validity,
          description: form.description,
          status: form.status
        });
      else
        await o.updateGymPackage(item.id, {
          title: form.title,
          price: +form.price,
          duration: +form.duration,
          sessions: +form.sessions,
          description: form.description,
          benefits: String(form.benefits)
            .split(',')
            .map((x: string) => x.trim())
            .filter(Boolean),
          status: form.status
        });
      window.dispatchEvent(
        new CustomEvent('zawana-toast', {
          detail: `${kind === 'badminton' ? 'Badminton' : 'Gym'} package updated.`
        })
      );
      setOpen(false)
    } catch (e: any) {
      window.dispatchEvent(
        new CustomEvent('zawana-toast', { detail: e.message || 'Update failed.' })
      )
    }
  };
  return <>
    {/* eslint-disable-next-line */}
    <button
      className="rounded-xl p-2 hover:bg-zawana-900"
      onClick={() => setOpen(true)}
      title="Edit"
    >
      <Edit3 size={15} />
    </button>
    <AnimatePresence>{open &&
      <OpsModal
        title={`Edit ${kind} package`}
        subtitle="Update pricing, sessions, validity and status."
        onClose={() => setOpen(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label>Title<input
              value={form.title || ''}
              onChange={e => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>Price<input
              type="number"
              value={form.price ?? ''}
              onChange={e => setForm({ ...form, price: e.target.value })}
            />
          </label>
          {kind === 'badminton' ?
            <>
              <label>Sessions<input
                  type="number"
                  value={form.sessions ?? ''}
                  onChange={e => setForm({ ...form, sessions: e.target.value })}
                />
              </label>
              <label>Validity days<input
                  type="number"
                  value={form.validity ?? ''}
                  onChange={e => setForm({ ...form, validity: e.target.value })}
                />
              </label>
            </> :
            <>
              <label>Duration days<input
                  type="number"
                  value={form.duration ?? ''}
                  onChange={e => setForm({ ...form, duration: e.target.value })}
                />
              </label>
              <label>Included sessions<input
                  type="number"
                  min={1}
                  value={form.sessions ?? ''}
                  onChange={e => setForm({ ...form, sessions: e.target.value })}
                />
              </label>
              <label className="md:col-span-2">Benefits<input
                  value={form.benefits || ''}
                  onChange={e => setForm({ ...form, benefits: e.target.value })}
                />
              </label>
            </>}
          <label className="md:col-span-2">Description<textarea
              value={form.description || ''}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label>Status<Select
              value={form.status || 'active'}
              onChange={e => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Active</option>
              {kind === 'badminton' && <option value="coming_soon">Coming Soon</option>}
              <option value="inactive">Inactive</option>
            </Select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save}>
            <Check size={15} /> Save changes</Button>
        </div>
      </OpsModal>}</AnimatePresence>
  </>
}

function PackageDelete({
  id,
  name,
  kind
}: {
  id: string;
  name: string;
  kind: 'badminton' | 'gym'
}) {
  const o = useOperations();
  const [open, setOpen] = useState(false);
  const remove = async () => {
    try {
      if (kind === 'badminton') await o.deleteBadmintonPackage(id);
      else await o.deleteGymPackage(id);
      window.dispatchEvent(new CustomEvent('zawana-toast', { detail: `${name} deleted.` }));
      setOpen(false)
    } catch (e: any) {
      window.dispatchEvent(
        new CustomEvent('zawana-toast', { detail: e.message || 'Delete failed.' })
      )
    }
  };
  return <>
    {
      <button
        className="rounded-xl p-2 text-red-600 hover:bg-red-50"
        onClick={() => setOpen(true)}
        title="Delete"
      >
        <Trash2 size={15} />
      </button>
    }
    <AnimatePresence>{open && <ConfirmDelete name={name} onCancel={() => setOpen(false)} onConfirm={remove} />}</AnimatePresence>
  </>
}

function PackageManager({
  kind,
  showForm,
  setShowForm,
  notify
}: {
  kind: 'badminton' | 'gym';
  showForm: boolean;
  setShowForm: (x: boolean) => void;
  notify: (s: string) => void
}) {
  const o = useOperations();
  const [name, setName] = useState(''),
    [price, setPrice] = useState(''),
    [number, setNumber] = useState('30'),
    [gymSessions, setGymSessions] = useState('12'),
    [validity, setValidity] = useState('60'),
    [description, setDescription] = useState(''),
    [benefits, setBenefits] = useState('Gym access'),
    [availableDays, setAvailableDays] = useState<string[]>([]),
    [availableFrom, setAvailableFrom] = useState(''),
    [availableUntil, setAvailableUntil] = useState(''),
    [scheduleNotes, setScheduleNotes] = useState(''),
    [courtRules, setCourtRules] = useState(''),
    [imageUrl, setImageUrl] = useState('');

  const save = async () => {
    if (!name.trim() || !price) {
      notify('Please enter a package title and price.');
      return }
    try {
      if (kind === 'badminton')
        await o.addBadmintonPackage({
          title: name,
          price: +price,
          sessions: +number,
          validity: +validity,
          description: description || 'Custom package',
          status: 'active',
          availableDays,
          availableFrom: availableFrom || null,
          availableUntil: availableUntil || null,
          scheduleNotes: scheduleNotes || null,
          courtRules: courtRules || null,
          imageUrl: imageUrl || null
        });
      else
        await o.addGymPackage({
          title: name,
          price: +price,
          duration: +number,
          sessions: +gymSessions,
          description: description || 'Custom gym package',
          benefits: benefits
            .split(',')
            .map(x => x.trim())
            .filter(Boolean),
          status: 'active'
        });
      setName('');
      setPrice('');
      setNumber('30');
      setGymSessions('12');
      setValidity('60');
      setDescription('');
      setBenefits('Gym access');
      setShowForm(false);
      notify(`${kind === 'badminton' ? 'Badminton' : 'Gym'} package created.`)
    } catch (e: any) {
      notify(e.message || 'Could not save package.')
    }
  };

  return <div>
    <div className="mb-4 flex justify-end">
      <Button onClick={() => setShowForm(true)}>
        <Plus size={16} /> New package</Button>
    </div>
    <AnimatePresence>{showForm &&
      <OpsModal
        title={`Create ${kind} package`}
        subtitle="Set the package data used by front office and POS."
        onClose={() => setShowForm(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <input
            placeholder="Package title"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            type="number"
            placeholder="Price"
            value={price}
            onChange={e => setPrice(e.target.value)}
          />
          {kind === 'badminton' ?
            <>
              <input
                type="number"
                placeholder="Sessions"
                value={number}
                onChange={e => setNumber(e.target.value)}
              />
              <input
                type="number"
                placeholder="Validity days"
                value={validity}
                onChange={e => setValidity(e.target.value)}
              />
              <div className="md:col-span-2">
                <p className="mb-2 text-xs font-bold text-zawana-500">Available days</p>
                <div className="flex flex-wrap gap-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d =>
                    <label
                      key={d}
                      className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={availableDays.includes(d)}
                        onChange={e =>
                          setAvailableDays(
                            e.target.checked
                              ? [...availableDays, d]
                              : availableDays.filter(x => x !== d)
                          )
                        }
                      />
                      {d}
                    </label>)}
                </div>
              </div>
              <input
                type="time"
                aria-label="Available from"
                value={availableFrom}
                onChange={e => setAvailableFrom(e.target.value)}
              />
              <input
                type="time"
                aria-label="Available until"
                value={availableUntil}
                onChange={e => setAvailableUntil(e.target.value)}
              />
              <input
                placeholder="Schedule notes"
                value={scheduleNotes}
                onChange={e => setScheduleNotes(e.target.value)}
              />
              <input
                placeholder="Court rules"
                value={courtRules}
                onChange={e => setCourtRules(e.target.value)}
              />
              <input
                placeholder="Image URL (optional)"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
              />
            </> :
            <>
              <input
                type="number"
                placeholder="Duration days"
                value={number}
                onChange={e => setNumber(e.target.value)}
              />
              <input
                type="number"
                placeholder="Included sessions"
                min={1}
                value={gymSessions}
                onChange={e => setGymSessions(e.target.value)}
              />
              <input
                placeholder="Benefits, separated by comma"
                value={benefits}
                onChange={e => setBenefits(e.target.value)}
              />
            </>}
          <textarea
            className="md:col-span-2"
            placeholder="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={save}>
            <Plus size={15} /> Create</Button>
        </div>
      </OpsModal>}</AnimatePresence>
    {kind === 'badminton' ? <BadmintonPackages /> : <GymEnrollments />}
  </div>
}

function GymMemberships() {
  const o = useOperations();
  return <Table headers={['Package', 'Price', 'Duration', 'Sessions', 'Benefits', 'Status', 'Actions']}>
    {o.gymPackages.map(p =>
      <tr key={p.id}>
        <Cell>
          <b>{p.title}</b>
          <p className="text-xs text-zawana-500">{p.description}</p>
        </Cell>
        <Cell>{money(p.price)}</Cell>
        <Cell>{p.duration} days</Cell>
        <Cell>{p.benefits.join(' · ')}</Cell>
        <Cell>
          <Badge good={p.status === 'active'}>{p.status}</Badge>
        </Cell>
        <Cell>
          <div className="flex gap-2">
            <PackageEdit item={p} kind="gym" />
            <PackageDelete id={p.id} name={p.title} kind="gym" />
          </div>
        </Cell>
      </tr>
    )}
  </Table>
}

function MembershipTable({
  query,
  setQuery,
  notify
}: {
  query: string;
  setQuery: (x: string) => void;
  notify: (s: string) => void
}) {
  const o = useOperations();
  const [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [busyId, setBusyId] = useState('');
  const dateNow = gymToday();
  const rows = o.memberships.filter(
    m =>([m.customer, m.phone, m.id, m.package].some(v =>
        String(v || '')
          .toLowerCase()
          .includes(query.toLowerCase()))) &&
      (!status ||
        status ===
          (m.status === 'active' && m.startDate <= dateNow && m.expiryDate >= dateNow && (m.accessMode === 'unlimited' || m.sessionsRemaining > 0)
            ? 'ready'
            : 'blocked'))
  );
  const pageSize = 12,
    totalPages = Math.ceil(rows.length / pageSize),
    visible = rows.slice((page - 1) * pageSize, page * pageSize);
  const checkIn = async (m: any) => {
    setBusyId(m.id);
    try {
      const result = await post<any>('/memberships/check-in', { membershipId: m.id });
      await o.refresh();
      notify(result.membership.accessMode === 'unlimited' ? `${m.customer} checked in · unlimited gym access.` : `${m.customer} checked in · ${result.membership.sessionsRemaining} visits remain.`)
    } catch (e: any) {
      notify(e.message || 'Gym check-in was denied.')
    } finally {
      setBusyId('')
    }
  };
  return <div>
    <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]">
      <div className="relative">
        <Search className="absolute left-3 top-3.5 text-zawana-400" size={16} />
        <input
          className="w-full rounded-xl border p-3 pl-10"
          placeholder="Search member, package or phone"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setPage(1)
          }}
        />
      </div>
      <Select
        aria-label="Filter memberships by access"
        value={status}
        onChange={e => {
          setStatus(e.target.value);
          setPage(1)
        }}
      >
        <option value="">All memberships</option>
        <option value="ready">Ready to check in</option>
        <option value="blocked">Expired or no sessions</option>
      </Select>
    </div>
    {visible.length ?
      <Table
        paginate={false}
        headers={[
          'Member',
          'Gym package',
          'Sessions',
          'Start / expiry',
          'Last check-in',
          'Access',
          'Action'
        ]}
      >
        {visible.map(m => {
          const ready =
            m.status === 'active' && m.startDate <= dateNow && m.expiryDate >= dateNow && (m.accessMode === 'unlimited' || m.sessionsRemaining > 0);
          return <tr key={m.id}>
            <Cell>
              <b>{m.customer}</b>
              <p className="text-xs text-zawana-500">{m.phone}</p>
            </Cell>
            <Cell>{m.package}</Cell>
            <Cell>
              <b>{m.accessMode === 'unlimited' ? 'Unlimited' : `${m.sessionsRemaining || 0} / ${m.sessionsTotal || 0}`}</b>
            </Cell>
            <Cell>
              {m.startDate}
              <p className="text-xs text-zawana-500">Expires {m.expiryDate}</p>
            </Cell>
            <Cell>{m.lastCheckIn || '—'}</Cell>
            <Cell>
              <Badge good={ready}>{ready ? 'Ready' : 'Blocked'}</Badge>
            </Cell>
            <Cell>
              <Button
                disabled={!ready || busyId === m.id}
                className="px-3 py-2"
                onClick={() => void checkIn(m)}
              >
                {busyId === m.id ? 'Checking…' : 'Check in'}
              </Button>
            </Cell>
          </tr>
        })}
      </Table> :
      <Empty
        title="No Gym memberships found"
        body={
          o.memberships.length
            ? 'No records match the current filters.'
            : 'Gym memberships with package entitlements appear here.'
        }
      />}
    <Pagination page={page} totalPages={totalPages} total={rows.length} onPage={setPage} />
  </div>
}

function GymCheckInWorkflow({
  query,
  setQuery,
  notify
}: {
  query: string;
  setQuery: (x: string) => void;
  notify: (s: string) => void
}) {
  return <Card className="p-6">
    <div className="mb-5">
      <h2 className="text-xl font-black">Search â†’ Validate â†’ Check In</h2>
      <p className="text-sm text-zawana-500">Membership status and expiry are validated before attendance is recorded.</p>
    </div>
    <MembershipTable query={query} setQuery={setQuery} notify={notify} />
  </Card>
}

function AppointmentTable({
  notify,
  professional
}: {
  notify: (s: string) => void;
  professional?: string
}) {
  const o = useOperations();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]),
    [doctors, setDoctors] = useState<any[]>([]),
    [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const [form, setForm] = useState({
    userId: '',
    doctorId: '',
    date: '',
    time: '',
    type: 'Physiotherapy'
  });
  useEffect(() => {
    if (['admin', 'clinic_fo'].includes(user?.role || '')) {
      get<any[]>('/clinic/member-accounts')
        .then(setAccounts)
        .catch(() => setAccounts([]));
      get<any[]>('/doctors')
        .then(setDoctors)
        .catch(() => setDoctors([]))
    }
  }, [user?.role]);
  const rows = o.appointments.filter(
    (a: any) => professional !== 'own' || a.doctorProfile?.user?.id === user?.id
  );
  const create = async () => {
    setSaving(true);
    setError('');
    try {
      await post('/appointments', form);
      await o.refresh();
      setOpen(false);
      notify('Appointment created.')
    } catch (e: any) {
      setError(e.message || 'Could not create appointment.')
    } finally {
      setSaving(false)
    }
  };
  return <div>
    {['admin', 'clinic_fo'].includes(user?.role || '') &&
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            setForm({ userId: '', doctorId: '', date: '', time: '', type: 'Physiotherapy' });
            setOpen(true)
          }}
        >
          <Plus size={15} /> New appointment</Button>
      </div>}
    <Table
      headers={['Member', 'Doctor', 'Date', 'Time', 'Service', 'Payment', 'Status', 'Action']}
    >
      {rows.map((a: any) =>
        <tr key={a.id}>
          <Cell>
            <b>{a.user?.name || a.patient}</b>
            <p className="text-xs text-zawana-500">{a.user?.email || ''}</p>
          </Cell>
          <Cell>{a.doctorProfile?.user?.name || a.doctor}</Cell>
          <Cell>{a.date}</Cell>
          <Cell>{a.time}</Cell>
          <Cell>{a.type}</Cell>
          <Cell>
            <Badge>{a.paymentStatus}</Badge>
          </Cell>
          <Cell>
            <Badge>{a.status}</Badge>
          </Cell>
          <Cell>
            <Button
              className="px-3 py-2"
              onClick={async () => {
                const next =
                  a.status === 'pending'
                    ? 'confirmed'
                    : a.status === 'confirmed'
                      ? 'checked_in'
                      : a.status === 'checked_in'
                        ? 'completed'
                        : 'completed';
                try {
                  await o.updateAppointment(a.id, next as Appointment['status']);
                  notify(`Appointment ${next}.`)
                } catch (e: any) {
                  notify(e.message || 'Could not update appointment.')
                }
              }}
            >
              {a.status === 'completed' ? 'Done' : 'Update'}
            </Button>
          </Cell>
        </tr>
      )}
    </Table>
    {!rows.length &&
      <Card className="mt-4 p-10 text-center text-sm text-zawana-500">No appointments linked to this account yet.</Card>}
    <AnimatePresence>{open &&
      <OpsModal
        title="Schedule clinic appointment"
        subtitle="Select member and doctor accounts. The doctor’s schedule will be checked before saving."
        onClose={() => setOpen(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            value={form.userId}
            onChange={e => setForm({ ...form, userId: e.target.value })}
          >
            <option value="">Select member</option>
            {accounts.map(a =>
              <option key={a.id} value={a.id}>
                {a.name} · {a.email}
              </option>)}
          </Select>
          <Select
            value={form.doctorId}
            onChange={e => setForm({ ...form, doctorId: e.target.value })}
          >
            <option value="">Select doctor</option>
            {doctors
              .filter(d => d.user?.active)
              .map(d =>
                <option key={d.id} value={d.id}>
                  {d.user.name} · {d.specialty}
                </option>
              )}
          </Select>
          <input
            type="date"
            value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })}
          />
          <input
            type="time"
            value={form.time}
            onChange={e => setForm({ ...form, time: e.target.value })}
          />
          <input
            className="md:col-span-2"
            value={form.type}
            onChange={e => setForm({ ...form, type: e.target.value })}
            placeholder="Appointment type"
          />
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={
              saving || !form.userId || !form.doctorId || !form.date || !form.time || !form.type
            }
            onClick={create}
          >
            {saving ? 'Saving…' : 'Create appointment'}
          </Button>
        </div>
      </OpsModal>}</AnimatePresence>
  </div>
}

function PatientList({ query, setQuery }: { query: string; setQuery: (x: string) => void }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const o = useOperations();
  useEffect(() => {
    get<any[]>('/clinic/member-accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }, []);
  const rows = accounts.filter(u =>
    `${u.name} ${u.email} ${u.phone || ''}`.toLowerCase().includes(query.toLowerCase())
  );
  return <div>
    <div className="mb-4 relative">
      <Search className="absolute left-3 top-3.5 text-zawana-400" size={16} />
      <input
        className="w-full rounded-xl border p-3 pl-10"
        placeholder="Search member account"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
    </div>
    <Table headers={['Member account', 'Appointments', 'Latest appointment', 'Access']}>
      {rows.map(u => {
        const visits = o.appointments.filter((a: any) => a.userId === u.id);
        const recent = [...visits].sort((a: any, b: any) =>
          `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
        )[0];
        return <tr key={u.id}>
          <Cell>
            <b>{u.name}</b>
            <p className="text-xs text-zawana-500">
              {u.email} · {u.phone || 'No phone'}
            </p>
          </Cell>
          <Cell>{visits.length}</Cell>
          <Cell>{recent ? `${recent.type} · ${recent.date}` : 'No appointment history'}</Cell>
          <Cell>
            <Badge good>Restricted</Badge>
          </Cell>
        </tr>
      })}
    </Table>
    {!rows.length &&
      <Card className="mt-4 p-8 text-center text-sm text-zawana-500">No member accounts found.</Card>}
  </div>
}

function DoctorList() {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    get<any[]>('/doctors')
      .then(setDoctors)
      .catch(() => setDoctors([]))
      .finally(() => setLoading(false))
  }, []);
  if (loading)
    return <Card className="p-8 text-sm text-zawana-500">Loading doctor accounts…</Card>;
  return <Table headers={['Doctor account', 'Specialty', 'Working days', 'Hours', 'Status']}>
    {doctors.map(d =>
      <tr key={d.id}>
        <Cell>
          <b>{d.user?.name}</b>
          <p className="text-xs text-zawana-500">{d.user?.email}</p>
        </Cell>
        <Cell>{d.specialty}</Cell>
        <Cell>
          {d.schedules?.map((s: any) => s.day.slice(0, 3)).join(' · ') || 'Not scheduled'}
        </Cell>
        <Cell>{d.schedules?.map((s: any) => `${s.start}–${s.end}`).join(' · ') || '—'}</Cell>
        <Cell>
          <Badge good={d.status === 'active' && d.user?.active}>
            {d.status === 'active' && d.user?.active ? 'Active' : 'Inactive'}
          </Badge>
        </Cell>
      </tr>
    )}
  </Table>
}

function ScheduleTable({ person }: { person?: string }) {
  const o = useOperations();
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    {days.map(d =>
      <Card key={d} className="p-5">
        <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">{d}</p>
        {o.schedules
          .filter(s => (!person || s.person === person) && s.day === d && s.active)
          .map(s =>
            <div key={s.id} className="mt-3 rounded-xl bg-zawana-950/4 p-3">
              <b>{s.person}</b>
              <p className="text-xs text-zawana-500">
                {s.start} – {s.end}
              </p>
              <p className="mt-1 text-xs font-bold">{s.service}</p>
            </div>)}
        {!o.schedules.some(s => (!person || s.person === person) && s.day === d && s.active) &&
          <p className="mt-3 text-sm text-zawana-400">Off / unavailable</p>}
      </Card>
    )}
  </div>
}

function MedicalRecords() {
  return <Card className="p-8">
    <Empty
      title="Clinical records are not connected"
      body="This system does not store clinical treatment records yet. Use patient accounts and appointments for the data currently available."
    />
  </Card>
}

function CoachManager() {
  const o = useOperations(),
    { user } = useAuth();

  return <div className="space-y-5">
    <Card className="bg-zawana-950 p-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">Coaching roster</p>
          <h2 className="mt-2 text-2xl font-black">Active coaches can be booked directly.</h2>
          <p className="mt-2 text-sm text-white/65">Coach availability is managed by assigned bookings. No recurring schedule setup is required.</p>
        </div>
        {user?.role === 'admin' &&
          <Link to="/admin/users">
            <Button variant="secondary">
              <UserPlus size={15} /> Create coach account</Button>
          </Link>}
      </div>
    </Card>
    <div className="grid gap-4 lg:grid-cols-3">
      {o.coaches.map(c =>
        <Card key={c.id} className="p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-zawana-950 text-sm font-black text-white">
              {c.imageUrl ?
                <img
                  src={mediaImageSrc(c.imageUrl)}
                  alt={`${c.name} profile`}
                  className="h-full w-full object-cover"
                /> :
                c.name
                  .split(' ')
                  .map(x => x[0])
                  .join('')
                  .slice(0, 2
              )}
            </div>
            <div>
              <h3 className="font-black">{c.name}</h3>
              <p className="text-xs text-zawana-500">
                {c.department} · {c.specialty}
              </p>
            </div>
          </div>
          <div className="mt-4 border-t pt-3 text-sm">
            {c.status === 'active' ? 'Active profile' : 'Inactive profile'}
          </div>
        </Card>
      )}
    </div>
    {!o.coaches.length &&
      <Card className="p-8 text-center text-sm text-zawana-500">No coach profiles are configured.</Card>}
  </div>
}

function CourtManager() {
  const o = useOperations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  const [form, setForm] = useState({
    name: '',
    type: 'Premium' as 'Premium' | 'Standard',
    surface: 'Yonex Tournament',
    price: '18000',
    features: 'Air conditioned, LED lighting'
  });

  const save = () => {
    if (!form.name || !form.price) return;
    const data = {
      name: form.name,
      type: form.type,
      surface: form.surface,
      price: +form.price,
      status: 'available' as const,
      features: form.features
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
    };
    if (editing) o.updateCourt(editing, data);
    else o.addCourt(data);
    setOpen(false);
    setEditing(null);
    setForm({
      name: '',
      type: 'Premium',
      surface: 'Yonex Tournament',
      price: '18000',
      features: 'Air conditioned, LED lighting'
    })
  };

  const edit = (id: string) => {
    const c = o.managedCourts.find(x => x.id === id);
    if (!c) return;
    setForm({
      name: c.name,
      type: c.type,
      surface: c.surface,
      price: String(c.price),
      features: c.features.join(', ')
    });
    setEditing(id);
    setOpen(true)
  };

  const shown = o.managedCourts.filter(c => filter === 'all' || c.status === filter);
  const available = o.managedCourts.filter(c => c.status === 'available').length;

  return <div className="space-y-6">
    <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-zawana-950 via-zawana-purple to-zawana-950 p-6 text-white shadow-[0_24px_70px_rgba(29,27,71,.16)] md:p-8">
      <div className="absolute right-[-4rem] top-[-5rem] h-64 w-64 rounded-full border border-zawana-gold/30" />
      <div className="absolute right-16 top-12 h-32 w-32 rounded-full border border-white/10" />
      <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.24em] text-zawana-gold">Facility command center</p>
          <h2 className="mt-2 text-3xl font-black md:text-4xl">Court rental, capacity & control.</h2>
          <p className="mt-2 max-w-xl text-sm text-white/60">Create courts, price sessions, switch maintenance status and keep the booking inventory aligned with the front desk.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true)
          }}
        >
          <Plus size={16} /> Create court</Button>
      </div>
      <div className="relative mt-7 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-white/10 p-4">
          <p className="text-xs text-white/50">Total courts</p>
          <p className="mt-1 text-2xl font-black">{o.managedCourts.length}</p>
        </div>
        <div className="rounded-2xl bg-white/10 p-4">
          <p className="text-xs text-white/50">Bookable now</p>
          <p className="mt-1 text-2xl font-black">{available}</p>
        </div>
        <div className="rounded-2xl bg-white/10 p-4">
          <p className="text-xs text-white/50">Maintenance</p>
          <p className="mt-1 text-2xl font-black">
            {o.managedCourts.filter(c => c.status === 'maintenance').length}
          </p>
        </div>
        <div className="rounded-2xl bg-white/10 p-4">
          <p className="text-xs text-white/50">Today bookings</p>
          <p className="mt-1 text-2xl font-black">
            {o.courtBookings.filter(b => b.date === today).length}
          </p>
        </div>
      </div>
    </div>

    {open &&
      <Card className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">
              {editing ? 'Edit court' : 'New court'}
            </p>
            <h3 className="text-xl font-black">Court configuration</h3>
          </div>
          <button onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <input
            placeholder="Court name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
          <Select
            value={form.type}
            onChange={e => setForm({ ...form, type: e.target.value as any })}
          >
            <option>Premium</option>
            <option>Standard</option>
          </Select>
          <input
            placeholder="Surface"
            value={form.surface}
            onChange={e => setForm({ ...form, surface: e.target.value })}
          />
          <input
            type="number"
            placeholder="Price / 60 min"
            value={form.price}
            onChange={e => setForm({ ...form, price: e.target.value })}
          />
          <input
            className="md:col-span-2"
            placeholder="Features, separated by commas"
            value={form.features}
            onChange={e => setForm({ ...form, features: e.target.value })}
          />
        </div>
        <div className="mt-5 flex gap-2">
          <Button onClick={save}>{editing ? 'Save changes' : 'Create court'}</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </Card>}

    <div className="flex flex-wrap items-center justify-between gap-3">
      <SegmentedControl value={filter} onChange={setFilter} label="Court status"
        options={['all', 'available', 'maintenance', 'inactive'].map(value => ({ value, label: value.replace(/^./, c => c.toUpperCase()) }))} />
      <p className="text-sm text-zawana-500">Pricing is per 60-minute session.</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {shown.map(c =>
        <Card key={c.id} className="group overflow-hidden p-0">
          <div
            className={`relative h-28 ${c.type === 'Premium' ? 'bg-zawana-950' : 'bg-zawana-purple'} court-lines`}
          >
            <div className="absolute inset-0 grid place-items-center">
              <div className="h-16 w-28 rounded-lg border border-white/30" />
            </div>
            <div className="absolute left-4 top-4 rounded-full bg-white/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white">
              {c.type}
            </div>
            <button
              onClick={() => edit(c.id)}
              className="absolute right-3 top-3 rounded-xl bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <Pencil size={14} />
            </button>
          </div>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black">{c.name}</h3>
                <p className="mt-1 text-xs text-zawana-500">{c.surface}</p>
              </div>
              <Badge good={c.status === 'available'}>{c.status}</Badge>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zawana-500">60 min</p>
                <p className="font-black">{money(c.price)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-zawana-500">Features</p>
                <p className="max-w-[130px] text-xs font-bold">
                  {c.features.slice(0, 2).join(' · ')}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                className="flex-1 px-3 py-2"
                variant={c.status === 'maintenance' ? 'secondary' : 'primary'}
                onClick={() =>
                  o.updateCourt(c.id, {
                    status: c.status === 'maintenance' ? 'available' : 'maintenance'
                  })
                }
              >
                {c.status === 'maintenance' ?
                  <>
                    <Check size={14} /> Mark available</> :
                  <>
                    <Wrench size={14} /> Maintenance</>}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>

    <Card className="overflow-hidden">
      <div className="border-b p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">Rental flow</p>
            <h3 className="mt-1 text-xl font-black">Today’s court schedule</h3>
          </div>
          <span className="text-xs font-bold text-zawana-500">
            {o.courtBookings.length} booking records</span>
        </div>
      </div>
      <div className="divide-y divide-zawana-950/8">
        {o.courtBookings
          .filter(b => b.date === today)
          .map(b =>
            <div key={b.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-zawana-900">
                <CalendarDays size={17} />
              </div>
              <div className="flex-1">
                <p className="font-black">
                  {b.court} · {b.time}
                </p>
                <p className="text-xs text-zawana-500">
                  {b.customer} · {b.session} min</p>
              </div>
              <Badge>{b.paymentStatus}</Badge>
              <Badge good={b.status === 'confirmed'}>{b.status}</Badge>
            </div>
          )}
      </div>
    </Card>
  </div>
}

function StudentManager({
  showForm,
  setShowForm,
  notify
}: {
  showForm: boolean;
  setShowForm: (x: boolean) => void;
  notify: (s: string) => void
}) {
  const o = useOperations();
  const { user } = useAuth();
  const canDelete = user?.role === 'admin';
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [form, setForm] = useState<any>({
    name: '',
    phone: '',
    className: 'Academy',
    coach: '',
    package: '',
    paymentStatus: 'pending',
    attendance: 0,
    expiryDate: '2026-10-29',
    status: 'active'
  });
  const openEdit = (s: any) => {
    setEditing(s);
    setForm({ ...s });
    setShowForm(true)
  };
  const save = async () => {
    if (!form.name) {
      notify('Student name is required.');
      return }
    try {
      if (editing) await o.updateStudent(editing.id, form);
      else await o.addStudent(form);
      notify(editing ? 'Student updated.' : 'Student registered.');
      setEditing(null);
      setShowForm(false)
    } catch (e: any) {
      notify(e.message || 'Could not save student.')
    }
  };
  const remove = async () => {
    if (!deleting) return;
    try {
      await o.deleteStudent(deleting.id);
      notify(`${deleting.name} deleted.`);
      setDeleting(null)
    } catch (e: any) {
      notify(e.message || 'Delete failed.')
    }
  };
  return <div>
    <div className="mb-4 flex justify-end">
      <Button
        onClick={() => {
          setEditing(null);
          setForm({
            name: '',
            phone: '',
            className: 'Academy',
            coach: '',
            package: '',
            paymentStatus: 'pending',
            attendance: 0,
            expiryDate: '2026-10-29',
            status: 'active'
          });
          setShowForm(true)
        }}
      >
        <Plus size={16} /> Register student</Button>
    </div>
    <AnimatePresence>{showForm &&
      <OpsModal
        title={editing ? 'Edit student' : 'Register student'}
        subtitle="Keep academy student information current."
        onClose={() => setShowForm(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <input
            placeholder="Student name"
            value={form.name || ''}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder="Phone"
            value={form.phone || ''}
            onChange={e => setForm({ ...form, phone: e.target.value })}
          />
          <input
            placeholder="Class"
            value={form.className || ''}
            onChange={e => setForm({ ...form, className: e.target.value })}
          />
          <input
            placeholder="Coach"
            value={form.coach || ''}
            onChange={e => setForm({ ...form, coach: e.target.value })}
          />
          <input
            placeholder="Package"
            value={form.package || ''}
            onChange={e => setForm({ ...form, package: e.target.value })}
          />
          <input
            type="number"
            min="0"
            max="100"
            placeholder="Attendance %"
            value={form.attendance ?? 0}
            onChange={e => setForm({ ...form, attendance: +e.target.value })}
          />
          <Select
            value={form.paymentStatus || 'pending'}
            onChange={e => setForm({ ...form, paymentStatus: e.target.value })}
          >
            <option value="pending">Payment pending</option>
            <option value="paid">Paid</option>
          </Select>
          <input
            type="date"
            value={form.expiryDate || ''}
            onChange={e => setForm({ ...form, expiryDate: e.target.value })}
          />
          <Select
            value={form.status || 'active'}
            onChange={e => setForm({ ...form, status: e.target.value })}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          <Button onClick={save}>
            <Check size={15} /> Save</Button>
        </div>
      </OpsModal>}</AnimatePresence>
    {
      <Table
        headers={[
          'Student',
          'Class',
          'Coach',
          'Package',
          'Payment',
          'Attendance',
          'Expiry',
          'Actions'
        ]}
      >
        {o.students.map(s =>
          <tr key={s.id}>
            <Cell>
              <b>{s.name}</b>
              <p className="text-xs text-zawana-500">{s.phone}</p>
            </Cell>
            <Cell>{s.className}</Cell>
            <Cell>{s.coach}</Cell>
            <Cell>{s.package}</Cell>
            <Cell>
              <Badge good={s.paymentStatus === 'paid'}>{s.paymentStatus}</Badge>
            </Cell>
            <Cell>{s.attendance}%</Cell>
            <Cell>{s.expiryDate}</Cell>
            <Cell>
              <div className="flex gap-2">
                <button
                  className="rounded-xl p-2 hover:bg-zawana-900"
                  onClick={() => openEdit(s)}
                >
                  <Edit3 size={15} />
                </button>
                {canDelete &&
                  <button
                    className="rounded-xl p-2 text-red-600 hover:bg-red-50"
                    onClick={() => setDeleting(s)}
                  >
                    <Trash2 size={15} />
                  </button>}
              </div>
            </Cell>
          </tr>)}
      </Table>
    }
    <AnimatePresence>{deleting &&
      <ConfirmDelete name={deleting.name} onCancel={() => setDeleting(null)} onConfirm={remove} />}</AnimatePresence>
  </div>
}

function Finance() {
  const [business, setBusiness] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<any[]>([]);
  const [pageInfo, setPageInfo] = useState<any>({ total: 0, totalPages: 0 });
  const [summary, setSummary] = useState<any>({ gross: 0, discounts: 0, net: 0 });
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    status: '',
    paymentMethod: '',
    q: ''
  });
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        const p = new URLSearchParams({ page: String(page), limit: '20' });
        if (business) p.set('business', business);
        for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
        get<any>(`/transactions?${p}`)
          .then(r => {
            setRows(r.data || []);
            setPageInfo(r.pagination || { total: 0, totalPages: 0 });
            setSummary(r.summary || { gross: 0, discounts: 0, net: 0 });
            setError('')
          })
          .catch((e: any) => setError(e.message || 'Could not load finance transactions.'))
      },
      filters.q ? 250 : 0
    );
    return () => window.clearTimeout(timer)
  }, [page, business, filters]);
  const setFilter = (key: string, value: string) => {
    setPage(1);
    setFilters(f => ({ ...f, [key]: value }))
  };
  return <div>
    <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <input
        aria-label="Search transactions"
        className="rounded-xl border p-3"
        placeholder="Search customer, item or ID"
        value={filters.q}
        onChange={e => setFilter('q', e.target.value)}
      />
      <input
        aria-label="From date"
        type="date"
        className="rounded-xl border p-3"
        value={filters.from}
        onChange={e => setFilter('from', e.target.value)}
      />
      <input
        aria-label="To date"
        type="date"
        className="rounded-xl border p-3"
        value={filters.to}
        onChange={e => setFilter('to', e.target.value)}
      />
      <Select
        aria-label="Transaction status"
        className="rounded-xl border p-3"
        value={filters.status}
        onChange={e => setFilter('status', e.target.value)}
      >
        <option value="">All statuses</option>
        {['paid', 'pending', 'refunded', 'cancelled'].map(s =>
          <option key={s}>{s}</option>
        )}
      </Select>
      <Select
        aria-label="Payment method"
        className="rounded-xl border p-3"
        value={filters.paymentMethod}
        onChange={e => setFilter('paymentMethod', e.target.value)}
      >
        <option value="">All payment types</option>
        {['Cash', 'KPay', 'Pay Later', 'Temporarily disabled'].map(s =>
          <option key={s}>{s}</option>
        )}
      </Select>
    </div>
    <SegmentedControl label="Finance business" value={business} className="mb-5 w-fit"
      onChange={value => { setBusiness(value); setPage(1); }}
      options={['', 'Gym', 'Badminton', 'Clinic', 'Store', 'Cafe', 'Academy'].map(value => ({ value, label: value || 'All businesses' }))} />
    {error &&
      <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>}
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <Stat label="Gross · filtered total" value={money(summary.gross)} />
      <Stat label="Discounts · filtered total" value={money(summary.discounts)} />
      <Stat label="Net · filtered total" value={money(summary.net)} />
    </div>
    <div className="hidden md:block">
      <Table
        headers={[
          'ID',
          'Date',
          'Customer',
          'Business',
          'Item',
          'Amount',
          'Discount',
          'Final',
          'Payment',
          'Staff'
        ]}
      >
        {rows.map(t =>
          <tr key={t.id}>
            <Cell>{t.id}</Cell>
            <Cell>{t.date}</Cell>
            <Cell>{t.customer}</Cell>
            <Cell>
              <Badge>{t.business}</Badge>
            </Cell>
            <Cell>{t.item}</Cell>
            <Cell>{money(t.amount)}</Cell>
            <Cell>{money(t.discount)}</Cell>
            <Cell>
              <b>{money(t.finalAmount)}</b>
            </Cell>
            <Cell>{t.paymentMethod}</Cell>
            <Cell>{t.staff}</Cell>
          </tr>
        )}
      </Table>
    </div>
    <div className="space-y-3 md:hidden">
      {rows.map(t =>
        <Card key={t.id} className="p-4">
          <div className="flex justify-between gap-2">
            <b>{t.customer}</b>
            <b>{money(t.finalAmount)}</b>
          </div>
          <p className="mt-2 text-sm">{t.item}</p>
          <p className="mt-1 text-xs text-zawana-500">
            {t.date} · {t.business} · {t.paymentMethod} · {t.status}
          </p>
          <p className="mt-1 text-[10px] text-zawana-400">
            {t.id} · {t.staff}
          </p>
        </Card>)}
    </div>
    {!rows.length && !error &&
      <div className="mt-4">
        <Empty title="No matching transactions" body="Try another date range or filter." />
      </div>}
    <Pagination
      page={page}
      totalPages={pageInfo.totalPages || 0}
      total={pageInfo.total || 0}
      onPage={setPage}
    />
  </div>
}

function Transactions({ business }: { business: Transaction['business'] }) {
  const [rows, setRows] = useState<any[]>([]),
    [page, setPage] = useState(1),
    [pageInfo, setPageInfo] = useState<any>({ total: 0, totalPages: 0 }),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [item, setItem] = useState(''),
    [status, setStatus] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20', business });
    if (query) params.set('q', query);
    if (item) params.set('item', item);
    if (status) params.set('status', status);
    get<any>(`/transactions?${params}`)
      .then(r => {
        if (!alive) return;
        setRows(r.data || []);
        setPageInfo(r.pagination || { total: 0, totalPages: 0 });
        setError('')
      })
      .catch((e: any) => {
        if (alive) setError(e.message || 'Could not load transactions.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      });
    return () => {
      alive = false
    }
  }, [business, page, query, item, status]);
  return <div>
    <form
      className="mb-4 grid gap-3 rounded-2xl border border-zawana-950/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={e => {
        e.preventDefault();
        setPage(1);
        setQuery(search.trim())
      }}
    >
      <input
        aria-label="Search transactions"
        placeholder="Search customer or transaction ID"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <input
        aria-label="Filter by item or product"
        placeholder="Filter item / product"
        value={item}
        onChange={e => {
          setPage(1);
          setItem(e.target.value)
        }}
      />
      <Select
        aria-label="Filter status"
        value={status}
        onChange={e => {
          setPage(1);
          setStatus(e.target.value)
        }}
      >
        <option value="">All statuses</option>
        <option value="paid">Paid</option>
        <option value="pending">Pending</option>
        <option value="refunded">Refunded</option>
      </Select>
      <Button>Search transactions</Button>
    </form>
    {error &&
      <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>}
    {loading ?
      <Card className="h-24 animate-pulse bg-zawana-950/5" /> : rows.length ?
      <>
        <div className="hidden md:block">
          <Table
            paginate={false}
            headers={['ID', 'Customer', 'Item / product', 'Final Amount', 'Payment', 'Status']}
          >
            {rows.map(t =>
              <tr key={t.id}>
                <Cell>{t.id}</Cell>
                <Cell>{t.customer}</Cell>
                <Cell>{t.item}</Cell>
                <Cell>
                  <b>{money(t.finalAmount)}</b>
                </Cell>
                <Cell>{t.paymentMethod}</Cell>
                <Cell>
                  <Badge good={t.status === 'paid'}>{t.status}</Badge>
                </Cell>
              </tr>
            )}
          </Table>
        </div>
        <div className="space-y-3 md:hidden">
          {rows.map(t =>
            <Card key={t.id} className="p-4">
              <div className="flex justify-between gap-3">
                <b>{t.customer}</b>
                <b>{money(t.finalAmount)}</b>
              </div>
              <p className="mt-2 text-sm">{t.item}</p>
              <p className="mt-1 text-xs text-zawana-500">
                {t.date} · {t.paymentMethod} · {t.status}
              </p>
              <p className="mt-1 text-[10px] text-zawana-400">{t.id}</p>
            </Card>)}
        </div>
        <Pagination
          page={page}
          totalPages={pageInfo.totalPages || 0}
          total={pageInfo.total || 0}
          onPage={setPage}
        />
      </> :
      <Empty
        title="No matching transactions"
        body="Try another product, item or status filter."
      />}
  </div>
}

function CMS({ notify }: { notify: (s: string) => void }) {
  const o = useOperations();
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [deleting, setDeleting] = useState<ContentItem | null>(null);
  const [open, setOpen] = useState(false);
  const [publishingId, setPublishingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [kindFilter, setKindFilter] = useState('all');
  const emptyForm: Omit<ContentItem, 'id'> = {
    kind: 'achievement',
    category: 'Milestones',
    body: '',
    title: '',
    description: '',
    image: '',
    googleFormLink: '',
    status: 'draft',
    publishDate: gymToday()
  };
  const [form, setForm] = useState(emptyForm);
  const contentToday = gymToday();

  const start = (item?: ContentItem, kind: ContentItem['kind'] = 'achievement') => {
    setEditing(item || null);
    setForm(
      item
        ? { ...emptyForm, ...item }
        : { ...emptyForm, kind }
    );
    setOpen(true);
  };
  const isLive = (item: ContentItem) =>
    item.status === 'published' && Boolean(item.publishDate) && item.publishDate <= contentToday;
  const isScheduled = (item: ContentItem) =>
    item.status === 'published' && Boolean(item.publishDate) && item.publishDate > contentToday;
  const save = async () => {
    if (saving || imageUploading) return;
    if (!form.title.trim()) {
      notify('Content title is required.');
      return }
    setSaving(true);
    try {
      if (editing)
        await o.updateContent(editing.id, {
          title: form.title,
          kind: form.kind,
          category: form.category,
          body: form.body,
          description: form.description,
          image: form.image,
          googleFormLink: form.googleFormLink,
          status: form.status,
          publishDate: form.publishDate || contentToday
        });
      else await o.addContent({ ...form, publishDate: form.publishDate || contentToday });
      notify(editing ? 'Content updated.' : 'Content created.');
      setOpen(false);
    } catch (e: any) {
      notify(e.message || 'Could not save content.')
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!deleting) return;
    try {
      await o.deleteContent(deleting.id);
      notify(deleting.title + ' deleted.');
      setDeleting(null);
    } catch (e: any) {
      notify(e.message || 'Delete failed.')
    }
  };
  const publish = async (item: ContentItem) => {
    setPublishingId(item.id);
    try {
      await o.publishContent(item.id);
      notify(item.title + (item.kind === 'achievement' ? ' is live on the achievements page.' : ' is live on the homepage.'));
    } catch (e: any) {
      notify(e.message || 'Publish failed.')
    } finally {
      setPublishingId('')
    }
  };

  return <div>
    <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <p className="max-w-xl text-sm text-zawana-500">Publish achievement articles or community updates. Achievement stories appear on their own public page.</p>
        <p className="mt-1 text-xs text-zawana-400">Future publish dates are scheduled. Use Publish now to show an item immediately.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => start(undefined, 'community')}><Plus size={16} /> Community update</Button>
        <Button onClick={() => start()}><Plus size={16} /> New achievement</Button>
      </div>
    </div>
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter content type">
      {[['all', 'All content'], ['achievement', 'Achievements'], ['community', 'Community']].map(([value, label]) =>
        <Button key={value} variant={kindFilter === value ? 'primary' : 'secondary'} aria-pressed={kindFilter === value} onClick={() => setKindFilter(value)}>{label}</Button>)}
      <Link to="/achievements" className="ml-auto inline-flex items-center gap-2 text-sm font-semibold"><Eye size={16} /> View achievements</Link>
    </div>
    <Table headers={['Content', 'Status', 'Publish date', 'Destination', 'Actions']}>
      {o.content.filter(c => kindFilter === 'all' || c.kind === kindFilter).map(c => {
        const live = isLive(c);
        const scheduled = isScheduled(c);
        const dateLabel = c.publishDate
          ? publicationDate(c.publishDate)
          : 'No date';
        return <tr key={c.id}>
          <Cell>
            <div className="flex items-center gap-3">
              <div className="h-12 w-16 overflow-hidden rounded-xl bg-zawana-900">
                {c.image &&
                  <img src={publicImageSrc(c.image)} alt={c.title} className="h-full w-full object-cover" />}
              </div>
              <div>
                <b>{c.title}</b>
                <p className="mt-1 text-xs font-semibold text-zawana-500">{c.kind === 'achievement' ? `Achievement · ${c.category}` : 'Community update'}</p>
                <p className="max-w-sm truncate text-xs text-zawana-500">{c.description}</p>
              </div>
            </div>
          </Cell>
          <Cell>
            <Badge good={live}>{live ? 'Live' : scheduled ? 'Scheduled' : 'Draft'}</Badge>
          </Cell>
          <Cell>{dateLabel}</Cell>
          <Cell>
            {c.kind === 'achievement' ? 'Achievements page' : 'Homepage / community'}
            <p className="mt-1 text-xs text-zawana-500">{live ? 'Public' : scheduled ? 'Scheduled for ' + dateLabel : 'Hidden draft'}</p>
          </Cell>
          <Cell>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-xl p-2 hover:bg-zawana-900"
                onClick={() => start(c)}
                title="Edit"
                aria-label={'Edit ' + c.title}
              >
                <Edit3 size={15} />
              </button>
              {live && c.kind === 'achievement' && <Link to={`/achievements/${c.id}`} className="rounded-xl p-2 hover:bg-zawana-900" aria-label={`View ${c.title}`}><Eye size={15} /></Link>}
              <button
                className="rounded-xl p-2 text-red-600 hover:bg-red-50"
                onClick={() => setDeleting(c)}
                title="Delete"
                aria-label={'Delete ' + c.title}
              >
                <Trash2 size={15} />
              </button>
              {!live &&
                <Button
                  className="px-3 py-2"
                  disabled={Boolean(publishingId)}
                  onClick={() => publish(c)}
                >
                  {publishingId === c.id ? 'Publishing…' : 'Publish now'}
                </Button>}
            </div>
          </Cell>
        </tr>
      })}
    </Table>
    {!o.content.some(c => kindFilter === 'all' || c.kind === kindFilter) && <Empty title="Your next story starts here" body="Create an achievement to celebrate your players, or a community update for the homepage." />}
    <AnimatePresence>{open &&
      <OpsModal
        title={editing ? 'Edit content' : 'Create a new story'}
        subtitle="Save a draft, publish today, or choose a future date to schedule your story. Dates use Yangon time."
        onClose={() => { if (!saving && !imageUploading) setOpen(false); }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">Post type
          <Select aria-label="Post type" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as ContentItem['kind'] })}>
            <option value="achievement">Achievement article</option><option value="community">Community update</option>
          </Select></label>
          <label className="text-sm font-semibold">Category
          <Select aria-label="Story category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value as ContentItem['category'] })}>
            {['Milestones', 'Tournaments', 'Academy', 'Community'].map(category => <option key={category} value={category}>{category}</option>)}
          </Select></label>
          <label className="text-sm font-semibold md:col-span-2">Title
          <input className="mt-2 w-full" aria-label="Story title" maxLength={180}
            placeholder="Give your story a title"
            value={form.title || ''}
            onChange={e => setForm({ ...form, title: e.target.value })}
          /></label>
          <div className="md:col-span-2"><ImageUpload label="Story cover image" value={form.image} onBusyChange={setImageUploading} onChange={url => setForm(current => ({ ...current, image: url || '' }))} /></div>
          <label className="text-sm font-semibold">Or use an image URL / path
          <input className="mt-2 w-full" aria-label="Cover image URL" placeholder="https://… or /facilities/…"
            value={form.image || ''}
            onChange={e => setForm({ ...form, image: e.target.value })}
          /></label>
          <label className="text-sm font-semibold">Registration / more information (optional)
          <input className="mt-2 w-full" aria-label="More information URL" type="url" placeholder="https://…"
            value={form.googleFormLink || ''}
            onChange={e => setForm({ ...form, googleFormLink: e.target.value })}
          /></label>
          <label className="text-sm font-semibold md:col-span-2">{form.kind === 'achievement' ? 'Summary' : 'Description'}
          <textarea className="mt-2 w-full" aria-label="Story summary" rows={3} maxLength={3000} placeholder="A short introduction for readers"
            value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </label>
          {form.kind === 'achievement' && <label className="text-sm font-semibold md:col-span-2">Full article
            <textarea className="mt-2 w-full" aria-label="Full article" rows={12} maxLength={100000} placeholder="Tell the full story…"
              value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
            <span className="mt-1 block text-xs font-normal text-zawana-500">Plain text. Leave a blank line between paragraphs. A summary and full article are required to publish.</span>
          </label>}
          <label className="text-sm font-semibold">Publication status
          <Select
            aria-label="Content status"
            value={form.status || 'draft'}
            onChange={e => setForm({ ...form, status: e.target.value as ContentItem['status'] })}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </Select></label>
          <label className="text-sm font-semibold text-zawana-600">Publish date
     <input
              className="mt-2 w-full"
              type="date"
              aria-label="Publish date"
              value={form.publishDate || ''}
              onChange={e => setForm({ ...form, publishDate: e.target.value })}
            />
            <span className="mt-1 block text-xs font-normal text-zawana-400">Published {form.kind === 'achievement' ? 'articles appear on the achievements page' : 'updates appear on the homepage'} on this date.</span>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" disabled={saving || imageUploading} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={saving || imageUploading} onClick={save}>
            <Check size={15} /> {saving ? 'Saving…' : imageUploading ? 'Uploading cover…' : 'Save story'}</Button>
        </div>
      </OpsModal>}</AnimatePresence>
    <AnimatePresence>{deleting &&
      <ConfirmDelete
        name={deleting.title}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />}</AnimatePresence>
  </div>;
}

function ProductManager({ notify }: { notify: (s: string) => void }) {
  const o = useOperations();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState('');

  const [search, setSearch] = useState(''),
    [categoryFilter, setCategoryFilter] = useState(''),
    [statusFilter, setStatusFilter] = useState(''),
    [page, setPage] = useState(1);

  const filteredProducts = o.products.filter(
    p =>
      (!search || `${p.name} ${p.sku} ${p.barcode}`.toLowerCase().includes(search.toLowerCase())) &&
      (!categoryFilter || p.category === categoryFilter) &&
      (!statusFilter || p.status === statusFilter)
  );

  const pageSize = 12,
    totalPages = Math.ceil(filteredProducts.length / pageSize),
    pageRows = filteredProducts.slice((page - 1) * pageSize, page * pageSize);

  const [form, setForm] = useState<any>({
    name: '',
    price: '',
    category: 'General',
    description: '',
    sku: '',
    barcode: '',
    stock: 0,
    cost: 0,
    tax: 0,
    status: 'active',
    imageUrl: null
  });

  const reset = () => {
    setEditing(null);
    setForm({
      name: '',
      price: '',
      category: o.categories[0]?.name || 'General',
      description: '',
      sku: `SKU-${Date.now()}`,
      barcode: '',
      stock: 0,
      cost: 0,
      tax: 0,
      status: 'active',
      imageUrl: null
    });
    setOpen(true)
  };

  const edit = (p: any) => {
    setEditing(p);
    setForm({ ...p });
    setOpen(true)
  };

  const save = async () => {
    try {
      const category = o.categories.find(c => c.name === form.category);
      const data = {
        ...form,
        price: +form.price,
        stock: +form.stock,
        cost: +form.cost,
        tax: +form.tax,
        categoryId: category?.id || null
      };
      if (editing) await o.updateProduct(editing.id, data);
      else
        await o.addProduct({
          ...data,
          sku: form.sku || `SKU-${Date.now()}`,
          barcode: form.barcode || `BAR-${Date.now()}`
        });
      setOpen(false);
      notify(editing ? 'Product updated.' : 'Product created.')
    } catch (e: any) {
      notify(e.message || 'Could not save product.')
    }
  };

  const remove = async (p: any) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    try {
      await o.deleteProduct(p.id);
      notify('Product deleted.')
    } catch (e: any) {
      notify(e.message || 'Delete failed.')
    }
  };

  const addCategory = async () => {
    if (!catName.trim()) return;
    try {
      await o.addCategory({ name: catName.trim(), active: true });
      setCatName('');
      notify('Category created.')
    } catch (e: any) {
      notify(e.message || 'Category already exists.')
    }
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      notify('CSV is empty.');
      return }
    const parse = (line: string) => {
      const out: string[] = [];
      let cur = '',
        q = false;
      for (const ch of line) {
        if (ch === '"') q = !q;
        else if (ch === ',' && !q) {
          out.push(cur.trim());
          cur = ''
        } else cur += ch
      }
      out.push(cur.trim());
      return out
    };
    const headers = parse(lines[0]).map(x => x.toLowerCase());
    const rows = lines
      .slice(1)
      .map(line => {
        const v = parse(line);
        const x: any = {};
        headers.forEach((h, i) =>x[h] = v[i] ?? '');
        return {
          name: x.name,
          price: Number(x.price || 0),
          category: x.category || 'General',
          description: x.description || '',
          sku: x.sku || `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          barcode: x.barcode || `BAR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          stock: Number(x.stock || 0),
          cost: Number(x.cost || 0),
          tax: Number(x.tax || 0),
          status:(x.status === 'inactive' ? 'inactive' : 'active')}
      })
      .filter(x => x.name && x.price >= 0);
    try {
      const r = await post<any>('/store/products/import', { rows });
      await o.refresh();
      notify(`${r.imported} products imported.`)
    } catch (e: any) {
      notify(e.message || 'CSV import failed.')
    }
  };

  return <div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm text-zawana-500">Manage retail products, pricing, stock defaults and categories.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-black">
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) importCsv(f);
              e.currentTarget.value = ''
            }}
          />CSV import</label>
        <a
          href="/store-products-template.csv"
          download
          className="inline-flex items-center rounded-xl border bg-white px-4 py-2 text-sm font-black"
        >Download template</a>
        <Button variant="secondary" onClick={() => setCatOpen(true)}>Manage categories</Button>
        <Button onClick={reset}>
          <PackagePlus size={16} /> Add product</Button>
      </div>
    </div>

    <Card className="mb-3 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_220px_180px]">
        <input
          aria-label="Search products"
          placeholder="Search name, SKU or barcode"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(1)
          }}
        />
        <Select
          aria-label="Filter products by category"
          value={categoryFilter}
          onChange={e => {
            setCategoryFilter(e.target.value);
            setPage(1)
          }}
        >
          <option value="">All categories</option>
          {o.categories.map(c =>
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          )}
        </Select>
        <Select
          aria-label="Filter products by status"
          value={statusFilter}
          onChange={e => {
            setStatusFilter(e.target.value);
            setPage(1)
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </div>
    </Card>

    <Table
      paginate={false}
      headers={[
        'Product',
        'SKU / Barcode',
        'Category',
        'Stock',
        'Cost',
        'Price',
        'Status',
        'Actions'
      ]}
    >
      {pageRows.map(p =>
        <tr key={p.id}>
          <Cell>
            <div className="flex items-center gap-3">
              {p.imageUrl ?
                <img
                  src={mediaImageSrc(p.imageUrl)}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover"
                /> :
                <div className="h-12 w-12 rounded-lg bg-zawana-50" />}
              <div>
                <b>{p.name}</b>
                <p className="text-xs text-zawana-500">{p.description}</p>
              </div>
            </div>
          </Cell>
          <Cell>
            {p.sku}
            <br />
            <span className="text-xs text-zawana-500">{p.barcode}</span>
          </Cell>
          <Cell>{p.category}</Cell>
          <Cell>
            <span className={p.stock <= 5 ? 'font-black text-red-600' : 'font-bold'}>
              {p.stock}
            </span>
          </Cell>
          <Cell>{money(p.cost)}</Cell>
          <Cell>{money(p.price)}</Cell>
          <Cell>
            <Badge good={p.status === 'active'}>{p.status}</Badge>
          </Cell>
          <Cell>
            <div className="flex gap-1">
              <button className="rounded-xl p-2 hover:bg-zawana-950/5" onClick={() => edit(p)}>
                <Edit3 size={15} />
              </button>
              <button
                className="rounded-xl p-2 text-red-600 hover:bg-red-50"
                onClick={() => remove(p)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </Cell>
        </tr>
      )}
    </Table>
    {!pageRows.length &&
      <Empty title="No products match" body="Adjust the category, status or search filter." />}
    <Pagination
      page={page}
      totalPages={totalPages}
      total={filteredProducts.length}
      onPage={setPage}
    />

    <AnimatePresence>{open &&
      <OpsModal
        title={editing ? 'Edit product' : 'Add product'}
        subtitle="Product prices are tax-exclusive; tax is added at checkout."
        onClose={() => setOpen(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ['name', 'Product name'],
            ['sku', 'SKU'],
            ['barcode', 'Barcode'],
            ['price', 'Selling price'],
            ['cost', 'Cost'],
            ['stock', 'Opening stock'],
            ['tax', 'Tax rate (%) · exclusive']
          ].map(([k, l]) =>
            <label key={k} className="text-sm">
              <span className="text-[11px] font-black uppercase tracking-wider text-zawana-500">
                {l}
              </span>
              <input
                className="mt-1"
                type={['price', 'cost', 'stock', 'tax'].includes(k) ? 'number' : 'text'}
                value={form[k] ?? ''}
                onChange={e => setForm({ ...form, [k]: e.target.value })}
              />
            </label>
          )}
          <label className="text-sm">
            <span className="text-[11px] font-black uppercase tracking-wider text-zawana-500">Category</span>
            <Select
              className="mt-1"
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
            >
              {o.categories.map(c =>
                <option key={c.id}>{c.name}</option>
              )}
              <option>General</option>
            </Select>
          </label>
          <label className="text-sm">
            <span className="text-[11px] font-black uppercase tracking-wider text-zawana-500">Status</span>
            <Select
              className="mt-1"
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-zawana-500">Description</span>
            <textarea
              className="mt-1"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </label>
        </div>
        <div className="mt-4">
          <ImageUpload
            label="Product image"
            value={form.imageUrl}
            onChange={imageUrl => setForm({ ...form, imageUrl })}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save}>Save product</Button>
        </div>
      </OpsModal>}</AnimatePresence>

    <AnimatePresence>{catOpen &&
      <OpsModal
        title="Product categories"
        subtitle="Create, rename or deactivate store categories."
        onClose={() => setCatOpen(false)}
      >
        <div className="flex gap-2">
          <input
            className="flex-1"
            placeholder="New category"
            value={catName}
            onChange={e => setCatName(e.target.value)}
          />
          <Button onClick={addCategory}>Add</Button>
        </div>
        <div className="mt-5 space-y-2">
          {o.categories.map(c =>
            <div key={c.id} className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <b>{c.name}</b>
                <p className="text-xs text-zawana-500">{c.active ? 'Active' : 'Inactive'}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="px-3 py-2"
                  onClick={async () => {
                    const n = prompt('Category name', c.name);
                    if (n && n !== c.name) await o.updateCategory(c.id, { name: n })
                  }}
                >Rename</Button>
                <Button
                  variant="danger"
                  className="px-3 py-2"
                  onClick={async () => {
                    if (confirm(`Delete ${c.name}?`)) await o.deleteCategory(c.id)
                  }}
                >Delete</Button>
              </div>
            </div>
          )}
        </div>
      </OpsModal>}</AnimatePresence>
  </div>
}

function CategoryManager({ notify }: { notify: (s: string) => void }) {
  const o = useOperations();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const save = async () => {
    if (!name.trim()) return;
    try {
      if (editing) await o.updateCategory(editing.id, { name: name.trim() });
      else await o.addCategory({ name: name.trim(), active: true });
      setName('');
      setEditing(null);
      notify(editing ? 'Category updated.' : 'Category created.')
    } catch (e: any) {
      notify(e.message || 'Could not save category.')
    }
  };
  return <div>
    <Card className="mb-5 p-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className="flex-1"
          placeholder="Category name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save()
          }}
        />
        <Button onClick={save}>{editing ? 'Save changes' : 'Add category'}</Button>
        {editing &&
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(null);
              setName('')
            }}
          >Cancel</Button>}
      </div>
    </Card>
    <Table headers={['Category', 'Status', 'Actions']}>
      {o.categories.map(c =>
        <tr key={c.id}>
          <Cell>
            <b>{c.name}</b>
          </Cell>
          <Cell>
            <Badge good={c.active}>{c.active ? 'Active' : 'Inactive'}</Badge>
          </Cell>
          <Cell>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="px-3 py-2"
                onClick={() => {
                  setEditing(c);
                  setName(c.name)
                }}
              >
                <Edit3 size={14} /> Edit</Button>
              <Button
                variant="danger"
                className="px-3 py-2"
                onClick={async () => {
                  if (confirm(`Delete ${c.name}?`)) {
                    try {
                      await o.deleteCategory(c.id);
                      notify('Category deleted.')
                    } catch (e: any) {
                      notify(e.message || 'Delete failed.')
                    }
                  }
                }}
              >
                <Trash2 size={14} /> Delete</Button>
            </div>
          </Cell>
        </tr>
      )}
    </Table>
  </div>
}

function Inventory({ notify }: { notify: (message: string) => void }) {
  const o = useOperations();
  const [category, setCategory] = useState(''),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1);
  const rows = o.products.filter(
    p =>
      (!category || p.category === category) &&
      (!status ||
        (status === 'low'
          ? p.stock <= 5
          : status === 'healthy'
            ? p.stock > 5
            : p.status === status))
  );
  const pageSize = 15,
    totalPages = Math.ceil(rows.length / pageSize),
    visible = rows.slice((page - 1) * pageSize, page * pageSize);
  return <div>
    <div className="mb-5 grid gap-4 sm:grid-cols-3">
      <Stat label="SKUs" value={o.products.length} />
      <Stat label="Low stock" value={o.metrics.lowStock} />
      <Stat label="Categories" value={o.categories.length} />
    </div>
    <Card className="mb-3 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          aria-label="Filter inventory by category"
          value={category}
          onChange={e => {
            setCategory(e.target.value);
            setPage(1)
          }}
        >
          <option value="">All categories</option>
          {o.categories.map(c =>
            <option value={c.name} key={c.id}>
              {c.name}
            </option>
          )}
        </Select>
        <Select
          aria-label="Filter inventory status"
          value={status}
          onChange={e => {
            setStatus(e.target.value);
            setPage(1)
          }}
        >
          <option value="">All inventory statuses</option>
          <option value="low">Low stock</option>
          <option value="healthy">Healthy stock</option>
          <option value="active">Active products</option>
          <option value="inactive">Inactive products</option>
        </Select>
      </div>
    </Card>
    <Table
      paginate={false}
      headers={['Product', 'Category', 'Stock', 'Status', 'Quick adjustment']}
    >
      {visible.map(p =>
        <tr key={p.id}>
          <Cell>
            <b>{p.name}</b>
          </Cell>
          <Cell>{p.category}</Cell>
          <Cell>{p.stock}</Cell>
          <Cell>
            {p.stock <= 5 ? <Badge>Low stock</Badge> : <Badge good>Healthy</Badge>}
            <span className="ml-2 text-xs text-zawana-500">{p.status}</span>
          </Cell>
          <Cell>
            <div className="flex gap-2">
              <Button
                className="px-3 py-2"
                onClick={() =>
                  void o
                    .adjustStock(p.id, 1, 'Manual stock receive')
                    .then(() => notify(`${p.name} stock increased.`))
                    .catch((e: any) => notify(e.message || 'Could not update stock.'))
                }
              >
                <Plus size={14} />
              </Button>
              <Button
                variant="secondary"
                className="px-3 py-2"
                onClick={() =>
                  void o
                    .adjustStock(p.id, -1, 'Manual stock removal')
                    .then(() => notify(`${p.name} stock decreased.`))
                    .catch((e: any) => notify(e.message || 'Could not update stock.'))
                }
              >
                <Minus size={14} />
              </Button>
            </div>
          </Cell>
        </tr>
      )}
    </Table>
    {!visible.length &&
      <Empty title="No inventory matches" body="Adjust the category or stock status." />}
    <Pagination page={page} totalPages={totalPages} total={rows.length} onPage={setPage} />
  </div>
}

function StoreOrders({ notify }: { notify: (s: string) => void }) {
  const o = useOperations();
  return <Table headers={['Order', 'Customer', 'Total', 'Paid', 'Remaining', 'Due', 'Status']}>
    {o.storeOrders.length ?
      o.storeOrders.map(x =>
        <tr key={x.id}>
          <Cell>{x.id}</Cell>
          <Cell>{x.customer}</Cell>
          <Cell>{money(x.total)}</Cell>
          <Cell>{money(x.paid)}</Cell>
          <Cell>{money(x.total - x.paid)}</Cell>
          <Cell>{x.dueDate || '—'}</Cell>
          <Cell>
            <Badge>{x.status}</Badge>
          </Cell>
        </tr>
      ) :
      <tr>
        <Cell>
          <span className="text-zawana-500">No store orders yet. POS pay-later orders will appear here.</span>
        </Cell>
        <Cell>—</Cell>
        <Cell>—</Cell>
        <Cell>—</Cell>
        <Cell>—</Cell>
        <Cell>—</Cell>
        <Cell>—</Cell>
      </tr>}
  </Table>
}

function CafeOrders({ notify }: { notify: (s: string) => void }) {
  const o = useOperations();
  const lanes = ['NEW', 'PREPARING', 'READY', 'DELIVERING', 'COMPLETED'];

  const advance = async (order: any) => {
    const next =
      order.status === 'NEW'
        ? 'PREPARING'
        : order.status === 'PREPARING'
          ? 'READY'
          : order.status === 'READY'
            ?(order.location === 'Cafe'
              ? 'COMPLETED'
              : 'DELIVERING'): 'COMPLETED';
    try {
      await o.updateCafeOrder(order.id, next as any);
      notify(`${order.orderNumber || 'Order'} moved to ${next.toLowerCase()}.`)
    } catch (e: any) {
      notify(e.message || 'Could not update order status.')
    }
  };

  const cancel = async (order: any) => {
    try {
      await o.updateCafeOrder(order.id, 'CANCELLED' as any);
      notify(`${order.orderNumber || 'Order'} cancelled.`)
    } catch (e: any) {
      notify(e.message || 'Could not cancel order.')
    }
  };

  const settle = async (order: any) => {
    try {
      await patch(`/cafe/orders/${order.id}/payment`, { paymentMethod: 'CASH' });
      await o.refresh();
      notify('Cash payment recorded.')
    } catch (e: any) {
      notify(e.message || 'Could not record payment.')
    }
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-zawana-500">Kitchen queue, delivery location, and payment status.</p>
      <Button variant="secondary" onClick={() => void o.refresh()}>
        <RotateCcw size={14} /> Refresh orders</Button>
    </div>
    <div className="grid gap-4 xl:grid-cols-4">
      {lanes.slice(0, 4).map(status => {
        const orders = o.cafeOrders.filter(order => order.status === status);
        return <section key={status} className="min-w-0 rounded-2xl bg-zawana-950/[.035] p-3">
          <div className="mb-3 flex items-center justify-between px-1">
            <h3 className="text-xs font-black uppercase tracking-widest">
              {status.replace('_', ' ')}
            </h3>
            <Badge>{orders.length}</Badge>
          </div>
          <div className="space-y-3">
            {orders.map(order =>
              <Card key={order.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-zawana-gold">
                      {order.orderNumber || order.id.slice(-8)}
                    </p>
                    <h4 className="mt-1 font-black">{order.customer}</h4>
                  </div>
                  <Badge good={order.paymentStatus === 'paid'}>
                    {order.paymentStatus === 'paid'
                      ? 'Paid'
                      : String(order.paymentMethod).replace('_', ' ')}
                  </Badge>
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs font-bold text-zawana-600">
                  <MapPin size={13} />
                  {order.location || order.floor}
                  {order.court?.name ? ` · ${order.court.name}` : ''}
                </p>
                <div className="my-3 space-y-1 border-y py-3 text-xs">
                  {order.items.map((item, index) =>
                    <div
                      key={`${item.id || item.name}-${index}`}
                      className="flex justify-between gap-3"
                    >
                      <span>
                        {item.quantity} Ã— {item.name}
                      </span>
                      <b>{money(item.quantity * item.price)}</b>
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total</span>
                  <b>
                    {money(
                      order.total ??
                        order.items.reduce((sum, item) => sum + item.quantity * item.price, 0)
                    )}
                  </b>
                </div>
                <p className="mt-1 text-[10px] text-zawana-500">
                  {new Date(order.orderTime).toLocaleString()}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {order.paymentStatus !== 'paid' && order.paymentMethod === 'PAY_LATER' &&
                    <Button
                      variant="secondary"
                      className="px-3 py-2"
                      onClick={() => void settle(order)}
                    >Collect cash</Button>}
                  <Button className="px-3 py-2" onClick={() => void advance(order)}>
                    {status === 'NEW'
                      ? 'Start preparing'
                      : status === 'PREPARING'
                        ? 'Mark ready'
                        : status === 'READY' && order.location !== 'Cafe'
                          ? 'Send delivery'
                          : 'Complete'}
                  </Button>
                  {['NEW', 'PREPARING'].includes(status) &&
                    <Button
                      variant="danger"
                      className="px-3 py-2"
                      onClick={() => void cancel(order)}
                    >Cancel</Button>}
                </div>
              </Card>)}
            {!orders.length &&
              <p className="rounded-xl border border-dashed p-5 text-center text-xs text-zawana-400">No {status.toLowerCase()} orders.</p>}
          </div>
        </section>
      })}
    </div>
    <details className="rounded-2xl border bg-white p-4">
      <summary className="cursor-pointer text-sm font-black">Completed and cancelled orders</summary>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {o.cafeOrders
          .filter(order => ['COMPLETED', 'CANCELLED'].includes(order.status))
          .map(order =>
            <div key={order.id} className="rounded-xl bg-zawana-50 p-3 text-sm">
              <div className="flex justify-between gap-2">
                <b>{order.orderNumber || order.id}</b>
                <Badge>{order.status}</Badge>
              </div>
              <p className="mt-1">
                {order.customer} · {order.location || order.floor}
              </p>
              <p className="mt-1 text-xs text-zawana-500">
                {money(order.total || 0)} · {order.paymentStatus}
              </p>
            </div>
          )}
      </div>
    </details>
  </div>
}

function CafeMenu() {
  const o = useOperations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({
    name: '',
    category: 'Coffee',
    description: '',
    price: '',
    available: true,
    imageUrl: null
  });

  const reset = () => {
    setEditing(null);
    setForm({
      name: '',
      category: 'Coffee',
      description: '',
      price: '',
      available: true,
      imageUrl: null
    });
    setOpen(true)
  };

  const edit = (m: any) => {
    setEditing(m);
    setForm({ ...m });
    setOpen(true)
  };

  const save = async () => {
    try {
      const data = { ...form, price: +form.price };
      if (editing) await o.updateMenuItem(editing.id, data);
      else await o.addMenuItem(data);
      setOpen(false)
    } catch (e: any) {
      window.dispatchEvent(
        new CustomEvent('zawana-toast', { detail: e.message || 'Could not save menu item.' })
      )
    }
  };

  return <div>
    <div className="mb-5 flex items-center justify-between">
      <p className="text-sm text-zawana-500">Cafe menu photos appear in POS and customer ordering.</p>
      <Button onClick={reset}>
        <Plus size={15} /> Add menu item</Button>
    </div>

    <Table headers={['Item', 'Category', 'Price', 'Availability', 'Actions']}>
      {o.menu.map(m =>
        <tr key={m.id}>
          <Cell>
            <div className="flex items-center gap-3">
              {m.imageUrl ?
                <img
                  src={mediaImageSrc(m.imageUrl)}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover"
                /> :
                <div className="h-12 w-12 rounded-lg bg-zawana-50" />}
              <div>
                <b>{m.name}</b>
                <p className="text-xs text-zawana-500">{m.description}</p>
              </div>
            </div>
          </Cell>
          <Cell>{m.category}</Cell>
          <Cell>{money(m.price)}</Cell>
          <Cell>
            <Badge good={m.available}>{m.available ? 'Available' : 'Hidden'}</Badge>
          </Cell>
          <Cell>
            <div className="flex gap-1">
              <button className="rounded-xl p-2" onClick={() => edit(m)}>
                <Edit3 size={15} />
              </button>
              <button
                className="rounded-xl p-2 text-red-600"
                onClick={async () => {
                  if (confirm(`Delete ${m.name}?`)) await o.deleteMenuItem(m.id)
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </Cell>
        </tr>
      )}
    </Table>

    <AnimatePresence>{open &&
      <OpsModal
        title={editing ? 'Edit menu item' : 'Add menu item'}
        onClose={() => setOpen(false)}
      >
        <div className="grid gap-4">
          <input
            placeholder="Item name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder="Category"
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
          />
          <input
            type="number"
            min="0"
            placeholder="Price"
            value={form.price}
            onChange={e => setForm({ ...form, price: e.target.value })}
          />
          <textarea
            placeholder="Description"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
          <ImageUpload
            label="Menu item image"
            value={form.imageUrl}
            onChange={imageUrl => setForm({ ...form, imageUrl })}
          />
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={form.available}
              onChange={e => setForm({ ...form, available: e.target.checked })}
            /> Available for POS / customer ordering</label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save}>Save menu item</Button>
        </div>
      </OpsModal>}</AnimatePresence>
  </div>
}

function CafePOS({ notify }: { notify: (s: string) => void }) {
  const { user } = useAuth();
  const [items, setItems] = useState<
    { id: string; name: string; price: number; qty: number; imageUrl?: string | null }[]
  >([]);
  const [location, setLocation] = useState<(typeof CAFE_LOCATIONS)[number]>('Cafe');
  const [courtId, setCourtId] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [paymentMethod, setPaymentMethod] = useState<(typeof CAFE_PAYMENT_METHODS)[number]>('CASH');
  const [customer, setCustomer] = useState('');
  const [discount, setDiscount] = useState(0);
  const [busy, setBusy] = useState(false);
  const o = useOperations();

  const menu = o.menu.filter(
    item =>
      item.available &&
      (!search ||
        `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase())) &&
      (category === 'All' || item.category === category)
  );
  const categories = ['All', ...new Set(o.menu.map(item => item.category))];
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = Math.max(0, subtotal - discount);
  const usesCourt = location.includes('Badminton Court');

  const add = (item: any) =>
    setItems(current => {
      const row = current.find(entry => entry.id === item.id);
      return row
        ? current.map(entry =>entry.id === item.id ? { ...entry, qty: entry.qty + 1 } : entry)
        : [
            ...current,
            { id: item.id, name: item.name, price: item.price, qty: 1, imageUrl: item.imageUrl }
          ]
    });

  const changeQty = (id: string, delta: number) =>
    setItems(current =>
      current.flatMap(item =>
        item.id !== id ? [item] : item.qty + delta < 1 ? [] : [{ ...item, qty: item.qty + delta }]
      )
    );

  const checkout = async () => {
    if (!items.length) return;
    const printTarget = paymentMethod === 'CASH' ? openReceiptWindow() : null;
    let receiptWarning = '';
    setBusy(true);
    try {
      const result: any = await o.addCafeOrder({
        location,
        ...(usesCourt && courtId ? { courtId } : {}),
        ...(customer.trim() ? { customer: customer.trim() } : {}),
        items: items.map(item => ({ id: item.id, quantity: item.qty })),
        discount,
        paymentMethod
      });
      const order = result?.order;
      if (paymentMethod === 'CASH') {
        try {
          await printReceipt(
            {
              business: 'ZAWANA CAFE',
              customer: customer || 'Walk-in Customer',
              items: items.map(item => ({ name: item.name, qty: item.qty, price: item.price })),
              subtotal: Number(order?.subtotal ?? subtotal),
              discount: Number(order?.discount ?? discount),
              tax: Number(order?.tax ?? 0),
              total: Number(order?.total ?? total),
              paymentMethod: 'Cash',
              reference: order?.orderNumber,
              location,
              staff: user?.name || "Cafe",
              court: o.managedCourts.find(row => row.id === courtId)?.name
            },
            printTarget
          )
        } catch (printError: any) {
          receiptWarning = printError.message || 'Order saved; receipt printing failed.'
        }
      }
      setItems([]);
      setDiscount(0);
      setCustomer('');
      notify(receiptWarning || result?.message || `Order ${order?.orderNumber || ''} created.`)
    } catch (e: any) {
      printTarget?.close();
      notify(e.message || 'Could not create cafe order.')
    } finally {
      setBusy(false)
    }
  };

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
    <section className="min-w-0">
      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-3.5 text-zawana-400" size={16} />
            <input
              className="w-full pl-10"
              aria-label="Search cafe menu"
              placeholder="Search coffee, food, drinks…"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </label>
          <SegmentedControl label="Menu category" value={category} onChange={setCategory}
            options={categories.map(value => ({ value, label: value }))} />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {menu.map(item =>
          <button
            key={item.id}
            onClick={() => add(item)}
            className="overflow-hidden rounded-2xl border bg-white text-left transition hover:-translate-y-0.5 hover:border-zawana-gold hover:shadow-lg"
          >
            <div className="h-36 bg-zawana-50">
              {item.imageUrl ?
                <img
                  src={mediaImageSrc(item.imageUrl)}
                  alt={item.name}
                  className="h-full w-full object-cover"
                /> :
                <div className="grid h-full place-items-center text-xs font-bold text-zawana-400">Zawana Cafe</div>}
            </div>
            <div className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-zawana-gold">
                {item.category}
              </p>
              <b className="mt-1 block">{item.name}</b>
              <span className="mt-2 block text-sm font-black">{money(item.price)}</span>
            </div>
          </button>)}
      </div>

      {!menu.length &&
        <Card className="p-6">
          <p className="text-sm text-zawana-500">No menu items match that search.</p>
        </Card>}
    </section>

    <Card className="h-fit p-5 xl:sticky xl:top-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart size={18} />
          <h2 className="text-xl font-black">Current order</h2>
        </div>
        <Badge>{items.reduce((sum, item) => sum + item.qty, 0)} items</Badge>
      </div>

      <div className="mt-4 max-h-[32vh] space-y-2 overflow-y-auto">
        {items.map(item =>
          <div key={item.id} className="flex items-center gap-3 rounded-xl bg-zawana-50 p-2">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white">
              {item.imageUrl &&
                <img
                  src={mediaImageSrc(item.imageUrl)}
                  alt=""
                  className="h-full w-full object-cover"
                />}
            </div>
            <div className="min-w-0 flex-1">
              <b className="block truncate text-sm">{item.name}</b>
              <span className="text-xs text-zawana-500">{money(item.price)} each</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                aria-label={`Remove one ${item.name}`}
                className="grid h-8 w-8 place-items-center rounded-lg border bg-white"
                onClick={() => changeQty(item.id, -1)}
              >
                <Minus size={14} />
              </button>
              <b className="min-w-4 text-center">{item.qty}</b>
              <button
                aria-label={`Add one ${item.name}`}
                className="grid h-8 w-8 place-items-center rounded-lg border bg-white"
                onClick={() => changeQty(item.id, 1)}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        )}
        {!items.length &&
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-zawana-400">Select menu items to start an order.</div>}
      </div>

      <div className="mt-4 grid gap-3">
        <label className="text-[10px] font-black uppercase tracking-widest text-zawana-500">Order location<Select
            className="mt-1 w-full"
            value={location}
            onChange={event => {
              setLocation(event.target.value as (typeof CAFE_LOCATIONS)[number]);
              setCourtId('')
            }}
          >
            {CAFE_LOCATIONS.map(option =>
              <option key={option}>{option}</option>
            )}
          </Select>
        </label>
        {usesCourt &&
          <label className="text-[10px] font-black uppercase tracking-widest text-zawana-500">Court (optional)<Select
              className="mt-1 w-full"
              value={courtId}
              onChange={event => setCourtId(event.target.value)}
            >
              <option value="">Choose court</option>
              {o.managedCourts.map(court =>
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              )}
            </Select>
          </label>}
        <input
          aria-label="Customer name"
          className="w-full"
          placeholder="Customer or table name"
          value={customer}
          onChange={event => setCustomer(event.target.value)}
        />
        <label className="text-[10px] font-black uppercase tracking-widest text-zawana-500">Discount<input
            className="mt-1 w-full"
            type="number"
            min="0"
            max={subtotal}
            value={discount || ''}
            onChange={event =>
              setDiscount(Math.min(subtotal, Math.max(0, Number(event.target.value))))
            }
          />
        </label>
      </div>

      <div className="mt-4 space-y-2 border-t pt-4 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <b>{money(subtotal)}</b>
        </div>
        <div className="flex justify-between">
          <span>Discount</span>
          <b>âˆ’{money(discount)}</b>
        </div>
        <div className="flex justify-between text-xl font-black">
          <span>Total</span>
          <b>{money(total)}</b>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-zawana-500">Online orders stay unpaid until a verified payment flow is connected. No payment is marked successful here.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {CAFE_PAYMENT_METHODS.map(method =>
          <button
            key={method}
            onClick={() => setPaymentMethod(method)}
            className={`min-h-11 rounded-xl border px-2 text-[10px] font-black ${paymentMethod === method ? 'border-zawana-950 bg-zawana-950 text-white' : 'bg-white'}`}
          >
            {method.replace('_', ' ')}
          </button>
        )}
      </div>
      <Button
        disabled={!items.length || busy}
        className="mt-3 w-full"
        onClick={() => void checkout()}
      >
        {busy
          ? 'Saving order…'
          : paymentMethod === 'CASH'
            ? 'Record cash & send'
            : 'Create online order'}
      </Button>
    </Card>
  </div>
}

function POS({
  mode,
  cart,
  setCart,
  discount,
  setDiscount,
  notify
}: {
  mode: 'store' | 'badminton';
  cart: any[];
  setCart: (x: any[]) => void;
  discount: number;
  setDiscount: (x: number) => void;
  notify: (s: string) => void
}) {
  const o = useOperations();
  const [productQuery, setProductQuery] = useState(''),
    [discountRate, setDiscountRate] = useState(0),
    [customer, setCustomer] = useState('Walk-in Customer'),
    [dueDate, setDueDate] = useState(
      new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    );
  const allProducts =
    mode === 'store'
      ? o.products.filter(p => p.status === 'active')
      : o.badmintonPackages
          .filter(p => p.status === 'active')
          .map(p => ({ id: p.id, name: p.title, price: p.price, tax: 0 }));
  const products = allProducts.filter(
    p =>
      !productQuery ||
      `${p.name} ${'sku' in p ? p.sku : ''} ${'barcode' in p ? p.barcode : ''}`
        .toLowerCase()
        .includes(productQuery.toLowerCase())
  );
  const subtotal = cart.reduce((sum, x) => sum + x.price * x.qty, 0),
    taxBase =
      mode === 'store'
        ? cart.reduce((sum, x) => sum +x.price * x.qty * (x.tax || 0) / 100, 0)
        : 0,
    discountAmount = Math.min(subtotal, Math.round(subtotal * discountRate / 100)),
    tax = subtotal ? Math.round(taxBase * (subtotal - discountAmount) / subtotal) : 0,
    final = subtotal - discountAmount + tax;
  const [busy, setBusy] = useState(false);
  const add = (p: any) => {
    const found = cart.find(x => x.id === p.id);
    setCart(
      found
        ? cart.map(x =>x.id === p.id ? { ...x, qty: x.qty + 1 } : x)
        : [...cart, { id: p.id, name: p.name, price: p.price, tax: p.tax || 0, qty: 1 }]
    )
  };
  const complete = async (paymentMethod: 'Cash' | 'Pay Later' | 'Pay Online') => {
    if (!cart.length) {
      notify('Cart is empty.');
      return }
    if (paymentMethod === 'Pay Online') {
      notify('Online checkout is not configured yet. No payment or sale was recorded.');
      return }
    if (paymentMethod === 'Pay Later' && !customer.trim()) {
      notify('Customer name is required for pay later.');
      return }
    const printTarget = paymentMethod === 'Cash' && mode === 'store' ? openReceiptWindow() : null;
    let receiptWarning = '';
    setBusy(true);
    const business = mode === 'store' ? 'Store' : 'Badminton';
    const items = cart.map(x => ({ name: x.name, qty: x.qty, price: x.price }));
    try {
      let savedOrder: any = null;
      if (mode === 'store') {
        savedOrder = await o.addStoreOrder({
          customer: customer.trim() || 'Walk-in Customer',
          total: final,
          discount: discountAmount,
          tax,
          paid: paymentMethod === 'Pay Later' ? 0 : final,
          itemSummary: items.map(x => `${x.name} ×${x.qty}`).join(', '),
          dueDate: paymentMethod === 'Pay Later' ? dueDate : undefined,
          status: paymentMethod === 'Pay Later' ? 'pending' : 'paid',
          paymentMethod,
          items: cart.map(x => ({ productId: x.id, quantity: x.qty }))
        });
      } else {
        await o.addTransaction({
          date: today,
          customer: customer || 'Walk-in Customer',
          business,
          item: items.map(x => x.name).join(', '),
          amount: subtotal,
          discount: discountAmount,
          tax,
          finalAmount: final,
          paymentMethod,
          staff: 'Badminton FO',
          status: paymentMethod === 'Pay Later' ? 'pending' : 'paid'
        });
      }
      if (paymentMethod === 'Cash' && mode === 'store') {
        try {
          const savedItems = Array.isArray(savedOrder?.items)
            ? savedOrder.items.map((line: any) => ({
                name: String(line.name || 'Item'),
                qty: Number(line.quantity || 1),
                price: Number(line.price || 0)
              }))
            : items;
          const savedDiscount = Number(savedOrder?.discount ?? discountAmount),
            savedTax = Number(savedOrder?.tax ?? tax),
            savedTotal = Number(savedOrder?.total ?? final);
          await printReceipt(
            {
              business,
              customer: customer || 'Walk-in Customer',
              items: savedItems,
              subtotal: savedTotal + savedDiscount - savedTax,
              discount: savedDiscount,
              tax: savedTax,
              total: savedTotal,
              paymentMethod,
              reference: savedOrder?.id
                ? `STORE-${String(savedOrder.id).slice(-8).toUpperCase()}`
                : `ZW-${Date.now().toString().slice(-6)}`
            },
            printTarget
          )
        } catch (printError: any) {
          receiptWarning = printError.message || 'Sale saved; receipt printing failed.'
        }
      }
      setCart([]);
      setDiscount(0);
      setDiscountRate(0);
      notify(
        receiptWarning ||
          (paymentMethod === 'Pay Later'
            ? 'Pay-later order saved.'
            : `Cash sale recorded · ${money(final)}.`)
      )
    } catch (e: any) {
      printTarget?.close();
      notify(e.message || 'Could not complete this sale.')
    } finally {
      setBusy(false)
    }
  };
  return <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
    <Card className="p-5 md:p-6">
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="flex items-center gap-3 rounded-xl border px-3">
          <ScanLine />
          <input
            autoFocus
            className="w-full border-0 p-3 outline-none"
            placeholder="Scan barcode or search product"
            value={productQuery}
            onChange={e => setProductQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const p = products.find(
                  x =>
                    x.name.toLowerCase() === productQuery.toLowerCase() ||
                    ('barcode' in x && x.barcode === productQuery)
                );
                if (p) {
                  add(p);
                  setProductQuery('')
                }
              }
            }}
          />
        </div>
        {mode === 'store' &&
          <input
            className="rounded-xl border p-3"
            placeholder="Customer name"
            value={customer}
            onChange={e => setCustomer(e.target.value)}
          />}
      </div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-black">
            {mode === 'store' ? 'Store products' : 'Badminton packages'}
          </h2>
          <p className="text-xs text-zawana-500">{products.length} items available</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {products.map(p =>
          <button
            key={p.id}
            onClick={() => add(p)}
            className="overflow-hidden rounded-2xl border bg-white text-left transition hover:border-zawana-gold"
          >
            {'imageUrl' in p && typeof p.imageUrl === 'string' && p.imageUrl ?
              <img
                src={mediaImageSrc(p.imageUrl)}
                alt={p.name}
                className="h-32 w-full object-cover"
              /> :
              <div className="grid h-32 place-items-center bg-zawana-50 text-xs text-zawana-400">
                {mode === 'store' && 'stock' in p ? `Stock ${p.stock}` : 'Zawana'}
              </div>}
            <div className="p-4">
              <b>{p.name}</b>
              <p className="mt-1 text-sm text-zawana-500">
                {money(p.price)}
                {mode === 'store' && 'tax' in p &&
                  <span className="ml-2">· {p.tax}% tax excl.</span>}
              </p>
            </div>
          </button>)}
      </div>
      {!products.length &&
        <Empty title="No matching products" body="Search another product name or barcode." />}
    </Card>
    <Card className="h-fit p-5 md:sticky md:top-5 md:p-6">
      <div className="flex items-center gap-2">
        <ShoppingCart size={18} />
        <h2 className="text-xl font-black">Cart <span className="text-sm text-zawana-500">({cart.reduce((sum, x) => sum + x.qty, 0)})</span>
        </h2>
      </div>
      <div className="my-5 max-h-72 space-y-3 overflow-y-auto">
        {cart.map(x =>
          <div
            key={x.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-zawana-950/4 p-3"
          >
            <div>
              <b>{x.name}</b>
              <p className="text-xs text-zawana-500">
                {x.qty} × {money(x.price)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <b>{money(x.qty * x.price)}</b>
              <button
                aria-label={`Remove ${x.name}`}
                onClick={() => setCart(cart.filter(i => i.id !== x.id))}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        {!cart.length &&
          <p className="rounded-xl border border-dashed p-5 text-center text-sm text-zawana-400">Scan or select an item to begin.</p>}
      </div>
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-wider text-zawana-500">Discount preset</p>
        <div className="grid grid-cols-5 gap-2">
          {[0, 5, 10, 15, 20].map(rate =>
            <button
              key={rate}
              onClick={() => {
                setDiscountRate(rate);
                setDiscount(Math.round(subtotal * rate / 100))
              }}
              className={`rounded-lg border px-2 py-2 text-xs font-black ${discountRate === rate ? 'border-zawana-950 bg-zawana-950 text-white' : ''}`}
            >
              {rate}%</button>)}
        </div>
      </div>
      {mode === 'store' && discountRate > 0 &&
        <p className="mt-2 text-xs text-zawana-500">Preset discount: {money(discountAmount)}</p>}
      {mode === 'store' &&
        <input
          className="mt-3 w-full rounded-xl border p-3"
          type="date"
          aria-label="Pay later due date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
        />}
      <div className="mt-4 space-y-2 border-t pt-4 text-sm">
        <div className="flex justify-between">
          <span>Subtotal · tax exclusive</span>
          <b>{money(subtotal)}</b>
        </div>
        <div className="flex justify-between">
          <span>Discount · {discountRate}%</span>
          <b>-{money(discountAmount)}</b>
        </div>
        {mode === 'store' &&
          <div className="flex justify-between">
            <span>Tax</span>
            <b>{money(tax)}</b>
          </div>}
        <div className="flex justify-between border-t pt-3 text-xl">
          <span>Total</span>
          <b>{money(final)}</b>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button disabled={busy || !cart.length} onClick={() => void complete('Cash')}>Pay cash</Button>
        <Button
          disabled={busy || !cart.length}
          variant="secondary"
          onClick={() => void complete('Pay Later')}
        >Pay later</Button>
        <Button
          disabled={busy || !cart.length}
          variant="secondary"
          onClick={() => void complete('Pay Online')}
        >Pay online</Button>
      </div>
      <p className="mt-3 text-center text-[11px] text-zawana-500">Online checkout will not record a sale until KPay is configured.</p>
    </Card>
  </div>
}

function CourtDesk({ notify }: { notify: (s: string) => void }) {
  const o = useOperations();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [court, setCourt] = useState<any>(null);
  const [slot, setSlot] = useState('');
  const [walkInName, setWalkInName] = useState('Walk-in Customer');

  const [saving, setSaving] = useState(false);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [holiday, setHoliday] = useState<any>(null);
  const [dateOverride, setDateOverride] = useState<any>(null);
  const [overrideType, setOverrideType] = useState<'open' | 'closed'>('open');
  const [overrideTitle, setOverrideTitle] = useState('Holiday');
  const [overrideReason, setOverrideReason] = useState('');
  const [classTitle, setClassTitle] = useState('Badminton Class');

  const bookings = o.courtBookings.filter(b => b.date === date);

  const dayName = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });

  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

  const to24 = (value: string) => {
    const r = rangeOf(value);
    if (!r) return null;
    const f = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return { start: f(r.start), end: f(r.end) };
  };

  const refreshBlocks = async () => {
    try {
      const [availability, weekly] = await Promise.all([
        get<any>(`/bookings/availability?date=${date}`),

        get<any[]>(`/court-blocks?date=${date}&courtId=${court?.id || ''}`),
      ]);

      const merged = [...(weekly || []), ...(availability.blocks || [])];

      const unique = Array.from(new Map(merged.map((b: any) => [b.id, b])).values());

      setBlocks(unique);
      setHoliday(availability.holiday || null);
      setDateOverride(availability.dateOverride || null);
      setOverrideType(availability.dateOverride?.type || 'open');
      setOverrideTitle(availability.dateOverride?.title || 'Holiday');
      setOverrideReason(availability.dateOverride?.reason || '');
    } catch {
      try {
        const weekly = await get<any[]>(`/court-blocks?date=${date}&courtId=${court?.id || ''}`);
        setBlocks(weekly || []);
      } catch {}
    }
  };

  const saveDateOverride = async () => {
    setSaving(true);
    try {
      const result = await put<any>(`/badminton/date-overrides/${date}`, {
        type: overrideType,
        title: overrideTitle.trim() || 'Holiday',
        reason: overrideReason.trim() || undefined
      });
      setDateOverride(result);
      await refreshBlocks();
      notify(
        `One-day ${result.type === 'open' ? 'open availability' : 'closure'} saved for ${date}. Weekly schedules are unchanged.`
      )
    } catch (e: any) {
      notify(e.message || 'Could not save the date override.')
    } finally {
      setSaving(false)
    }
  };

  const removeDateOverride = async () => {
    setSaving(true);
    try {
      await del(`/badminton/date-overrides/${date}`);
      setDateOverride(null);
      await refreshBlocks();
      notify('Date override removed. The normal weekly schedule applies again.')
    } catch (e: any) {
      notify(e.message || 'Could not remove the date override.')
    } finally {
      setSaving(false)
    }
  };

  useEffect(() => {
    refreshBlocks()
  }, [date, o.courtBookings.length, court?.id]);

  const isBlocked = (c: any, t: string) =>
    blocks.some(
      b => b.courtId === c.id && b.active !== false && slotOverlaps(`${b.start} â€” ${b.end}`, t)
    );

  const isBusy = (c: any, t: string) =>
    c.status !== 'available' ||
    bookings.some(
      b => b.court === c.name && slotOverlaps(b.time, t) && !['cancelled'].includes(b.status)
    ) ||
    isBlocked(c, t);

  const status = (c: any, t: string) =>
    c.status !== 'available'
      ? 'maintenance'
      : isBlocked(c, t)
        ? 'class'
        : isBusy(c, t)
          ? 'booked'
          : 'open';

  const slotPrice = (c: any, t: string) =>
    holiday?.active
      ? Number(holiday.price)
      : Number(c.price) + (courtSlots.indexOf(t) >= 9 ? 5000 : 0);

  const reserveClass = async () => {
    if (!court || !slot || isBusy(court, slot)) {
      notify('Select an open court slot first.');
      return }

    const range = to24(slot);
    if (!range) {
      notify('Invalid court slot.');
      return }

    setSaving(true);

    try {
      await post('/court-blocks', {
        courtId: court.id,
        dayOfWeek,
        start: range.start,
        end: range.end,
        title: classTitle || 'Badminton Class',
        type: 'class',
        active: true
      });

      await refreshBlocks();
      setSlot('');
      notify(`${court.name} reserved every ${dayName} · ${slot}.`);
    } catch (e: any) {
      notify(e.message || 'Could not reserve class time.');

      await refreshBlocks();
    } finally {
      setSaving(false)
    }
  };

  const unreserve = async (block: any) => {
    if (
      !confirm(
        `Unreserve ${block.title || 'this class'} every ${dayName} at ${block.start}–${block.end}?`
      )
    )
      return;

    setSaving(true);

    try {
      await del(`/court-blocks/${block.id}`);
      await refreshBlocks();
      notify(`${block.title || 'Class'} has been unreserved.`)
    } catch (e: any) {
      notify(e.message || 'Could not unreserve class.')
    } finally {
      setSaving(false)
    }
  };

  const bookWalkIn = async () => {
    if (!court || !slot || isBusy(court, slot)) {
      notify('That court slot is no longer available.');
      return }
    setSaving(true);
    try {
      await post<any>('/bookings', {
        kind: 'court',
        title: court.name,
        date,
        time: slot,
        location: 'Zawana Badminton Arena',
        price: slotPrice(court, slot),
        courtId: court.id,
        meta: JSON.stringify({ source: 'walk_in', customerName: walkInName || 'Walk-in Customer' }),
        paymentStatus: 'pending'
      });
      await o.refresh();
      notify(`${court.name} reserved for ${walkInName || 'Walk-in Customer'} · ${slot}.`);
      setCourt(null);
      setSlot('')
    } catch (e: any) {
      notify(e.message || 'Walk-in booking failed.');
      await o.refresh()
    } finally {
      setSaving(false)
    }
  };

  const activeClassBlocks = blocks.filter(
    b => b.courtId === court?.id && b.type === 'class' && b.active !== false
  );

  return <div>
    <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto]">
      <div className="rounded-[24px] bg-zawana-950 p-5 text-white">
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-zawana-gold">Cinema-style court board</p>
        <h2 className="mt-1 text-2xl font-black">Tap a court to inspect 6 AM — 9 PM</h2>
        <p className="mt-1 text-xs text-white/50">15 one-hour slots. Gold = open · red = booked · 🔒 bright red = weekly class reserved · dark = maintenance.</p>
      </div>
      <label className="rounded-[24px] border border-zawana-950/8 bg-white p-5">
        <span className="block text-[10px] font-black uppercase tracking-widest text-zawana-500">Operating day</span>
        <input
          className="mt-2"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </label>
    </div>

    <Card className="mb-5 p-5">
      <div className="grid gap-4 md:grid-cols-[1fr_180px_1fr_auto] md:items-end">
        <label className="text-xs font-bold">One-day availability override<input
            className="mt-2 w-full"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </label>
        <label className="text-xs font-bold">Override type<Select
            className="mt-2 w-full"
            value={overrideType}
            onChange={e => setOverrideType(e.target.value as 'open' | 'closed')}
          >
            <option value="open">Holiday · open</option>
            <option value="closed">Closed all day</option>
          </Select>
        </label>
        <label className="text-xs font-bold">Holiday / closure label<input
            className="mt-2 w-full"
            value={overrideTitle}
            onChange={e => setOverrideTitle(e.target.value)}
            placeholder="e.g. Public holiday"
          />
        </label>
        <div className="flex gap-2">
          <Button disabled={saving} onClick={saveDateOverride}>
            {saving ? 'Saving…' : 'Apply to date'}
          </Button>
          {dateOverride &&
            <Button variant="secondary" disabled={saving} onClick={removeDateOverride}>Remove</Button>}
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-zawana-500">This affects {date} only. Holiday · open makes courts bookable despite recurring weekday reservations; bookings, maintenance and date-specific court blocks still apply. Removing it restores the normal weekly schedule.</p>
      {dateOverride &&
        <p className="mt-2 text-xs font-bold text-zawana-accent">Active for this date: {dateOverride.title} · {dateOverride.type === 'open' ? 'weekly schedule bypassed' : 'courts closed'}
          {dateOverride.reason ? ` · ${dateOverride.reason}` : ''}
        </p>}
    </Card>

    {holiday?.active &&
      <div className="mb-5 rounded-2xl border border-zawana-gold/30 bg-zawana-gold/10 p-4 text-sm font-black">Public holiday · {holiday.title} · {Number(holiday.price).toLocaleString()} MMK / hour</div>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {o.managedCourts.map(c => {
        const openSlots = courtSlots.filter(t => status(c, t) === 'open').length;
        const blockedSlots = courtSlots.filter(t =>
          ['booked', 'class', 'maintenance'].includes(status(c, t))
        ).length;
        return <button
          key={c.id}
          onClick={() => setCourt(c)}
          className="group overflow-hidden rounded-[28px] border border-zawana-950/8 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-2xl"
        >
          <div className="relative h-40 overflow-hidden bg-zawana-950 p-5 text-white">
            <div className="absolute inset-4 rounded-2xl border border-white/12">
              <div className="absolute left-1/2 top-0 h-full w-px bg-white/12" />
              <div className="absolute inset-x-[18%] top-1/2 h-px bg-white/12" />
              <div className="absolute inset-x-[8%] top-[30%] h-[40%] rounded-xl border border-white/10" />
            </div>
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zawana-gold">
                  {c.type} court</p>
                <h3 className="mt-1 text-2xl font-black">{c.name}</h3>
              </div>
              <Badge good={c.status === 'available'}>{c.status}</Badge>
            </div>
            <div className="absolute bottom-4 left-5 right-5 flex justify-between text-xs">
              <span className="text-white/55">{money(c.price)} normal · +5,000 peak</span>
              <b>{openSlots} open</b>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-black">
              <div className="rounded-xl bg-zawana-gold/12 p-3">
                <b className="block text-lg">{openSlots}</b>
                <span className="text-[9px] uppercase tracking-wider text-zawana-500">Open</span>
              </div>
              <div className="rounded-xl bg-red-50 p-3">
                <b className="block text-lg text-red-700">{blockedSlots}</b>
                <span className="text-[9px] uppercase tracking-wider text-zawana-500">Reserved</span>
              </div>
              <div className="rounded-xl bg-zawana-900 p-3">
                <b className="block text-lg">15</b>
                <span className="text-[9px] uppercase tracking-wider text-zawana-500">Slots</span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs font-bold text-zawana-500">
              <span>Open court board</span>
              <Eye size={15} />
            </div>
          </div>
        </button>
      })}
    </div>

    {!o.managedCourts.length &&
      <Empty
        title="No courts configured"
        body="Admin must create courts before the FO can accept rentals."
      />}

    <AnimatePresence>{court &&
      <OpsModal
        wide
        title={`${court.name} · availability`}
        subtitle={`${date} · ${dayName} · 06:00 AM — 09:00 PM · one-hour sessions`}
        onClose={() => {
          setCourt(null);
          setSlot('')
        }}
      >
        <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <div className="mb-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="rounded-full bg-zawana-gold/15 px-3 py-2">Normal · {money(court.price)}
              </span>
              <span className="rounded-full bg-zawana-purple/15 px-3 py-2">Peak · {money(Number(court.price) + 5000)}
              </span>
              <span className="rounded-full bg-red-50 px-3 py-2">Holiday · {money(holiday?.price || 30000)}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {courtSlots.map(t => {
                const st = status(court, t);
                const booking = bookings.find(
                  b =>
                    b.court === court.name && slotOverlaps(b.time, t) && b.status !== 'cancelled'
                );
                const block = blocks.find(
                  b =>
                    b.courtId === court.id &&
                    b.active !== false &&
                    slotOverlaps(`${b.start} â€” ${b.end}`, t)
                );
                const reserved = st === 'class';
                return <button
                  key={t}
                  onClick={() => {
                    if (st === 'open') setSlot(t)
                  }}
                  disabled={st !== 'open'}
                  aria-label={`${t} ${reserved ? `reserved every ${dayName}` : st !== 'open' ? st : 'available'}`}
                  className={`group relative min-h-[118px] overflow-hidden rounded-2xl border-2 p-4 text-left transition ${st === 'open' ? 'border-zawana-gold bg-zawana-gold/8 hover:-translate-y-0.5 hover:shadow-lg' : reserved ? 'border-red-600 bg-red-600 text-white shadow-[0_10px_28px_rgba(220,38,38,.25)]' : 'border-red-200 bg-red-50 text-red-900'} ${slot === t ? 'ring-2 ring-zawana-gold ring-offset-2' : ''}`}
                >
                  <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-[28px] bg-black/5" />

                  <div className="relative flex items-start justify-between gap-3">
                    <span
                      className={`text-sm font-black ${reserved ? 'text-white' : 'text-zawana-950'}`}
                    >
                      {t}
                    </span>
                    {reserved ?
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-red-700 shadow-sm">
                        <LockKeyhole size={11} /> RESERVED</span> :
                      <span
                        className={`h-3 w-3 rounded-full ring-4 ${st === 'open' ? 'bg-zawana-gold ring-zawana-gold/20' : 'bg-red-500 ring-red-500/15'}`}
                      />}
                  </div>

                  {reserved ?
                    <div className="relative mt-5">
                      <p className="text-[11px] font-black uppercase tracking-[.12em] text-white">WEEKLY CLASS</p>
                      <p className="mt-1 truncate text-xs font-bold text-white/85">
                        {block?.title || 'Class reservation'}
                      </p>
                      <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-black/15 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white">Every {dayName} · Unavailable</p>
                    </div> :
                    <p
                      className={`relative mt-7 text-[10px] font-black uppercase tracking-widest ${st === 'open' ? 'text-zawana-500' : 'text-red-700'}`}
                    >
                      {st === 'open'
                        ? `AVAILABLE · ${money(slotPrice(court, t))}`
                        : court.status !== 'available'
                          ? 'MAINTENANCE'
                          : `BOOKED · ${booking?.customer || 'Reserved'}`}
                    </p>}
                </button>
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-zawana-purple/20 bg-zawana-purple/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zawana-purple">Weekly reservations · {dayName}
                  </p>
                  <p className="mt-1 text-xs text-zawana-500">These repeat every {dayName} until you unreserve them.</p>
                </div>
              </div>
              {activeClassBlocks.length ?
                <div className="mt-3 space-y-2">
                  {activeClassBlocks.map(b =>
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white p-3"
                    >
                      <div>
                        <b className="text-sm">{b.title}</b>
                        <p className="text-xs text-zawana-500">Every {dayName} · {b.start}–{b.end}
                        </p>
                      </div>
                      <Button
                        variant="danger"
                        className="px-3 py-2"
                        disabled={saving}
                        onClick={() => unreserve(b)}
                      >
                        <RotateCcw size={14} /> Unreserve</Button>
                    </div>
                  )}
                </div> :
                <p className="mt-3 text-xs text-zawana-500">No weekly class reservation for this court/day.</p>}
            </div>
          </div>
          <div className="rounded-[24px] bg-zawana-950 p-6 text-white">
            <p className="text-[10px] font-black uppercase tracking-widest text-zawana-gold">Front-office controls</p>
            <h3 className="mt-2 text-2xl font-black">Reserve this court</h3>
            <p className="mt-2 text-sm text-white/50">
              {slot || 'Select an available slot first.'}
            </p>
            <label className="mt-5 block text-xs font-bold text-white/60">Walk-in customer<input
                className="mt-2 w-full bg-white/8 text-white placeholder:text-white/30"
                value={walkInName}
                onChange={e => setWalkInName(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-xs font-bold text-white/60">Weekly class / facility block<input
                className="mt-2 w-full bg-white/8 text-white placeholder:text-white/30"
                value={classTitle}
                onChange={e => setClassTitle(e.target.value)}
              />
            </label>
            <div className="mt-5 rounded-2xl bg-white/8 p-4">
              <div className="flex justify-between text-sm">
                <span>Court</span>
                <b>{court.name}</b>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span>Rental</span>
                <b>{slot ? money(slotPrice(court, slot)) : '—'}</b>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span>Repeats</span>
                <b>Every {dayName}</b>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              <Button
                disabled={!slot || saving || isBusy(court, slot)}
                onClick={bookWalkIn}
                className="w-full"
              >
                {saving ? 'Reserving…' : 'Walk-in booking'}
              </Button>
              <Button
                variant="secondary"
                disabled={!slot || saving || isBusy(court, slot)}
                onClick={reserveClass}
                className="w-full"
              >Reserve weekly class</Button>
            </div>
          </div>
        </div>
      </OpsModal>}</AnimatePresence>
  </div>
}

function Professional({ role }: { role: UserRole }) {
  const o = useOperations();
  const [coachBookings, setCoachBookings] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (role !== 'coach') return;
    let active = true;
    get<any[]>('/coach/private-courses')
      .then(rows => {
        if (active) setCoachBookings(rows)
      })
      .catch((e: any) => {
        if (active) setError(e.message || 'Could not load assigned sessions.')
      });
    return () => {
      active = false
    }
  }, [role]);

  const bookings = role === 'doctor' ? o.appointments : coachBookings;

  const upcoming = coachBookings
    .filter(
      b =>
        ['PENDING_COACH_CONFIRMATION', 'AWAITING_PAYMENT', 'CONFIRMED'].includes(b.status) &&
        b.date >= today
    )
    .slice(0, 5);

  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat label="Assigned courses" value={bookings.length} />
      <Stat
        label="Needs your response"
        value={coachBookings.filter(b => b.status === 'PENDING_COACH_CONFIRMATION').length}
      />
      <Stat
        label="Upcoming confirmed"
        value={coachBookings.filter(b => b.status === 'CONFIRMED' && b.date >= today).length}
      />
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">Coach workspace</p>
        <h2 className="mt-1 text-2xl font-black">Your sessions, in one place</h2>
        <p className="mt-2 text-sm text-zawana-500">Review requests, manage course responses, and open your calendar.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/coach/bookings">
            <Button>
              <ClipboardList size={15} /> Manage bookings</Button>
          </Link>
          <Link to="/coach/schedule">
            <Button variant="secondary">
              <CalendarDays size={15} /> Open calendar</Button>
          </Link>
        </div>
        {error &&
          <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>}
      </Card>
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-zawana-gold">Upcoming sessions</p>
            <h2 className="mt-1 text-xl font-black">Your next courses</h2>
          </div>
          <CalendarDays className="text-zawana-gold" />
        </div>
        {upcoming.length ?
          <div className="mt-4 divide-y divide-zawana-950/8">
            {upcoming.map(b =>
              <div key={b.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>{b.title}</b>
                  <Badge good={b.status === 'CONFIRMED'}>
                    {String(b.status).replaceAll('_', ' ')}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-zawana-500">
                  {b.date} · {b.time}
                </p>
                <p className="mt-1 text-xs text-zawana-500">
                  {b.user?.name || 'Member'} · {b.court?.name || b.location}
                </p>
              </div>
            )}
          </div> :
          <Empty
            title={error ? 'Sessions could not load' : 'No upcoming courses'}
            body={
              error
                ? 'Try again in a moment or open Bookings to reload.'
                : 'New private course requests assigned to you will appear here.'
            }
          />}
      </Card>
    </div>
  </div>
}

function CoachBookings({ notify }: { notify: (s: string) => void }) {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [page, setPage] = useState(1),
    [pageInfo, setPageInfo] = useState<any>({ total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ q: '', status: '', from: '', to: '' });

  const load = () => {
    const p = new URLSearchParams({ page: String(page), limit: '20', kind: 'private_course' });
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    return get<any>(`/bookings?${p}`)
      .then(r => {
        setRows(r.data || []);
        setPageInfo(r.pagination || { total: 0, totalPages: 0 });
        setError('')
      })
      .catch((e: any) => setError(e.message || 'Could not load assigned bookings.'))
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), filters.q ? 250 : 0);
    return () => window.clearTimeout(timer)
  }, [page, filters]);

  const setFilter = (key: string, value: string) => {
    setPage(1);
    setFilters(f => ({ ...f, [key]: value }))
  };

  const complete = async (id: string) => {
    setBusy(id);
    try {
      await post(`/coach/private-courses/${id}/complete`, {});
      await load();
      notify('Course marked complete.')
    } catch (e: any) {
      notify(e.message || 'Could not update booking.')
    } finally {
      setBusy('')
    }
  };

  return <div>
    {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    <div className="mb-4 rounded-2xl border border-zawana-accent/30 bg-zawana-accent/10 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-zawana-accent">Assigned sessions</p>
      <p className="mt-1 text-sm text-zawana-600">Review request details here. Confirm or decline new requests from the notification bell or Notifications page.</p>
    </div>

    <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <input
        className="rounded-xl border p-3"
        placeholder="Search member, request or course"
        aria-label="Search assigned sessions"
        value={filters.q}
        onChange={e => setFilter('q', e.target.value)}
      />
      <Select
        className="rounded-xl border p-3"
        aria-label="Filter status"
        value={filters.status}
        onChange={e => setFilter('status', e.target.value)}
      >
        <option value="">All statuses</option>
        {[
          'PENDING_COACH_CONFIRMATION',
          'AWAITING_PAYMENT',
          'CONFIRMED',
          'COACH_DECLINED',
          'EXPIRED',
          'CANCELLED',
          'COMPLETED'
        ].map(x =>
          <option key={x}>{x}</option>
        )}
      </Select>
      <input
        className="rounded-xl border p-3"
        type="date"
        aria-label="From date"
        value={filters.from}
        onChange={e => setFilter('from', e.target.value)}
      />
      <input
        className="rounded-xl border p-3"
        type="date"
        aria-label="To date"
        value={filters.to}
        onChange={e => setFilter('to', e.target.value)}
      />
    </div>

    <div className="hidden md:block">
      <Table headers={['Member', 'Course', 'Date', 'Time', 'Court', 'Status', 'Action']}>
        {rows.map(b =>
          <tr key={b.id}>
            <Cell>
              <b>{b.user?.name || 'Member'}</b>
              <p className="text-xs text-zawana-500">{b.user?.email}</p>
            </Cell>
            <Cell>{b.title}</Cell>
            <Cell>{b.date}</Cell>
            <Cell>{b.time}</Cell>
            <Cell>{b.court?.name || b.location}</Cell>
            <Cell>
              <Badge good={b.status === 'CONFIRMED'}>
                {String(b.status).replaceAll('_', ' ')}
              </Badge>
              {b.paymentExpiresAt && b.status === 'AWAITING_PAYMENT' &&
                <p className="mt-1 text-[10px] text-zawana-500">Due {new Date(b.paymentExpiresAt).toLocaleString()}
                </p>}
            </Cell>
            <Cell>
              {b.status === 'PENDING_COACH_CONFIRMATION' ?
                <span className="text-xs font-bold text-amber-800">Respond from Notifications</span> : b.status === 'CONFIRMED' && b.date <= today ?
                <Button
                  disabled={!!busy}
                  className="px-3 py-2"
                  onClick={() => void complete(b.id)}
                >
                  {busy === b.id ? 'Saving…' : 'Complete'}
                </Button> : b.status === 'COMPLETED' ?
                <span className="text-xs text-zawana-500">Completed</span> : b.status === 'AWAITING_PAYMENT' ?
                <span className="text-xs text-amber-700">Waiting for member payment</span> :
                <span className="text-xs text-zawana-500">—</span>}
            </Cell>
          </tr>
        )}
      </Table>
    </div>
    <div className="space-y-3 md:hidden">
      {rows.map(b =>
        <Card key={b.id} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <b>{b.user?.name || 'Member'}</b>
              <p className="text-xs text-zawana-500">{b.title}</p>
            </div>
            <Badge good={b.status === 'CONFIRMED'}>{String(b.status).replaceAll('_', ' ')}</Badge>
          </div>
          <p className="mt-3 text-sm">
            {b.date} · {b.time} · {b.court?.name || b.location}
          </p>
          {b.paymentExpiresAt && b.status === 'AWAITING_PAYMENT' &&
            <p className="mt-1 text-xs text-amber-700">Payment due {new Date(b.paymentExpiresAt).toLocaleString()}
            </p>}
          {b.status === 'PENDING_COACH_CONFIRMATION' &&
            <p className="mt-3 text-xs font-bold text-amber-800">Confirm or decline from Notifications.</p>}
          {b.status === 'CONFIRMED' && b.date <= today &&
            <Button className="mt-3" disabled={!!busy} onClick={() => void complete(b.id)}>Complete</Button>}
        </Card>)}
    </div>

    {!rows.length && !error &&
      <Card className="mt-4 p-8 text-center text-sm text-zawana-500">No private course sessions assigned to this coach account.</Card>}
    <Pagination
      page={page}
      totalPages={pageInfo.totalPages || 0}
      total={pageInfo.total || 0}
      onPage={setPage}
    />
  </div>
}

function CoachClients() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    get<any[]>('/bookings')
      .then(setRows)
      .catch(() => setRows([]))
  }, []);
  const clients = [
    ...new Map(rows.filter(b => b.user).map(b => [b.user.id, { ...b.user, last: b }])).values()
  ];
  return <Table headers={['Member account', 'Email', 'Latest session', 'Date', 'Booking status']}>
    {clients.map((c: any) =>
      <tr key={c.id}>
        <Cell>
          <b>{c.name}</b>
        </Cell>
        <Cell>{c.email}</Cell>
        <Cell>{c.last.title}</Cell>
        <Cell>{c.last.date}</Cell>
        <Cell>
          <Badge>{String(c.last.status).replaceAll('_', ' ')}</Badge>
        </Cell>
      </tr>
    )}
  </Table>
}

function ProfileCard({ name, role }: { name: string; role: string }) {
  return <Card className="p-7">
    <div className="flex items-center gap-4">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-zawana-950 text-white">
        {name.slice(0, 2)}
      </div>
      <div>
        <h2 className="text-2xl font-black">{name}</h2>
        <p className="text-sm text-zawana-500">{role}</p>
      </div>
    </div>
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <div>
        <p className="text-xs text-zawana-500">Email</p>
        <b>doctor@zawana.test</b>
      </div>
      <div>
        <p className="text-xs text-zawana-500">Availability</p>
        <b>Tue / Fri · 10:00–18:00</b>
      </div>
      <div>
        <p className="text-xs text-zawana-500">Permissions</p>
        <b>Clinical workspace only</b>
      </div>
    </div>
  </Card>
}

function NotificationCenter({ role }: { role: UserRole }) {
  const [items, setItems] = useState<any[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState('');

  const load = () =>
    get<any[]>('/notifications')
      .then(setItems)
      .catch((e: any) => setError(e.message || 'Could not load notifications.'))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load()
  }, []);

  const markRead = async (id: string) => {
    try {
      await patch(`/notifications/${id}/read`, {});
      setItems(rows => rows.filter(item => item.id !== id))
    } catch (e: any) {
      setError(e.message || 'Could not update notification.')
    }
  };

  const decide = async (item: any, decision: 'accept' | 'decline') => {
    if (!item.entityId || busy) return;
    setBusy(item.id);
    setError('');
    try {
      await post(`/coach/private-courses/${item.entityId}/decision`, { decision });
      await patch(`/notifications/${item.id}/read`, {});
      setItems(rows => rows.filter(n => n.id !== item.id));
      window.dispatchEvent(
        new CustomEvent('zawana-toast', {
          detail:
            decision === 'accept'
              ? 'Request accepted. The member has 24 hours to pay.'
              : 'Request declined; the reservation was released.'
        })
      );
    } catch (e: any) {
      setError(e.message || 'Could not update the private course request.')
    } finally {
      setBusy('')
    }
  };

  const confirmBooking = async (item: any) => {
    if (!item.entityId || busy) return;
    setBusy(item.id);
    setError('');
    try {
      const result = await post<any>(`/member/private-courses/${item.entityId}/pay`, {});
      await patch(`/notifications/${item.id}/read`, {}).catch(() => {});
      setItems(rows => rows.filter(n => n.id !== item.id));
      window.dispatchEvent(
        new CustomEvent('zawana-toast', {
          detail: result.message || 'Booking confirmed. Payment is due at the venue.'
        })
      )
    } catch (e: any) {
      setError(e.message || 'Could not confirm this booking.')
    } finally {
      setBusy('')
    }
  };

  const cancelBooking = async (item: any) => {
    if (!item.entityId || busy) return;
    setBusy(item.id);
    setError('');
    try {
      await post(`/member/private-courses/${item.entityId}/cancel`, {});
      await patch(`/notifications/${item.id}/read`, {}).catch(() => {});
      setItems(rows => rows.filter(n => n.id !== item.id));
      window.dispatchEvent(
        new CustomEvent('zawana-toast', {
          detail: 'Private course cancelled. The court and coach reservation were released.'
        })
      )
    } catch (e: any) {
      setError(e.message || 'Could not cancel this booking.')
    } finally {
      setBusy('')
    }
  };

  if (loading) return <Card className="p-6">Loading notifications…</Card>;

  return <div className="space-y-3">
    {error &&
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>}
    {items.map(item => {
      const courseRequest =
        role === 'coach' &&
        item.type === 'booking' &&
        item.entityType === 'booking' &&
        item.entityId &&
        item.title?.toLowerCase().includes('private course request');
      const memberPay =
        role === 'member' &&
        item.type === 'booking' &&
        item.entityType === 'booking' &&
        item.entityId &&
        item.title === 'Coach confirmed your private course';
      return <Card
        key={item.id}
        className={`p-5 ${item.read ? 'opacity-70' : 'border-zawana-gold/40'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <Badge>{role.replace('_', ' ')}</Badge>
          <span className="text-xs text-zawana-500">
            {new Date(item.createdAt).toLocaleString()}
          </span>
        </div>
        <h3 className="mt-3 text-lg font-black">{item.title}</h3>
        <p className="mt-1 text-sm text-zawana-500">{item.body}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {courseRequest ?
            <>
              <Button disabled={!!busy} onClick={() => void decide(item, 'accept')}>
                {busy === item.id ? 'Saving…' : 'Accept request'}
              </Button>
              <Button
                variant="danger"
                disabled={!!busy}
                onClick={() => void decide(item, 'decline')}
              >
                {busy === item.id ? 'Saving…' : 'Decline'}
              </Button>
            </> : memberPay ?
            <>
              <Button
                variant="danger"
                disabled={!!busy}
                onClick={() => void cancelBooking(item)}
              >
                {busy === item.id ? 'Saving…' : 'Cancel booking'}
              </Button>
              <Button disabled={!!busy} onClick={() => void confirmBooking(item)}>
                {busy === item.id ? 'Confirming…' : 'Pay now'}
              </Button>
            </> :
            item.link &&
              <Link
                onClick={() => void markRead(item.id)}
                to={item.link}
                className="inline-flex min-h-11 items-center rounded-xl bg-zawana-950 px-4 py-2 text-xs font-black text-white"
              >
                {item.actionLabel || 'Open'}
              </Link>}
          {!courseRequest && !memberPay &&
            <Button
              variant="secondary"
              className="px-4 py-2"
              onClick={() => void markRead(item.id)}
            >Mark read</Button>}
        </div>
      </Card>
    })}
    {!items.length &&
      <Empty
        title="You’re all caught up"
        body="New booking and payment updates will appear here."
      />}
  </div>
}

