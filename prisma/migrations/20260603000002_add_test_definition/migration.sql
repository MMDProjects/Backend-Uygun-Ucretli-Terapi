-- AlterTable: tests tablosuna definition JSONB alanı ekle
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "definition" JSONB;
