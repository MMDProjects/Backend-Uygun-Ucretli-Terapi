-- AlterEnum
ALTER TYPE "UnansweredStatus" ADD VALUE 'DISMISSED';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "retrieval" JSONB;

-- AlterTable
ALTER TABLE "unanswered_questions" ADD COLUMN     "askCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
ADD COLUMN     "lastAskedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

