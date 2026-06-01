-- AlterTable: add per-expert pricing fields (nullable, falls back to global SystemSetting)
ALTER TABLE "expert_profiles" ADD COLUMN IF NOT EXISTS "standardPrice" DECIMAL(10,2);
ALTER TABLE "expert_profiles" ADD COLUMN IF NOT EXISTS "discountedPrice" DECIMAL(10,2);
