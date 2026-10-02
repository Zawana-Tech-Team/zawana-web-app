CREATE TABLE "BadmintonPackageCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BadmintonPackageCategory_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
ALTER TABLE "BadmintonPackage" ADD COLUMN "categoryId" TEXT REFERENCES "BadmintonPackageCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BadmintonPackage" ADD COLUMN "availableDays" JSONB;
ALTER TABLE "BadmintonPackage" ADD COLUMN "availableFrom" TEXT;
ALTER TABLE "BadmintonPackage" ADD COLUMN "availableUntil" TEXT;
ALTER TABLE "BadmintonPackage" ADD COLUMN "scheduleNotes" TEXT;
ALTER TABLE "BadmintonPackage" ADD COLUMN "courtRules" TEXT;
ALTER TABLE "BadmintonPackage" ADD COLUMN "imageUrl" TEXT;
CREATE INDEX "BadmintonPackage_categoryId_status_idx" ON "BadmintonPackage"("categoryId", "status");
