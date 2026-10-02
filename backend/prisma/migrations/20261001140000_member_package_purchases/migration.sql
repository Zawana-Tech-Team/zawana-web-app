CREATE TABLE "BadmintonPackagePurchase" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "packageName" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "paymentMethod" TEXT NOT NULL DEFAULT 'Pay at front desk',
  "status" TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" DATETIME,
  CONSTRAINT "BadmintonPackagePurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BadmintonPackagePurchase_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "BadmintonPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
ALTER TABLE "BadmintonEnrollment" ADD COLUMN "purchaseId" TEXT REFERENCES "BadmintonPackagePurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "BadmintonEnrollment_purchaseId_key" ON "BadmintonEnrollment"("purchaseId");
CREATE INDEX "BadmintonPackagePurchase_userId_createdAt_idx" ON "BadmintonPackagePurchase"("userId", "createdAt");
CREATE INDEX "BadmintonPackagePurchase_status_createdAt_idx" ON "BadmintonPackagePurchase"("status", "createdAt");
