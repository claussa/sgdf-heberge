-- Badge « Payant » explicite (checkbox admin), découplé de la catégorie :
-- couvre les bases scoutes et gymnases payants, avec ou sans priceInfo.
ALTER TABLE "Listing" ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT false;

-- Les hôtels existants affichaient déjà le badge (déduit de la catégorie).
UPDATE "Listing" SET "isPaid" = true WHERE "category" = 'HOTEL';
