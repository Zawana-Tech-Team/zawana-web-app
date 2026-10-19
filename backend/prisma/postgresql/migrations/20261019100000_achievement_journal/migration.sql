ALTER TABLE "ContentItem" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'community';
ALTER TABLE "ContentItem" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Milestones';
ALTER TABLE "ContentItem" ADD COLUMN "body" TEXT NOT NULL DEFAULT '';
CREATE INDEX "ContentItem_kind_status_publishDate_idx" ON "ContentItem"("kind", "status", "publishDate");
