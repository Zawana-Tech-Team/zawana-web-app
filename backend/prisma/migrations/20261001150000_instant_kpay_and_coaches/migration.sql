ALTER TABLE "Coach" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "PrivateCourse" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "PrivateCourse" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Private Training';

ALTER TABLE "Notification" ADD COLUMN "icon" TEXT;
ALTER TABLE "Notification" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Notification" ADD COLUMN "actionLabel" TEXT;
ALTER TABLE "Notification" ADD COLUMN "entityType" TEXT;
ALTER TABLE "Notification" ADD COLUMN "entityId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "activeInInbox" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "_PrivateCourseCoaches" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_PrivateCourseCoaches_A_fkey" FOREIGN KEY ("A") REFERENCES "Coach"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "_PrivateCourseCoaches_B_fkey" FOREIGN KEY ("B") REFERENCES "PrivateCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "_PrivateCourseCoaches_AB_unique" ON "_PrivateCourseCoaches"("A", "B");
CREATE INDEX "_PrivateCourseCoaches_B_idx" ON "_PrivateCourseCoaches"("B");

CREATE TABLE "PaymentAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reference" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'MMK',
  "provider" TEXT NOT NULL DEFAULT 'KPay',
  "providerReference" TEXT UNIQUE,
  "checkoutUrl" TEXT,
  "qrCode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'INITIATING',
  "expiresAt" DATETIME NOT NULL,
  "paidAt" DATETIME,
  "failureReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PaymentAttempt_userId_createdAt_idx" ON "PaymentAttempt"("userId", "createdAt");
CREATE INDEX "PaymentAttempt_resourceType_resourceId_idx" ON "PaymentAttempt"("resourceType", "resourceId");
CREATE INDEX "PaymentAttempt_status_expiresAt_idx" ON "PaymentAttempt"("status", "expiresAt");

CREATE TABLE "Schedule_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "person" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "start" TEXT NOT NULL,
  "end" TEXT NOT NULL,
  "service" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "doctorId" TEXT,
  CONSTRAINT "Schedule_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "Schedule_new" ("id","person","role","day","start","end","service","active","doctorId")
SELECT "id","person","role","day","start","end","service","active","doctorId" FROM "Schedule" WHERE "role" = 'doctor';
DROP TABLE "Schedule";
ALTER TABLE "Schedule_new" RENAME TO "Schedule";
