-- Lien entre une LV annulée et sa remplaçante, posé à la création de la remplaçante
-- (ou après coup depuis l'Historique) par Apps Script, avec la clé secrète.
--  * lier_remplacement_voyage : renseigne voyages_annules.remplacee_par.
--  * lire_historique_voyages : chaque LV indique aussi celle(s) qu'elle remplace (`remplace`).

CREATE OR REPLACE FUNCTION public.lier_remplacement_voyage(p_annulee text, p_remplacante text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(trim(p_annulee), '') = '' OR coalesce(trim(p_remplacante), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numéros requis');
  END IF;
  IF p_annulee = p_remplacante THEN
    RETURN jsonb_build_object('ok', false, 'message', 'une LV ne peut pas se remplacer elle-même');
  END IF;
  UPDATE voyages_annules SET remplacee_par = p_remplacante
   WHERE numero_lv = p_annulee AND remplacee_par IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'LV annulée introuvable ou déjà remplacée');
  END IF;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'message', sqlerrm);
END;
$function$;

REVOKE ALL ON FUNCTION public.lier_remplacement_voyage(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lier_remplacement_voyage(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.lire_historique_voyages(p_secret text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
           i.doc_annexe, i.commande, i.conducteur, i.immat_moteur, i.immat_semi, i.expediteur, i.convoi, i.pdf_url,
           false AS annulee, NULL::timestamptz AS annulee_le, NULL::text AS annulee_par, NULL::text AS annulation_motif, NULL::text AS remplacee_par
    FROM voyages v
    LEFT JOIN voyages_internes i ON i.numero_lv = v.numero_lv
    WHERE v.parti = false
  ),
  recents_partis AS (
    SELECT v.numero_lv, v.type, v.date_creation, v.destination, v.destination_adresse,
           v.poids, v.ml, v.grutage, v.commentaire, v.marchandises_desc, v.livraison_prevue, v.parti, v.parti_le,
           i.doc_annexe, i.commande, i.conducteur, i.immat_moteur, i.immat_semi, i.expediteur, i.convoi, i.pdf_url,
           false AS annulee, NULL::timestamptz AS annulee_le, NULL::text AS annulee_par, NULL::text AS annulation_motif, NULL::text AS remplacee_par
    FROM voyages v
    LEFT JOIN voyages_internes i ON i.numero_lv = v.numero_lv
    WHERE v.parti = true
    ORDER BY v.numero_lv::int DESC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
  ),
  annules AS (
    SELECT a.numero_lv, a.type, a.date_creation, a.destination, a.destination_adresse,
           a.poids, a.ml, a.grutage, a.commentaire, a.marchandises_desc, a.livraison_prevue, coalesce(a.parti, false), a.parti_le,
           a.doc_annexe, a.commande, a.conducteur, a.immat_moteur, a.immat_semi, a.expediteur, a.convoi, a.pdf_url,
           true, a.annulee_le, a.annulee_par, a.motif, a.remplacee_par
    FROM voyages_annules a
    WHERE a.annulee_le > now() - interval '90 days'
    ORDER BY a.annulee_le DESC
    LIMIT 100
  )
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.numero_lv::int DESC)
  INTO result
  FROM (
    SELECT u.*, (SELECT string_agg(x.numero_lv, ', ' ORDER BY x.numero_lv) FROM voyages_annules x WHERE x.remplacee_par = u.numero_lv) AS remplace
    FROM (SELECT * FROM dispo UNION ALL SELECT * FROM recents_partis UNION ALL SELECT * FROM annules) u
  ) t;

  RETURN jsonb_build_object('ok', true, 'history', COALESCE(result, '[]'::jsonb));
END;
$function$;
