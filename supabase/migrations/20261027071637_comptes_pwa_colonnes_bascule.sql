-- Comptes PWA : retrait des colonnes de la bascule du 2026-10-15 (pin_migre, ancien_uid).
-- Les 4 comptes étaient migrés (pin_migre = true partout) : hasPIN = « a un PIN », inchangé.

CREATE OR REPLACE FUNCTION public.pwa_compte_creer(p_prenom text, p_nom text, p_role text, p_activites text[], p_pin text, p_employe uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  e    employes;
  v_id uuid;
BEGIN
  IF coalesce(p_role, '') NOT IN ('admin', 'utilisateur') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Rôle invalide.');
  END IF;
  IF coalesce(array_length(p_activites, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Au moins une activité requise.');
  END IF;
  IF coalesce(p_pin, '') !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'PIN invalide (4 chiffres attendus).');
  END IF;

  -- Toute personne est créée dans rh-metal (salarié ou personne externe) ; ici on n'active qu'un compte.
  SELECT * INTO e FROM employes WHERE id = p_employe;
  IF e.id IS NULL OR NOT _acces_applis(e) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Personne inconnue ou sans accès : créez-la d''abord dans rh-metal (salarié ou personne externe).');
  END IF;
  IF EXISTS (SELECT 1 FROM comptes_pwa WHERE employe_id = e.id) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Cet utilisateur a déjà un compte.');
  END IF;
  IF _pin_deja_pris(p_pin, e.id) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Ce PIN est déjà utilisé par un collègue : choisissez-en un autre.');
  END IF;

  UPDATE employes SET pin_hash = crypt(p_pin, gen_salt('bf', 12)), updated_at = now() WHERE id = e.id;
  INSERT INTO comptes_pwa (employe_id, role, activites)
  VALUES (e.id, p_role, p_activites)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'employeId', e.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pwa_comptes_liste()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_res jsonb := '[]'::jsonb;
  r record;
  b record;
BEGIN
  FOR r IN
    SELECT c.*, e.prenom, e.nom, e.pin_hash IS NOT NULL AS a_pin, e.classe_num IS NOT NULL AS a_fiche_rh,
           _acces_applis(e) AS present, e.acces_externe
      FROM comptes_pwa c JOIN employes e ON e.id = c.employe_id
     ORDER BY e.prenom, e.nom
  LOOP
    SELECT * INTO b FROM _connexion_pwa_blocage(r.id);
    v_res := v_res || jsonb_build_object(
      'id', r.id, 'prenom', r.prenom, 'nom', r.nom, 'role', r.role, 'actif', r.actif,
      'activites', to_jsonb(r.activites), 'employeId', r.employe_id, 'aFicheRh', r.a_fiche_rh,
      'present', r.present, 'externe', r.acces_externe, 'hasPIN', r.a_pin,
      'bloqueJusqua', b.bloque_jusqua, 'echecsJour', b.echecs_jour);
  END LOOP;
  RETURN v_res;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pwa_definir_pin(p_compte uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_employe uuid;
BEGIN
  IF coalesce(p_pin, '') !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'PIN invalide (4 chiffres attendus).');
  END IF;
  SELECT employe_id INTO v_employe FROM comptes_pwa WHERE id = p_compte;
  IF v_employe IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Compte introuvable.');
  END IF;
  IF _pin_deja_pris(p_pin, v_employe) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Ce PIN est déjà utilisé par un collègue : choisissez-en un autre.');
  END IF;
  UPDATE employes SET pin_hash = crypt(p_pin, gen_salt('bf', 12)), updated_at = now() WHERE id = v_employe;
  UPDATE comptes_pwa SET updated_at = now() WHERE id = p_compte;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

ALTER TABLE public.comptes_pwa DROP COLUMN pin_migre, DROP COLUMN ancien_uid;
