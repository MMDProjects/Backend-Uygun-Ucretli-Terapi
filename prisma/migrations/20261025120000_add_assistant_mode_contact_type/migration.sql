-- CreateEnum
CREATE TYPE "AssistantMode" AS ENUM ('OFF', 'SHADOW', 'LIVE');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('DANISAN', 'UZMAN', 'EKIP');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "contactType" "ContactType" NOT NULL DEFAULT 'DANISAN',
ADD COLUMN     "noticeSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "draftMeta" JSONB,
ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN     "assistantMode" "AssistantMode" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "assistantNoticeText" TEXT;
