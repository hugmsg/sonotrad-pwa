-- Audit 2026-10-06 : PIN du kiosque et suppression d'employé passent par le backend
-- (pwa_master.js, clé secrète) ou par un admin RH connecté (rh-metal).

-- Ancienne surcharge sans p_id, plus appelée nulle part.
DROP FUNCTION IF EXISTS public.upsert_employe_pointage(text, text, text);

REVOKE EXECUTE ON FUNCTION public.upsert_employe_pointage(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.upsert_employe_pointage(text, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.supprimer_employe_rh(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    PERFORM _exiger_admin_rh();
  END IF;
  UPDATE employes SET supprime = true, updated_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.supprimer_employe_rh(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.supprimer_employe_rh(uuid) TO authenticated, service_role;
