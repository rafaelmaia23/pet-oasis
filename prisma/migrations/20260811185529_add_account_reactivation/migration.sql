-- AlterEnum
ALTER TYPE "VerificationPurpose" ADD VALUE 'ACCOUNT_REACTIVATION';

-- AlterTable
ALTER TABLE "verification_tokens" ADD COLUMN     "restore_profiles" "ProfileKind"[],
ADD COLUMN     "restore_role_ids" TEXT[];
