-- 2026-11-24 — Consigne de livraison des LV (demande de Hugo) : « le … », « avant le … », « à partir du … »,
-- « semaine n° » (lundi → vendredi) ou pas de consigne. Ramenée à une fenêtre [livraison_min, livraison_max] :
--   le       → min = max = la date          avant   → max seulement
--   apartir  → min seulement                 semaine → lundi et vendredi de la semaine ISO
-- livraison_prevue reste rempli (max, sinon min) : le portail transporteur et le reste continuent de le lire.
-- Écrit par Apps Script (clé secrète) juste après enregistrer_voyage, via voyage_livraison().

ALTER TABLE public.voyages
  ADD COLUMN IF NOT EXISTS livraison_type text,
  ADD COLUMN IF NOT EXISTS livraison_min date,
  ADD COLUMN IF NOT EXISTS livraison_max date;
ALTER TABLE public.voyages DROP CONSTRAINT IF EXISTS voyages_livraison_type_check;
ALTER TABLE public.voyages ADD CONSTRAINT voyages_livraison_type_check
  CHECK (livraison_type IS NULL OR livraison_type = ANY (ARRAY['le'::text, 'avant'::text, 'apartir'::text, 'semaine'::text, 'aucune'::text]));

ALTER TABLE public.voyages_annules
  ADD COLUMN IF NOT EXISTS livraison_type text,
  ADD COLUMN IF NOT EXISTS livraison_min date,
  ADD COLUMN IF NOT EXISTS livraison_max date;

CREATE OR REPLACE FUNCTION public.voyage_livraison(p_numero_lv text, p_type text, p_min date, p_max date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type text := NULLIF(btrim(coalesce(p_type, '')), '');
BEGIN
  IF coalesce(btrim(p_numero_lv), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv manquant');
  END IF;
  IF v_type IS NOT NULL AND v_type <> ALL (ARRAY['le', 'avant', 'apartir', 'semaine', 'aucune']) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'consigne inconnue : ' || v_type);
  END IF;
  IF p_min IS NOT NULL AND p_max IS NOT NULL AND p_min > p_max THEN
    RETURN jsonb_build_object('ok', false, 'message', 'date au plus tôt après la date au plus tard');
  END IF;

  UPDATE voyages
     SET livraison_type   = v_type,
         livraison_min    = CASE WHEN v_type = 'aucune' THEN NULL ELSE p_min END,
         livraison_max    = CASE WHEN v_type = 'aucune' THEN NULL ELSE p_max END,
         livraison_prevue = CASE WHEN v_type IS NULL THEN livraison_prevue
                                 WHEN v_type = 'aucune' THEN NULL
                                 ELSE coalesce(p_max, p_min) END
   WHERE numero_lv = p_numero_lv;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv introuvable : ' || p_numero_lv);
  END IF;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'message', sqlerrm);
END;
$function$;
REVOKE ALL ON FUNCTION public.voyage_livraison(text, text, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voyage_livraison(text, text, date, date) TO service_role;

-- Annulation : la consigne suit la LV dans voyages_annules.
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
         immat_moteur, immat_semi, expediteur, convoi, pdf_url, annulee_par, motif, remplacee_par,
         livraison_type, livraison_min, livraison_max)
  SELECT v.numero_lv, v.type, v.date_creation, v.destination, v.destination_adresse, v.poids, v.ml, v.grutage,
         v.commentaire, v.marchandises_desc, v.livraison_prevue, v.parti, v.parti_le, i.doc_annexe, i.commande, i.conducteur,
         i.immat_moteur, i.immat_semi, i.expediteur, i.convoi, i.pdf_url,
         NULLIF(p_par, ''), trim(p_motif), NULLIF(trim(coalesce(p_remplacee_par, '')), ''),
         v.livraison_type, v.livraison_min, v.livraison_max
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

-- Historique (PWA) : avec la consigne.
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
           false AS annulee, NULL::timestamptz AS annulee_le, NULL::text AS annulee_par, NULL::text AS annulation_motif, NULL::text AS remplacee_par,
           v.livraison_type, v.livraison_min, v.livraison_max
    FROM voyages v
    LEFT JOIN voyages_internes i ON i.numero_lv = v.numero_lv
    WHERE v.parti = false
  ),
  recents_partis AS (
    SELECT v.numero_lv, v.type, v.date_creation, v.destination, v.destination_adresse,
           v.poids, v.ml, v.grutage, v.commentaire, v.marchandises_desc, v.livraison_prevue, v.parti, v.parti_le,
           i.doc_annexe, i.commande, i.conducteur, i.immat_moteur, i.immat_semi, i.expediteur, i.convoi, i.pdf_url,
           false AS annulee, NULL::timestamptz AS annulee_le, NULL::text AS annulee_par, NULL::text AS annulation_motif, NULL::text AS remplacee_par,
           v.livraison_type, v.livraison_min, v.livraison_max
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
           true, a.annulee_le, a.annulee_par, a.motif, a.remplacee_par,
           a.livraison_type, a.livraison_min, a.livraison_max
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
