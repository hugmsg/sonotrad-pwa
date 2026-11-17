-- 2026-11-16 (sortie d'essai des fiches OT, demande de Hugo) :
--  * ot_historique : copie de la feuille « Historique OT » de la matrice Excel, importée depuis la PWA
--    (le navigateur lit le .xlsm choisi par Hugo ; remplacement complet à chaque import).
--  * Numérotation : le compteur annuel repart après le plus grand numéro connu (Excel ou PWA),
--    pour que la PWA et l'Excel ne réutilisent jamais un numéro.
--  * ot_tableau_bord : nombre d'OT, total HT et moyenne par mois (comme la feuille « Feuil2 » de la matrice),
--    = historique Excel + fiches PWA validées absentes de l'historique.
--  * ot_historique_a_reporter : fiches PWA validées pas encore dans l'Excel, avec leurs quantités par code OP
--    (lignes à coller en tête de « Historique OT »).

CREATE TABLE IF NOT EXISTS public.ot_historique (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero        text,            -- N° Évènement (AAMMJJ-NNNN)
  code_planning text,
  numero_module text,
  agence        text,
  type_lettre   text,            -- colonne M/B (1re lettre du type de module)
  date_fin      date,
  annee         integer,
  mois          integer,
  total         numeric(12,2)
);
CREATE INDEX IF NOT EXISTS ot_historique_numero ON public.ot_historique (numero);
CREATE INDEX IF NOT EXISTS ot_historique_annee  ON public.ot_historique (annee, mois);

CREATE TABLE IF NOT EXISTS public.ot_historique_import (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  colonnes    jsonb,             -- ligne 4 de « Historique OT » (en-têtes, cases vides = null)
  nb          integer,
  fichier     text,
  importe_par text,
  importe_le  timestamptz
);

ALTER TABLE public.ot_historique        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_historique_import ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ot_historique        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ot_historique_import FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.ot_historique_id_seq FROM PUBLIC, anon, authenticated;

-- Prochain numéro du compteur annuel (sans le préfixe ni la date).
CREATE OR REPLACE FUNCTION public._ot_prochain_numero()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT greatest(
    -- plus grand numéro de l'année dans l'Excel
    (SELECT coalesce(max(substring(numero FROM '-([0-9]{4})$')::integer), 0) FROM ot_historique
      WHERE numero LIKE to_char(now() AT TIME ZONE 'Europe/Paris', 'YY') || '____-____'),
    -- compteur de l'Excel (nombre de lignes de l'année)
    (SELECT count(*)::integer FROM ot_historique
      WHERE annee = extract(year FROM now() AT TIME ZONE 'Europe/Paris')::integer),
    -- plus grand vrai numéro donné par la PWA
    (SELECT coalesce(max(substring(numero_ot FROM '-([0-9]{4})$')::integer), 0) FROM ot_fiches
      WHERE numero_ot LIKE to_char(now() AT TIME ZONE 'Europe/Paris', 'YY') || '____-____')
  ) + 1;
$function$;

