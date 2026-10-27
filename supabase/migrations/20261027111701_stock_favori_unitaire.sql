-- Stock : une étoile s'ajoute ou se retire seule (la PWA envoyait toute sa liste locale, parfois vide,
-- ce qui effaçait les autres). Remise des 52 étoiles d'avant le test du 2026-10-27 (stockage_prefs.json).

CREATE FUNCTION public.stock_basculer_favori(p_ref text, p_on boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF btrim(coalesce(p_ref, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'ref manquant');
  END IF;
  IF p_on THEN
    INSERT INTO stock_favoris (ref) VALUES (btrim(p_ref)) ON CONFLICT (ref) DO NOTHING;
  ELSE
    DELETE FROM stock_favoris WHERE ref = btrim(p_ref);
  END IF;
  RETURN jsonb_build_object('ok', true, 'count', (SELECT count(*) FROM stock_favoris));
END;
$function$;

REVOKE ALL ON FUNCTION public.stock_basculer_favori(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_basculer_favori(text, boolean) TO service_role;

SELECT public.stock_definir_favoris('["2","3","5","7","10","12","15","75","81","82","83","84","85","86","87","88","93","97","101","102","106","123","130","131","132","133","134","135","138","143","146","147","148","149","150","152","154","155","156","157","158","159","160","161","162","163","165","167","168","169","170","171"]'::jsonb);
