-- AlterTable
ALTER TABLE "CourtBlock" ADD COLUMN "effectiveFrom" TEXT;
ALTER TABLE "CourtBlock" ADD COLUMN "effectiveUntil" TEXT;
ALTER TABLE "CourtBlock" ADD COLUMN "excludedDates" JSONB;

-- CreateTable
CREATE TABLE "DeskMoveBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PrivateRescheduleRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "pendingKey" TEXT,
    "requestedById" TEXT NOT NULL,
    "originalRevision" TEXT NOT NULL,
    "original" JSONB NOT NULL,
    "courtId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrivateRescheduleRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DeskMoveBatch_actorId_requestKey_key" ON "DeskMoveBatch"("actorId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateRescheduleRequest_pendingKey_key" ON "PrivateRescheduleRequest"("pendingKey");

-- CreateIndex
CREATE INDEX "PrivateRescheduleRequest_bookingId_status_idx" ON "PrivateRescheduleRequest"("bookingId", "status");

