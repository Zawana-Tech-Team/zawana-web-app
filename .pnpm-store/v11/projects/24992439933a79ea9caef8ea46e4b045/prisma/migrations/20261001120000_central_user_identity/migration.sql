ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;
CREATE INDEX "User_role_active_idx" ON "User"("role", "active");

ALTER TABLE "Coach" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Coach_userId_key" ON "Coach"("userId");
UPDATE "Coach" SET "userId" = (SELECT "id" FROM "User" WHERE lower("email") = lower("Coach"."email") AND "role" = 'coach' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM "User" WHERE lower("email") = lower("Coach"."email") AND "role" = 'coach');

CREATE TABLE "Doctor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "specialty" TEXT NOT NULL DEFAULT 'Physiotherapy & rehabilitation',
  "phone" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'active',
  "color" TEXT NOT NULL DEFAULT '#79B4FF',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "Schedule" ADD COLUMN "doctorId" TEXT REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD COLUMN "doctorId" TEXT REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreOrder" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Schedule_doctorId_idx" ON "Schedule"("doctorId");
CREATE INDEX "Appointment_userId_date_idx" ON "Appointment"("userId", "date");
CREATE INDEX "Appointment_doctorId_date_idx" ON "Appointment"("doctorId", "date");
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");
CREATE INDEX "StoreOrder_userId_idx" ON "StoreOrder"("userId");
