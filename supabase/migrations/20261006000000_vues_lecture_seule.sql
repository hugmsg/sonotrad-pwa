-- Audit 2026-10-06 : les vues sont en lecture seule pour les clients.
-- PWA, rh-metal et GAS ne font que des SELECT sur ces vues.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.employes_actifs_vue,
  public.en_service_vue,
  public.heures_rapport_vue,
  public.pointages_rapport_vue,
  public.pointages_today_vue,
  public.voyages_portail
FROM anon, authenticated;
