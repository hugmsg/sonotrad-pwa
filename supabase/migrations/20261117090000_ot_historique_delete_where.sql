-- 2026-11-17 : l'import de la matrice échouait (« DELETE requires a WHERE clause ») : appelée par l'API
-- (PostgREST), la fonction tombe sous la protection pg_safeupdate de Supabase, qui refuse un DELETE sans WHERE.
-- Seul changement : DELETE FROM ot_historique WHERE true.
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
  DELETE FROM ot_historique WHERE true;
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
