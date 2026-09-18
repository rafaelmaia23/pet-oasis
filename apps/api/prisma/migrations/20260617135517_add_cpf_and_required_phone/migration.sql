/*
  Warnings:

  - A unique constraint covering the columns `[cpf]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Made the column `phone` on table `customers` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `cpf` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "phone" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "cpf" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");
