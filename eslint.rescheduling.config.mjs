import base from './eslint.gym.config.mjs';

export default [{
  ...base[0],
  files: [
    'src/components/{SharedRescheduleFlow,ReplacementSessionFields,BookingRequestWorkflow,PrivateRescheduling}.tsx',
    'src/components/member-booking/AffectedBookingGroup.tsx',
    'src/pages/CourtReschedule.tsx',
    'backend/src/services/{bookingRequests,privateRescheduling,deskMoves,rentalPricing,courtAvailability}.ts',
    'backend/src/routes/rescheduling.ts',
    'backend/tests/{unified-rescheduling,rescheduling-api}.test.ts',
    'backend/tests/attendance-browser-fixture.ts',
  ],
}];
