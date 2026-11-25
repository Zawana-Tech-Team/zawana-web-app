import base from './eslint.gym.config.mjs';
export default [{ignores:['dist/**','backend/dist/**','**/node_modules/**']},{...base[0],files:[
 'src/components/member-booking/{MemberAttendanceHistory,HistoryPagination}.tsx','src/components/coach/*.tsx','src/components/{CoachManagement,NotificationBell,Interactions,Select,RoleLayout}.tsx','src/components/court-desk/CourtActionMenu.tsx','src/pages/Login.tsx','src/pages/Membership.tsx','src/pages/PaymentHistory.tsx','src/pages/Admin.tsx','src/pages/UserManagement.tsx','src/pages/PrivateCourseAdmin.tsx','src/components/PrivateCourseRequests.tsx','src/components/StaffNotificationInbox.tsx','src/components/notification/*.tsx','src/components/AdminFinance.tsx','src/components/ContentManagement.tsx','src/components/badminton/BadmintonDashboard.tsx','src/components/badminton/BadmintonTransactions.tsx','src/components/badminton/BadmintonCheckInWorkspace.tsx','src/components/QrDesk.tsx',
 'src/context/OperationalActionsContext.tsx','src/components/operational-actions/*.tsx','src/services/bookingSync.ts','backend/src/services/operationalActions.ts',
 'src/services/{authErrors,sessionEvents}.ts','src/api.ts',
 'backend/src/services/{badmintonCheckInRoster,adminDashboard,badmintonRenewals,notificationEvents,notificationLifecycle}.ts','backend/src/routes/{badmintonCheckInRoster,adminDashboard,notifications}.ts',
 'backend/tests/{badminton-check-in-roster,admin-dashboard,notifications,auth-presentation}.test.ts',
]}];
