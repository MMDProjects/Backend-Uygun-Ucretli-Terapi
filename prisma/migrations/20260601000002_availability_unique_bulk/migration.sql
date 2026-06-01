-- Duplicate'ları temizle, sonra unique constraint ekle
DELETE FROM "availabilities" a
USING "availabilities" b
WHERE a.id > b.id
  AND a."expertProfileId" = b."expertProfileId"
  AND a."dayOfWeek" = b."dayOfWeek"
  AND a."startTime" = b."startTime";

-- AlterTable: unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "availabilities_expertProfileId_dayOfWeek_startTime_key"
  ON "availabilities"("expertProfileId", "dayOfWeek", "startTime");
