ALTER TABLE "BookingAttendance" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'present';
ALTER TABLE "BookingAttendance" ADD COLUMN "notes" TEXT;
CREATE TABLE "AttendanceModification" (
  "id" TEXT NOT NULL PRIMARY KEY, "bookingId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL, "previous" TEXT NOT NULL, "current" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AttendanceModification_bookingId_createdAt_idx" ON "AttendanceModification"("bookingId", "createdAt");
CREATE TABLE "BookingChangeHistory" (
  "id" TEXT NOT NULL PRIMARY KEY, "bookingId" TEXT NOT NULL, "action" TEXT NOT NULL,
  "previous" TEXT NOT NULL, "current" TEXT NOT NULL, "requestedById" TEXT NOT NULL,
  "approvedById" TEXT, "reason" TEXT NOT NULL, "policyException" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingChangeHistory_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "BookingChangeHistory_bookingId_createdAt_idx" ON "BookingChangeHistory"("bookingId", "createdAt");
CREATE TABLE "BookingCancellationRequest" (
  "id" TEXT NOT NULL PRIMARY KEY, "bookingId" TEXT NOT NULL, "requestedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'requested', "refundStatus" TEXT NOT NULL DEFAULT 'manual_review',
  "reviewedById" TEXT, "reviewReason" TEXT, "reviewedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingCancellationRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "BookingCancellationRequest_bookingId_createdAt_idx" ON "BookingCancellationRequest"("bookingId", "createdAt");

-- Keep all historical attendance, including multiple visits recorded on a legacy day.
ALTER TABLE "BadmintonCheckIn" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'present';
ALTER TABLE "BadmintonCheckIn" ADD COLUMN "packageSnapshot" TEXT;
-- Seed one technical guard per legacy enrollment/day; additional historical rows remain intact.
ALTER TABLE "BadmintonCheckIn" ADD COLUMN "dailyKey" TEXT;
UPDATE "BadmintonCheckIn"
SET "dailyKey" = "enrollmentId" || ':' || "date"
WHERE "id" IN (SELECT MIN("id") FROM "BadmintonCheckIn" GROUP BY "enrollmentId", "date");
CREATE UNIQUE INDEX "BadmintonCheckIn_dailyKey_key" ON "BadmintonCheckIn"("dailyKey");
