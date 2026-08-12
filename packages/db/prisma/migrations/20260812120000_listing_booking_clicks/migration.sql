-- Hôtels : compteur agrégé de clics sur le lien de réservation externe.
-- Incrémenté atomiquement côté API, affiché à l'admin. Aucune trace individuelle.
ALTER TABLE "Listing" ADD COLUMN "bookingClicks" INTEGER NOT NULL DEFAULT 0;
