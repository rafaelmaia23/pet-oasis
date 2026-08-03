-- AlterEnum
ALTER TYPE "VerificationPurpose" ADD VALUE 'EMAIL_CHANGE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pending_email" TEXT;

-- AlterTable
ALTER TABLE "verification_tokens" ADD COLUMN     "new_email" TEXT;

-- CreateTable
CREATE TABLE "previous_emails" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "replaced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "previous_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "previous_emails_email_key" ON "previous_emails"("email");

-- CreateIndex
CREATE INDEX "previous_emails_user_id_idx" ON "previous_emails"("user_id");

-- AddForeignKey
ALTER TABLE "previous_emails" ADD CONSTRAINT "previous_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
