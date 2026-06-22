-- AlterTable: add pending name fields to expert_profiles
ALTER TABLE "expert_profiles" ADD COLUMN IF NOT EXISTS "pendingFirstName" TEXT;
ALTER TABLE "expert_profiles" ADD COLUMN IF NOT EXISTS "pendingLastName" TEXT;
