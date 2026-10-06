-- Additive identity migration. Existing users, IDs, roles and relations are preserved.
ALTER TABLE "User" ADD COLUMN "firebaseUid" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");
