CREATE TABLE "CourtDateOverride" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "date" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Holiday',
  "reason" TEXT,
  "createdById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourtDateOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CourtDateOverride_date_key" ON "CourtDateOverride"("date");
CREATE INDEX "CourtDateOverride_date_type_idx" ON "CourtDateOverride"("date", "type");
