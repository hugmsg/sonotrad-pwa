-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Portail transporteur : positionnement précis par géocodage (2026-07-24)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Jusqu'ici, le positionnement sur la carte du portail reposait uniquement sur
-- une table de correspondance mots-clés codée en dur (VILLES dans
-- portail-transporteur.html), testée contre le nom du destinataire — imprécis
-- (position = centre-ville) et fragile (ne matche que si le nom du
-- destinataire contient un nom de ville reconnu ; ex. "TRANSPORTS MESNAGER"
-- ne matche rien).
--
-- Ajoute destination_lat/destination_lon, alimentés par un géocodage réel de
-- destination_adresse (Nominatim/OpenStreetMap, un seul appel par création de
-- LV côté index.html — voir _geocodeAdresse()). La table VILLES reste en
-- repli pour les entrées sans coordonnées (géocodage échoué, ou créées avant
-- ce commit).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE voyages
  ADD COLUMN IF NOT EXISTS destination_lat numeric,
  ADD COLUMN IF NOT EXISTS destination_lon numeric;

DROP FUNCTION IF EXISTS enregistrer_voyage(text,text,text,text,text,text,numeric,numeric,boolean,text,boolean,text,text,text,text,text,text,boolean,text,timestamptz);

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
  p_parti               boolean     DEFAULT false,
  p_marchandises_desc   text        DEFAULT NULL,
  p_destination_adresse text        DEFAULT NULL,
  p_conducteur          text        DEFAULT NULL,
  p_immat_moteur        text        DEFAULT NULL,
  p_immat_semi          text        DEFAULT NULL,
  p_expediteur          text        DEFAULT NULL,
  p_convoi              boolean     DEFAULT false,
  p_pdf_url             text        DEFAULT NULL,
  p_date_creation       timestamptz DEFAULT NULL,
  p_destination_lat     numeric     DEFAULT NULL,
  p_destination_lon     numeric     DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_numero_lv IS NULL OR length(trim(p_numero_lv)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv manquant');
  END IF;

  INSERT INTO voyages (numero_lv, type, date_creation, destination, commentaire, poids, ml, grutage, transporteur, parti, parti_le, marchandises_desc, destination_adresse, destination_lat, destination_lon)
  VALUES (p_numero_lv, COALESCE(NULLIF(p_type, ''), 'LV'), COALESCE(p_date_creation, now()), p_destination, NULLIF(p_commentaire, ''),
          p_poids, p_ml, COALESCE(p_grutage, false), NULLIF(p_transporteur, ''),
          COALESCE(p_parti, false), CASE WHEN COALESCE(p_parti, false) THEN now() ELSE NULL END,
          NULLIF(p_marchandises_desc, ''), NULLIF(p_destination_adresse, ''), p_destination_lat, p_destination_lon)
  ON CONFLICT (numero_lv) DO UPDATE SET
    type                = EXCLUDED.type,
    date_creation       = EXCLUDED.date_creation,
    destination         = EXCLUDED.destination,
    commentaire         = EXCLUDED.commentaire,
    poids               = EXCLUDED.poids,
    ml                  = EXCLUDED.ml,
    grutage             = EXCLUDED.grutage,
    transporteur        = EXCLUDED.transporteur,
    marchandises_desc   = EXCLUDED.marchandises_desc,
    destination_adresse = EXCLUDED.destination_adresse,
    destination_lat     = EXCLUDED.destination_lat,
    destination_lon     = EXCLUDED.destination_lon;
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

DROP VIEW IF EXISTS voyages_portail;

CREATE VIEW voyages_portail
WITH (security_invoker = true) AS
SELECT numero_lv, type, date_creation, destination, destination_adresse, destination_lat, destination_lon,
       poids, ml, grutage, commentaire, parti, parti_le, marchandises_desc
FROM voyages
ORDER BY parti ASC, date_creation DESC;

GRANT SELECT ON voyages_portail TO anon;
