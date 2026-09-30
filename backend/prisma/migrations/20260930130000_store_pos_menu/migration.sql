CREATE TABLE "ProductCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ProductCategory_name_key" ON "ProductCategory"("name");

CREATE TABLE "CafeMenuItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "price" INTEGER NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT;
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

INSERT OR IGNORE INTO "ProductCategory" ("id", "name", "active") VALUES ('seed-cat-apparel', 'Apparel', 1);
INSERT OR IGNORE INTO "ProductCategory" ("id", "name", "active") VALUES ('seed-cat-equipment', 'Equipment', 1);
INSERT OR IGNORE INTO "ProductCategory" ("id", "name", "active") VALUES ('seed-cat-accessories', 'Accessories', 1);
INSERT OR IGNORE INTO "CafeMenuItem" ("id", "name", "category", "description", "price", "available") VALUES ('seed-menu-americano', 'Iced Americano', 'Coffee', 'Cold brewed espresso over ice.', 5000, 1);
INSERT OR IGNORE INTO "CafeMenuItem" ("id", "name", "category", "description", "price", "available") VALUES ('seed-menu-wrap', 'Chicken Wrap', 'Food', 'Chicken wrap for a quick post-training meal.', 9000, 1);
INSERT OR IGNORE INTO "CafeMenuItem" ("id", "name", "category", "description", "price", "available") VALUES ('seed-menu-bowl', 'Protein Bowl', 'Healthy', 'Protein-focused bowl.', 12000, 1);
