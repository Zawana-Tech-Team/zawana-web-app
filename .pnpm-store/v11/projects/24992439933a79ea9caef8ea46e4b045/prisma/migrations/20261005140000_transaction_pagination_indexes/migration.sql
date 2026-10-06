CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");
CREATE INDEX "Transaction_business_status_date_idx" ON "Transaction"("business", "status", "date");
