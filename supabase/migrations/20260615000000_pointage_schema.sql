-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Module Pointage
-- Migration : schéma initial
-- ═══════════════════════════════════════════════════════════════════════════

-- Extension pgcrypto pour bcrypt (disponible nativement sur Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Nettoyage préalable (idempotent — safe à relancer même si vide)
DROP TRIGGER  IF EXISTS trg_sync_heures_journalieres ON pointages;
DROP FUNCTION IF EXISTS _sync_heures_journalieres();
DROP FUNCTION IF EXISTS detecter_anomalies_oubli_sortie();
DROP FUNCTION IF EXISTS verifier_pointage(uuid, text);
DROP FUNCTION IF EXISTS authentifier_par_pin(text);
DROP VIEW     IF EXISTS en_service_vue;
DROP TABLE    IF EXISTS heures_journalieres CASCADE;
DROP TABLE    IF EXISTS pointages           CASCADE;
DROP TABLE    IF EXISTS employes            CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE : employes
-- Référentiel des employés. Le PIN est stocké en hash bcrypt (jamais en clair).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         text        NOT NULL,
  prenom      text        NOT NULL,
  pin_hash    text        NOT NULL,    -- crypt(pin, gen_salt('bf'))
  nfc_uid     text        UNIQUE,      -- UID tag NFC (optionnel)
  actif       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employes_actif ON employes (actif);


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE : pointages
-- Registre légal immuable. On n'efface jamais — on annule (valide = false).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pointages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id   uuid        NOT NULL REFERENCES employes(id),
  type         text        NOT NULL CHECK (type IN ('ENTREE', 'SORTIE', 'PAUSE_DEBUT', 'PAUSE_FIN')),
  horodatage   timestamptz NOT NULL DEFAULT now(),
  source       text        NOT NULL DEFAULT 'kiosque'
                           CHECK (source IN ('kiosque', 'nfc', 'admin', 'auto')),
  valide       boolean     NOT NULL DEFAULT true,
  raison_modif text,                  -- obligatoire si valide passe à false
  modifie_par  text,                      -- nom de l'admin (texte libre)
  modifie_le   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pointages_employe_date
  ON pointages (employe_id, horodatage DESC);
CREATE INDEX IF NOT EXISTS idx_pointages_valide
  ON pointages (valide) WHERE valide = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE : heures_journalieres
-- Récapitulatif quotidien calculé automatiquement par trigger.
-- Jamais modifié directement par la PWA.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS heures_journalieres (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id             uuid        NOT NULL REFERENCES employes(id),
  date                   date        NOT NULL,
  heure_entree           timestamptz,
  heure_sortie           timestamptz,
  duree_brute            interval,   -- heure_sortie - heure_entree
  duree_pause            interval    NOT NULL DEFAULT '0',
  duree_nette            interval,   -- duree_brute - duree_pause
  statut                 text        NOT NULL DEFAULT 'ABSENT'
                         CHECK (statut IN ('EN_SERVICE', 'EN_PAUSE', 'SORTI', 'ANOMALIE', 'ABSENT')),
  pause_legale_appliquee boolean     NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employe_id, date)
);

CREATE INDEX IF NOT EXISTS idx_hj_date_statut
  ON heures_journalieres (date, statut);


-- ─────────────────────────────────────────────────────────────────────────────
-- VUE SÉCURISÉE : en_service_vue
-- Expose nom/prénom sans exposer pin_hash aux clients anonymes.
-- Utilisée par la PWA pour afficher la liste "en service".
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW en_service_vue AS
SELECT
  hj.employe_id,
  e.nom,
  e.prenom,
  hj.statut,
  hj.heure_entree,
  hj.date
FROM heures_journalieres hj
JOIN employes e ON e.id = hj.employe_id
WHERE e.actif = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

-- employes : aucun accès direct depuis le client (tout passe par SECURITY DEFINER)
ALTER TABLE employes ENABLE ROW LEVEL SECURITY;

-- pointages : anon peut insérer des pointages valides depuis le kiosque
ALTER TABLE pointages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_pointages"
  ON pointages
  FOR INSERT
  TO anon
  WITH CHECK (valide = true AND source = 'kiosque');

-- Interdire DELETE sur pointages (tous rôles sauf superuser)
CREATE POLICY "no_delete_pointages"
  ON pointages
  FOR DELETE
  TO public
  USING (false);

-- heures_journalieres : lecture publique (pas de données sensibles)
ALTER TABLE heures_journalieres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_heures_journalieres"
  ON heures_journalieres
  FOR SELECT
  TO anon
  USING (true);

