-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Portail transporteur — carte détail (adresse de livraison)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ajoute l'adresse complète de destination (jusqu'ici seul le nom du
-- destinataire était synchronisé, colonne "destination"). Alimentée par
-- _syncVoyageSupabase() dans index.html (adresse + ville du destinataire,
-- déjà saisies à la création de la LV/CMR). NULL pour tout voyage créé avant
-- ce commit — même limite que marchandises_desc, la donnée n'a jamais été
-- envoyée avant, rien à récupérer rétroactivement.
--
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE voyages ADD COLUMN IF NOT EXISTS destination_adresse text;

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
  p_destination_adresse text    DEFAULT NULL
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

DROP VIEW IF EXISTS voyages_portail;

CREATE VIEW voyages_portail
WITH (security_invoker = true) AS
SELECT numero_lv, type, date_creation, destination, destination_adresse, poids, ml, grutage, commentaire, parti, parti_le, marchandises_desc
FROM voyages
ORDER BY parti ASC, date_creation DESC;

GRANT SELECT ON voyages_portail TO anon;
