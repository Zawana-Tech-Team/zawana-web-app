ALTER TABLE "BadmintonEnrollment" ADD COLUMN "renewalOfId" TEXT REFERENCES "BadmintonEnrollment"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE UNIQUE INDEX "BadmintonEnrollment_renewalOfId_key" ON "BadmintonEnrollment"("renewalOfId");
UPDATE "BadmintonEnrollment" SET "status"='inactive' WHERE "status" NOT IN ('active','inactive') OR ("status"='active' AND ("expiryDate" < date('now','+6 hours','+30 minutes') OR "sessionsRemaining" <= 0));
