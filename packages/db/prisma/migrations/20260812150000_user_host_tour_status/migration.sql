-- Tour guidé de l'espace hébergeur (driver.js), proposé sur « Mes logements » quand le
-- champ est NULL et qu'au moins un logement existe. SKIPPED = refusé ou abandonné en
-- cours ; DONE = terminé. Pas de backfill : les hébergeurs existants voient la
-- proposition UNE fois à leur prochaine visite (refuser la range définitivement).
CREATE TYPE "HostTourStatus" AS ENUM ('SKIPPED', 'DONE');
ALTER TABLE "User" ADD COLUMN "hostTourStatus" "HostTourStatus";
