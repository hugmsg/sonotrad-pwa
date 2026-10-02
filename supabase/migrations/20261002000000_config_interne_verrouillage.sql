-- Appliquée en base le 2026-10-02 (MCP apply_migration "config_interne_verrouillage").
--
-- config_interne contient historique_secret. Elle était sans RLS et lisible/modifiable
-- par anon : n'importe qui muni de la clé anon (publique, dans supabase.js) pouvait lire
-- le secret qui protège lire_historique_voyages / supprimer_voyage.
--
-- Seuls lecteurs légitimes : ces deux fonctions, SECURITY DEFINER, owner postgres —
-- elles contournent la RLS et ne sont pas affectées.
ALTER TABLE public.config_interne ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.config_interne FROM anon, authenticated;
