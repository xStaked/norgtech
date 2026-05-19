/*
  Warnings:

  - Added the required column `minGoalAmount` to the `CustomerSegment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CustomerSegment" ADD COLUMN     "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "maxGoalAmount" DECIMAL(14,2),
ADD COLUMN     "minGoalAmount" DECIMAL(14,2) NOT NULL;
