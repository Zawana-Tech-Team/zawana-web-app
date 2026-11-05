BEGIN IMMEDIATE;
-- Forward-only extension. Historical desk tokens are revoked; no visits or balances change.
ALTER TABLE "BadmintonEntryQr" ADD COLUMN "memberId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BadmintonEntryQr" ADD COLUMN "authorizedCategories" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "BadmintonEntryQr" ADD COLUMN "encryptedToken" TEXT;
ALTER TABLE "BadmintonEntryQr" ADD COLUMN "scopeKey" TEXT;
ALTER TABLE "BadmintonEntryQr" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "BadmintonEntryQr" ADD COLUMN "usedAt" DATETIME;
ALTER TABLE "BadmintonEntryQr" ADD COLUMN "redeemedBy" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BadmintonEntryQr" ADD COLUMN "attendanceId" TEXT REFERENCES "BadmintonCheckIn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE "BadmintonEntryQr" SET "status"='REVOKED', "revokedAt"=CURRENT_TIMESTAMP WHERE "memberId" IS NULL;
CREATE UNIQUE INDEX "BadmintonEntryQr_attendanceId_key" ON "BadmintonEntryQr"("attendanceId");
CREATE INDEX "BadmintonEntryQr_memberId_status_expiresAt_idx" ON "BadmintonEntryQr"("memberId", "status", "expiresAt");
CREATE INDEX "BadmintonEntryQr_scopeKey_status_idx" ON "BadmintonEntryQr"("scopeKey", "status");
CREATE TABLE "PackageSecurityChallenge" (
 "id" TEXT NOT NULL PRIMARY KEY, "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "mutationHash" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" DATETIME NOT NULL, "consumedAt" DATETIME);
CREATE INDEX "PackageSecurityChallenge_actorId_expiresAt_idx" ON "PackageSecurityChallenge"("actorId", "expiresAt");
CREATE TABLE "PackageSecurityAudit" (
 "id" TEXT NOT NULL PRIMARY KEY, "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "packageId" TEXT, "action" TEXT NOT NULL, "changes" TEXT NOT NULL, "success" BOOLEAN NOT NULL,
 "requestIp" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "PackageSecurityAudit_actorId_createdAt_idx" ON "PackageSecurityAudit"("actorId", "createdAt");
CREATE INDEX "PackageSecurityAudit_packageId_createdAt_idx" ON "PackageSecurityAudit"("packageId", "createdAt");

CREATE TABLE "NotificationRead" (
 "notificationId" TEXT NOT NULL REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("notificationId", "userId"));
CREATE INDEX "NotificationRead_userId_idx" ON "NotificationRead"("userId");

ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

COMMIT;
