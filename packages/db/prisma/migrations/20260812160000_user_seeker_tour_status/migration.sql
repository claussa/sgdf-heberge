-- Tour guidé de l'espace volontaire (driver.js), proposé sur « Où dormiras-tu ? » quand
-- le champ est NULL et que l'espace volontaire est ouvert. Mêmes règles que le tour
-- hébergeur : SKIPPED = refusé ou abandonné en cours ; DONE = terminé ; pas de backfill,
-- les volontaires existants voient la proposition UNE fois à leur prochaine visite.
-- L'enum, désormais partagé par les deux tours, prend un nom neutre.
ALTER TYPE "HostTourStatus" RENAME TO "TourStatus";
ALTER TABLE "User" ADD COLUMN "seekerTourStatus" "TourStatus";
