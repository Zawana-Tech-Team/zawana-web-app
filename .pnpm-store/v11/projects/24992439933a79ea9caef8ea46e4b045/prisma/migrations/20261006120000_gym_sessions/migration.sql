ALTER TABLE "GymPackage" ADD COLUMN "sessions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StoreOrder" ADD COLUMN "discount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StoreOrder" ADD COLUMN "tax" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Membership" ADD COLUMN "sessionsTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Membership" ADD COLUMN "sessionsRemaining" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "GymCheckIn" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "membershipId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "time" TEXT NOT NULL,
  "sessionsUsed" INTEGER NOT NULL DEFAULT 1,
  "staffId" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GymCheckIn_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GymCheckIn_membershipId_date_key" ON "GymCheckIn"("membershipId", "date");
