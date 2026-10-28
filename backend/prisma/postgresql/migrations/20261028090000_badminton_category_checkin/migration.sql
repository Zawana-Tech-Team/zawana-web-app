BEGIN;
-- DropIndex
DROP INDEX "BadmintonQrVisit_userId_date_key";

-- AlterTable
ALTER TABLE "BadmintonPackageCategory" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "BadmintonEnrollment" ADD COLUMN     "categoryCode" TEXT;

-- AlterTable
ALTER TABLE "BadmintonCheckIn" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "attendanceKey" TEXT,
ADD COLUMN     "categoryCode" TEXT,
ADD COLUMN     "memberId" TEXT,
ADD COLUMN     "qrId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'STAFF';

-- AlterTable
ALTER TABLE "BadmintonEntryQr" ADD COLUMN     "categoryCode" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "BadmintonQrVisit" ADD COLUMN     "categoryCode" TEXT,
ADD COLUMN     "qrId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BadmintonPackageCategory_code_key" ON "BadmintonPackageCategory"("code");

-- CreateIndex
CREATE INDEX "BadmintonEnrollment_userId_categoryCode_status_expiryDate_idx" ON "BadmintonEnrollment"("userId", "categoryCode", "status", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "BadmintonCheckIn_attendanceKey_key" ON "BadmintonCheckIn"("attendanceKey");

-- CreateIndex
CREATE INDEX "BadmintonCheckIn_memberId_categoryCode_date_idx" ON "BadmintonCheckIn"("memberId", "categoryCode", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BadmintonQrVisit_userId_categoryCode_date_key" ON "BadmintonQrVisit"("userId", "categoryCode", "date");

-- AddForeignKey
ALTER TABLE "BadmintonCheckIn" ADD CONSTRAINT "BadmintonCheckIn_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "BadmintonEntryQr"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "BadmintonQrVisit" ADD CONSTRAINT "BadmintonQrVisit_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "BadmintonEntryQr"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "BadmintonQrVisit" ADD CONSTRAINT "BadmintonQrVisit_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "BadmintonCheckIn"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;


UPDATE "BadmintonEntryQr" SET "createdAt"=NULL; -- Old issuances had no creation timestamp.
CREATE FUNCTION "badminton_migration_snapshot_package"(value text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN RETURN value::jsonb ->> 'packageId'; EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$;
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
UPDATE "BadmintonCheckIn" SET "categoryCode"=(SELECT e."categoryCode" FROM "BadmintonEnrollment" e WHERE e."id"="BadmintonCheckIn"."enrollmentId") WHERE ("packageSnapshot" IS NULL OR "badminton_migration_snapshot_package"("packageSnapshot") = (SELECT e."packageId" FROM "BadmintonEnrollment" e WHERE e."id"="BadmintonCheckIn"."enrollmentId"));
-- Keep every historical duplicate; one canonical row guards the whole member/category/day.
UPDATE "BadmintonCheckIn" SET "attendanceKey"="memberId" || ':' || "categoryCode" || ':' || "date"
WHERE "memberId" IS NOT NULL AND "categoryCode" IS NOT NULL
AND "id"=(SELECT min(c."id") FROM "BadmintonCheckIn" c WHERE c."memberId"="BadmintonCheckIn"."memberId" AND c."categoryCode"="BadmintonCheckIn"."categoryCode" AND c."date"="BadmintonCheckIn"."date");
UPDATE "BadmintonQrVisit" SET "categoryCode"=(SELECT c."categoryCode" FROM "BadmintonCheckIn" c WHERE c."id"="BadmintonQrVisit"."checkInId");
ALTER TABLE "BadmintonPackageCategory" ADD CONSTRAINT "BadmintonPackageCategory_category_valid" CHECK ("code" IS NULL OR "code" IN ('FOUNDATION','SOCIAL','PATHWAY'));
CREATE FUNCTION "BadmintonPackageCategory_category_immutable_fn"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."code" IS NOT NULL AND NEW."code" IS DISTINCT FROM OLD."code" THEN RAISE EXCEPTION 'Badminton category is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER "BadmintonPackageCategory_category_immutable" BEFORE UPDATE OF "code" ON "BadmintonPackageCategory" FOR EACH ROW EXECUTE FUNCTION "BadmintonPackageCategory_category_immutable_fn"();
ALTER TABLE "BadmintonEnrollment" ADD CONSTRAINT "BadmintonEnrollment_category_valid" CHECK ("categoryCode" IS NULL OR "categoryCode" IN ('FOUNDATION','SOCIAL','PATHWAY'));
CREATE FUNCTION "BadmintonEnrollment_category_immutable_fn"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."categoryCode" IS NOT NULL AND NEW."categoryCode" IS DISTINCT FROM OLD."categoryCode" THEN RAISE EXCEPTION 'Badminton category is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER "BadmintonEnrollment_category_immutable" BEFORE UPDATE OF "categoryCode" ON "BadmintonEnrollment" FOR EACH ROW EXECUTE FUNCTION "BadmintonEnrollment_category_immutable_fn"();
ALTER TABLE "BadmintonCheckIn" ADD CONSTRAINT "BadmintonCheckIn_category_valid" CHECK ("categoryCode" IS NULL OR "categoryCode" IN ('FOUNDATION','SOCIAL','PATHWAY'));
CREATE FUNCTION "BadmintonCheckIn_category_immutable_fn"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."categoryCode" IS NOT NULL AND NEW."categoryCode" IS DISTINCT FROM OLD."categoryCode" THEN RAISE EXCEPTION 'Badminton category is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER "BadmintonCheckIn_category_immutable" BEFORE UPDATE OF "categoryCode" ON "BadmintonCheckIn" FOR EACH ROW EXECUTE FUNCTION "BadmintonCheckIn_category_immutable_fn"();
ALTER TABLE "BadmintonEntryQr" ADD CONSTRAINT "BadmintonEntryQr_category_valid" CHECK ("categoryCode" IS NULL OR "categoryCode" IN ('FOUNDATION','SOCIAL','PATHWAY'));
CREATE FUNCTION "BadmintonEntryQr_category_immutable_fn"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."categoryCode" IS NOT NULL AND NEW."categoryCode" IS DISTINCT FROM OLD."categoryCode" THEN RAISE EXCEPTION 'Badminton category is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER "BadmintonEntryQr_category_immutable" BEFORE UPDATE OF "categoryCode" ON "BadmintonEntryQr" FOR EACH ROW EXECUTE FUNCTION "BadmintonEntryQr_category_immutable_fn"();
ALTER TABLE "BadmintonQrVisit" ADD CONSTRAINT "BadmintonQrVisit_category_valid" CHECK ("categoryCode" IS NULL OR "categoryCode" IN ('FOUNDATION','SOCIAL','PATHWAY'));
CREATE FUNCTION "BadmintonQrVisit_category_immutable_fn"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."categoryCode" IS NOT NULL AND NEW."categoryCode" IS DISTINCT FROM OLD."categoryCode" THEN RAISE EXCEPTION 'Badminton category is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER "BadmintonQrVisit_category_immutable" BEFORE UPDATE OF "categoryCode" ON "BadmintonQrVisit" FOR EACH ROW EXECUTE FUNCTION "BadmintonQrVisit_category_immutable_fn"();

DROP FUNCTION "badminton_migration_snapshot_package"(text);
COMMIT;
