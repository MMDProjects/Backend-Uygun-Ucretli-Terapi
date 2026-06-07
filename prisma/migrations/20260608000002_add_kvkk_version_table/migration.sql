-- CreateTable: kvkk_versions
CREATE TABLE "kvkk_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "kvkk_versions_pkey" PRIMARY KEY ("id")
);

-- AlterTable contact_forms: drop legacy kvkkVersion string if it exists, add FK
ALTER TABLE "contact_forms" DROP COLUMN IF EXISTS "kvkkVersion";
ALTER TABLE "contact_forms" ADD COLUMN "kvkkVersionId" TEXT;

-- AddForeignKey
ALTER TABLE "contact_forms" ADD CONSTRAINT "contact_forms_kvkkVersionId_fkey"
    FOREIGN KEY ("kvkkVersionId") REFERENCES "kvkk_versions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
