-- Tour guidé de l'espace unité (driver.js), proposé sur « Jumelage » quand le champ
-- est NULL et qu'une annonce ACTIVE existe. Un seul tour pour les deux sens d'annonce
-- (SEEKING/HOSTING — même interface, wording adapté). Mêmes règles que les deux autres
-- tours : SKIPPED = refusé ou abandonné en cours ; DONE = terminé ; pas de backfill,
-- les unités existantes voient la proposition UNE fois à leur prochaine visite.
ALTER TABLE "User" ADD COLUMN "unitTourStatus" "TourStatus";
