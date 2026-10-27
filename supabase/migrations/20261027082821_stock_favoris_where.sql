-- Stock : l'API refuse un DELETE sans WHERE (safeupdate) — liste des étoiles vidée avec WHERE true.
CREATE OR REPLACE FUNCTION public.stock_definir_favoris(p_refs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM stock_favoris WHERE true;
  INSERT INTO stock_favoris (ref)
  SELECT r FROM (SELECT DISTINCT ON (btrim(x)) btrim(x) AS r, n
                   FROM jsonb_array_elements_text(coalesce(p_refs, '[]'::jsonb)) WITH ORDINALITY AS t(x, n)
                  WHERE btrim(x) <> '' ORDER BY btrim(x), n) y
   ORDER BY n;
  RETURN jsonb_build_object('ok', true, 'count', jsonb_array_length(coalesce(p_refs, '[]'::jsonb)));
END;
$function$;
