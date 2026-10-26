-- Annulation d'une LV/CMR : elle quitte `voyages` (donc le portail transporteur, qui lit
-- cette table) mais reste visible dans l'Historique de la PWA, marquée annulée, avec le
-- motif, l'auteur et le numéro qui la remplace. Le numéro n'est jamais réutilisé.
--  * voyages_annules : copie figée de la fiche au moment de l'annulation (aucune policy :
--    lecture par lire_historique_voyages uniquement).
--  * annuler_voyage : appelée par Apps Script (clé secrète) après l'annulation dans l'Archive.
--  * lire_historique_voyages : ajoute les annulations des 90 derniers jours.

CREATE TABLE public.voyages_annules (
  numero_lv           text PRIMARY KEY,
  type                text,
  date_creation       timestamptz,
  destination         text,
  destination_adresse text,
  poids               numeric,
  ml                  numeric,
  grutage             boolean,
  commentaire         text,
  marchandises_desc   text,
  livraison_prevue    date,
  parti               boolean,
  parti_le            timestamptz,
  doc_annexe          text,
  commande            text,
  conducteur          text,
  immat_moteur        text,
  immat_semi          text,
  expediteur          text,
  convoi              boolean,
  pdf_url             text,
  annulee_le          timestamptz NOT NULL DEFAULT now(),
  annulee_par         text,
  motif               text NOT NULL,
  remplacee_par       text
);
ALTER TABLE public.voyages_annules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.voyages_annules FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.voyages_annules TO service_role;

CREATE OR REPLACE FUNCTION public.annuler_voyage(p_numero_lv text, p_motif text, p_par text, p_remplacee_par text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_destination text DEFAULT NULL::text, p_pdf_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(trim(p_numero_lv), '') = '' OR coalesce(trim(p_motif), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numéro et motif requis');
  END IF;

  INSERT INTO voyages_annules (numero_lv, type, date_creation, destination, destination_adresse, poids, ml, grutage,
         commentaire, marchandises_desc, livraison_prevue, parti, parti_le, doc_annexe, commande, conducteur,
         immat_moteur, immat_semi, expediteur, convoi, pdf_url, annulee_par, motif, remplacee_par)
  SELECT v.numero_lv, v.type, v.date_creation, v.destination, v.destination_adresse, v.poids, v.ml, v.grutage,
         v.commentaire, v.marchandises_desc, v.livraison_prevue, v.parti, v.parti_le, i.doc_annexe, i.commande, i.conducteur,
         i.immat_moteur, i.immat_semi, i.expediteur, i.convoi, i.pdf_url,
         NULLIF(p_par, ''), trim(p_motif), NULLIF(trim(coalesce(p_remplacee_par, '')), '')
  FROM voyages v LEFT JOIN voyages_internes i ON i.numero_lv = v.numero_lv
  WHERE v.numero_lv = p_numero_lv
  ON CONFLICT (numero_lv) DO NOTHING;

  -- Fiche absente de Supabase (synchro jamais faite) : on garde au moins l'essentiel.
  IF NOT FOUND THEN
    INSERT INTO voyages_annules (numero_lv, type, destination, pdf_url, annulee_par, motif, remplacee_par)
    VALUES (p_numero_lv, NULLIF(p_type, ''), NULLIF(p_destination, ''), NULLIF(p_pdf_url, ''),
            NULLIF(p_par, ''), trim(p_motif), NULLIF(trim(coalesce(p_remplacee_par, '')), ''))
    ON CONFLICT (numero_lv) DO NOTHING;
  END IF;

  DELETE FROM voyages WHERE numero_lv = p_numero_lv;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'message', sqlerrm);
END;
$function$;

REVOKE ALL ON FUNCTION public.annuler_voyage(text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.annuler_voyage(text, text, text, text, text, text, text) TO service_role;

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
  FROM (SELECT * FROM dispo UNION ALL SELECT * FROM recents_partis UNION ALL SELECT * FROM annules) t;

  RETURN jsonb_build_object('ok', true, 'history', COALESCE(result, '[]'::jsonb));
END;
$function$;
