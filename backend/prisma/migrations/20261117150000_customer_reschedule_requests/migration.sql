-- CreateTable
CREATE TABLE "BookingRescheduleRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "activeKey" TEXT,
    "customerId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CUSTOMER',
    "reason" TEXT NOT NULL DEFAULT '',
    "response" TEXT,
    "oldSchedule" JSONB NOT NULL,
    "proposed" JSONB,
    "oldPaid" INTEGER,
    "newPrice" INTEGER,
    "priceDifference" INTEGER,
    "priceAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "privateProposalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "BookingRescheduleRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RescheduleRequestEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RescheduleRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BookingRescheduleRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingRescheduleRequest_activeKey_key" ON "BookingRescheduleRequest"("activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRescheduleRequest_privateProposalId_key" ON "BookingRescheduleRequest"("privateProposalId");

-- CreateIndex
CREATE INDEX "BookingRescheduleRequest_customerId_status_idx" ON "BookingRescheduleRequest"("customerId", "status");

