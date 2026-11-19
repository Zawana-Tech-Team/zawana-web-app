CREATE TABLE "BookingRequestBatch" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "senderId" TEXT NOT NULL,
 "recipientId" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "BookingRescheduleRequest" ADD COLUMN "batchId" TEXT REFERENCES "BookingRequestBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "BookingRequestBatch_recipientId_createdAt_idx" ON "BookingRequestBatch"("recipientId", "createdAt");
CREATE INDEX "BookingRescheduleRequest_batchId_idx" ON "BookingRescheduleRequest"("batchId");
