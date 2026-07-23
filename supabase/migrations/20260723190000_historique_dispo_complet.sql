-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Historique : disponibles toujours complets (2026-07-23)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug remonté par Hugo : le filtre "Disponibles" de l'Historique PWA affichait
-- 14 voyages, contre 18 sur le portail transporteur, pour les mêmes données.
--
-- Cause : lire_historique_voyages() limitait d'abord (ORDER BY date DESC
-- LIMIT p_limit) puis le filtre "disponibles" s'appliquait côté client sur
-- ce sous-ensemble — un voyage non-parti ancien pouvait tomber hors de la
-- fenêtre des p_limit lignes les plus récentes. Le portail, lui, utilise une
-- limite (300) supérieure au nombre total de lignes, donc ne rencontrait pas
-- le problème.
--
-- Correctif : renvoyer TOUJOURS la totalité des voyages non-partis (volume
-- naturellement faible — on ne peut pas avoir des centaines de voyages en
-- attente en même temps) + les p_limit derniers partis pour l'historique
-- récent. Signature inchangée (même 2 paramètres) — CREATE OR REPLACE
-- remplace bien la fonction existante ici (pas de nouvelle surcharge).
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
           v.poids, v.ml, v.grutage, v.commentaire, v.marchandises_desc, v.parti, v.parti_le,
           i.doc_annexe, i.commande, i.conducteur, i.immat_moteur, i.immat_semi, i.expediteur, i.convoi, i.pdf_url
    FROM voyages v
    LEFT JOIN voyages_internes i ON i.numero_lv = v.numero_lv
    WHERE v.parti = false
  ),
  recents_partis AS (
    SELECT v.numero_lv, v.type, v.date_creation, v.destination, v.destination_adresse,
           v.poids, v.ml, v.grutage, v.commentaire, v.marchandises_desc, v.parti, v.parti_le,
           i.doc_annexe, i.commande, i.conducteur, i.immat_moteur, i.immat_semi, i.expediteur, i.convoi, i.pdf_url
    FROM voyages v
    LEFT JOIN voyages_internes i ON i.numero_lv = v.numero_lv
    WHERE v.parti = true
    ORDER BY v.date_creation DESC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
  )
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.date_creation DESC)
  INTO result
  FROM (SELECT * FROM dispo UNION ALL SELECT * FROM recents_partis) t;

  RETURN jsonb_build_object('ok', true, 'history', COALESCE(result, '[]'::jsonb));
END;
$$;
