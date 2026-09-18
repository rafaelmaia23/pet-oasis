-- AlterTable
ALTER TABLE "user_features" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_roles" ADD COLUMN     "deleted_at" TIMESTAMP(3);
