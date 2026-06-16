-- Admin bloglarının herhangi bir uzman profiline bağlanmaması için
-- expertProfileId nullable yapılıyor, CASCADE → SET NULL

ALTER TABLE "blogs" DROP CONSTRAINT IF EXISTS "blogs_expertProfileId_fkey";

ALTER TABLE "blogs" ALTER COLUMN "expertProfileId" DROP NOT NULL;

ALTER TABLE "blogs" ADD CONSTRAINT "blogs_expertProfileId_fkey"
  FOREIGN KEY ("expertProfileId")
  REFERENCES "expert_profiles"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
