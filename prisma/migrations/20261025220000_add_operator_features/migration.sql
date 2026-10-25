-- CreateEnum
CREATE TYPE "ContactLifecycle" AS ENUM ('POTANSIYEL', 'DANISAN', 'PASIF');

-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "availabilityId" TEXT;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "lastSummary" TEXT,
ADD COLUMN     "lastSummaryAt" TIMESTAMP(3),
ADD COLUMN     "lifecycleStatus" "ContactLifecycle" NOT NULL DEFAULT 'POTANSIYEL';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedUserId" TEXT;

-- CreateTable
CREATE TABLE "contact_tags" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_reads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canned_responses" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "content" TEXT NOT NULL,
    "shortcut" VARCHAR(30),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canned_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_prompts" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "note" VARCHAR(200),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ContactToContactTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContactToContactTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "contact_tags_name_key" ON "contact_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_reads_userId_conversationId_key" ON "conversation_reads"("userId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "canned_responses_shortcut_key" ON "canned_responses"("shortcut");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_prompts_version_key" ON "assistant_prompts"("version");

-- CreateIndex
CREATE INDEX "_ContactToContactTag_B_index" ON "_ContactToContactTag"("B");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_availabilityId_key" ON "appointments"("availabilityId");

-- CreateIndex
CREATE INDEX "conversations_assignedUserId_idx" ON "conversations"("assignedUserId");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "availabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_prompts" ADD CONSTRAINT "assistant_prompts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactToContactTag" ADD CONSTRAINT "_ContactToContactTag_A_fkey" FOREIGN KEY ("A") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactToContactTag" ADD CONSTRAINT "_ContactToContactTag_B_fkey" FOREIGN KEY ("B") REFERENCES "contact_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Veri güncellemesi: randevusu olan kişiler danışan
UPDATE "contacts" SET "lifecycleStatus" = 'DANISAN' WHERE "id" IN (SELECT DISTINCT "contactId" FROM "appointments");
