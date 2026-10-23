CREATE TABLE "BadmintonEntryQr" (
 "id" TEXT NOT NULL PRIMARY KEY, "tokenHash" TEXT NOT NULL, "createdById" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "BadmintonEntryQr_tokenHash_key" ON "BadmintonEntryQr"("tokenHash");
CREATE TABLE "BadmintonQrVisit" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "date" TEXT NOT NULL, "checkInId" TEXT NOT NULL
);
CREATE UNIQUE INDEX "BadmintonQrVisit_checkInId_key" ON "BadmintonQrVisit"("checkInId");
CREATE UNIQUE INDEX "BadmintonQrVisit_userId_date_key" ON "BadmintonQrVisit"("userId", "date");
