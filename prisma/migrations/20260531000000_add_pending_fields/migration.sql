-- AlterTable: add isPublished and pending fields to expert_profiles
ALTER TABLE "expert_profiles" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "expert_profiles" ADD COLUMN IF NOT EXISTS "pendingBio" TEXT;
ALTER TABLE "expert_profiles" ADD COLUMN IF NOT EXISTS "pendingCertificateUrl" TEXT;
ALTER TABLE "expert_profiles" ADD COLUMN IF NOT EXISTS "pendingCvUrl" TEXT;
