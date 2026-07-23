-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Historique LV/CMR via Supabase (essai, 2026-07-23)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Objectif : permettre à l'Historique interne PWA de lire ses données depuis
-- Supabase (Realtime, plus réactif) plutôt que l'Archive Google Sheets, sans
-- construire un vrai système d'authentification Supabase (jugé trop lourd
-- pour le gain avec Hugo). À la place : Apps Script (serveur, jamais exposé
-- au navigateur) lit via une RPC protégée par un secret partagé, différent
-- de l'anon key publique déjà utilisée par le portail transporteur externe.
-- Le portail public ignore ce secret et ne peut donc pas lire ces données
-- internes même s'il utilise la même anon key.
--
-- Le secret lui-même N'EST JAMAIS versionné en clair : il vit dans la table
-- config_interne (créée vide ici), insérée séparément hors fichier commité.
-- Même principe côté Apps Script : le secret vit dans PropertiesService
-- (Script Properties), jamais en dur dans pwa_master.js.
--
-- 1. Ajoute à voyages_internes les champs encore absents (conducteur, immat,
--    expéditeur, convoi, lien PDF) — jamais exposés au portail, cohérent avec
--    le rôle déjà documenté de cette table.
-- 2. Nettoie 3 anciennes surcharges de enregistrer_voyage() : les migrations
--    précédentes ont utilisé CREATE OR REPLACE en ajoutant des paramètres
--    nommés différemment à chaque fois, ce qui crée une nouvelle surcharge
--    Postgres (pas un vrai remplacement) tant que le nom de la fonction ET
--    la liste de paramètres ne matchent pas exactement. Sans risque : seul
--    index.html appelle cette fonction, toujours avec le jeu complet actuel.
-- 3. Étend enregistrer_voyage() avec les nouveaux champs.
-- 4. Nouvelle RPC lire_historique_voyages(secret, limit) — lecture combinée
--    voyages + voyages_internes, gated par secret (stocké dans config_interne).
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS enregistrer_voyage(text,text,text,text,text,text,numeric,numeric,boolean,text);
DROP FUNCTION IF EXISTS enregistrer_voyage(text,text,text,text,text,text,numeric,numeric,boolean,text,boolean);
DROP FUNCTION IF EXISTS enregistrer_voyage(text,text,text,text,text,text,numeric,numeric,boolean,text,boolean,text);
DROP FUNCTION IF EXISTS enregistrer_voyage(text,text,text,text,text,text,numeric,numeric,boolean,text,boolean,text,text);

ALTER TABLE voyages_internes
  ADD COLUMN IF NOT EXISTS conducteur   text,
  ADD COLUMN IF NOT EXISTS immat_moteur text,
  ADD COLUMN IF NOT EXISTS immat_semi   text,
  ADD COLUMN IF NOT EXISTS expediteur   text,
  ADD COLUMN IF NOT EXISTS convoi       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdf_url      text;

-- Table de config interne : ne stocke QUE de la config technique (le secret
-- de la RPC ci-dessous), jamais de données métier. Créée vide — la ligne
-- ('historique_secret', <valeur>) est insérée séparément, hors migration
-- versionnée, pour ne jamais faire transiter le secret par git.
CREATE TABLE IF NOT EXISTS config_interne (
  cle    text PRIMARY KEY,
  valeur text NOT NULL
);

