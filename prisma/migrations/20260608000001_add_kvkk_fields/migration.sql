-- AlterTable: add kvkkContent and kvkkVersion to system_settings
ALTER TABLE "system_settings" ADD COLUMN "kvkkContent" JSONB;
ALTER TABLE "system_settings" ADD COLUMN "kvkkVersion" TEXT;
