import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
// @ts-expect-error ScrollToTop is a JSX module without a TypeScript declaration.
import ScrollToTop from './components/ScrollToTop';
import RoleLayout from './components/RoleLayout';
import { AppLayout } from './layouts/Layouts';
import { useAuth } from './context/AuthContext';
import { Generic, Home, Login, Signup, CafeCustomer, Dashboard, Book, CourtBooking, CoachBooking, Bookings, Membership, Performance, Training, Revive, Classes, Community, Store, Notifications, Profile, Admin, AdminTable, GymCheckIn, ReviveClinicFO } from './pages';
import OperationsPage from './pages/Operations';
import { AdminManagement } from './pages/AdminManagement';
import { PrivateCourse } from './pages/PrivateCourse';
import { CoachCalendar } from './pages/CoachCalendar';
import PrivateCourseAdmin from './pages/PrivateCourseAdmin';
import type { UserRole } from './types';
import { classes, courts } from './data';

const homeByRole: Record<UserRole,string> = {
 member:'/member', coach:'/coach', admin:'/admin', gym_fo:'/gym-fo', clinic_fo:'/clinic-fo',
 badminton_fo:'/badminton-fo', store_fo:'/store-fo', cafe_fo:'/cafe', doctor:'/doctor',
};

function Guard({role,children}:{role:UserRole;children:ReactNode}){
 const {user}=useAuth();
 if(!user) return <Navigate to="/login" replace/>;
 if(user.role!==role) return <Navigate to={homeByRole[user.role]||'/dashboard'} replace/>;
 if(role==='member') return <AppLayout role="member">{children}</AppLayout>;
 return <RoleLayout role={role as Exclude<UserRole,'member'>}>{children}</RoleLayout>;
}
const operational=(role:UserRole,path:string)=> <Route path={path} element={<Guard role={role}><OperationsPage role={role}/></Guard>}/>;

export default function App(){
 return <><ScrollToTop/><Routes>
  <Route path="/" element={<Home/>}/>
  <Route path="/facilities" element={<Generic title="Facilities" body="Badminton courts, performance gym, training studio and recovery services in one arena."/>}/>
  <Route path="/memberships" element={<Generic title="Memberships" body="Choose an access plan built around how you train."/>}/>
  <Route path="/coaches" element={<Generic title="Coaches" body="Meet Zawana coaches across badminton, strength, conditioning and recovery."/>}/>
  <Route path="/contact" element={<Generic title="Contact Zawana" body="Visit the arena or speak with the team about training."/>}/>
  <Route path="/login" element={<Login/>}/><Route path="/signup" element={<Signup/>}/>

  {/* Customer experience — existing screens preserved */}
  <Route path="/member" element={<Guard role="member"><Dashboard/></Guard>}/>
  <Route path="/dashboard" element={<Guard role="member"><Dashboard/></Guard>}/>
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
  <Route path="/private-course" element={<Guard role="member"><PrivateCourse/></Guard>}/>
  <Route path="/membership" element={<Guard role="member"><Membership/></Guard>}/><Route path="/performance" element={<Guard role="member"><Performance/></Guard>}/>
  <Route path="/training" element={<Guard role="member"><Training/></Guard>}/><Route path="/revive" element={<Guard role="member"><Revive/></Guard>}/>
  <Route path="/classes" element={<Guard role="member"><Classes/></Guard>}/><Route path="/community" element={<Guard role="member"><Community/></Guard>}/>
  <Route path="/store" element={<Guard role="member"><Store/></Guard>}/><Route path="/cafe-order" element={<Guard role="member"><CafeCustomer/></Guard>}/><Route path="/notifications" element={<Guard role="member"><Notifications/></Guard>}/>
  <Route path="/profile" element={<Guard role="member"><Profile/></Guard>}/><Route path="/settings" element={<Guard role="member"><Generic title="Settings" body="Manage preferences, notifications, security and demo-mode controls."/></Guard>}/>

  {/* Admin */}
  {['/admin','/admin/notifications','/admin/badminton-packages','/admin/gym-packages','/admin/students','/admin/finance','/admin/cms'].map(path=>operational('admin',path))}
  <Route path="/admin/courts" element={<Guard role="admin"><AdminManagement section="courts"/></Guard>}/>
  <Route path="/admin/coaches" element={<Guard role="admin"><AdminManagement section="coaches"/></Guard>}/>
  <Route path="/admin/schedules" element={<Guard role="admin"><AdminManagement section="schedules"/></Guard>}/>
  <Route path="/admin/members" element={<Guard role="admin"><AdminTable title="Members" items={['Sai Zay','Htet Aung','Su Myat Thiri']}/></Guard>}/>
  <Route path="/admin/bookings" element={<Guard role="admin"><AdminTable title="Bookings" items={courts.map(c=>c.name)}/></Guard>}/>
  <Route path="/admin/classes" element={<Guard role="admin"><AdminTable title="Classes" items={classes.map(c=>c.title)}/></Guard>}/>

  {/* Department workspaces */}
  {['/badminton-fo','/badminton-fo/notifications','/badminton-fo/students','/badminton-fo/check-in','/badminton-fo/courts','/badminton-fo/bookings','/badminton-fo/packages','/badminton-fo/pos','/badminton-fo/transactions'].map(path=>operational('badminton_fo',path))}
  <Route path="/badminton-fo/private-courses" element={<Guard role="badminton_fo"><PrivateCourseAdmin/></Guard>}/>
  {['/gym-fo','/gym-fo/notifications','/gym-fo/check-in','/gym-fo/members','/gym-fo/memberships','/gym-fo/appointments','/gym-fo/coaches','/gym-fo/payments'].map(path=>operational('gym_fo',path))}
  {['/clinic-fo','/clinic-fo/notifications','/clinic-fo/patients','/clinic-fo/appointments','/clinic-fo/doctors','/clinic-fo/schedule','/clinic-fo/records','/clinic-fo/payments'].map(path=>operational('clinic_fo',path))}
  {['/store-fo','/store-fo/notifications','/store-fo/products','/store-fo/categories','/store-fo/inventory','/store-fo/pos','/store-fo/orders','/store-fo/transactions'].map(path=>operational('store_fo',path))}
  {['/cafe','/cafe/notifications','/cafe/orders','/cafe/menu','/cafe/pos','/cafe/transactions'].map(path=>operational('cafe_fo',path))}

  {/* Professional portals */}
  <Route path="/coach/schedule" element={<Guard role="coach"><CoachCalendar/></Guard>}/>
  {['/coach','/coach/notifications','/coach/schedule','/coach/bookings','/coach/clients','/coach/availability'].map(path=>operational('coach',path))}
  {['/doctor','/doctor/notifications','/doctor/schedule','/doctor/appointments','/doctor/patients','/doctor/profile'].map(path=>operational('doctor',path))}

  {/* Existing specialized screens remain available during migration */}
  <Route path="/legacy/front-office/gym" element={<Guard role="gym_fo"><GymCheckIn/></Guard>}/>
  <Route path="/legacy/front-office/revive-clinic" element={<Guard role="clinic_fo"><ReviveClinicFO/></Guard>}/>

  <Route path="*" element={<Navigate to="/" replace/>}/>
 </Routes></>;
}
