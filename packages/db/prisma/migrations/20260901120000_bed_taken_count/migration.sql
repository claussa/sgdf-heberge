-- Occupation par ligne de couchage (« 1 chambre sur 2 occupée ») et places restantes
-- dénormalisées, filtrées par la recherche à la place de la capacité déclarée.
ALTER TABLE "ListingBed" ADD COLUMN "takenCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Listing" ADD COLUMN "availableCapacity" INTEGER NOT NULL DEFAULT 0;

-- Reprise de l'existant : aucune ligne occupée, donc restantes = capacité déclarée
-- (institutionnels compris, qui n'ont pas de lignes). Le statut global n'est pas touché :
-- un logement passé « Complet » par son hébergeur reste FULL, donc hors recherche.
UPDATE "Listing" SET "availableCapacity" = "capacity";
