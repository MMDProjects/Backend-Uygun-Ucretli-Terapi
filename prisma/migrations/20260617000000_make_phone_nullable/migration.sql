-- AlterTable: phone alanını nullable yap (admin tarafından oluşturulan uzmanlar için)
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
