-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('OK', 'BOUNCED', 'COMPLAINED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('INDIVIDUAL', 'SCOUT_UNIT');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ListingCategory" AS ENUM ('PRIVATE', 'HOTEL', 'COLLECTIVE');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('OPEN', 'FULL');

-- CreateEnum
CREATE TYPE "BedType" AS ENUM ('PRIVATE_ROOM', 'COUCH', 'FLOOR_BED', 'TENT_SPOT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AwaitingSide" AS ENUM ('HOST', 'REQUESTER');

-- CreateEnum
CREATE TYPE "CancelActor" AS ENUM ('REQUESTER', 'HOST', 'SYSTEM');

-- CreateEnum
CREATE TYPE "JumelageKind" AS ENUM ('SEEKING', 'HOSTING');

-- CreateEnum
CREATE TYPE "AdStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "accountType" "AccountType",
    "role" "Role" NOT NULL DEFAULT 'USER',
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT NOT NULL,
    "emailHash" TEXT,
    "phone" TEXT,
    "groupSize" INTEGER,
    "accessibilityNeeds" TEXT,
    "unitName" TEXT,
    "unitBranch" TEXT,
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'OK',
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "category" "ListingCategory" NOT NULL DEFAULT 'PRIVATE',
    "site" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "addressFull" TEXT NOT NULL,
    "displayArea" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "availableFrom" DATE NOT NULL,
    "availableTo" DATE NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'OPEN',
    "hiddenAt" TIMESTAMP(3),
    "lastHostActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "accessPmr" BOOLEAN NOT NULL DEFAULT false,
    "accessElectricWheelchair" BOOLEAN NOT NULL DEFAULT false,
    "accessFewSteps" BOOLEAN NOT NULL DEFAULT false,
    "accessHumanHelp" BOOLEAN NOT NULL DEFAULT false,
    "accessTransport" BOOLEAN NOT NULL DEFAULT false,
    "accessParking" BOOLEAN NOT NULL DEFAULT false,
    "accessAssistanceDog" BOOLEAN NOT NULL DEFAULT false,
    "accessQuiet" BOOLEAN NOT NULL DEFAULT false,
    "accessibilityNotes" TEXT,
    "priceInfo" TEXT,
    "bookingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingBed" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "type" "BedType" NOT NULL,
    "count" INTEGER NOT NULL,
    "capacityEach" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "ListingBed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LodgingRequest" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "peopleCount" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "awaitingSide" "AwaitingSide" NOT NULL DEFAULT 'HOST',
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReminderAt" TIMESTAMP(3),
    "cancelledBy" "CancelActor",
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LodgingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JumelageAd" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "JumelageKind" NOT NULL,
    "site" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "peopleLabel" TEXT NOT NULL,
    "description" TEXT,
    "status" "AdStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JumelageAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JumelageContact" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "message" TEXT,
    "status" "ContactStatus" NOT NULL DEFAULT 'PENDING',
    "dismissedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JumelageContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "maxUses" INTEGER NOT NULL DEFAULT 5,
    "invalidatedAt" TIMESTAMP(3),

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkUsage" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_emailHash_key" ON "User"("emailHash");

-- CreateIndex
CREATE INDEX "Listing_site_category_status_hiddenAt_idx" ON "Listing"("site", "category", "status", "hiddenAt");

-- CreateIndex
CREATE INDEX "Listing_ownerId_idx" ON "Listing"("ownerId");

-- CreateIndex
CREATE INDEX "ListingBed_listingId_idx" ON "ListingBed"("listingId");

-- CreateIndex
CREATE INDEX "LodgingRequest_requesterId_status_idx" ON "LodgingRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "LodgingRequest_listingId_status_idx" ON "LodgingRequest"("listingId", "status");

-- CreateIndex
CREATE INDEX "LodgingRequest_status_lastActivityAt_idx" ON "LodgingRequest"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "RequestMessage_requestId_idx" ON "RequestMessage"("requestId");

-- CreateIndex
CREATE INDEX "JumelageAd_site_kind_status_idx" ON "JumelageAd"("site", "kind", "status");

-- CreateIndex
CREATE INDEX "JumelageAd_userId_idx" ON "JumelageAd"("userId");

-- CreateIndex
CREATE INDEX "JumelageContact_requesterId_idx" ON "JumelageContact"("requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "JumelageContact_adId_requesterId_key" ON "JumelageContact"("adId", "requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_tokenHash_key" ON "MagicLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLinkToken_userId_idx" ON "MagicLinkToken"("userId");

-- CreateIndex
CREATE INDEX "MagicLinkToken_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

-- CreateIndex
CREATE INDEX "MagicLinkToken_userId_createdAt_idx" ON "MagicLinkToken"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MagicLinkUsage_tokenId_idx" ON "MagicLinkUsage"("tokenId");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingBed" ADD CONSTRAINT "ListingBed_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LodgingRequest" ADD CONSTRAINT "LodgingRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LodgingRequest" ADD CONSTRAINT "LodgingRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LodgingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JumelageAd" ADD CONSTRAINT "JumelageAd_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JumelageContact" ADD CONSTRAINT "JumelageContact_adId_fkey" FOREIGN KEY ("adId") REFERENCES "JumelageAd"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JumelageContact" ADD CONSTRAINT "JumelageContact_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MagicLinkUsage" ADD CONSTRAINT "MagicLinkUsage_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "MagicLinkToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index uniques partiels (non déclarables en Prisma) :
-- 1) Anti-doublon / anti-harcèlement : une seule demande active (PENDING ou ACCEPTED)
--    par couple (logement, demandeur). Re-demande possible après refus/expiration/annulation.
CREATE UNIQUE INDEX "LodgingRequest_active_uniq" ON "LodgingRequest"("listingId", "requesterId")
  WHERE "status" IN ('PENDING', 'ACCEPTED');

-- 2) Une seule annonce de jumelage ACTIVE par unité (le singulier de la maquette fait foi).
CREATE UNIQUE INDEX "JumelageAd_one_active" ON "JumelageAd"("userId") WHERE "status" = 'ACTIVE';