CREATE OR REPLACE FUNCTION public.ot_fiche_statut(p_id bigint, p_statut text, p_par text, p_admin boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_f      ot_fiches;
  v_de     text;
  v_jour   text;
  v_n      integer;
BEGIN
  SELECT * INTO v_f FROM ot_fiches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Fiche introuvable');
  END IF;
  v_de := v_f.statut;

  IF NOT ((v_de = 'brouillon' AND p_statut = 'a_valider')
       OR (v_de = 'a_valider' AND p_statut = 'brouillon')
       OR (p_admin AND v_de = 'a_valider' AND p_statut = 'validee')
       OR (p_admin AND v_de = 'validee' AND p_statut IN ('a_valider', 'envoyee'))
       OR (p_admin AND v_de <> 'envoyee' AND v_de <> 'annulee' AND p_statut = 'annulee')) THEN
    RETURN jsonb_build_object('ok', false, 'message',
                              'Passage impossible : ' || v_de || ' → ' || coalesce(p_statut, '?'));
  END IF;

  IF p_statut = 'validee' THEN
    IF NOT EXISTS (SELECT 1 FROM ot_lignes WHERE fiche_id = p_id AND coalesce(quantite, 0) > 0) THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Aucune ligne avec quantité');
    END IF;
    UPDATE ot_lignes l SET mo_unitaire = c.mo_unitaire, prix_piece_unitaire = c.prix_piece_unitaire
      FROM _ot_lignes_calcul(p_id) c WHERE c.id = l.id;
    -- Une fiche numérotée en essai reçoit un vrai numéro si elle est revalidée hors essai.
    IF v_f.numero_ot IS NULL OR (v_f.numero_ot LIKE 'ESSAI-%' AND _ot_parametre('essai') <> 1) THEN
      PERFORM pg_advisory_xact_lock(hashtext('ot_numero'));
      v_jour := to_char(now() AT TIME ZONE 'Europe/Paris', 'YYMMDD');
      IF _ot_parametre('essai') = 1 THEN
        SELECT coalesce(max(substring(numero_ot FROM '-([0-9]{4})$')::integer), 0) + 1 INTO v_n
          FROM ot_fiches WHERE numero_ot LIKE 'ESSAI-' || left(v_jour, 2) || '____-____';
        v_f.numero_ot := 'ESSAI-' || v_jour || '-' || lpad(v_n::text, 4, '0');
      ELSE
        v_f.numero_ot := v_jour || '-' || lpad(_ot_prochain_numero()::text, 4, '0');
      END IF;
    END IF;
    UPDATE ot_fiches
       SET statut = 'validee', numero_ot = v_f.numero_ot, total_ht = (_ot_totaux(p_id)->>'total')::numeric,
           valide_par = btrim(coalesce(p_par, '')), valide_le = now(), modifie_le = clock_timestamp()
     WHERE id = p_id;
  ELSIF v_de = 'validee' AND p_statut = 'a_valider' THEN
    UPDATE ot_lignes SET mo_unitaire = NULL, prix_piece_unitaire = NULL WHERE fiche_id = p_id;
    UPDATE ot_fiches SET statut = 'a_valider', total_ht = NULL, valide_par = NULL, valide_le = NULL,
                         modifie_le = clock_timestamp()
     WHERE id = p_id;
  ELSE
    UPDATE ot_fiches
       SET statut = p_statut, modifie_le = clock_timestamp(),
           envoye_le = CASE WHEN p_statut = 'envoyee' THEN now() ELSE envoye_le END
     WHERE id = p_id;
  END IF;
  RETURN _ot_fiche_json(p_id) || jsonb_build_object('ok', true);
END;
$function$;

-- Import complet de « Historique OT » (remplace tout).
-- p_lignes : [{numero, code, module, agence, type, date 'AAAA-MM-JJ', annee, mois, total}]
CREATE OR REPLACE FUNCTION public.ot_historique_importer(p_lignes jsonb, p_colonnes jsonb, p_par text, p_fichier text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nb integer;
BEGIN
  IF jsonb_typeof(p_lignes) <> 'array' OR jsonb_array_length(p_lignes) < 100 THEN
    RETURN jsonb_build_object('ok', false, 'message',
      'Historique trop court (' || coalesce(jsonb_array_length(p_lignes), 0) || ' lignes) : mauvais fichier ?');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ot_numero'));
  DELETE FROM ot_historique;
  INSERT INTO ot_historique (numero, code_planning, numero_module, agence, type_lettre, date_fin, annee, mois, total)
  SELECT nullif(btrim(x->>'numero'), ''), nullif(upper(btrim(x->>'code')), ''), nullif(btrim(x->>'module'), ''),
         nullif(btrim(x->>'agence'), ''), nullif(btrim(x->>'type'), ''),
         CASE WHEN x->>'date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (x->>'date')::date END,
         CASE WHEN x->>'annee' ~ '^\d{4}$' THEN (x->>'annee')::integer END,
         CASE WHEN x->>'mois' ~ '^\d{1,2}$' THEN (x->>'mois')::integer END,
         CASE WHEN x->>'total' ~ '^-?\d+(\.\d+)?$' THEN round((x->>'total')::numeric, 2) END
    FROM jsonb_array_elements(p_lignes) x;
  GET DIAGNOSTICS v_nb = ROW_COUNT;
  INSERT INTO ot_historique_import (id, colonnes, nb, fichier, importe_par, importe_le)
  VALUES (1, p_colonnes, v_nb, btrim(coalesce(p_fichier, '')), btrim(coalesce(p_par, '')), now())
  ON CONFLICT (id) DO UPDATE SET colonnes = EXCLUDED.colonnes, nb = EXCLUDED.nb, fichier = EXCLUDED.fichier,
                                 importe_par = EXCLUDED.importe_par, importe_le = EXCLUDED.importe_le;
  RETURN jsonb_build_object('ok', true, 'nb', v_nb,
    'prochain', to_char(now() AT TIME ZONE 'Europe/Paris', 'YYMMDD') || '-' || lpad(_ot_prochain_numero()::text, 4, '0'));
END;
$function$;

-- Fiches PWA comptées : vraies (hors essai), validées ou envoyées, absentes de l'historique Excel.
CREATE OR REPLACE FUNCTION public._ot_fiches_hors_excel()
 RETURNS SETOF ot_fiches
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT f.* FROM ot_fiches f
   WHERE f.statut IN ('validee', 'envoyee') AND f.numero_ot IS NOT NULL AND f.numero_ot NOT LIKE 'ESSAI-%'
     AND NOT EXISTS (SELECT 1 FROM ot_historique h WHERE h.numero = f.numero_ot);
$function$;

-- Date retenue pour une fiche PWA : date de fin du Planning (celle des documents), sinon jour de validation.
CREATE OR REPLACE FUNCTION public._ot_fiche_date(f ot_fiches)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN f.documents->>'date_fin' ~ '^\d{4}-\d{2}-\d{2}'
              THEN left(f.documents->>'date_fin', 10)::date
              ELSE (f.valide_le AT TIME ZONE 'Europe/Paris')::date END;
$function$;

CREATE OR REPLACE FUNCTION public.ot_tableau_bord()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH toutes AS (
    SELECT annee, mois, total, 'excel' AS source FROM ot_historique
     WHERE annee BETWEEN 2000 AND 2100 AND mois BETWEEN 1 AND 12
    UNION ALL
    SELECT extract(year FROM _ot_fiche_date(f))::integer, extract(month FROM _ot_fiche_date(f))::integer,
           f.total_ht, 'pwa'
      FROM _ot_fiches_hors_excel() f
  ), parmois AS (
    SELECT annee, mois, count(*) AS nb, coalesce(sum(total), 0) AS total,
           count(*) FILTER (WHERE source = 'pwa') AS nb_pwa
      FROM toutes GROUP BY annee, mois
  )
  SELECT jsonb_build_object(
    'mois', coalesce((SELECT jsonb_agg(jsonb_build_object('annee', annee, 'mois', mois, 'nb', nb,
                                                          'total', total, 'nb_pwa', nb_pwa)
                                       ORDER BY annee, mois) FROM parmois), '[]'::jsonb),
    'import', (SELECT jsonb_build_object('nb', nb, 'fichier', fichier, 'par', importe_par, 'le', importe_le)
                 FROM ot_historique_import WHERE id = 1),
    'a_reporter', (SELECT count(*) FROM _ot_fiches_hors_excel()),
    'essai', _ot_parametre('essai'),
    'prochain', to_char(now() AT TIME ZONE 'Europe/Paris', 'YYMMDD') || '-' || lpad(_ot_prochain_numero()::text, 4, '0'));
$function$;

-- Lignes à reporter dans « Historique OT » : fiches PWA pas encore dans l'Excel,
-- quantités cumulées par code OP (lignes sans code OP ignorées, comme dans la matrice ;
-- vérifié le 2026-11-16 : fiche 9 GQQHKJ = ligne 261113-0450 de l'Excel, code par code).
CREATE OR REPLACE FUNCTION public.ot_historique_a_reporter()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'colonnes', (SELECT colonnes FROM ot_historique_import WHERE id = 1),
    'lignes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', f.id, 'numero', f.numero_ot, 'code', f.code_planning, 'module', f.numero_module,
               'agence', coalesce(nullif(f.documents->>'agence', ''), f.agence),
               'type', upper(left(btrim(coalesce(f.type_module, '')), 1)),
               'date', _ot_fiche_date(f), 'total', f.total_ht,
               'op', (SELECT coalesce(jsonb_object_agg(k, q), '{}'::jsonb) FROM (
                        SELECT btrim(l->>'op_code') AS k, sum((l->>'quantite')::numeric) AS q
                          FROM jsonb_array_elements(ot_fiche_documents(f.id)->'lignes') l
                         WHERE coalesce((l->>'quantite')::numeric, 0) > 0 AND coalesce(btrim(l->>'op_code'), '') <> ''
                         GROUP BY 1) t))
             ORDER BY f.numero_ot DESC)
        FROM _ot_fiches_hors_excel() f), '[]'::jsonb));
$function$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['_ot_prochain_numero()', '_ot_fiches_hors_excel()', '_ot_fiche_date(ot_fiches)',
                           'ot_fiche_statut(bigint, text, text, boolean)',
                           'ot_historique_importer(jsonb, jsonb, text, text)', 'ot_tableau_bord()',
                           'ot_historique_a_reporter()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
