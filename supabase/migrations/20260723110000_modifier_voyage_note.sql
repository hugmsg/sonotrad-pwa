-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Historique LV/CMR (PWA) — édition ponctuelle note/grutage
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Permet de corriger la note de livraison et le grutage après la création
-- d'une LV/CMR (ex: date de livraison décidée à la dernière minute, grutage
-- non prévu au départ), sans toucher au PDF déjà généré (figé à la création).
-- Miroir Apps Script : masterfile/pwa_master.js → _updateLvNote() (écrit la
-- même info dans l'onglet Archive du fichier LV/CMR, colonne Note).
--
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION modifier_voyage_note(
  p_numero_lv   text,
  p_commentaire text,
  p_grutage     boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_numero_lv IS NULL OR length(trim(p_numero_lv)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv manquant');
  END IF;

  UPDATE voyages
  SET commentaire = NULLIF(p_commentaire, ''),
      grutage     = COALESCE(p_grutage, false)
  WHERE numero_lv = p_numero_lv;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv introuvable : ' || p_numero_lv);
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'message', sqlerrm);
END;
$$;
