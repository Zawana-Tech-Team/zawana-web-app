ALTER TABLE "BadmintonEnrollment" ADD COLUMN "renewalOfId" TEXT;
ALTER TABLE "BadmintonEnrollment" ADD CONSTRAINT "BadmintonEnrollment_renewalOfId_fkey" FOREIGN KEY ("renewalOfId") REFERENCES "BadmintonEnrollment"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE UNIQUE INDEX "BadmintonEnrollment_renewalOfId_key" ON "BadmintonEnrollment"("renewalOfId");
UPDATE "BadmintonEnrollment" SET "status"='inactive' WHERE "status" NOT IN ('active','inactive') OR ("status"='active' AND ("expiryDate" < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Yangon')::date::text OR "sessionsRemaining" <= 0));
