-- CreateTable
CREATE TABLE "PrivateCoursePayment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "transactionId" TEXT,
    "paymentAttemptId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "paymentSource" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "collectedByUserId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "providerReference" TEXT,
    "externalReceiptReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateCoursePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateCourseSettlement" (
    "id" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "receivedById" TEXT,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "requestKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,

    CONSTRAINT "PrivateCourseSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateCourseSettlementItem" (
    "settlementId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "PrivateCourseSettlementItem_pkey" PRIMARY KEY ("settlementId","paymentId")
);

-- CreateTable
CREATE TABLE "PrivateCourseAdjustment" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateCourseAdjustment_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "PrivateCoursePayment" ADD CONSTRAINT "PrivateCoursePayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateCoursePayment" ADD CONSTRAINT "PrivateCoursePayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateCoursePayment" ADD CONSTRAINT "PrivateCoursePayment_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateCourseSettlementItem" ADD CONSTRAINT "PrivateCourseSettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "PrivateCourseSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateCourseSettlementItem" ADD CONSTRAINT "PrivateCourseSettlementItem_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PrivateCoursePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateCourseAdjustment" ADD CONSTRAINT "PrivateCourseAdjustment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PrivateCoursePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

