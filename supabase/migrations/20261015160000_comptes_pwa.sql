-- 2026-10-15 : comptes de la PWA dans Supabase (remplacent la feuille Sonotrad-Utilisateurs).
-- Une personne = une ligne employes ; comptes_pwa porte ce qui est propre à la PWA (rôle,
-- activités, actif). Le PIN est celui du kiosque (employes.pin_hash, bcrypt).
-- Connexion : on choisit son nom puis on tape son PIN ; erreurs comptées par compte
-- (3 en 10 min → 10 min ; 10 dans la journée → jusqu'au lendemain), comme le kiosque.
-- Bascule : tant que pin_migre = false, Apps Script peut confirmer l'ancien PIN (feuille) ;
-- le PIN est alors enregistré ici.
-- Toutes les fonctions sont réservées au serveur (Apps Script, clé secrète).

CREATE TABLE IF NOT EXISTS public.comptes_pwa (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id  uuid NOT NULL UNIQUE REFERENCES public.employes(id),
  role        text NOT NULL DEFAULT 'utilisateur' CHECK (role IN ('admin', 'utilisateur')),
  activites   text[] NOT NULL DEFAULT ARRAY['loxam'],
  actif       boolean NOT NULL DEFAULT true,
  pin_migre   boolean NOT NULL DEFAULT false,
  ancien_uid  text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comptes_pwa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comptes_pwa FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.connexion_pwa_essais (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  compte_id  uuid NOT NULL REFERENCES public.comptes_pwa(id) ON DELETE CASCADE,
  resultat   text NOT NULL CHECK (resultat IN ('echec', 'ok', 'deblocage'))
);
CREATE INDEX IF NOT EXISTS connexion_pwa_essais_compte_idx ON public.connexion_pwa_essais (compte_id, at DESC);
ALTER TABLE public.connexion_pwa_essais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.connexion_pwa_essais FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.connexion_pwa_essais_id_seq FROM PUBLIC, anon, authenticated;

-- ── Outils internes ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._connexion_pwa_blocage(p_compte uuid,
  OUT bloque_jusqua timestamptz, OUT raison text, OUT echecs_jour int)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tz        text := 'Europe/Paris';
  v_jour      timestamptz := date_trunc('day', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_demain    timestamptz := (date_trunc('day', now() AT TIME ZONE v_tz) + interval '1 day') AT TIME ZONE v_tz;
  v_deblocage bigint;
  v_ok        bigint;
  v_court     int;
  v_derniere  timestamptz;
BEGIN
  SELECT max(id) INTO v_deblocage FROM connexion_pwa_essais
   WHERE compte_id = p_compte AND resultat = 'deblocage' AND at >= v_jour;
  SELECT max(id) INTO v_ok FROM connexion_pwa_essais
   WHERE compte_id = p_compte AND resultat = 'ok';

  SELECT count(*) INTO echecs_jour FROM connexion_pwa_essais
   WHERE compte_id = p_compte AND resultat = 'echec'
     AND at >= v_jour AND id > coalesce(v_deblocage, 0);
  IF echecs_jour >= 10 THEN
    bloque_jusqua := v_demain; raison := 'jour';
    RETURN;
  END IF;

  SELECT count(*), max(at) INTO v_court, v_derniere FROM connexion_pwa_essais
   WHERE compte_id = p_compte AND resultat = 'echec'
     AND at > now() - interval '10 minutes'
     AND id > greatest(coalesce(v_ok, 0), coalesce(v_deblocage, 0));
  IF v_court >= 3 THEN
    bloque_jusqua := v_derniere + interval '10 minutes'; raison := 'court';
  END IF;
END;
$$;

-- Le PIN est-il déjà celui d'un autre salarié ? (le kiosque ne demande que le PIN)
CREATE OR REPLACE FUNCTION public._pin_deja_pris(p_pin text, p_sauf uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM employes
     WHERE supprime = false AND pin_hash IS NOT NULL
       AND id IS DISTINCT FROM p_sauf
       AND crypt(p_pin, pin_hash) = pin_hash);
$$;

CREATE OR REPLACE FUNCTION public._employe_present(e public.employes)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT e.actif AND NOT e.supprime AND (e.date_sortie IS NULL OR e.date_sortie >= current_date);
$$;

-- Fiche employes pour un nouveau compte : celle indiquée, sinon celle du même nom, sinon une
-- nouvelle (« sans fiche RH »).
CREATE OR REPLACE FUNCTION public._pwa_resoudre_employe(p_prenom text, p_nom text, p_employe uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_employe IS NOT NULL THEN
    SELECT id INTO v_id FROM employes WHERE id = p_employe;
  END IF;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM employes WHERE nom = p_nom AND prenom = p_prenom;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO employes (nom, prenom) VALUES (p_nom, p_prenom) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- ── Connexion ────────────────────────────────────────────────────────────────

-- Liste affichée sur l'écran de connexion : prénom + initiale (nom complet seulement si
-- deux personnes auraient la même étiquette).
CREATE OR REPLACE FUNCTION public.pwa_comptes_connexion()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH c AS (
    SELECT c.id, e.prenom, e.nom,
           e.prenom || ' ' || upper(left(e.nom, 1)) || '.' AS court
      FROM comptes_pwa c JOIN employes e ON e.id = c.employe_id
     WHERE c.actif AND _employe_present(e)
  ), n AS (
    SELECT *, count(*) OVER (PARTITION BY court) AS homonymes FROM c
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id,
           'nom', CASE WHEN homonymes > 1 THEN prenom || ' ' || nom ELSE court END)
           ORDER BY prenom, nom), '[]'::jsonb)
    FROM n;
$$;

-- p_ancien_ok : réponse d'Apps Script sur l'ancien PIN (feuille), seulement si demandée
-- (verifier_ancien) pendant la bascule.
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
  IF NOT _employe_present(e) THEN
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

-- Nouveau PIN (changement par l'utilisateur ou réinitialisation par un admin).
CREATE OR REPLACE FUNCTION public.pwa_definir_pin(p_compte uuid, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
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
  UPDATE comptes_pwa SET pin_migre = true, updated_at = now() WHERE id = p_compte;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── Administration (écran Admin › Utilisateurs de la PWA) ────────────────────

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
           _employe_present(e) AS present
      FROM comptes_pwa c JOIN employes e ON e.id = c.employe_id
     ORDER BY e.prenom, e.nom
  LOOP
    SELECT * INTO b FROM _connexion_pwa_blocage(r.id);
    v_res := v_res || jsonb_build_object(
      'id', r.id, 'prenom', r.prenom, 'nom', r.nom, 'role', r.role, 'actif', r.actif,
      'activites', to_jsonb(r.activites), 'employeId', r.employe_id, 'aFicheRh', r.a_fiche_rh,
      'present', r.present, 'hasPIN', r.a_pin OR NOT r.pin_migre,
      'bloqueJusqua', b.bloque_jusqua, 'echecsJour', b.echecs_jour);
  END LOOP;
  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.pwa_compte_creer(p_prenom text, p_nom text, p_role text,
  p_activites text[], p_pin text, p_employe uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_employe uuid;
  v_id      uuid;
BEGIN
  p_prenom := trim(coalesce(p_prenom, '')); p_nom := trim(coalesce(p_nom, ''));
  IF p_prenom = '' OR p_nom = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Prénom et nom requis.');
  END IF;
  IF coalesce(p_role, '') NOT IN ('admin', 'utilisateur') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Rôle invalide.');
  END IF;
  IF coalesce(array_length(p_activites, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Au moins une activité requise.');
  END IF;
  IF coalesce(p_pin, '') !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'PIN invalide (4 chiffres attendus).');
  END IF;

  v_employe := _pwa_resoudre_employe(p_prenom, p_nom, p_employe);
  IF EXISTS (SELECT 1 FROM comptes_pwa WHERE employe_id = v_employe) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Cet utilisateur a déjà un compte.');
  END IF;
  IF _pin_deja_pris(p_pin, v_employe) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Ce PIN est déjà utilisé par un collègue : choisissez-en un autre.');
  END IF;

  -- Fiche « sans fiche RH » supprimée autrefois : on la réutilise.
  UPDATE employes SET pin_hash = crypt(p_pin, gen_salt('bf', 12)), actif = true,
         supprime = CASE WHEN classe_num IS NULL THEN false ELSE supprime END, updated_at = now()
   WHERE id = v_employe;
  INSERT INTO comptes_pwa (employe_id, role, activites, pin_migre)
  VALUES (v_employe, p_role, p_activites, true)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'employeId', v_employe);
END;
$$;

CREATE OR REPLACE FUNCTION public.pwa_compte_modifier(p_compte uuid, p_role text DEFAULT NULL,
  p_activites text[] DEFAULT NULL, p_actif boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_role IS NOT NULL AND p_role NOT IN ('admin', 'utilisateur') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Rôle invalide.');
  END IF;
  IF p_activites IS NOT NULL AND coalesce(array_length(p_activites, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Au moins une activité requise.');
  END IF;
  UPDATE comptes_pwa SET
    role      = coalesce(p_role, role),
    activites = coalesce(p_activites, activites),
    actif     = coalesce(p_actif, actif),
    updated_at = now()
  WHERE id = p_compte;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Compte introuvable.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Supprime le compte ; la fiche employes n'est retirée que si ce n'est pas une vraie fiche RH.
CREATE OR REPLACE FUNCTION public.pwa_compte_supprimer(p_compte uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_employe uuid;
BEGIN
  DELETE FROM comptes_pwa WHERE id = p_compte RETURNING employe_id INTO v_employe;
  IF v_employe IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Compte introuvable.');
  END IF;
  UPDATE employes SET supprime = true, updated_at = now()
   WHERE id = v_employe AND classe_num IS NULL AND NOT is_rh_admin AND auth_user_id IS NULL;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.pwa_compte_debloquer(p_compte uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO connexion_pwa_essais (compte_id, resultat) VALUES (p_compte, 'deblocage');
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Import depuis la feuille (une fois, idempotent : relancer ne crée pas de doublon).
CREATE OR REPLACE FUNCTION public.pwa_compte_importer(p_prenom text, p_nom text, p_role text,
  p_actif boolean, p_activites text[], p_ancien_uid text, p_employe uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_employe uuid;
  v_id      uuid;
BEGIN
  p_prenom := trim(coalesce(p_prenom, '')); p_nom := trim(coalesce(p_nom, ''));
  IF p_prenom = '' OR p_nom = '' OR coalesce(p_ancien_uid, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'ligne incomplète');
  END IF;
  SELECT id INTO v_id FROM comptes_pwa WHERE ancien_uid = p_ancien_uid;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'statut', 'déjà importé');
  END IF;
  v_employe := _pwa_resoudre_employe(p_prenom, p_nom, p_employe);
  IF EXISTS (SELECT 1 FROM comptes_pwa WHERE employe_id = v_employe) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'fiche déjà reliée à un autre compte');
  END IF;
  INSERT INTO comptes_pwa (employe_id, role, activites, actif, ancien_uid)
  VALUES (v_employe,
          CASE WHEN lower(p_role) = 'admin' THEN 'admin' ELSE 'utilisateur' END,
          CASE WHEN coalesce(array_length(p_activites, 1), 0) = 0 THEN ARRAY['loxam'] ELSE p_activites END,
          coalesce(p_actif, true), p_ancien_uid)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'statut', 'importé');
END;
$$;

-- ── Droits : serveur uniquement ──────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._connexion_pwa_blocage(uuid)',
    'public._pin_deja_pris(text, uuid)',
    'public._pwa_resoudre_employe(text, text, uuid)',
    'public.pwa_comptes_connexion()',
    'public.pwa_connexion(uuid, text, boolean)',
    'public.pwa_definir_pin(uuid, text)',
    'public.pwa_comptes_liste()',
    'public.pwa_compte_creer(text, text, text, text[], text, uuid)',
    'public.pwa_compte_modifier(uuid, text, text[], boolean)',
    'public.pwa_compte_supprimer(uuid)',
    'public.pwa_compte_debloquer(uuid)',
    'public.pwa_compte_importer(text, text, text, boolean, text[], text, uuid)']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
