-- Audit 2026-10-06 : corrections de pointage réservées au backend (pwa_master.js, clé
-- secrète) ou à un admin RH connecté (rh-metal). Corps des fonctions inchangé, seul le
-- contrôle d'accès est ajouté en tête.

CREATE OR REPLACE FUNCTION public.admin_add_pointage(p_employe_id uuid, p_type text, p_horodatage timestamp with time zone, p_modifie_par text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    PERFORM _exiger_admin_rh();
  END IF;
  IF p_type NOT IN ('ENTREE','SORTIE','PAUSE_DEBUT','PAUSE_FIN') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Type invalide.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE id = p_employe_id AND actif = true) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Employe introuvable.');
  END IF;
  IF public._semaine_est_verrouillee(p_employe_id, (p_horodatage AT TIME ZONE 'Europe/Paris')::date) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Semaine verrouillée — déverrouillez-la avant de modifier ce pointage.');
  END IF;
  INSERT INTO public.pointages (employe_id, type, horodatage, source, valide, raison_modif, modifie_par)
  VALUES (p_employe_id, p_type, p_horodatage, 'admin', true, 'Ajout manuel', p_modifie_par);
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_annuler_pointage(p_pointage_id uuid, p_motif text, p_modifie_par text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    PERFORM _exiger_admin_rh();
  END IF;
  IF trim(p_motif) = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Motif obligatoire.');
  END IF;
  UPDATE pointages SET valide = false, raison_modif = p_motif, modifie_par = p_modifie_par
  WHERE id = p_pointage_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Pointage introuvable.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_modifier_pointage(p_pointage_id uuid, p_horodatage timestamp with time zone, p_modifie_par text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    PERFORM _exiger_admin_rh();
  END IF;
  UPDATE pointages
  SET horodatage = p_horodatage, modifie_par = p_modifie_par, raison_modif = 'Correction heure'
  WHERE id = p_pointage_id AND valide = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Pointage introuvable ou déjà annulé.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_add_pointage(uuid, text, timestamp with time zone, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_annuler_pointage(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_modifier_pointage(uuid, timestamp with time zone, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_add_pointage(uuid, text, timestamp with time zone, text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_annuler_pointage(uuid, text, text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_modifier_pointage(uuid, timestamp with time zone, text) TO authenticated, service_role;
