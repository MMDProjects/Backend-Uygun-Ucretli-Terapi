-- AlterTable: add wheelSegments JSON field to system_settings
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "wheelSegments" JSONB NOT NULL DEFAULT '[]';
