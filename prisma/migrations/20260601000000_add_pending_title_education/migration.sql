-- AlterTable: add pendingTitle and pendingEducation to expert_profiles
ALTER TABLE "expert_profiles" ADD COLUMN IF NOT EXISTS "pendingTitle" TEXT;
ALTER TABLE "expert_profiles" ADD COLUMN IF NOT EXISTS "pendingEducation" TEXT;
