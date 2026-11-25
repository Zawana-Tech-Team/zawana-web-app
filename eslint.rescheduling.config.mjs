import base from './eslint.gym.config.mjs';

export default [{ignores:['dist/**','backend/dist/**','**/node_modules/**']},{
  ...base[0],
  files: [
    'src/components/{AdminRequestToolbar,AdminRefundRequests,StaffBookingHistoryList,StaffBookingRequests,BookingStatusBadge,SharedRescheduleFlow,ReplacementSessionFields,BookingRequestWorkflow,PrivateRescheduling,RefundWorkflow,BulkRefundDialog}.tsx',
    'src/components/member-booking/AffectedBookingGroup.tsx',
    'src/components/court-desk/{DeskMoveDialog,RentalReschedulePresentation,CourtSelectionManager}.tsx',
    'src/components/refund/*.tsx',
    'src/hooks/useRentalMoveAvailability.ts',
    'src/pages/CourtReschedule.tsx','src/pages/Bookings.tsx',
    'backend/src/services/{bookingCompletion,bookingRequests,privateRescheduling,deskMoves,deskMoveAvailability,rentalPricing,courtAvailability}.ts',
    'backend/src/routes/rescheduling.ts',
    'backend/tests/{booking-completion,desk-move-availability,unified-rescheduling,rescheduling-api}.test.ts',
    'backend/tests/attendance-browser-fixture.ts',
  ],
}];
