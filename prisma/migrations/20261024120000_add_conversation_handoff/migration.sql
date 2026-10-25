-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "handedOffAt" TIMESTAMP(3),
ADD COLUMN     "handoffReason" TEXT,
ADD COLUMN     "handoffSummary" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "externalSource" TEXT;

