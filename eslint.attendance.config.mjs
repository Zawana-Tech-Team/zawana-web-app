import base from './eslint.gym.config.mjs';
export default [{ignores:['dist/**','backend/dist/**','**/node_modules/**']},{ ...base[0], files: [
  'src/components/{QrDesk,PackageReauthentication,AttendanceDetail,AttendanceList,AttendanceStatus,NotificationBell}.tsx', 'src/pages/{Attendance,QrCheckIn,Notifications}.tsx',
  'src/components/member-booking/MemberAttendanceHistory.tsx',
  'src/hooks/useViewedNotifications.ts', 'src/services/notificationInbox.ts', 'src/context/AppContext.tsx',
  'backend/src/routes/{qrCheckIn,notifications,attendance}.ts', 'backend/src/services/{packageSecurity,attendanceNotifications,badmintonAttendance,categoryQrPolicy,notificationLifecycle,weeklyAttendance}.ts',
  'backend/tests/{package-security,badminton-category,notifications,attendance}.test.ts',
], rules: { ...base[0].rules, '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }] } }];
