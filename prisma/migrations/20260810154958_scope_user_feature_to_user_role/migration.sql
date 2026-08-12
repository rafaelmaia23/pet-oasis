-- DropForeignKey
ALTER TABLE "user_features" DROP CONSTRAINT "user_features_user_id_fkey";

-- AlterTable
ALTER TABLE "user_features" DROP COLUMN "user_id",
ADD COLUMN     "user_role_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "user_roles" ADD COLUMN     "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "user_features_user_role_id_feature_id_key" ON "user_features"("user_role_id", "feature_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- AddForeignKey
ALTER TABLE "user_features" ADD CONSTRAINT "user_features_user_role_id_fkey" FOREIGN KEY ("user_role_id") REFERENCES "user_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

