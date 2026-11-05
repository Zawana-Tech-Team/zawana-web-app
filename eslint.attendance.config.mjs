import base from './eslint.gym.config.mjs';
export default [{ ...base[0], files: [
  'src/components/{QrDesk,PackageReauthentication,AttendanceDetail,NotificationBell}.tsx', 'src/pages/{Attendance,QrCheckIn,Notifications}.tsx',
  'src/hooks/useViewedNotifications.ts', 'src/services/notificationInbox.ts', 'src/context/AppContext.tsx',
  'backend/src/routes/{qrCheckIn,notifications,attendance}.ts', 'backend/src/services/{packageSecurity,attendanceNotifications,badmintonAttendance,categoryQrPolicy,notificationLifecycle}.ts',
  'backend/tests/{package-security,badminton-category,notifications}.test.ts',
], rules: { ...base[0].rules, '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }] } }];
