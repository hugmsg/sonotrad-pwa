-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Historique : tri par numéro + correction dates inversées (2026-07-23)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug remonté par Hugo : les dates de création affichées étaient parfois
-- fausses (ex. LV 01600 affichait "7 janvier" au lieu de "1er juillet"),
-- désordonnant l'affichage puisque lire_historique_voyages() triait par
-- date_creation.
--
-- Cause réelle : Google Sheets a auto-converti certains textes "dd/MM/yyyy"
-- (écrits par _saveLv) en vraies dates, en les réinterprétant parfois en
-- MM/dd/yyyy (bug de locale Sheets) — uniquement quand jour ET mois sont
-- tous les deux ≤ 12 (ambigu). Le backfill de l'Archive vers Supabase a
-- fidèlement recopié ces dates déjà corrompues à la source ; les vraies
-- créations (via l'app, `now()` côté serveur) ne sont pas concernées.
--
-- Deux correctifs :
-- 1. lire_historique_voyages() trie désormais par numero_lv (fiable, jamais
--    corrompu) plutôt que par date_creation.
-- 2. Correction ponctuelle (exécutée hors migration, cf. conversation) :
--    UPDATE voyages SET date_creation = <jour/mois inversés> pour les lignes
--    du backfill où l'ambiguïté était détectable (jour ET mois ≤ 12) —
--    vérifiée en donnant une séquence parfaitement chronologique cohérente
--    avec l'ordre des numero_lv. Non répétée ici (idempotence non garantie
--    si des vraies dates ≤12/≤12 légitimes existent depuis) — voir historique
--    Supabase des requêtes exécutées si besoin de la reproduire.
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
    ORDER BY v.numero_lv::int DESC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
  )
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.numero_lv::int DESC)
  INTO result
  FROM (SELECT * FROM dispo UNION ALL SELECT * FROM recents_partis) t;

  RETURN jsonb_build_object('ok', true, 'history', COALESCE(result, '[]'::jsonb));
END;
$$;
