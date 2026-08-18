-- Nouveau type de logement institutionnel : base scoute.
-- Lien de réservation optionnel : avec lien → comportement hôtel (réservation
-- externe, pas de demande in-app) ; sans lien → flux de demande standard (gymnase).
ALTER TYPE "ListingCategory" ADD VALUE 'SCOUT_BASE';
