-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Module Portail Transporteur
-- Fix : les CMR BCB sont déjà "parties" au moment de leur création
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contexte (relevé par Hugo le 2026-07-23) : contrairement à LOXAM (LV créée
-- en avance, avant le départ réel), pour BCB la CMR est créée AU MOMENT où le
-- matériel part. Sans ce paramètre, enregistrer_voyage() insérait toujours
-- parti=false (valeur par défaut de la colonne), donnant l'impression que du
-- matériel déjà parti était encore disponible sur le portail.
--
-- Miroir du même correctif côté Apps Script : masterfile/pwa_master.js →
-- _saveLv(), colonne Parti de l'onglet Archive (source === 'bcb' → true dès
-- la création).
--
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
  p_transporteur text,
  p_parti        boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_numero_lv IS NULL OR length(trim(p_numero_lv)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv manquant');
  END IF;

  INSERT INTO voyages (numero_lv, type, destination, commentaire, poids, ml, grutage, transporteur, parti, parti_le)
  VALUES (p_numero_lv, COALESCE(NULLIF(p_type, ''), 'LV'), p_destination, NULLIF(p_commentaire, ''),
          p_poids, p_ml, COALESCE(p_grutage, false), NULLIF(p_transporteur, ''),
          COALESCE(p_parti, false), CASE WHEN COALESCE(p_parti, false) THEN now() ELSE NULL END)
  ON CONFLICT (numero_lv) DO UPDATE SET
    type         = EXCLUDED.type,
    destination  = EXCLUDED.destination,
    commentaire  = EXCLUDED.commentaire,
    poids        = EXCLUDED.poids,
    ml           = EXCLUDED.ml,
    grutage      = EXCLUDED.grutage,
    transporteur = EXCLUDED.transporteur;
    -- parti volontairement absent du DO UPDATE : une fois le voyage enregistré,
    -- seul marquer_parti() doit pouvoir faire évoluer ce statut (évite qu'un
    -- ré-enregistrement écrase un "parti" déjà posé par ailleurs)

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