-- Vue en_service_vue : accessible en lecture pour anon
GRANT SELECT ON en_service_vue TO anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTION : authentifier_par_pin
-- Vérifie le PIN bcrypt et retourne l'identité de l'employé.
-- SECURITY DEFINER : s'exécute avec les droits du propriétaire (bypass RLS).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION authentifier_par_pin(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_employe employes%ROWTYPE;
BEGIN
  IF length(p_pin) <> 4 OR p_pin !~ '^\d{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Format PIN invalide (4 chiffres attendus).');
  END IF;

  SELECT * INTO v_employe
  FROM employes
  WHERE actif = true
    AND crypt(p_pin, pin_hash) = pin_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Code PIN incorrect.');
  END IF;

  RETURN jsonb_build_object(
    'ok',     true,
    'id',     v_employe.id,
    'nom',    v_employe.nom,
    'prenom', v_employe.prenom
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTION : verifier_pointage
-- Contrôle la cohérence métier avant d'insérer un pointage.
-- Retourne { ok, message }.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION verifier_pointage(p_employe_id uuid, p_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_dernier_type text;
  v_tz           text := 'Europe/Paris';
  v_today        date := (now() AT TIME ZONE v_tz)::date;
BEGIN
  -- Dernier type de pointage valide de l'employé aujourd'hui
  SELECT type INTO v_dernier_type
  FROM pointages
  WHERE employe_id = p_employe_id
    AND valide = true
    AND (horodatage AT TIME ZONE v_tz)::date = v_today
  ORDER BY horodatage DESC
  LIMIT 1;

  CASE p_type
    WHEN 'ENTREE' THEN
      IF v_dernier_type IS NOT NULL AND v_dernier_type <> 'SORTIE' THEN
        RETURN jsonb_build_object(
          'ok', false,
          'message', 'Déjà en service — pointez votre sortie d''abord.'
        );
      END IF;

    WHEN 'SORTIE' THEN
      IF v_dernier_type IS NULL OR v_dernier_type NOT IN ('ENTREE', 'PAUSE_FIN') THEN
        RETURN jsonb_build_object(
          'ok', false,
          'message', 'Aucune entrée en cours — impossible de pointer une sortie.'
        );
      END IF;

    WHEN 'PAUSE_DEBUT' THEN
      IF v_dernier_type IS NULL OR v_dernier_type NOT IN ('ENTREE', 'PAUSE_FIN') THEN
        RETURN jsonb_build_object(
          'ok', false,
          'message', 'Pointez d''abord votre entrée avant de déclarer une pause.'
        );
      END IF;

    WHEN 'PAUSE_FIN' THEN
      IF v_dernier_type IS NULL OR v_dernier_type <> 'PAUSE_DEBUT' THEN
        RETURN jsonb_build_object(
          'ok', false,
          'message', 'Aucune pause en cours à terminer.'
        );
      END IF;

    ELSE
      RETURN jsonb_build_object(
        'ok', false,
        'message', 'Type de pointage inconnu : ' || p_type
      );
  END CASE;

  RETURN jsonb_build_object('ok', true, 'message', 'OK');
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTION TRIGGER : _sync_heures_journalieres
-- Recalcule automatiquement heures_journalieres après chaque pointage.
-- Gère : statut (EN_SERVICE / EN_PAUSE / SORTI), durée brute/nette,
--        pauses explicites, et la pause légale 20 min (convention transport).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _sync_heures_journalieres()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tz           text        := 'Europe/Paris';
  v_date         date;
  v_entree       timestamptz;
  v_sortie       timestamptz;
  v_last_type    text;
  v_duree_pause  interval    := '0'::interval;
  v_duree_brute  interval;
  v_duree_nette  interval;
  v_statut       text;
  v_pause_legale boolean     := false;
  r              record;
  v_fin_pause    timestamptz;
BEGIN
  v_date := (NEW.horodatage AT TIME ZONE v_tz)::date;

  -- Première ENTREE valide du jour
  SELECT horodatage INTO v_entree
  FROM pointages
  WHERE employe_id = NEW.employe_id AND valide = true
    AND (horodatage AT TIME ZONE v_tz)::date = v_date AND type = 'ENTREE'
  ORDER BY horodatage LIMIT 1;

  -- Dernière SORTIE valide du jour
  SELECT horodatage INTO v_sortie
  FROM pointages
  WHERE employe_id = NEW.employe_id AND valide = true
    AND (horodatage AT TIME ZONE v_tz)::date = v_date AND type = 'SORTIE'
  ORDER BY horodatage DESC LIMIT 1;

  -- Dernier type de pointage du jour (pour déterminer le statut en cours)
  SELECT type INTO v_last_type
  FROM pointages
  WHERE employe_id = NEW.employe_id AND valide = true
    AND (horodatage AT TIME ZONE v_tz)::date = v_date
  ORDER BY horodatage DESC LIMIT 1;

  -- Somme des pauses complètes (paires PAUSE_DEBUT / PAUSE_FIN)
  FOR r IN
    SELECT horodatage AS debut
    FROM pointages
    WHERE employe_id = NEW.employe_id AND valide = true
      AND (horodatage AT TIME ZONE v_tz)::date = v_date AND type = 'PAUSE_DEBUT'
    ORDER BY horodatage
  LOOP
    SELECT horodatage INTO v_fin_pause
    FROM pointages
    WHERE employe_id = NEW.employe_id AND valide = true
      AND (horodatage AT TIME ZONE v_tz)::date = v_date
      AND type = 'PAUSE_FIN' AND horodatage > r.debut
    ORDER BY horodatage LIMIT 1;

    IF v_fin_pause IS NOT NULL THEN
      v_duree_pause := v_duree_pause + (v_fin_pause - r.debut);
    END IF;
  END LOOP;

  -- Calcul durées et statut
  IF v_entree IS NULL THEN
    v_statut := 'ABSENT';

  ELSIF v_sortie IS NOT NULL THEN
    v_duree_brute := v_sortie - v_entree;
    v_statut      := 'SORTI';
    -- Convention transport : déduire 20 min si durée > 6h sans aucune pause pointée
    IF v_duree_brute > interval '6 hours' AND v_duree_pause = '0'::interval THEN
      v_duree_pause  := interval '20 minutes';
      v_pause_legale := true;
    END IF;
    v_duree_nette := v_duree_brute - v_duree_pause;

  ELSIF v_last_type = 'PAUSE_DEBUT' THEN
    v_statut := 'EN_PAUSE';

  ELSE
    v_statut := 'EN_SERVICE';
  END IF;

  -- Upsert heures_journalieres
  INSERT INTO heures_journalieres (
    employe_id, date,
    heure_entree, heure_sortie,
    duree_brute, duree_pause, duree_nette,
    statut, pause_legale_appliquee, updated_at
  )
  VALUES (
    NEW.employe_id, v_date,
    v_entree, v_sortie,
    v_duree_brute, v_duree_pause, v_duree_nette,
    v_statut, v_pause_legale, now()
  )
  ON CONFLICT (employe_id, date) DO UPDATE SET
    heure_entree           = EXCLUDED.heure_entree,
    heure_sortie           = EXCLUDED.heure_sortie,
    duree_brute            = EXCLUDED.duree_brute,
    duree_pause            = EXCLUDED.duree_pause,
    duree_nette            = EXCLUDED.duree_nette,
    statut                 = EXCLUDED.statut,
    pause_legale_appliquee = EXCLUDED.pause_legale_appliquee,
    updated_at             = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_heures_journalieres
  AFTER INSERT OR UPDATE ON pointages
  FOR EACH ROW
  EXECUTE FUNCTION _sync_heures_journalieres();


-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTION : detecter_anomalies_oubli_sortie
-- À appeler chaque nuit via un cron (pg_cron ou Supabase Scheduled Functions).
-- Marque ANOMALIE toutes les lignes "En service" de la veille sans sortie.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION detecter_anomalies_oubli_sortie()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE heures_journalieres
  SET statut     = 'ANOMALIE',
      updated_at = now()
  WHERE date = current_date - 1
    AND statut IN ('EN_SERVICE', 'EN_PAUSE')
    AND heure_sortie IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;  -- nombre d'anomalies créées
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- DONNÉES D'EXEMPLE
-- Décommenter pour créer des employés de test.
-- Le PIN est haché avec bcrypt (bf = blowfish, coût 12).
-- Exemple : PIN 1234 → crypt('1234', gen_salt('bf', 12))
-- ─────────────────────────────────────────────────────────────────────────────
/*
INSERT INTO employes (nom, prenom, pin_hash) VALUES
  ('Dupont',   'Jean',    crypt('1234', gen_salt('bf', 12))),
  ('Martin',   'Sophie',  crypt('5678', gen_salt('bf', 12))),
  ('Bernard',  'Pierre',  crypt('9012', gen_salt('bf', 12)));
*/


-- ─────────────────────────────────────────────────────────────────────────────
-- NOTES D'EXPLOITATION
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Créer un employé (depuis Supabase SQL Editor ou via un admin panel) :
--   INSERT INTO employes (nom, prenom, pin_hash)
--   VALUES ('Nom', 'Prénom', crypt('XXXX', gen_salt('bf', 12)));
--
-- Annuler un pointage (jamais de DELETE) :
--   UPDATE pointages
--   SET valide = false,
--       raison_modif = 'Erreur de saisie',
--       modifie_par  = '<uuid_admin>',
--       modifie_le   = now()
--   WHERE id = '<uuid_pointage>';
--   -- Le trigger se déclenche sur UPDATE et recalcule heures_journalieres.
--
-- Cron recommandé (pg_cron — activer dans Supabase Dashboard > Database > Extensions) :
--   SELECT cron.schedule(
--     'detecter-anomalies-oubli-sortie',
--     '15 0 * * *',  -- tous les jours à 00h15
--     'SELECT detecter_anomalies_oubli_sortie()'
--   );
