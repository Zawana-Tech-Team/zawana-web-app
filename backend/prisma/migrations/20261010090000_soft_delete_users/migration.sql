ALTER TABLE "User" ADD COLUMN "deletedAt" DATETIME;

CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