CREATE OR REPLACE FUNCTION enregistrer_voyage(
  p_numero_lv           text,
  p_type                text,
  p_destination         text,
  p_doc_annexe          text,
  p_commande            text,
  p_commentaire         text,
  p_poids               numeric,
  p_ml                  numeric,
  p_grutage             boolean,
  p_transporteur        text,
  p_parti               boolean DEFAULT false,
  p_marchandises_desc   text    DEFAULT NULL,
  p_destination_adresse text    DEFAULT NULL,
  p_conducteur          text    DEFAULT NULL,
  p_immat_moteur        text    DEFAULT NULL,
  p_immat_semi          text    DEFAULT NULL,
  p_expediteur          text    DEFAULT NULL,
  p_convoi              boolean DEFAULT false,
  p_pdf_url             text    DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_numero_lv IS NULL OR length(trim(p_numero_lv)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv manquant');
  END IF;

  INSERT INTO voyages (numero_lv, type, destination, commentaire, poids, ml, grutage, transporteur, parti, parti_le, marchandises_desc, destination_adresse)
  VALUES (p_numero_lv, COALESCE(NULLIF(p_type, ''), 'LV'), p_destination, NULLIF(p_commentaire, ''),
          p_poids, p_ml, COALESCE(p_grutage, false), NULLIF(p_transporteur, ''),
          COALESCE(p_parti, false), CASE WHEN COALESCE(p_parti, false) THEN now() ELSE NULL END,
          NULLIF(p_marchandises_desc, ''), NULLIF(p_destination_adresse, ''))
  ON CONFLICT (numero_lv) DO UPDATE SET
    type                = EXCLUDED.type,
    destination         = EXCLUDED.destination,
    commentaire         = EXCLUDED.commentaire,
    poids               = EXCLUDED.poids,
    ml                  = EXCLUDED.ml,
    grutage             = EXCLUDED.grutage,
    transporteur        = EXCLUDED.transporteur,
    marchandises_desc   = EXCLUDED.marchandises_desc,
    destination_adresse = EXCLUDED.destination_adresse;
    -- parti volontairement absent du DO UPDATE : une fois le voyage enregistré,
    -- seul marquer_parti() doit pouvoir faire évoluer ce statut

  INSERT INTO voyages_internes (numero_lv, doc_annexe, commande, conducteur, immat_moteur, immat_semi, expediteur, convoi, pdf_url)
  VALUES (p_numero_lv, NULLIF(p_doc_annexe, ''), NULLIF(p_commande, ''), NULLIF(p_conducteur, ''),
          NULLIF(p_immat_moteur, ''), NULLIF(p_immat_semi, ''), NULLIF(p_expediteur, ''),
          COALESCE(p_convoi, false), NULLIF(p_pdf_url, ''))
  ON CONFLICT (numero_lv) DO UPDATE SET
    doc_annexe   = EXCLUDED.doc_annexe,
    commande     = EXCLUDED.commande,
    conducteur   = EXCLUDED.conducteur,
    immat_moteur = EXCLUDED.immat_moteur,
    immat_semi   = EXCLUDED.immat_semi,
    expediteur   = EXCLUDED.expediteur,
    convoi       = EXCLUDED.convoi,
    pdf_url      = EXCLUDED.pdf_url;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'message', sqlerrm);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- RPC lire_historique_voyages — lecture combinée voyages + voyages_internes,
-- réservée à Apps Script. GRANT à anon nécessaire car Apps Script appelle
-- aussi avec l'anon key (pas de rôle Postgres dédié) — la protection vient
-- du secret (stocké dans config_interne), pas du rôle appelant.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lire_historique_voyages(p_secret text, p_limit int DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result jsonb;
  expected text;
BEGIN
  SELECT valeur INTO expected FROM config_interne WHERE cle = 'historique_secret';
  IF expected IS NULL OR p_secret IS DISTINCT FROM expected THEN
    RETURN jsonb_build_object('ok', false, 'message', 'secret invalide');
  END IF;

  SELECT jsonb_agg(row_to_json(t))
  INTO result
  FROM (
    SELECT v.numero_lv, v.type, v.date_creation, v.destination, v.destination_adresse,
           v.poids, v.ml, v.grutage, v.commentaire, v.marchandises_desc, v.parti, v.parti_le,
           i.doc_annexe, i.commande, i.conducteur, i.immat_moteur, i.immat_semi, i.expediteur, i.convoi, i.pdf_url
    FROM voyages v
    LEFT JOIN voyages_internes i ON i.numero_lv = v.numero_lv
    ORDER BY v.date_creation DESC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
  ) t;

  RETURN jsonb_build_object('ok', true, 'history', COALESCE(result, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION lire_historique_voyages(text, int) TO anon;
