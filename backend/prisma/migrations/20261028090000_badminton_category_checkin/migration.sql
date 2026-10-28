-- Atomic forward migration; no balances or historical rows are discarded.
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;
-- AlterTable
ALTER TABLE "BadmintonPackageCategory" ADD COLUMN "code" TEXT;

-- AlterTable
ALTER TABLE "BadmintonEnrollment" ADD COLUMN "categoryCode" TEXT;

-- RedefineTables
CREATE TABLE "new_BadmintonCheckIn" (
    "memberId" TEXT,
    "categoryCode" TEXT,
    "attendanceKey" TEXT,
    "source" TEXT NOT NULL DEFAULT 'STAFF',
    "actorId" TEXT,
    "qrId" TEXT,
    "dailyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'present',
    "packageSnapshot" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "enrollmentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "sessionsUsed" INTEGER NOT NULL DEFAULT 1,
    "staffId" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BadmintonCheckIn_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "BadmintonEntryQr" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BadmintonCheckIn_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "BadmintonEnrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BadmintonCheckIn" ("createdAt", "dailyKey", "date", "enrollmentId", "id", "note", "packageSnapshot", "sessionsUsed", "staffId", "status", "time") SELECT "createdAt", "dailyKey", "date", "enrollmentId", "id", "note", "packageSnapshot", "sessionsUsed", "staffId", "status", "time" FROM "BadmintonCheckIn";
DROP TABLE "BadmintonCheckIn";
ALTER TABLE "new_BadmintonCheckIn" RENAME TO "BadmintonCheckIn";
CREATE UNIQUE INDEX "BadmintonCheckIn_attendanceKey_key" ON "BadmintonCheckIn"("attendanceKey");
CREATE UNIQUE INDEX "BadmintonCheckIn_dailyKey_key" ON "BadmintonCheckIn"("dailyKey");
CREATE INDEX "BadmintonCheckIn_memberId_categoryCode_date_idx" ON "BadmintonCheckIn"("memberId", "categoryCode", "date");
CREATE INDEX "BadmintonCheckIn_enrollmentId_date_idx" ON "BadmintonCheckIn"("enrollmentId", "date");
CREATE TABLE "new_BadmintonEntryQr" (
    "categoryCode" TEXT,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME
);
INSERT INTO "new_BadmintonEntryQr" ("createdAt", "createdById", "expiresAt", "id", "revokedAt", "tokenHash") SELECT NULL, "createdById", "expiresAt", "id", "revokedAt", "tokenHash" FROM "BadmintonEntryQr";
DROP TABLE "BadmintonEntryQr";
ALTER TABLE "new_BadmintonEntryQr" RENAME TO "BadmintonEntryQr";
CREATE UNIQUE INDEX "BadmintonEntryQr_tokenHash_key" ON "BadmintonEntryQr"("tokenHash");
CREATE TABLE "new_BadmintonQrVisit" (
    "categoryCode" TEXT,
    "qrId" TEXT,
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    CONSTRAINT "BadmintonQrVisit_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "BadmintonEntryQr" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BadmintonQrVisit_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "BadmintonCheckIn" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BadmintonQrVisit" ("checkInId", "date", "id", "userId") SELECT "checkInId", "date", "id", "userId" FROM "BadmintonQrVisit";
DROP TABLE "BadmintonQrVisit";
ALTER TABLE "new_BadmintonQrVisit" RENAME TO "BadmintonQrVisit";
CREATE UNIQUE INDEX "BadmintonQrVisit_checkInId_key" ON "BadmintonQrVisit"("checkInId");
CREATE UNIQUE INDEX "BadmintonQrVisit_userId_categoryCode_date_key" ON "BadmintonQrVisit"("userId", "categoryCode", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BadmintonPackageCategory_code_key" ON "BadmintonPackageCategory"("code");

-- CreateIndex
CREATE INDEX "BadmintonEnrollment_userId_categoryCode_status_expiryDate_idx" ON "BadmintonEnrollment"("userId", "categoryCode", "status", "expiryDate");


-- Exact category aliases only. Duplicate aliases remain unresolved for operator review.
UPDATE "BadmintonPackageCategory" SET "code" = upper(trim("name"))
WHERE upper(trim("name")) IN ('FOUNDATION','SOCIAL','PATHWAY')
AND (SELECT count(*) FROM "BadmintonPackageCategory" c WHERE upper(trim(c."name"))=upper(trim("BadmintonPackageCategory"."name")))=1;
INSERT INTO "BadmintonPackageCategory" ("id","name","code","active","createdAt")
SELECT 'bmc-foundation', CASE WHEN EXISTS (SELECT 1 FROM "BadmintonPackageCategory" WHERE "name"='Foundation') THEN 'FOUNDATION [bmc-foundation]' ELSE 'Foundation' END, 'FOUNDATION', TRUE, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "BadmintonPackageCategory" WHERE "code"='FOUNDATION');
INSERT INTO "BadmintonPackageCategory" ("id","name","code","active","createdAt")
SELECT 'bmc-social', CASE WHEN EXISTS (SELECT 1 FROM "BadmintonPackageCategory" WHERE "name"='Social') THEN 'SOCIAL [bmc-social]' ELSE 'Social' END, 'SOCIAL', TRUE, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "BadmintonPackageCategory" WHERE "code"='SOCIAL');
INSERT INTO "BadmintonPackageCategory" ("id","name","code","active","createdAt")
SELECT 'bmc-pathway', CASE WHEN EXISTS (SELECT 1 FROM "BadmintonPackageCategory" WHERE "name"='Pathway') THEN 'PATHWAY [bmc-pathway]' ELSE 'Pathway' END, 'PATHWAY', TRUE, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "BadmintonPackageCategory" WHERE "code"='PATHWAY');

