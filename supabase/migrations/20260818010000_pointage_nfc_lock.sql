-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Module Pointage : verrou anti-doublon pointer_par_nfc
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Corrige une race condition confirmée en test le 2026-08-18 : le kiosque et
-- l'écran Équipe "Écouter le prochain scan" peuvent être abonnés
-- simultanément au même canal Realtime nfc-badge-scans. Un scan reçu par les
-- deux déclenche deux appels concurrents à pointer_par_nfc — la vérification
-- anti-doublon (SELECT dernier pointage < 5s puis INSERT) n'était pas
-- atomique : les deux transactions pouvaient passer la vérification avant
-- qu'aucune n'ait validé son insertion (3 lignes ENTREE créées pour un seul
-- scan physique lors du test).
--
-- pg_advisory_xact_lock() sérialise les appels concurrents pour un même
-- salarié (verrou relâché automatiquement à la fin de la transaction) sans
-- bloquer les scans d'autres salariés entre eux.
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

  PERFORM pg_advisory_xact_lock(hashtext(v_employe.id::text));

  SELECT type, horodatage INTO v_dernier_type, v_dernier_ts
  FROM pointages
  WHERE employe_id = v_employe.id
    AND valide = true
    AND (horodatage AT TIME ZONE v_tz)::date = v_today
  ORDER BY horodatage DESC
  LIMIT 1;

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
