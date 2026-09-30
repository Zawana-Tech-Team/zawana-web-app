CREATE TABLE "BadmintonEnrollment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "packageName" TEXT NOT NULL,
  "sessionsTotal" INTEGER NOT NULL,
  "sessionsRemaining" INTEGER NOT NULL,
  "startDate" TEXT NOT NULL,
  "expiryDate" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "renewalCount" INTEGER NOT NULL DEFAULT 0,
  "lastCheckIn" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BadmintonEnrollment_studentId_idx" ON "BadmintonEnrollment"("studentId");
CREATE INDEX "BadmintonEnrollment_expiryDate_status_idx" ON "BadmintonEnrollment"("expiryDate", "status");

CREATE TABLE "BadmintonCheckIn" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "enrollmentId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "time" TEXT NOT NULL,
  "sessionsUsed" INTEGER NOT NULL DEFAULT 1,
  "staffId" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BadmintonCheckIn_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "BadmintonEnrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BadmintonCheckIn_enrollmentId_date_idx" ON "BadmintonCheckIn"("enrollmentId", "date");