-- Never use package names. A conflicting purchase/package relationship is unresolved.
UPDATE "BadmintonEnrollment" SET "categoryCode" = (
 SELECT c."code" FROM "BadmintonPackage" p JOIN "BadmintonPackageCategory" c ON c."id"=p."categoryId"
 WHERE p."id"="BadmintonEnrollment"."packageId")
WHERE "purchaseId" IS NULL OR EXISTS (SELECT 1 FROM "BadmintonPackagePurchase" p WHERE p."id"="BadmintonEnrollment"."purchaseId" AND p."packageId"="BadmintonEnrollment"."packageId" AND p."userId"="BadmintonEnrollment"."userId");
UPDATE "BadmintonCheckIn" SET "memberId"=(SELECT COALESCE(e."userId", e."studentId") FROM "BadmintonEnrollment" e WHERE e."id"="BadmintonCheckIn"."enrollmentId"), "actorId"="staffId";
-- Historic self-check-ins may predate QR support, so do not label them as QR.
UPDATE "BadmintonCheckIn" SET "source"='LEGACY' WHERE "staffId" IS NULL;
UPDATE "BadmintonCheckIn" SET "source"='QR' WHERE EXISTS (SELECT 1 FROM "BadmintonQrVisit" v WHERE v."checkInId"="BadmintonCheckIn"."id");
UPDATE "BadmintonCheckIn" SET "categoryCode"=(SELECT e."categoryCode" FROM "BadmintonEnrollment" e WHERE e."id"="BadmintonCheckIn"."enrollmentId") WHERE ("packageSnapshot" IS NULL OR (CASE WHEN json_valid("packageSnapshot") THEN json_extract("packageSnapshot", '$.packageId') END = (SELECT e."packageId" FROM "BadmintonEnrollment" e WHERE e."id"="BadmintonCheckIn"."enrollmentId")));
-- Keep every historical duplicate; one canonical row guards the whole member/category/day.
UPDATE "BadmintonCheckIn" SET "attendanceKey"="memberId" || ':' || "categoryCode" || ':' || "date"
WHERE "memberId" IS NOT NULL AND "categoryCode" IS NOT NULL
AND "id"=(SELECT min(c."id") FROM "BadmintonCheckIn" c WHERE c."memberId"="BadmintonCheckIn"."memberId" AND c."categoryCode"="BadmintonCheckIn"."categoryCode" AND c."date"="BadmintonCheckIn"."date");
UPDATE "BadmintonQrVisit" SET "categoryCode"=(SELECT c."categoryCode" FROM "BadmintonCheckIn" c WHERE c."id"="BadmintonQrVisit"."checkInId");
CREATE TRIGGER "BadmintonPackageCategory_category_valid_insert" BEFORE INSERT ON "BadmintonPackageCategory" WHEN NEW."code" IS NOT NULL AND NEW."code" NOT IN ('FOUNDATION','SOCIAL','PATHWAY') BEGIN SELECT RAISE(ABORT,'Invalid badminton category'); END;
CREATE TRIGGER "BadmintonPackageCategory_category_immutable" BEFORE UPDATE OF "code" ON "BadmintonPackageCategory" WHEN (OLD."code" IS NOT NULL AND NEW."code" IS NOT OLD."code") OR (NEW."code" IS NOT NULL AND NEW."code" NOT IN ('FOUNDATION','SOCIAL','PATHWAY')) BEGIN SELECT RAISE(ABORT,'Badminton category is immutable'); END;
CREATE TRIGGER "BadmintonEnrollment_category_valid_insert" BEFORE INSERT ON "BadmintonEnrollment" WHEN NEW."categoryCode" IS NOT NULL AND NEW."categoryCode" NOT IN ('FOUNDATION','SOCIAL','PATHWAY') BEGIN SELECT RAISE(ABORT,'Invalid badminton category'); END;
CREATE TRIGGER "BadmintonEnrollment_category_immutable" BEFORE UPDATE OF "categoryCode" ON "BadmintonEnrollment" WHEN (OLD."categoryCode" IS NOT NULL AND NEW."categoryCode" IS NOT OLD."categoryCode") OR (NEW."categoryCode" IS NOT NULL AND NEW."categoryCode" NOT IN ('FOUNDATION','SOCIAL','PATHWAY')) BEGIN SELECT RAISE(ABORT,'Badminton category is immutable'); END;
CREATE TRIGGER "BadmintonCheckIn_category_valid_insert" BEFORE INSERT ON "BadmintonCheckIn" WHEN NEW."categoryCode" IS NOT NULL AND NEW."categoryCode" NOT IN ('FOUNDATION','SOCIAL','PATHWAY') BEGIN SELECT RAISE(ABORT,'Invalid badminton category'); END;
CREATE TRIGGER "BadmintonCheckIn_category_immutable" BEFORE UPDATE OF "categoryCode" ON "BadmintonCheckIn" WHEN (OLD."categoryCode" IS NOT NULL AND NEW."categoryCode" IS NOT OLD."categoryCode") OR (NEW."categoryCode" IS NOT NULL AND NEW."categoryCode" NOT IN ('FOUNDATION','SOCIAL','PATHWAY')) BEGIN SELECT RAISE(ABORT,'Badminton category is immutable'); END;
CREATE TRIGGER "BadmintonEntryQr_category_valid_insert" BEFORE INSERT ON "BadmintonEntryQr" WHEN NEW."categoryCode" IS NOT NULL AND NEW."categoryCode" NOT IN ('FOUNDATION','SOCIAL','PATHWAY') BEGIN SELECT RAISE(ABORT,'Invalid badminton category'); END;
CREATE TRIGGER "BadmintonEntryQr_category_immutable" BEFORE UPDATE OF "categoryCode" ON "BadmintonEntryQr" WHEN (OLD."categoryCode" IS NOT NULL AND NEW."categoryCode" IS NOT OLD."categoryCode") OR (NEW."categoryCode" IS NOT NULL AND NEW."categoryCode" NOT IN ('FOUNDATION','SOCIAL','PATHWAY')) BEGIN SELECT RAISE(ABORT,'Badminton category is immutable'); END;
CREATE TRIGGER "BadmintonQrVisit_category_valid_insert" BEFORE INSERT ON "BadmintonQrVisit" WHEN NEW."categoryCode" IS NOT NULL AND NEW."categoryCode" NOT IN ('FOUNDATION','SOCIAL','PATHWAY') BEGIN SELECT RAISE(ABORT,'Invalid badminton category'); END;
CREATE TRIGGER "BadmintonQrVisit_category_immutable" BEFORE UPDATE OF "categoryCode" ON "BadmintonQrVisit" WHEN (OLD."categoryCode" IS NOT NULL AND NEW."categoryCode" IS NOT OLD."categoryCode") OR (NEW."categoryCode" IS NOT NULL AND NEW."categoryCode" NOT IN ('FOUNDATION','SOCIAL','PATHWAY')) BEGIN SELECT RAISE(ABORT,'Badminton category is immutable'); END;

COMMIT;
PRAGMA foreign_keys=ON;
