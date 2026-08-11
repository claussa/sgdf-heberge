-- CreateEnum
CREATE TYPE "ParkingEase" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "parkingEase" "ParkingEase";
