BEGIN IMMEDIATE;
-- Preserve prior member QR records/redemptions; retire active tokens with the old contract.
ALTER TABLE "BadmintonEntryQr" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'MEMBER';
UPDATE "BadmintonEntryQr" SET "status"='REVOKED', "revokedAt"=CURRENT_TIMESTAMP WHERE "status"='ACTIVE';
CREATE TABLE "BadmintonQrDeskSlot" (
 "id" INTEGER NOT NULL PRIMARY KEY CHECK ("id" IN (1, 2)),
 "qrId" TEXT REFERENCES "BadmintonEntryQr"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BadmintonQrDeskSlot_qrId_key" ON "BadmintonQrDeskSlot"("qrId");
INSERT INTO "BadmintonQrDeskSlot"("id") VALUES (1), (2);
CREATE TABLE "BadmintonQrRedemption" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "qrId" TEXT NOT NULL REFERENCES "BadmintonEntryQr"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "memberId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "enrollmentId" TEXT NOT NULL REFERENCES "BadmintonEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "attendanceId" TEXT NOT NULL REFERENCES "BadmintonCheckIn"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "redeemedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BadmintonQrRedemption_qrId_memberId_key" ON "BadmintonQrRedemption"("qrId", "memberId");
CREATE UNIQUE INDEX "BadmintonQrRedemption_attendanceId_key" ON "BadmintonQrRedemption"("attendanceId");
CREATE INDEX "BadmintonQrRedemption_memberId_redeemedAt_idx" ON "BadmintonQrRedemption"("memberId", "redeemedAt");
COMMIT;
