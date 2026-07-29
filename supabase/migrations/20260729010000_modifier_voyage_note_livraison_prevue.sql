-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Historique LV/CMR (PWA) — édition rétroactive de la livraison prévue
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Étend modifier_voyage_note() (édition ponctuelle note/grutage après création
-- de la LV, voir 20260723110000_modifier_voyage_note.sql) pour couvrir aussi
-- la date de livraison prévue : une contrainte de dernière minute peut arriver
-- après la création de la LV et son ajout au portail transporteur — sans ce
-- champ, il n'existait aucun moyen de la répercuter sur le portail (l'édition
-- côté Départ LOXAM ne touche que la Production, en amont de la LV).
-- Miroir Apps Script : masterfile/pwa_master.js → _updateLvNote() (colonne S
-- de l'onglet Archive).
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS modifier_voyage_note(text, text, boolean);

CREATE OR REPLACE FUNCTION modifier_voyage_note(
  p_numero_lv        text,
  p_commentaire      text,
  p_grutage          boolean,
  p_livraison_prevue date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_numero_lv IS NULL OR length(trim(p_numero_lv)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv manquant');
  END IF;

  UPDATE voyages
  SET commentaire      = NULLIF(p_commentaire, ''),
      grutage          = COALESCE(p_grutage, false),
      livraison_prevue = p_livraison_prevue
  WHERE numero_lv = p_numero_lv;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv introuvable : ' || p_numero_lv);
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'message', sqlerrm);
END;
$$;
