CREATE TABLE "CourtBlock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courtId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "dayOfWeek" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "start" TEXT NOT NULL,
  "end" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'class',
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourtBlock_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CourtBlock_courtId_date_idx" ON "CourtBlock"("courtId", "date");
CREATE INDEX "CourtBlock_courtId_dayOfWeek_idx" ON "CourtBlock"("courtId", "dayOfWeek");
CREATE TABLE "HolidayRate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "date" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "price" INTEGER NOT NULL DEFAULT 30000,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "HolidayRate_date_key" ON "HolidayRate"("date");
