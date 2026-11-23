import base from './eslint.gym.config.mjs';
export default [{ignores:['dist/**','backend/dist/**','**/node_modules/**']},{...base[0],files:[
 'src/components/{BadmintonCategoryField,PackageMembers}.tsx',
 'src/components/court-desk/{HolidayManagement,DeskBatchBookingDialog}.tsx',
 'src/pages/Dashboard.tsx','src/utils/bookingTime.ts',
 'backend/src/routes/{packageManagement,holidays,courtDesk}.ts',
 'backend/src/services/{badmintonCategory,blockSchedule,deskWeekly}.ts',
 'backend/tests/{package-management,package-security}.test.ts',
]}];
