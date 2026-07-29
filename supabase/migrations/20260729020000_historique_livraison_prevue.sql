-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Historique Supabase : ajoute livraison_prevue (2026-07-29)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug remonté par Hugo : après édition de la livraison prévue via le modal
-- note/grutage de l'Historique PWA, la colonne "Livraison prévue" restait
-- vide dans ce même Historique — alors que l'Archive Sheets et la table
-- "voyages" étaient bien à jour.
--
-- Cause : l'Historique PWA (lvuLoadHistory) lit en réalité l'action
-- lv_history_supabase (RPC lire_historique_voyages), pas lv_history (Archive
-- Sheets, mis à jour lors de l'ajout initial de la fonctionnalité) — ces deux
-- chemins ont des mappings de colonnes indépendants, et celui-ci n'avait
-- jamais été étendu avec livraison_prevue. Signature inchangée (mêmes
-- 2 paramètres) — CREATE OR REPLACE remplace bien la fonction existante ici.
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

  WITH dispo AS (
    SELECT v.numero_lv, v.type, v.date_creation, v.destination, v.destination_adresse,
           v.poids, v.ml, v.grutage, v.commentaire, v.marchandises_desc, v.livraison_prevue, v.parti, v.parti_le,
           i.doc_annexe, i.commande, i.conducteur, i.immat_moteur, i.immat_semi, i.expediteur, i.convoi, i.pdf_url
    FROM voyages v
    LEFT JOIN voyages_internes i ON i.numero_lv = v.numero_lv
    WHERE v.parti = false
  ),
  recents_partis AS (
    SELECT v.numero_lv, v.type, v.date_creation, v.destination, v.destination_adresse,
           v.poids, v.ml, v.grutage, v.commentaire, v.marchandises_desc, v.livraison_prevue, v.parti, v.parti_le,
           i.doc_annexe, i.commande, i.conducteur, i.immat_moteur, i.immat_semi, i.expediteur, i.convoi, i.pdf_url
    FROM voyages v
    LEFT JOIN voyages_internes i ON i.numero_lv = v.numero_lv
    WHERE v.parti = true
    ORDER BY v.numero_lv::int DESC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
  )
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.numero_lv::int DESC)
  INTO result
  FROM (SELECT * FROM dispo UNION ALL SELECT * FROM recents_partis) t;

  RETURN jsonb_build_object('ok', true, 'history', COALESCE(result, '[]'::jsonb));
END;
$$;
