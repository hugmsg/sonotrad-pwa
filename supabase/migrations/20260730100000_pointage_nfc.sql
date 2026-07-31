-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Module Pointage : badge NFC (lecteur USB PC/SC)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le badge ne gère que ENTREE/SORTIE (bascule automatique selon le dernier
-- pointage du jour) — jamais de pause via badge, décision Hugo 2026-07-30 :
-- les pauses restent saisies manuellement par un admin (admin_add_pointage,
-- déjà existante), le badge n'ayant pas de moyen non-ambigu de distinguer
-- "je pars en pause" de "je pars définitivement" quand le salarié est déjà
-- en service.

-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTION : pointer_par_nfc
-- Authentifie par UID de badge ET enregistre le pointage en un seul aller-
-- retour (robustesse kiosque — pas de round-trip supplémentaire si la
-- connexion coupe entre deux appels, contrairement au flux PIN qui appelle
-- authentifier_par_pin puis verifier_pointage séparément).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pointer_par_nfc(p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_employe      employes%ROWTYPE;
  v_dernier_type text;
  v_dernier_ts   timestamptz;
  v_tz           text := 'Europe/Paris';
  v_today        date := (now() AT TIME ZONE v_tz)::date;
  v_type         text;
BEGIN
  IF trim(coalesce(p_uid, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Badge illisible.');
  END IF;

  SELECT * INTO v_employe FROM employes WHERE actif = true AND nfc_uid = p_uid LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Badge non reconnu.');
  END IF;

  SELECT type, horodatage INTO v_dernier_type, v_dernier_ts
  FROM pointages
  WHERE employe_id = v_employe.id
    AND valide = true
    AND (horodatage AT TIME ZONE v_tz)::date = v_today
  ORDER BY horodatage DESC
  LIMIT 1;

  -- Anti-doublon : ignore un re-scan du même badge dans les 5 dernières
  -- secondes (glitch reconnexion WS du pont, carte qui reste posée sur le
  -- lecteur le temps que le CardObserver se redéclenche).
  IF v_dernier_ts IS NOT NULL AND v_dernier_ts > now() - interval '5 seconds' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Badge déjà pris en compte.');
  END IF;

  v_type := CASE
    WHEN v_dernier_type IS NULL OR v_dernier_type = 'SORTIE' THEN 'ENTREE'
    ELSE 'SORTIE'
  END;

  INSERT INTO pointages (employe_id, type, source)
  VALUES (v_employe.id, v_type, 'nfc');

  RETURN jsonb_build_object(
    'ok',     true,
    'id',     v_employe.id,
    'nom',    v_employe.nom,
    'prenom', v_employe.prenom,
    'type',   v_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pointer_par_nfc(text) TO anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTIONS : associer_badge_nfc / dissocier_badge_nfc
-- Gestion du lien badge <-> salarié, appelées depuis l'écran admin rh-metal
-- (onglet Équipe). Anti-collision : un même UID ne peut pas être associé à
-- deux salariés.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION associer_badge_nfc(p_employe_id uuid, p_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF trim(coalesce(p_uid, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'UID vide.');
  END IF;

  IF EXISTS (SELECT 1 FROM employes WHERE nfc_uid = p_uid AND id <> p_employe_id) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Ce badge est déjà associé à un autre salarié.');
  END IF;

  UPDATE employes SET nfc_uid = p_uid, updated_at = now() WHERE id = p_employe_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Salarié introuvable.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION associer_badge_nfc(uuid, text) TO anon;

CREATE OR REPLACE FUNCTION dissocier_badge_nfc(p_employe_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE employes SET nfc_uid = NULL, updated_at = now() WHERE id = p_employe_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Salarié introuvable.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION dissocier_badge_nfc(uuid) TO anon;

-- Note : le trigger existant employes_broadcast_trigger (voir migration
-- 20260728000001_employes_broadcast_change.sql) se redéclenche automatiquement
-- sur les UPDATE ci-dessus (AFTER ... FOR EACH ROW sur toute la table employes)
-- — aucun nouveau trigger nécessaire, le payload broadcast reste {op, id} sans
-- donnée sensible (nfc_uid n'est jamais diffusé).
