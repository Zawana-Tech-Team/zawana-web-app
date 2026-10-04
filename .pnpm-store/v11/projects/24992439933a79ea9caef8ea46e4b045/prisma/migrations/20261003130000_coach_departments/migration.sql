ALTER TABLE "Coach" ADD COLUMN "department" TEXT NOT NULL DEFAULT 'Badminton';

UPDATE "Coach"
SET "department" = 'Gym'
WHERE lower("specialty") LIKE '%gym%'
  AND lower("specialty") NOT LIKE '%badminton%';
