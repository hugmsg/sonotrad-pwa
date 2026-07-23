-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Module Portail Transporteur
-- Migration : schéma voyages (alimenté à la création de la LV/CMR dans la PWA)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contexte :
--   La génération du PDF (LV/CMR) est 100% côté PWA (jsPDF, voir CLAUDE_LV.md).
--   La sauvegarde (numérotation, PDF sur Drive, ligne dans l'onglet "Départs" de
--   Google Sheets) passe encore par un Apps Script Web App, appelé depuis
--   lvuSaveToDrive() dans index.html.
--
--   Cette migration ajoute un canal parallèle, temps réel, pour le portail
--   transporteur externe :
--     - enregistrer_voyage() est appelé depuis lvuSaveToDrive() juste après le
--       succès de l'appel Apps Script existant (aucune modif de l'Apps Script
--       nécessaire pour la création).
--     - marquer_parti() est appelé par un déclencheur onEdit ajouté à la main
--       dans l'éditeur Apps Script existant, sur la colonne J (Parti) de
--       l'onglet "Départs" — voir apps-script/sync-parti-supabase.gs.txt.
--
--   Séparation en deux tables :
--     - voyages          → tout ce qui est utile et sans risque à exposer au
--                           portail public (destination, ml, poids, grutage,
--                           statut parti). Realtime activé dessus.
--     - voyages_internes → références internes (BT, n° de commande Loxam) que
--                           le portail n'a pas à afficher. Jamais exposée à anon.
--
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Nettoyage préalable (idempotent — safe à relancer même si vide)
DROP TRIGGER  IF EXISTS trg_voyages_touch ON voyages;
DROP FUNCTION IF EXISTS _voyages_touch_updated_at();
DROP FUNCTION IF EXISTS marquer_parti(text, boolean);
DROP FUNCTION IF EXISTS enregistrer_voyage(text, text, text, text, text, text, numeric, numeric, boolean, text);
DROP VIEW     IF EXISTS voyages_portail;
DROP TABLE    IF EXISTS voyages_internes CASCADE;
DROP TABLE    IF EXISTS voyages          CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE : voyages
-- Une ligne = une LV/CMR = un voyage. Colonnes exposées au portail transporteur.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voyages (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_lv      text        NOT NULL UNIQUE,     -- ex: '01659' — même numérotation que la sheet
  type           text        NOT NULL DEFAULT 'LV' CHECK (type IN ('LV', 'CMR')),
  date_creation  timestamptz NOT NULL DEFAULT now(),
  destination    text        NOT NULL,
  poids          numeric,                          -- tonnes, souvent vide à la source
  ml             numeric,                           -- mètres linéaires
  grutage        boolean     NOT NULL DEFAULT false,
  commentaire    text,                              -- contraintes de livraison (dates, consignes)
  transporteur   text,                              -- 'TRANSPORTS MESNAGER' ou nom saisi libre
  parti          boolean     NOT NULL DEFAULT false,
  parti_le       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voyages_parti          ON voyages (parti);
CREATE INDEX IF NOT EXISTS idx_voyages_date_creation   ON voyages (date_creation DESC);

COMMENT ON TABLE voyages IS 'Un voyage = une LV/CMR. Table exposée en lecture au portail transporteur externe (Realtime activé).';


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE : voyages_internes
-- Références internes SONOTRAD/Loxam, jamais exposées au portail.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voyages_internes (
  numero_lv   text PRIMARY KEY REFERENCES voyages(numero_lv) ON DELETE CASCADE,
  doc_annexe  text,   -- BT (bon de transport)
  commande    text    -- n° de commande Loxam
);

COMMENT ON TABLE voyages_internes IS 'Références internes (BT, commande) liées à un voyage. Jamais accessible à anon.';


-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER : updated_at automatique sur voyages
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _voyages_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_voyages_touch
  BEFORE UPDATE ON voyages
  FOR EACH ROW EXECUTE FUNCTION _voyages_touch_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTION : enregistrer_voyage
-- Appelée depuis lvuSaveToDrive() (index.html) juste après le succès de
-- l'appel Apps Script existant. Upsert par numero_lv (idempotent si la PWA
-- retente l'appel). security definer : anon ne peut pas écrire directement
-- dans voyages/voyages_internes, seulement via cette fonction.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enregistrer_voyage(
  p_numero_lv    text,
  p_type         text,
  p_destination  text,
  p_doc_annexe   text,
  p_commande     text,
  p_commentaire  text,
  p_poids        numeric,
  p_ml           numeric,
  p_grutage      boolean,
  p_transporteur text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_numero_lv IS NULL OR length(trim(p_numero_lv)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv manquant');
  END IF;

  INSERT INTO voyages (numero_lv, type, destination, commentaire, poids, ml, grutage, transporteur)
  VALUES (p_numero_lv, COALESCE(NULLIF(p_type, ''), 'LV'), p_destination, NULLIF(p_commentaire, ''),
          p_poids, p_ml, COALESCE(p_grutage, false), NULLIF(p_transporteur, ''))
  ON CONFLICT (numero_lv) DO UPDATE SET
    type         = EXCLUDED.type,
    destination  = EXCLUDED.destination,
    commentaire  = EXCLUDED.commentaire,
    poids        = EXCLUDED.poids,
    ml           = EXCLUDED.ml,
    grutage      = EXCLUDED.grutage,
    transporteur = EXCLUDED.transporteur;

  INSERT INTO voyages_internes (numero_lv, doc_annexe, commande)
  VALUES (p_numero_lv, NULLIF(p_doc_annexe, ''), NULLIF(p_commande, ''))
  ON CONFLICT (numero_lv) DO UPDATE SET
    doc_annexe = EXCLUDED.doc_annexe,
    commande   = EXCLUDED.commande;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'message', sqlerrm);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTION : marquer_parti
-- Appelée par le déclencheur onEdit Apps Script sur la colonne J (Parti) de
-- l'onglet "Départs" — voir apps-script/sync-parti-supabase.gs.txt.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION marquer_parti(
  p_numero_lv text,
  p_parti     boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE voyages
  SET parti    = p_parti,
      parti_le = CASE WHEN p_parti THEN now() ELSE NULL END
  WHERE numero_lv = p_numero_lv;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv introuvable : ' || p_numero_lv);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- VUE : voyages_portail
-- Confort de lecture pour le front (tri par défaut, voyages non partis en tête).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW voyages_portail AS
SELECT numero_lv, type, date_creation, destination, poids, ml, grutage, commentaire, parti, parti_le
FROM voyages
ORDER BY parti ASC, date_creation DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Aucune policy directe sur les tables : tout accès en écriture passe par les
-- fonctions security definer ci-dessus. Lecture publique via la vue uniquement.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE voyages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE voyages_internes ENABLE ROW LEVEL SECURITY;

-- Lecture publique (portail transporteur) sur la table voyages elle-même :
-- nécessaire pour que Realtime (qui écoute la table, pas la vue) fonctionne.
-- Toutes les colonnes de "voyages" sont non sensibles par construction — les
-- références internes (BT, commande) vivent dans voyages_internes, jamais lue
-- par anon.
CREATE POLICY "voyages_lecture_publique" ON voyages
  FOR SELECT USING (true);

GRANT SELECT ON voyages         TO anon;
GRANT SELECT ON voyages_portail TO anon;

-- voyages_internes : aucune policy = aucun accès anon, ni direct ni via RPC
-- (les RPC ci-dessus sont security definer et contournent RLS pour leur propre
-- écriture, ce qui est le comportement voulu).


-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME
-- Le portail s'abonne aux changements de "voyages" (INSERT = nouveau voyage,
-- UPDATE = case Parti cochée) sans avoir à re-interroger toute la table.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE voyages;
