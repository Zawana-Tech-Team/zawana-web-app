-- CreateTable
CREATE TABLE "BookingRefund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "cancellationRequestId" TEXT,
    "originalTransactionId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "employeeUserId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "refundReference" TEXT,
    "referenceKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REFUNDED',
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "sourcePayments" JSONB NOT NULL,
    "notificationDeliveredAt" DATETIME,
    CONSTRAINT "BookingRefund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingRefund_originalTransactionId_fkey" FOREIGN KEY ("originalTransactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingRefund_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingRefund_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingRefund_employeeUserId_fkey" FOREIGN KEY ("employeeUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingRefund_bookingId_key" ON "BookingRefund"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRefund_transactionId_key" ON "BookingRefund"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRefund_referenceKey_key" ON "BookingRefund"("referenceKey");

-- CreateIndex
CREATE INDEX "BookingRefund_customerId_processedAt_idx" ON "BookingRefund"("customerId", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingRefund_employeeUserId_requestKey_key" ON "BookingRefund"("employeeUserId", "requestKey");

