-- Annuaire des personnes : lu uniquement par Apps Script (action users_list, clé secrète).
REVOKE EXECUTE ON FUNCTION public.get_employes_annuaire() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_employes_annuaire() TO service_role;
