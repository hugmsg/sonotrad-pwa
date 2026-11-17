-- 2026-11-17 : la macro Excel « Reporter les OT PWA » (un clic) signale les OT qu'elle vient d'écrire dans
-- « Historique OT » : on les ajoute à la copie ot_historique, ils sortent de la liste « À reporter »
-- sans réimporter la matrice. Mêmes valeurs que ot_historique_a_reporter. Le prochain import complet
-- remplace tout, comme avant (l'Excel contient alors ces lignes).
CREATE OR REPLACE FUNCTION public.ot_historique_ajouter(p_numeros text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nb integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ot_numero'));
  INSERT INTO ot_historique (numero, code_planning, numero_module, agence, type_lettre, date_fin, annee, mois, total)
  SELECT f.numero_ot, f.code_planning, f.numero_module,
         coalesce(nullif(f.documents->>'agence', ''), f.agence),
         upper(left(btrim(coalesce(f.type_module, '')), 1)),
         _ot_fiche_date(f),
         extract(year FROM _ot_fiche_date(f))::integer, extract(month FROM _ot_fiche_date(f))::integer,
         f.total_ht
    FROM _ot_fiches_hors_excel() f
   WHERE f.numero_ot = ANY (coalesce(p_numeros, '{}'::text[]));
  GET DIAGNOSTICS v_nb = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'nb', v_nb);
END;
$function$;

REVOKE ALL ON FUNCTION public.ot_historique_ajouter(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ot_historique_ajouter(text[]) TO service_role;
