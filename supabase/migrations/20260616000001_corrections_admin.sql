-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Module Pointage
-- Migration v5 : corrections admin (ajout / annulation de pointages)
-- ═══════════════════════════════════════════════════════════════════════════

-- Vue employés actifs — utilisée par le modal d'ajout (pas de pin_hash exposé)
CREATE OR REPLACE VIEW employes_actifs_vue AS
SELECT id, nom, prenom FROM employes WHERE actif = true ORDER BY nom, prenom;
GRANT SELECT ON employes_actifs_vue TO anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTION : admin_add_pointage
-- Insère un pointage de correction (source='correction').
-- Bypass RLS via SECURITY DEFINER — réservé aux admins côté PWA.
-- Le trigger _sync_heures_journalieres recalcule automatiquement les totaux.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_add_pointage(
  p_employe_id  uuid,
  p_type        text,
  p_horodatage  timestamptz,
  p_modifie_par text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_type NOT IN ('ENTREE','SORTIE','PAUSE_DEBUT','PAUSE_FIN') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Type invalide.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM employes WHERE id = p_employe_id AND actif = true) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Employe introuvable.');
  END IF;
  INSERT INTO pointages (employe_id, type, horodatage, source, valide, raison_modif, modifie_par)
  VALUES (p_employe_id, p_type, p_horodatage, 'correction', true, 'Ajout manuel', p_modifie_par);
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION admin_add_pointage(uuid, text, timestamptz, text) TO anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTION : admin_annuler_pointage
-- Invalide un pointage (valide=false) avec motif obligatoire.
-- Le trigger recalcule automatiquement heures_journalieres.
-- Les rapports PDF ne montrent que les pointages valides (option activable).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_annuler_pointage(
  p_pointage_id uuid,
  p_motif       text,
  p_modifie_par text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF trim(p_motif) = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Motif obligatoire.');
  END IF;
  UPDATE pointages
  SET valide = false, raison_modif = p_motif, modifie_par = p_modifie_par
  WHERE id = p_pointage_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Pointage introuvable.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION admin_annuler_pointage(uuid, text, text) TO anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTION : admin_modifier_pointage
-- Corrige l'horodatage d'un pointage valide existant.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_modifier_pointage(
  p_pointage_id uuid,
  p_horodatage  timestamptz,
  p_modifie_par text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE pointages
  SET horodatage = p_horodatage, modifie_par = p_modifie_par, raison_modif = 'Correction heure'
  WHERE id = p_pointage_id AND valide = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Pointage introuvable ou déjà annulé.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION admin_modifier_pointage(uuid, timestamptz, text) TO anon;
