ALTER TABLE "CourtDateOverride" ADD COLUMN "weeklyOnly" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "CourtDateOverride" ADD COLUMN "holidayActive" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "CourtDateOverride" ADD COLUMN "suspendedBlockIds" JSONB;
