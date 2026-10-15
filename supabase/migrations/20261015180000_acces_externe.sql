-- 2026-10-15 : accès externe (ex. holding qui gère la RH) — accès à la PWA sans contrat
-- SONOTRAD en cours. Ne fait pas de la personne un salarié : pas de pointage au kiosque
-- (règle « présent » inchangée), pas de masse salariale.

ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS acces_externe boolean NOT NULL DEFAULT false;

-- Accès aux applications : salarié présent, ou accès externe (fiche non supprimée).
CREATE OR REPLACE FUNCTION public._acces_applis(e public.employes)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT NOT e.supprime AND (e.acces_externe OR _employe_present(e));
$$;

CREATE OR REPLACE FUNCTION public.pwa_comptes_connexion()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH c AS (
    SELECT c.id, e.prenom, e.nom,
           e.prenom || ' ' || upper(left(e.nom, 1)) || '.' AS court
      FROM comptes_pwa c JOIN employes e ON e.id = c.employe_id
     WHERE c.actif AND _acces_applis(e)
  ), n AS (
    SELECT *, count(*) OVER (PARTITION BY court) AS homonymes FROM c
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id,
           'nom', CASE WHEN homonymes > 1 THEN prenom || ' ' || nom ELSE court END)
           ORDER BY prenom, nom), '[]'::jsonb)
    FROM n;
$$;

CREATE OR REPLACE FUNCTION public.pwa_connexion(p_compte uuid, p_pin text, p_ancien_ok boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  c        comptes_pwa%ROWTYPE;
  e        employes%ROWTYPE;
  v_bloc   record;
  v_ok     boolean;
  v_changer boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('connexion_pwa:' || coalesce(p_compte::text, '')));

  SELECT * INTO c FROM comptes_pwa WHERE id = p_compte;
  IF NOT FOUND OR NOT c.actif THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Compte inconnu ou désactivé.');
  END IF;
  SELECT * INTO e FROM employes WHERE id = c.employe_id;
  IF NOT _acces_applis(e) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Accès suspendu : contrat terminé. Voir avec l''administrateur.');
  END IF;

  SELECT * INTO v_bloc FROM _connexion_pwa_blocage(c.id);
  IF v_bloc.bloque_jusqua IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'bloque', true, 'message',
      CASE v_bloc.raison WHEN 'jour'
        THEN 'Trop d''erreurs : connexion bloquée jusqu''à demain. Un administrateur peut débloquer.'
        ELSE 'Trop d''erreurs : réessayez à ' || to_char(v_bloc.bloque_jusqua AT TIME ZONE 'Europe/Paris', 'HH24"h"MI') || '.' END);
  END IF;

  IF coalesce(p_pin, '') !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Format PIN invalide (4 chiffres attendus).');
  END IF;

  v_ok := e.pin_hash IS NOT NULL AND crypt(p_pin, e.pin_hash) = e.pin_hash;

  IF NOT v_ok AND NOT c.pin_migre THEN
    IF p_ancien_ok IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'verifier_ancien', true, 'ancien_uid', c.ancien_uid);
    END IF;
    IF p_ancien_ok THEN
      v_ok := true;
      -- Le PIN de la PWA devient aussi celui du kiosque, sauf s'il est déjà à un collègue.
      IF _pin_deja_pris(p_pin, e.id) THEN
        v_changer := true;
      ELSE
        UPDATE employes SET pin_hash = crypt(p_pin, gen_salt('bf', 12)), updated_at = now() WHERE id = e.id;
        UPDATE comptes_pwa SET pin_migre = true, updated_at = now() WHERE id = c.id;
      END IF;
    END IF;
  ELSIF v_ok AND NOT c.pin_migre THEN
    UPDATE comptes_pwa SET pin_migre = true, updated_at = now() WHERE id = c.id;
  END IF;

  IF NOT v_ok THEN
    INSERT INTO connexion_pwa_essais (compte_id, resultat) VALUES (c.id, 'echec');
    SELECT * INTO v_bloc FROM _connexion_pwa_blocage(c.id);
    IF v_bloc.bloque_jusqua IS NOT NULL THEN
      INSERT INTO rh_journal (auteur, employe_id, action, motif)
      VALUES ('PWA', e.id, 'Connexion PWA bloquée',
              CASE v_bloc.raison WHEN 'jour' THEN '10 erreurs dans la journée — bloquée jusqu''à demain'
                                 ELSE '3 erreurs en 10 min — bloquée 10 min' END);
      RETURN jsonb_build_object('ok', false, 'bloque', true, 'message',
        'Code PIN incorrect. Trop d''erreurs : connexion bloquée '
        || CASE v_bloc.raison WHEN 'jour' THEN 'jusqu''à demain.' ELSE 'pendant 10 minutes.' END);
    END IF;
    RETURN jsonb_build_object('ok', false, 'message', 'Code PIN incorrect.');
  END IF;

  INSERT INTO connexion_pwa_essais (compte_id, resultat) VALUES (c.id, 'ok');
  DELETE FROM connexion_pwa_essais WHERE at < now() - interval '90 days';

  RETURN jsonb_build_object('ok', true, 'compte', c.id, 'prenom', e.prenom, 'nom', e.nom,
    'role', c.role, 'activites', to_jsonb(c.activites), 'pin_a_changer', v_changer);
END;
$$;

CREATE OR REPLACE FUNCTION public.pwa_comptes_liste()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      'present', r.present, 'externe', r.acces_externe, 'hasPIN', r.a_pin OR NOT r.pin_migre,
      'bloqueJusqua', b.bloque_jusqua, 'echecsJour', b.echecs_jour);
  END LOOP;
  RETURN v_res;
END;
$$;

-- L'activité « pointage » n'existe plus dans la PWA depuis le 2026-10-06.
UPDATE public.comptes_pwa SET activites = array_remove(activites, 'pointage'), updated_at = now()
 WHERE 'pointage' = ANY (activites);
