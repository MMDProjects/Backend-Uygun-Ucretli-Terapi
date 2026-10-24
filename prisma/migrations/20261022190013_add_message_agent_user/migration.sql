-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "agentUserId" TEXT;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

