-- 2026-11-25 — Le portail transporteur (clé publique) lit aussi la consigne de livraison des voyages.
-- voyages a des droits de lecture colonne par colonne pour anon / authenticated : les colonnes ajoutées le
-- 24/11 (migration voyages_consigne_livraison) n'y étaient pas. Lecture seule, rien d'autre ne change.
GRANT SELECT (livraison_type, livraison_min, livraison_max) ON public.voyages TO anon, authenticated;
