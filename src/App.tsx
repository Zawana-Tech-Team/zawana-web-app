import { PageSkeleton } from './components/UI';
import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
// @ts-expect-error ScrollToTop is a JSX module without a TypeScript declaration.
import ScrollToTop from './components/ScrollToTop';
import RoleLayout from './components/RoleLayout';
import { AppLayout } from './layouts/Layouts';
import { useAuth } from './context/AuthContext';
import type { UserRole } from './types';
import { classes, courts } from './data';

const Generic = lazy(() => import('./pages/Generic').then(module => ({ default: module.Generic })));
const Home = lazy(() => import('./pages/Home').then(module => ({ default: module.Home })));
const Achievements = lazy(() => import('./pages/Achievements').then(module => ({ default: module.Achievements })));
const AchievementArticle = lazy(() => import('./pages/Achievements').then(module => ({ default: module.AchievementArticle })));
const Coaches = lazy(() => import('./pages/Coaches').then(module => ({ default: module.Coaches })));
const Login = lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
const Signup = lazy(() => import('./pages/Signup').then(module => ({ default: module.Signup })));
const CafeCustomer = lazy(() =>
  import('./pages/CafeCustomer').then(module => ({ default: module.CafeCustomer }))
);
const Dashboard = lazy(() =>
  import('./pages/Dashboard').then(module => ({ default: module.Dashboard }))
);
const Book = lazy(() => import('./pages/Book').then(module => ({ default: module.Book })));
const CourtBooking = lazy(() =>
  import('./pages/CourtBooking').then(module => ({ default: module.CourtBooking }))
);
const CoachBooking = lazy(() =>
  import('./pages/CoachBooking').then(module => ({ default: module.CoachBooking }))
);
const Bookings = lazy(() =>
  import('./pages/Bookings').then(module => ({ default: module.Bookings }))
);
const Membership = lazy(() =>
  import('./pages/Membership').then(module => ({ default: module.Membership }))
);
const Performance = lazy(() =>
  import('./pages/Performance').then(module => ({ default: module.Performance }))
);
const Training = lazy(() =>
  import('./pages/Training').then(module => ({ default: module.Training }))
);
const Revive = lazy(() => import('./pages/Revive').then(module => ({ default: module.Revive })));
const Classes = lazy(() => import('./pages/Classes').then(module => ({ default: module.Classes })));
const Community = lazy(() =>
  import('./pages/Community').then(module => ({ default: module.Community }))
);
const Store = lazy(() => import('./pages/Store').then(module => ({ default: module.Store })));
const Notifications = lazy(() =>
  import('./pages/Notifications').then(module => ({ default: module.Notifications }))
);
const Profile = lazy(() => import('./pages/Profile').then(module => ({ default: module.Profile })));
const Admin = lazy(() => import('./pages/Admin').then(module => ({ default: module.Admin })));
const AdminTable = lazy(() =>
  import('./pages/AdminTable').then(module => ({ default: module.AdminTable }))
);
const GymCheckIn = lazy(() =>
  import('./pages/GymCheckIn').then(module => ({ default: module.GymCheckIn }))
);
const ReviveClinicFO = lazy(() =>
  import('./pages/ReviveClinicFO').then(module => ({ default: module.ReviveClinicFO }))
);
const OperationsPage = lazy(() => import('./pages/Operations'));
const AdminManagement = lazy(() =>
  import('./pages/AdminManagement').then(module => ({ default: module.AdminManagement }))
);
const PrivateCourse = lazy(() =>
  import('./pages/PrivateCourse').then(module => ({ default: module.PrivateCourse }))
);
const CoachCalendar = lazy(() =>
  import('./pages/CoachCalendar').then(module => ({ default: module.CoachCalendar }))
);
const PrivateCourseAdmin = lazy(() => import('./pages/PrivateCourseAdmin'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const PaymentHistory = lazy(() => import('./pages/PaymentHistory'));
const CompleteProfile = lazy(() =>
  import('./pages/AuthFlows').then(module => ({ default: module.CompleteProfile }))
);
const ForgotPassword = lazy(() =>
  import('./pages/AuthFlows').then(module => ({ default: module.ForgotPassword }))
);
const AuthAction = lazy(() =>
  import('./pages/AuthFlows').then(module => ({ default: module.AuthAction }))
);
const Settings = lazy(() =>
  import('./pages/Settings').then(module => ({ default: module.Settings }))
);
const PaymentStatus = lazy(() =>
  import('./pages/PaymentStatus').then(module => ({ default: module.PaymentStatus }))
);
const QrCheckIn = lazy(() => import('./pages/QrCheckIn'));
const Attendance = lazy(() => import('./pages/Attendance'));
const CourtReschedule = lazy(() => import('./pages/CourtReschedule'));
const MemberTraining = lazy(() => import('./pages/MemberTraining'));

function RouteLoading() { return <PageSkeleton />; }

const homeByRole: Record<UserRole, string> = {
  member: '/member',
  coach: '/coach',
  admin: '/admin',
  owner: '/owner',
  gym_fo: '/gym-fo',
  clinic_fo: '/clinic-fo',
  badminton_fo: '/badminton-fo',
  store_fo: '/store-fo',
  cafe_fo: '/cafe',
  doctor: '/doctor',
};

function Guard({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <RouteLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homeByRole[user.role] || '/dashboard'} replace />;
  if (role === 'member') return <AppLayout role="member">{children}</AppLayout>;
  return <RoleLayout role={role as Exclude<UserRole, 'member'>}>{children}</RoleLayout>;
}

function AccountSettings() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-sm text-zawana-500">Loading account…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return user.role === 'member' ?
    <AppLayout role="member">
      <Settings />
    </AppLayout> :
    <RoleLayout role={user.role as Exclude<UserRole, 'member'>}>
      <Settings />
    </RoleLayout>;
}

const operational = (role: UserRole, path: string) =>
  <Route
    path={path}
    element={
      <Guard role={role}>
        <OperationsPage role={role} />
      </Guard>
    }
  />;

export default function App() {
  return <Suspense fallback={<RouteLoading />}>
    <ScrollToTop />
    <Routes>
      <Route path="/check-in" element={<QrCheckIn />} />
      {([
        ['member', '/bookings/:id/reschedule'],
        ['badminton_fo', '/badminton-fo/bookings/:id/reschedule'],
        ['admin', '/admin/court-rentals/:id/reschedule'],
      ] as const).map(([role, path]) => <Route key={path} path={path} element={<Guard role={role}><CourtReschedule /></Guard>} />)}
      {(['member', 'coach', 'admin', 'badminton_fo'] as const).map(role => <Route key={`attendance-${role}`} path={role === 'member' ? '/attendance' : `/${role === 'badminton_fo' ? 'badminton-fo' : role}/attendance`} element={<Guard role={role}><Attendance /></Guard>} />)}
      <Route path="/" element={<Home />} />
      <Route
        path="/facilities"
        element={
          <Generic
            title="Facilities"
            body="Badminton courts, performance gym, training studio and recovery services in one arena."
          />
        }
      />
      <Route
        path="/memberships"
        element={
          <Generic title="Memberships" body="Choose an access plan built around how you train." />
        }
      />
      <Route path="/coaches" element={<Coaches />} />
      <Route path="/achievements" element={<Achievements />} />
      <Route path="/achievements/:id" element={<AchievementArticle />} />
      <Route
        path="/contact"
        element={
          <Generic
            title="Contact Zawana"
            body="Visit the arena or speak with the team about training."
          />
        }
      />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/complete-profile" element={<CompleteProfile />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/action" element={<AuthAction />} />

      {/* Customer experience — existing screens preserved */}
      <Route
        path="/member"
        element={
          <Guard role="member">
            <Dashboard />
          </Guard>
        }
      />
      <Route
        path="/member/training"
        element={
          <Guard role="member">
            <MemberTraining />
          </Guard>
        }
      />
      <Route
        path="/dashboard"
        element={
          <Guard role="member">
            <Dashboard />
          </Guard>
        }
      />
      <Route
        path="/book"
        element={
          <Guard role="member">
            <Book />
          </Guard>
        }
      />

      <Route
        path="/book/court"
        element={
          <Guard role="member">
            <CourtBooking />
          </Guard>
        }
      />

      <Route
        path="/book/coach"
        element={
          <Guard role="member">
            <CoachBooking />
          </Guard>
        }
      />

      <Route
        path="/bookings"
        element={
          <Guard role="member">
            <Bookings />
          </Guard>
        }
      />
      <Route
        path="/payments"
        element={
          <Guard role="member">
            <PaymentHistory />
          </Guard>
        }
      />
      <Route
        path="/payment/:id"
        element={
          <Guard role="member">
            <PaymentStatus />
          </Guard>
        }
      />
      <Route
        path="/private-course"
        element={
          <Guard role="member">
            <PrivateCourse />
          </Guard>
        }
      />
      <Route
        path="/membership"
        element={
          <Guard role="member">
            <Membership />
          </Guard>
        }
      />
      <Route
        path="/performance"
        element={
          <Guard role="member">
            <Performance />
          </Guard>
        }
      />
      <Route
        path="/training"
        element={
          <Guard role="member">
            <Training />
          </Guard>
        }
      />
      <Route
        path="/revive"
        element={
          <Guard role="member">
            <Revive />
          </Guard>
        }
      />
      <Route
        path="/classes"
        element={
          <Guard role="member">
            <Classes />
          </Guard>
        }
      />
      <Route
        path="/community"
        element={
          <Guard role="member">
            <Community />
          </Guard>
        }
      />
      <Route
        path="/store"
        element={
          <Guard role="member">
            <Store />
          </Guard>
        }
      />
      <Route
        path="/cafe-order"
        element={
          <Guard role="member">
            <CafeCustomer />
          </Guard>
        }
      />
      <Route
        path="/notifications"
        element={
          <Guard role="member">
            <Notifications />
          </Guard>
        }
      />
      <Route
        path="/profile"
        element={
          <Guard role="member">
            <Profile />
          </Guard>
        }
      />
      <Route path="/settings" element={<AccountSettings />} />

      {/* Admin */}
      {[
        '/admin',
        '/admin/notifications',
        '/admin/court-rentals',
        '/admin/badminton-packages',
        '/admin/gym-packages',
        '/admin/finance',
        '/admin/cms'
      ].map(path => operational('admin', path))}
      {['/owner', '/owner/notifications', '/owner/finance'].map(path =>
        operational('owner', path)
      )}
      <Route
        path="/admin/users"
        element={
          <Guard role="admin">
            <UserManagement />
          </Guard>
        }
      />
      <Route
        path="/admin/students"
        element={
          <Guard role="admin">
            <Navigate to="/admin/users" replace />
          </Guard>
        }
      />
      <Route
        path="/admin/courts"
        element={
          <Guard role="admin">
            <AdminManagement section="courts" />
          </Guard>
        }
      />
      <Route
        path="/admin/coaches"
        element={
          <Guard role="admin">
            <AdminManagement section="coaches" />
          </Guard>
        }
      />
      <Route path="/admin/gym-coaches" element={<Guard role="admin"><AdminManagement section="coaches" department="Gym" /></Guard>} />
      <Route
        path="/admin/private-courses"
        element={
          <Guard role="admin">
            <PrivateCourseAdmin />
          </Guard>
        }
      />
      <Route
        path="/admin/schedules"
        element={
          <Guard role="admin">
            <Navigate to="/admin/coaches" replace />
          </Guard>
        }
      />
      <Route
        path="/admin/members"
        element={
          <Guard role="admin">
            <Navigate to="/admin/users" replace />
          </Guard>
        }
      />
      <Route
        path="/admin/bookings"
        element={
          <Guard role="admin">
            <AdminTable title="Bookings" items={courts.map(c => c.name)} />
          </Guard>
        }
      />
      <Route
        path="/admin/classes"
        element={
          <Guard role="admin">
            <AdminTable title="Classes" items={classes.map(c => c.title)} />
          </Guard>
        }
      />

      {/* Department workspaces */}
      {[
        '/badminton-fo',
        '/badminton-fo/notifications',
        '/badminton-fo/check-in',
        '/badminton-fo/courts',
        '/badminton-fo/bookings',
        '/badminton-fo/active-packages',
        '/badminton-fo/transactions'
      ].map(path => operational('badminton_fo', path))}
      <Route path="/badminton-fo/pos" element={<Guard role="badminton_fo"><Navigate to="/badminton-fo/active-packages" replace /></Guard>} />
      <Route
        path="/badminton-fo/packages"
        element={
          <Guard role="badminton_fo">
            <Navigate to="/badminton-fo/check-in" replace />
          </Guard>
        }
      />
      <Route
        path="/badminton-fo/students"
        element={
          <Guard role="badminton_fo">
            <Navigate to="/badminton-fo/check-in" replace />
          </Guard>
        }
      />
      <Route
        path="/badminton-fo/private-courses"
        element={
          <Guard role="badminton_fo">
            <Navigate to="/badminton-fo/bookings" replace />
          </Guard>
        }
      />
      {[
        '/gym-fo',
        '/gym-fo/notifications',
        '/gym-fo/check-in',
        '/gym-fo/members',
        '/gym-fo/memberships',
        '/gym-fo/private-training',
        '/gym-fo/appointments',
        '/gym-fo/coaches',
        '/gym-fo/payments'
      ].map(path => operational('gym_fo', path))}
      {[
        '/clinic-fo',
        '/clinic-fo/notifications',
        '/clinic-fo/patients',
        '/clinic-fo/appointments',
        '/clinic-fo/doctors',
        '/clinic-fo/schedule',
        '/clinic-fo/records',
        '/clinic-fo/payments'
      ].map(path => operational('clinic_fo', path))}
      {[
        '/store-fo',
        '/store-fo/notifications',
        '/store-fo/products',
        '/store-fo/categories',
        '/store-fo/inventory',
        '/store-fo/pos',
        '/store-fo/orders',
        '/store-fo/transactions'
      ].map(path => operational('store_fo', path))}
      {[
        '/cafe',
        '/cafe/notifications',
        '/cafe/orders',
        '/cafe/menu',
        '/cafe/pos',
        '/cafe/transactions'
      ].map(path => operational('cafe_fo', path))}

      {/* Professional portals */}
      <Route
        path="/coach/schedule"
        element={
          <Guard role="coach">
            <CoachCalendar />
          </Guard>
        }
      />
      {[
        '/coach',
        '/coach/notifications',
        '/coach/bookings',
        '/coach/clients',
        '/coach/training'
      ].map(path => operational('coach', path))}
      <Route
        path="/coach/availability"
        element={
          <Guard role="coach">
            <Navigate to="/coach/schedule" replace />
          </Guard>
        }
      />
      {[
        '/doctor',
        '/doctor/notifications',
        '/doctor/schedule',
        '/doctor/appointments',
        '/doctor/patients',
        '/doctor/profile'
      ].map(path => operational('doctor', path))}

      {/* Existing specialized screens remain available during migration */}
      <Route
        path="/legacy/front-office/gym"
        element={
          <Guard role="gym_fo">
            <GymCheckIn />
          </Guard>
        }
      />
      <Route
        path="/legacy/front-office/revive-clinic"
        element={
          <Guard role="clinic_fo">
            <ReviveClinicFO />
          </Guard>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>;
}
