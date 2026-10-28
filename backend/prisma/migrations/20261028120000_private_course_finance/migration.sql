-- CreateTable
CREATE TABLE "PrivateCoursePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "transactionId" TEXT,
    "paymentAttemptId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "paymentSource" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "collectedByUserId" TEXT,
    "receivedAt" DATETIME,
    "verifiedByUserId" TEXT,
    "verifiedAt" DATETIME,
    "providerReference" TEXT,
    "externalReceiptReference" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrivateCoursePayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrivateCoursePayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrivateCoursePayment_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrivateCourseSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collectorId" TEXT NOT NULL,
    "receivedById" TEXT,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" DATETIME,
    "notes" TEXT,
    "requestKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "PrivateCourseSettlementItem" (
    "settlementId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    PRIMARY KEY ("settlementId", "paymentId"),
    CONSTRAINT "PrivateCourseSettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "PrivateCourseSettlement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrivateCourseSettlementItem_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PrivateCoursePayment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrivateCourseAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrivateCourseAdjustment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PrivateCoursePayment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PrivateCoursePayment_bookingId_key" ON "PrivateCoursePayment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateCoursePayment_transactionId_key" ON "PrivateCoursePayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateCoursePayment_paymentAttemptId_key" ON "PrivateCoursePayment"("paymentAttemptId");

-- CreateIndex
CREATE INDEX "PrivateCoursePayment_collectedByUserId_createdAt_idx" ON "PrivateCoursePayment"("collectedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PrivateCoursePayment_paymentSource_status_createdAt_idx" ON "PrivateCoursePayment"("paymentSource", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateCourseSettlement_collectorId_requestKey_key" ON "PrivateCourseSettlement"("collectorId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateCourseAdjustment_paymentId_key" ON "PrivateCourseAdjustment"("paymentId");

