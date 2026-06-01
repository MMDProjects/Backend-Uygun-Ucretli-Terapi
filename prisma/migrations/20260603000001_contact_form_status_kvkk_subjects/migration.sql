-- AlterEnum: Kurumsal subject değerleri ekle
ALTER TYPE "ContactSubject" ADD VALUE 'KURUMSAL_DANISMANLIK';
ALTER TYPE "ContactSubject" ADD VALUE 'CALISAN_DESTEK_PROGRAMI';
ALTER TYPE "ContactSubject" ADD VALUE 'EGITIM_VE_ATOLYE';
ALTER TYPE "ContactSubject" ADD VALUE 'TEKLIF_TALEBI';

-- CreateEnum: ContactFormStatus
CREATE TYPE "ContactFormStatus" AS ENUM ('YENI', 'ISLEMDE', 'COZULDU');

-- AlterTable: contact_forms'a status ve kvkkApproved ekle
ALTER TABLE "contact_forms"
  ADD COLUMN "kvkkApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "status" "ContactFormStatus" NOT NULL DEFAULT 'YENI';
