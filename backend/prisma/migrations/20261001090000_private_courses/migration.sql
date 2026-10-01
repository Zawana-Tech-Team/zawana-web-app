CREATE TABLE "PrivateCourse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "duration" INTEGER NOT NULL DEFAULT 60,
  "price" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PrivateCourse_status_title_idx" ON "PrivateCourse"("status", "title");
ALTER TABLE "Booking" ADD COLUMN "reservationExpiresAt" DATETIME;
ALTER TABLE "BadmintonEnrollment" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "BadmintonEnrollment_userId_idx" ON "BadmintonEnrollment"("userId");
CREATE INDEX "Booking_userId_createdAt_idx" ON "Booking"("userId", "createdAt");
CREATE INDEX "Booking_courtId_date_status_idx" ON "Booking"("courtId", "date", "status");
CREATE INDEX "Booking_coachId_date_status_idx" ON "Booking"("coachId", "date", "status");
