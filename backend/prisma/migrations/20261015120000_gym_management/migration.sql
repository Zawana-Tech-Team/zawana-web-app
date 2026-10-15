-- CreateTable
CREATE TABLE "GymPackageRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GymPackageRevision_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "GymPackage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GymEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "packageVersion" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "kind" TEXT NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "sessionsTotal" INTEGER NOT NULL,
    "sessionsRemaining" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "startDate" TEXT NOT NULL,
    "expiryDate" TEXT NOT NULL,
    "coachId" TEXT,
    "createdById" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "renewalOfId" TEXT,
    "transactionId" TEXT,
    "paymentMethod" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GymEnrollment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "GymPackage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GymEnrollment_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GymEnrollment_renewalOfId_fkey" FOREIGN KEY ("renewalOfId") REFERENCES "GymEnrollment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GymEnrollment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GymEnrollmentMember" (
    "enrollmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    PRIMARY KEY ("enrollmentId", "userId"),
    CONSTRAINT "GymEnrollmentMember_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "GymEnrollment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GymEnrollmentMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GymSessionAttendance" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',

    PRIMARY KEY ("sessionId", "userId"),
    CONSTRAINT "GymSessionAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PrivateTrainingSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GymSessionAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GymSessionDebit" (
    "sessionId" TEXT NOT NULL PRIMARY KEY,
    "enrollmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GymSessionDebit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PrivateTrainingSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GymSessionDebit_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "GymEnrollment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GymAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Additive changes preserve existing tables, rows, indexes, and triggers.
ALTER TABLE "PrivateTrainingSession" ADD COLUMN "enrollmentId" TEXT REFERENCES "GymEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrivateTrainingSession" ADD COLUMN "requestKey" TEXT;
CREATE INDEX "PrivateTrainingSession_enrollmentId_status_idx" ON "PrivateTrainingSession"("enrollmentId", "status");
CREATE UNIQUE INDEX "PrivateTrainingSession_enrollmentId_requestKey_key" ON "PrivateTrainingSession"("enrollmentId", "requestKey");
ALTER TABLE "Membership" ADD COLUMN "enrollmentId" TEXT REFERENCES "GymEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD COLUMN "accessMode" TEXT NOT NULL DEFAULT 'sessions';
CREATE UNIQUE INDEX "Membership_enrollmentId_key" ON "Membership"("enrollmentId");
ALTER TABLE "GymPackage" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'MEMBERSHIP';
ALTER TABLE "GymPackage" ADD COLUMN "rate" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GymPackage" ADD COLUMN "months" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GymPackage" ADD COLUMN "validityDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "GymPackage" ADD COLUMN "sessionMinutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "GymPackage" ADD COLUMN "minMembers" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "GymPackage" ADD COLUMN "maxMembers" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "GymPackage" ADD COLUMN "coachRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GymPackage" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
UPDATE "GymPackage" SET "validityDays"=MAX(1,"duration"), "months"=MAX(1,CAST(ROUND("duration"/30.0) AS INTEGER));
UPDATE "GymPackage" SET "rate"=CAST(ROUND("price"*1.0/"months") AS INTEGER);

-- CreateIndex
CREATE UNIQUE INDEX "GymPackageRevision_packageId_version_key" ON "GymPackageRevision"("packageId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "GymEnrollment_code_key" ON "GymEnrollment"("code");

-- CreateIndex
CREATE INDEX "GymEnrollment_renewalOfId_idx" ON "GymEnrollment"("renewalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "GymEnrollment_transactionId_key" ON "GymEnrollment"("transactionId");

-- CreateIndex
CREATE INDEX "GymEnrollment_status_expiryDate_idx" ON "GymEnrollment"("status", "expiryDate");

-- CreateIndex
CREATE INDEX "GymEnrollment_packageId_createdAt_idx" ON "GymEnrollment"("packageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GymEnrollment_createdById_requestKey_key" ON "GymEnrollment"("createdById", "requestKey");

-- CreateIndex
CREATE INDEX "GymEnrollmentMember_userId_idx" ON "GymEnrollmentMember"("userId");

-- CreateIndex
CREATE INDEX "GymAuditLog_entityType_entityId_createdAt_idx" ON "GymAuditLog"("entityType", "entityId", "createdAt");


-- Database guards complement transactional application checks.
CREATE TRIGGER "GymEnrollment_balance_insert" BEFORE INSERT ON "GymEnrollment"
WHEN NEW."sessionsRemaining" < 0 OR NEW."sessionsRemaining" > NEW."sessionsTotal" OR NEW."sessionsTotal" < 0 OR NEW."totalPrice" <= 0
BEGIN SELECT RAISE(ABORT, 'GYM_INVALID_BALANCE'); END;
CREATE TRIGGER "GymEnrollment_balance_update" BEFORE UPDATE ON "GymEnrollment"
WHEN NEW."sessionsRemaining" < 0 OR NEW."sessionsRemaining" > NEW."sessionsTotal"
BEGIN SELECT RAISE(ABORT, 'GYM_INVALID_BALANCE'); END;
CREATE TRIGGER "GymEnrollment_snapshot_immutable" BEFORE UPDATE ON "GymEnrollment"
WHEN NEW."snapshot" IS NOT OLD."snapshot" OR NEW."totalPrice" IS NOT OLD."totalPrice" OR NEW."packageVersion" IS NOT OLD."packageVersion" OR NEW."packageId" IS NOT OLD."packageId" OR NEW."sessionsTotal" IS NOT OLD."sessionsTotal" OR NEW."kind" IS NOT OLD."kind" OR NEW."startDate" IS NOT OLD."startDate" OR NEW."expiryDate" IS NOT OLD."expiryDate"
BEGIN SELECT RAISE(ABORT, 'GYM_IMMUTABLE_PURCHASE'); END;
CREATE TRIGGER "GymAuditLog_no_update" BEFORE UPDATE ON "GymAuditLog" BEGIN SELECT RAISE(ABORT, 'GYM_IMMUTABLE_AUDIT'); END;
CREATE TRIGGER "GymAuditLog_no_delete" BEFORE DELETE ON "GymAuditLog" BEGIN SELECT RAISE(ABORT, 'GYM_IMMUTABLE_AUDIT'); END;
CREATE TRIGGER "GymPackageRevision_no_update" BEFORE UPDATE ON "GymPackageRevision" BEGIN SELECT RAISE(ABORT, 'GYM_IMMUTABLE_REVISION'); END;
CREATE TRIGGER "GymPackageRevision_no_delete" BEFORE DELETE ON "GymPackageRevision" BEGIN SELECT RAISE(ABORT, 'GYM_IMMUTABLE_REVISION'); END;
