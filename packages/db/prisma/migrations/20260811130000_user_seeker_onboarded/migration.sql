-- Espace volontaire activé explicitement (bug nav : un hébergeur pur voyait la nav volontaire)
ALTER TABLE "User" ADD COLUMN "seekerOnboardedAt" TIMESTAMP(3);

-- Backfill conservateur : est classé volontaire tout compte INDIVIDUAL sans logement,
-- plus tout compte ayant déjà émis une demande (volontaire de fait, même s'il héberge aussi).
UPDATE "User" u
SET "seekerOnboardedAt" = CURRENT_TIMESTAMP
WHERE u."accountType" = 'INDIVIDUAL'
  AND (
    NOT EXISTS (SELECT 1 FROM "Listing" l WHERE l."ownerId" = u."id")
    OR EXISTS (SELECT 1 FROM "LodgingRequest" r WHERE r."requesterId" = u."id")
  );
