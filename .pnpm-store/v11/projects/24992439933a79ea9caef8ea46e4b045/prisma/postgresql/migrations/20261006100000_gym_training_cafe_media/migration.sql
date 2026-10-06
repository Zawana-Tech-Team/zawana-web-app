CREATE TYPE "PrivateTrainingStatus" AS ENUM ('SCHEDULED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

ALTER TABLE "Product" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "CafeMenuItem" ADD COLUMN "imageUrl" TEXT;

CREATE TABLE "PrivateTrainingSession" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 60,
  "status" "PrivateTrainingStatus" NOT NULL DEFAULT 'SCHEDULED',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivateTrainingSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivateTrainingSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PrivateTrainingSession_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivateTrainingSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PrivateTrainingSession_memberId_date_status_idx" ON "PrivateTrainingSession"("memberId", "date", "status");
CREATE INDEX "PrivateTrainingSession_coachId_date_status_idx" ON "PrivateTrainingSession"("coachId", "date", "status");

ALTER TABLE "CafeOrder" ADD COLUMN "orderNumber" TEXT;
ALTER TABLE "CafeOrder" ADD COLUMN "customerId" TEXT;
ALTER TABLE "CafeOrder" ADD COLUMN "location" TEXT NOT NULL DEFAULT 'Cafe';
ALTER TABLE "CafeOrder" ADD COLUMN "courtId" TEXT;
ALTER TABLE "CafeOrder" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "CafeOrder" ADD COLUMN "subtotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CafeOrder" ADD COLUMN "discount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CafeOrder" ADD COLUMN "tax" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CafeOrder" ADD COLUMN "total" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CafeOrder" ADD COLUMN "createdById" TEXT;
ALTER TABLE "CafeOrder" ADD COLUMN "transactionId" TEXT;
ALTER TABLE "CafeOrder" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CafeOrder" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "CafeOrder_orderNumber_key" ON "CafeOrder"("orderNumber");
CREATE UNIQUE INDEX "CafeOrder_transactionId_key" ON "CafeOrder"("transactionId");
CREATE INDEX "CafeOrder_status_createdAt_idx" ON "CafeOrder"("status", "createdAt");
CREATE INDEX "CafeOrder_location_createdAt_idx" ON "CafeOrder"("location", "createdAt");
ALTER TABLE "CafeOrder" ADD CONSTRAINT "CafeOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CafeOrder" ADD CONSTRAINT "CafeOrder_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CafeOrder" ADD CONSTRAINT "CafeOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CafeOrder" ADD CONSTRAINT "CafeOrder_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CafeOrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "menuItemId" TEXT,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CafeOrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CafeOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CafeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CafeOrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "CafeMenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "CafeOrderItem_orderId_idx" ON "CafeOrderItem"("orderId");
CREATE INDEX "CafeOrderItem_menuItemId_idx" ON "CafeOrderItem"("menuItemId");
