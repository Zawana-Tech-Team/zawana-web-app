ALTER TABLE "Transaction" ADD COLUMN "resourceType" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "resourceId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "confirmationMode" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "Transaction" ADD COLUMN "confirmedById" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "requestKey" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "requestHash" TEXT;
CREATE UNIQUE INDEX "Transaction_resourceType_resourceId_key" ON "Transaction"("resourceType", "resourceId");
CREATE UNIQUE INDEX "Transaction_requestKey_key" ON "Transaction"("requestKey");
ALTER TABLE "Appointment" ADD COLUMN "price" INTEGER NOT NULL DEFAULT 0;
-- Retire unfinished gateway attempts; never activate their resources or alter paid history.
UPDATE "PaymentAttempt" SET "status"='EXPIRED', "checkoutUrl"=NULL, "qrCode"=NULL,
 "failureReason"='Gateway retired; explicit manual confirmation required' WHERE "status" IN ('INITIATING','PENDING');
