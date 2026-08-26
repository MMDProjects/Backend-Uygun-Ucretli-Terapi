-- Onarim migration'i (tek seferlik).
--
-- Gecmiste bazi sema degisiklikleri `prisma db push` ile uygulanip migration
-- uretilmemisti; migration klasoru schema.prisma'nin gerisinde kalmisti.
-- Ilgili commitler: 206e724, bf3ba53, bd33a1d (Haziran 2026).
--
-- Bu dosya o degisiklikleri migration gecmisine geri kazandirir. Ifadeler
-- IDEMPOTENT yazildi: degisiklik hedefte zaten varsa atlanir. Boylece
-- calisan veritabaninda hicbir sey degismez, sifirdan kurulan ortamlar ise
-- ayni semaya ulasir.
--
-- Bundan sonraki migration'lar normal `prisma migrate dev` ile uretilecek;
-- bu dosya ornek alinmamalidir.

-- availabilities: haftalik dayOfWeek -> tarih bazli date
DROP INDEX IF EXISTS "availabilities_expertProfileId_dayOfWeek_startTime_key";

ALTER TABLE "availabilities"
  ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Default yalnizca mevcut satirlari doldurmak icindi; sema default tanimlamiyor.
ALTER TABLE "availabilities" ALTER COLUMN "date" DROP DEFAULT;
ALTER TABLE "availabilities" DROP COLUMN IF EXISTS "dayOfWeek";

CREATE UNIQUE INDEX IF NOT EXISTS "availabilities_expertProfileId_date_startTime_key"
  ON "availabilities"("expertProfileId", "date", "startTime");

-- blogs: yazar adi + admin onayi bekleyen alanlar
ALTER TABLE "blogs"
  ADD COLUMN IF NOT EXISTS "authorName" TEXT,
  ADD COLUMN IF NOT EXISTS "pendingContent" TEXT,
  ADD COLUMN IF NOT EXISTS "pendingCoverImageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "pendingTitle" TEXT;

-- system_settings: carkta sabit kazanan slotlari
ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "wheelWinnerIndices" JSONB NOT NULL DEFAULT '[]';
