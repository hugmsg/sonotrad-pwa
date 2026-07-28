-- Ajoute un paramètre p_id optionnel à upsert_employe_pointage : quand fourni,
-- cible la ligne employes par id au lieu de matcher sur (nom, prenom), pour
-- éviter les doublons de casse/accents entre rh-metal et sonotrad-pwa (voir
-- même pattern déjà en place sur upsert_employe_rh).
CREATE OR REPLACE FUNCTION public.upsert_employe_pointage(p_nom text, p_prenom text, p_pin text, p_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF length(p_pin) <> 4 OR p_pin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'PIN invalide (4 chiffres attendus).');
  END IF;

  IF trim(p_nom) = '' OR trim(p_prenom) = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Nom et prenom requis.');
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE employes SET
      nom        = p_nom,
      prenom     = p_prenom,
      pin_hash   = crypt(p_pin, gen_salt('bf', 12)),
      actif      = true,
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO employes (nom, prenom, pin_hash)
    VALUES (p_nom, p_prenom, crypt(p_pin, gen_salt('bf', 12)))
    ON CONFLICT (nom, prenom) DO UPDATE SET
      pin_hash   = EXCLUDED.pin_hash,
      actif      = true,
      updated_at = now()
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;
