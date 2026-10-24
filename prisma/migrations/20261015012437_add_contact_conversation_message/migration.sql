-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'WEB');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING_AGENT', 'CLOSED');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('CLIENT', 'BOT', 'AGENT');

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "instagramId" TEXT,
    "fullName" TEXT,
    "age" INTEGER,
    "notes" TEXT,
    "channel" "Channel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "isBotActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "flaggedCrisis" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderType" "SenderType" NOT NULL,
    "content" TEXT NOT NULL,
    "metaMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contacts_phone_key" ON "contacts"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_instagramId_key" ON "contacts"("instagramId");

-- CreateIndex
CREATE INDEX "conversations_contactId_idx" ON "conversations"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_metaMessageId_key" ON "messages"("metaMessageId");

-- CreateIndex
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
