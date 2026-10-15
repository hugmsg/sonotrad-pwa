-- 2026-10-15 : voyages (portail transporteur).
-- 1. Écritures réservées au serveur (Apps Script, clé secrète) : la PWA et le projet
--    planning passent par Apps Script depuis le 2026-10-15 (masterfile @102).
-- 2. Lecture publique limitée aux colonnes affichées par le portail (et donc aussi le
--    contenu des événements Realtime, filtré par colonne).

REVOKE EXECUTE ON FUNCTION public.enregistrer_voyage(text, text, text, text, text, text, numeric, numeric, boolean, text, boolean, text, text, text, text, text, text, boolean, text, timestamptz, numeric, numeric, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.marquer_parti(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.modifier_voyage_note(text, text, boolean, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enregistrer_voyage(text, text, text, text, text, text, numeric, numeric, boolean, text, boolean, text, text, text, text, text, text, boolean, text, timestamptz, numeric, numeric, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.marquer_parti(text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.modifier_voyage_note(text, text, boolean, date) TO service_role;

-- Écriture directe : déjà impossible (RLS sans policy d'écriture) ; on retire aussi les droits.
REVOKE ALL ON public.voyages FROM anon, authenticated;
REVOKE ALL ON public.voyages_internes FROM anon, authenticated;

GRANT SELECT (numero_lv, type, date_creation, destination, destination_adresse,
              destination_lat, destination_lon, poids, ml, grutage, commentaire,
              marchandises_desc, livraison_prevue, parti)
  ON public.voyages TO anon, authenticated;

-- Vue inutilisée (le portail lit la table) ; elle lisait parti_le, plus accordé.
DROP VIEW IF EXISTS public.voyages_portail;
