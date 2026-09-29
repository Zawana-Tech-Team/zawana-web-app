import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
// @ts-expect-error ScrollToTop is a JSX module without a TypeScript declaration.
import ScrollToTop from "./components/ScrollToTop";
import { useAuth } from "./context/AuthContext";
import { AppLayout } from "./layouts/Layouts";
import FrontOfficeLayout from "./components/FrontOfficeLayout";

import {
  Admin,
  AdminTable,
  Book,
  Bookings,
  Classes,
  Community,
  Dashboard,
  Generic,
  GymCheckIn,
  Home,
  Login,
  Membership,
  Notifications,
  Performance,
  Profile,
  Recovery,
  ReviveClinicFO,
  Signup,
  Store,
  Training,
} from "./pages";

import { classes, courts } from "./data/index";

type UserRole =
  | "member"
  | "coach"
  | "admin"
  | "gym_fo"
  | "clinic_fo";

type GuardProps = {
  role: UserRole;
  children: ReactNode;
};

const members = [
  "Sai Zay",
  "John Smith",
  "David Lee",
  "Aung Min",
  "May Thu",
  "Kyaw Zin",
  "Su Hlaing",
];

const coachSchedule = [
  "4:00 PM — John",
  "5:00 PM — David",
  "6:00 PM — Aung",
  "7:00 PM — May",
];

const coaches = [
  "Coach Sai",
  "Coach Aung",
  "Coach Min",
  "Coach Thiri",
];

const paymentReferences = [
  "ZW-PAY-00123",
  "ZW-PAY-00124",
  "ZW-PAY-00125",
  "ZW-PAY-00126",
];

const adminBookings = [
  "Court 03 — 6:30 PM",
  "Court 01 — 7:00 PM",
  "S&C — 6:00 PM",
  "Recovery — 4:00 PM",
];

const homeByRole: Record<UserRole, string> = {
  member: "/dashboard",
  coach: "/coach",
  admin: "/admin",
  gym_fo: "/front-office/gym",
  clinic_fo: "/front-office/revive-clinic",
};

function Guard({ role, children }: GuardProps) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Keep this local role type ahead of the AuthContext update. The
  // AuthContext must expose the same role strings for these staff accounts.
  const currentRole = user.role as UserRole;

  if (currentRole !== role) {
    return <Navigate to={homeByRole[currentRole] ?? "/dashboard"} replace />;
  }

  if (role === "gym_fo") {
    return <FrontOfficeLayout kind="gym">{children}</FrontOfficeLayout>;
  }

  if (role === "clinic_fo") {
    return <FrontOfficeLayout kind="clinic">{children}</FrontOfficeLayout>;
  }

  return <AppLayout role={role}>{children}</AppLayout>;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
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
            <Generic
              title="Memberships"
              body="Choose an access plan built around how you train. Compare Open Gym, Athlete and Premium memberships."
            />
          }
        />

        <Route
          path="/coaches"
          element={
            <Generic
              title="Coaches"
              body="Meet Zawana coaches across badminton, strength, conditioning and recovery."
            />
          }
        />

        <Route
          path="/contact"
          element={
            <Generic
              title="Contact Zawana"
              body="Visit the arena, ask about memberships, or speak with the team about training."
            />
          }
        />

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* MEMBER */}
        <Route path="/dashboard" element={<Guard role="member"><Dashboard /></Guard>} />
        <Route path="/book" element={<Guard role="member"><Book /></Guard>} />
        <Route path="/bookings" element={<Guard role="member"><Bookings /></Guard>} />
        <Route path="/membership" element={<Guard role="member"><Membership /></Guard>} />
        <Route path="/performance" element={<Guard role="member"><Performance /></Guard>} />
        <Route path="/training" element={<Guard role="member"><Training /></Guard>} />
        <Route path="/recovery" element={<Guard role="member"><Recovery /></Guard>} />
        <Route path="/classes" element={<Guard role="member"><Classes /></Guard>} />
        <Route path="/community" element={<Guard role="member"><Community /></Guard>} />
        <Route path="/store" element={<Guard role="member"><Store /></Guard>} />
        <Route path="/notifications" element={<Guard role="member"><Notifications /></Guard>} />
        <Route path="/profile" element={<Guard role="member"><Profile /></Guard>} />
        <Route
          path="/settings"
          element={
            <Guard role="member">
              <Generic
                title="Settings"
                body="Manage preferences, notifications, security and demo-mode controls."
              />
            </Guard>
          }
        />

        {/* COACH */}
        <Route
          path="/coach"
          element={
            <Guard role="coach">
              <Generic
                title="Coach Overview"
                body="Today: 4 sessions · 12 clients · 3 assessments. Use the sidebar to manage your coaching schedule and athletes."
              />
            </Guard>
          }
        />
        <Route
          path="/coach/schedule"
          element={<Guard role="coach"><AdminTable title="Coach Schedule" items={coachSchedule} /></Guard>}
        />
        <Route
          path="/coach/clients"
          element={<Guard role="coach"><AdminTable title="Clients" items={members} /></Guard>}
        />
        <Route
          path="/coach/programs"
          element={
            <Guard role="coach">
              <Generic
                title="Training Programs"
                body="Create and assign weekly programs, workouts and exercise targets to clients."
              />
            </Guard>
          }
        />
        <Route
          path="/coach/assessments"
          element={
            <Guard role="coach">
              <Generic
                title="Assessments"
                body="Record athlete performance tests, measurements and progress notes."
              />
            </Guard>
          }
        />

        {/* ADMIN — no operational front-office access */}
        <Route path="/admin" element={<Guard role="admin"><Admin /></Guard>} />
        <Route path="/admin/members" element={<Guard role="admin"><AdminTable title="Members" items={members} /></Guard>} />
        <Route
          path="/admin/memberships"
          element={
            <Guard role="admin">
              <AdminTable title="Memberships" items={["Open Gym", "Athlete", "Premium", "Frozen"]} />
            </Guard>
          }
        />
        <Route path="/admin/bookings" element={<Guard role="admin"><AdminTable title="Bookings" items={adminBookings} /></Guard>} />
        <Route path="/admin/courts" element={<Guard role="admin"><AdminTable title="Courts" items={courts.map((court) => court.name)} /></Guard>} />
        <Route path="/admin/classes" element={<Guard role="admin"><AdminTable title="Classes" items={classes.map((item) => item.title)} /></Guard>} />
        <Route path="/admin/coaches" element={<Guard role="admin"><AdminTable title="Coaches" items={coaches} /></Guard>} />
        <Route path="/admin/payments" element={<Guard role="admin"><AdminTable title="Payments" items={paymentReferences} /></Guard>} />
        <Route path="/admin/analytics" element={<Guard role="admin"><Admin /></Guard>} />
        <Route
          path="/admin/settings"
          element={
            <Guard role="admin">
              <Generic
                title="Admin Settings"
                body="Manage arena configuration, access controls, notifications and system preferences."
              />
            </Guard>
          }
        />

        {/* GYM FRONT OFFICE */}
        <Route
          path="/front-office/gym"
          element={<Guard role="gym_fo"><GymCheckIn /></Guard>}
        />

        {/* REVIVE CLINIC FRONT OFFICE */}
        <Route
          path="/front-office/revive-clinic"
          element={<Guard role="clinic_fo"><ReviveClinicFO /></Guard>}
        />

        <Route
          path="/front-office/revive-clinic/notifications"
          element={
            <FrontOfficeLayout kind="clinic">
              <Notifications />
            </FrontOfficeLayout>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
