ALTER TABLE "CourtDateOverride" ADD COLUMN "weeklyOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CourtDateOverride" ADD COLUMN "holidayActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CourtDateOverride" ADD COLUMN "suspendedBlockIds" JSONB;
