-- 2026-11-18 (demande de Hugo) : modules dont l'OT a été fait dans la matrice Excel (avant les fiches PWA).
-- Renvoie { "CODE PLANNING": "n° d'OT" } pour l'année en cours et la précédente (≈ 1 100 OT) ; lu avec ot_liste
-- (masterfile). La PWA retire ces modules de « À compléter » et de « OT à faire » et affiche le n° d'OT Excel.
CREATE OR REPLACE FUNCTION public.ot_historique_codes()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_object_agg(c.code, c.numero), '{}'::jsonb)
    FROM (SELECT DISTINCT ON (upper(btrim(h.code_planning))) upper(btrim(h.code_planning)) AS code, h.numero
            FROM ot_historique h
           WHERE btrim(coalesce(h.code_planning, '')) <> ''
             AND h.annee >= extract(year FROM now())::integer - 1
           ORDER BY upper(btrim(h.code_planning)), h.numero DESC) c;
$function$;

REVOKE ALL ON FUNCTION public.ot_historique_codes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ot_historique_codes() TO service_role;
