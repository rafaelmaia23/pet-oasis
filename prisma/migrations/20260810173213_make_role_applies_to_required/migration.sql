/*
  Warnings:

  - Made the column `appliesTo` on table `roles` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "roles" ALTER COLUMN "appliesTo" SET NOT NULL;
