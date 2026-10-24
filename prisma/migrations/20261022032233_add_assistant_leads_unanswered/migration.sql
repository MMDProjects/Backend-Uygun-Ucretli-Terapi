-- CreateEnum
CREATE TYPE "KnowledgeSource" AS ENUM ('MANUAL', 'SSS', 'CONVERSATION');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('YENI', 'ARANDI', 'ULASILAMADI', 'RANDEVU_OLUSTURULDU', 'VAZGECTI');

-- CreateEnum
CREATE TYPE "UnansweredStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceType" ADD VALUE 'AILE';
ALTER TYPE "ServiceType" ADD VALUE 'COCUK_ERGEN';

-- AlterTable
ALTER TABLE "knowledge_base" ADD COLUMN     "source" "KnowledgeSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceRefId" TEXT;

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conversationId" TEXT,
    "channel" "Channel" NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "fullName" TEXT NOT NULL,
    "age" INTEGER,
    "phone" TEXT,
    "preferredCallTime" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'YENI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unanswered_questions" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "topScore" DOUBLE PRECISION,
    "status" "UnansweredStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unanswered_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_status_createdAt_idx" ON "leads"("status", "createdAt");

-- CreateIndex
CREATE INDEX "unanswered_questions_status_createdAt_idx" ON "unanswered_questions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "knowledge_base_source_sourceRefId_idx" ON "knowledge_base"("source", "sourceRefId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unanswered_questions" ADD CONSTRAINT "unanswered_questions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

