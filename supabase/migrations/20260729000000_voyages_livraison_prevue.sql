-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Portail transporteur : date de livraison prévue (2026-07-29)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La date de livraison prévue (renseignée en amont dans la Production LOXAM,
-- colonne "Livraison" du Planning) est désormais un champ dédié du formulaire
-- de création LV/CMR côté PWA (case à cocher + date, voir index.html
-- _lvuCollectFormData / lvuApplyLoxam). Ce champ est non sensible par
-- construction (comme marchandises_desc, destination_adresse) : il peut donc
-- vivre dans "voyages" et être exposé au portail transporteur public.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE voyages ADD COLUMN IF NOT EXISTS livraison_prevue date;

DROP FUNCTION IF EXISTS enregistrer_voyage(text,text,text,text,text,text,numeric,numeric,boolean,text,boolean,text,text,text,text,text,text,boolean,text,timestamptz,numeric,numeric);

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
  p_destination_lon     numeric     DEFAULT NULL,
  p_livraison_prevue    date        DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_numero_lv IS NULL OR length(trim(p_numero_lv)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv manquant');
  END IF;

  INSERT INTO voyages (numero_lv, type, date_creation, destination, commentaire, poids, ml, grutage, transporteur, parti, parti_le, marchandises_desc, destination_adresse, destination_lat, destination_lon, livraison_prevue)
  VALUES (p_numero_lv, COALESCE(NULLIF(p_type, ''), 'LV'), COALESCE(p_date_creation, now()), p_destination, NULLIF(p_commentaire, ''),
          p_poids, p_ml, COALESCE(p_grutage, false), NULLIF(p_transporteur, ''),
          COALESCE(p_parti, false), CASE WHEN COALESCE(p_parti, false) THEN now() ELSE NULL END,
          NULLIF(p_marchandises_desc, ''), NULLIF(p_destination_adresse, ''), p_destination_lat, p_destination_lon, p_livraison_prevue)
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
    destination_lon     = EXCLUDED.destination_lon,
    livraison_prevue    = EXCLUDED.livraison_prevue;
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
       poids, ml, grutage, commentaire, parti, parti_le, marchandises_desc, livraison_prevue
FROM voyages
ORDER BY parti ASC, date_creation DESC;

GRANT SELECT ON voyages_portail TO anon;
