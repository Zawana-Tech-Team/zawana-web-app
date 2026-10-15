-- AlterTable
ALTER TABLE "PrivateTrainingSession" ADD COLUMN     "enrollmentId" TEXT,
ADD COLUMN     "requestKey" TEXT;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "accessMode" TEXT NOT NULL DEFAULT 'sessions',
ADD COLUMN     "enrollmentId" TEXT;

-- AlterTable
ALTER TABLE "GymPackage" ADD COLUMN     "coachRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'MEMBERSHIP',
ADD COLUMN     "maxMembers" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "minMembers" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "months" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rate" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sessionMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "validityDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "GymPackageRevision" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GymPackageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GymEnrollment" (
    "id" TEXT NOT NULL,
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
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GymEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GymEnrollmentMember" (
    "enrollmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "GymEnrollmentMember_pkey" PRIMARY KEY ("enrollmentId","userId")
);

-- CreateTable
CREATE TABLE "GymSessionAttendance" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',

    CONSTRAINT "GymSessionAttendance_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateTable
CREATE TABLE "GymSessionDebit" (
    "sessionId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GymSessionDebit_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "GymAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GymAuditLog_pkey" PRIMARY KEY ("id")
);

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

-- CreateIndex
CREATE INDEX "PrivateTrainingSession_enrollmentId_status_idx" ON "PrivateTrainingSession"("enrollmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateTrainingSession_enrollmentId_requestKey_key" ON "PrivateTrainingSession"("enrollmentId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_enrollmentId_key" ON "Membership"("enrollmentId");

-- AddForeignKey
ALTER TABLE "PrivateTrainingSession" ADD CONSTRAINT "PrivateTrainingSession_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "GymEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "GymEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymPackageRevision" ADD CONSTRAINT "GymPackageRevision_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "GymPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymEnrollment" ADD CONSTRAINT "GymEnrollment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "GymPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymEnrollment" ADD CONSTRAINT "GymEnrollment_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymEnrollment" ADD CONSTRAINT "GymEnrollment_renewalOfId_fkey" FOREIGN KEY ("renewalOfId") REFERENCES "GymEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymEnrollment" ADD CONSTRAINT "GymEnrollment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymEnrollmentMember" ADD CONSTRAINT "GymEnrollmentMember_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "GymEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymEnrollmentMember" ADD CONSTRAINT "GymEnrollmentMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymSessionAttendance" ADD CONSTRAINT "GymSessionAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PrivateTrainingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymSessionAttendance" ADD CONSTRAINT "GymSessionAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymSessionDebit" ADD CONSTRAINT "GymSessionDebit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PrivateTrainingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GymSessionDebit" ADD CONSTRAINT "GymSessionDebit_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "GymEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Keep legacy package prices and use their existing validity period.
UPDATE "GymPackage" SET "validityDays"=GREATEST(1,"duration"), "months"=GREATEST(1,ROUND("duration"/30.0)::INTEGER);
UPDATE "GymPackage" SET "rate"=ROUND("price"::NUMERIC/"months")::INTEGER;
ALTER TABLE "GymEnrollment" ADD CONSTRAINT "GymEnrollment_balance_check" CHECK ("sessionsRemaining">=0 AND "sessionsRemaining"<="sessionsTotal" AND "sessionsTotal">=0 AND "totalPrice">0);
CREATE FUNCTION gym_purchase_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR NEW."totalPrice" IS DISTINCT FROM OLD."totalPrice" OR NEW."packageVersion" IS DISTINCT FROM OLD."packageVersion" OR NEW."packageId" IS DISTINCT FROM OLD."packageId" OR NEW."sessionsTotal" IS DISTINCT FROM OLD."sessionsTotal" OR NEW."kind" IS DISTINCT FROM OLD."kind" OR NEW."startDate" IS DISTINCT FROM OLD."startDate" OR NEW."expiryDate" IS DISTINCT FROM OLD."expiryDate" THEN RAISE EXCEPTION 'GYM_IMMUTABLE_PURCHASE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "GymEnrollment_snapshot_immutable" BEFORE UPDATE ON "GymEnrollment" FOR EACH ROW EXECUTE FUNCTION gym_purchase_immutable();
CREATE FUNCTION gym_history_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'GYM_IMMUTABLE_HISTORY'; END $$;
CREATE TRIGGER "GymAuditLog_immutable" BEFORE UPDATE OR DELETE ON "GymAuditLog" FOR EACH ROW EXECUTE FUNCTION gym_history_immutable();
CREATE TRIGGER "GymPackageRevision_immutable" BEFORE UPDATE OR DELETE ON "GymPackageRevision" FOR EACH ROW EXECUTE FUNCTION gym_history_immutable();
