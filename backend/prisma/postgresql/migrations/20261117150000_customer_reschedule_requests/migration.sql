-- CreateTable
CREATE TABLE "BookingRescheduleRequest" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRescheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RescheduleRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RescheduleRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingRescheduleRequest_activeKey_key" ON "BookingRescheduleRequest"("activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRescheduleRequest_privateProposalId_key" ON "BookingRescheduleRequest"("privateProposalId");

-- CreateIndex
CREATE INDEX "BookingRescheduleRequest_customerId_status_idx" ON "BookingRescheduleRequest"("customerId", "status");

-- AddForeignKey
ALTER TABLE "BookingRescheduleRequest" ADD CONSTRAINT "BookingRescheduleRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequestEvent" ADD CONSTRAINT "RescheduleRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BookingRescheduleRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

