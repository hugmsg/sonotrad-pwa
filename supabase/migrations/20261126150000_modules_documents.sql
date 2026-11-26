-- Documents à relier au dossier Drive de chaque module (raccourcis), pour le rattrapage de masterfile
-- (modRaccourcisRattrapage, masterfile/dossier_module.js). Lecture seule, clé secrète seulement.
CREATE OR REPLACE FUNCTION public.modules_documents()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'commandes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'numero', c.numero, 'affaire', c.affaire,
                         'code', c.code_planning, 'pdf', c.pdf, 'statut', c.statut) ORDER BY c.id), '[]'::jsonb)
                    FROM commandes_loxam c
                   WHERE coalesce(btrim(c.code_planning), '') <> '' AND c.pdf ? 'id'),
    'expeditions', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'numero', e.numero, 'bt', e.bt,
                         'modules', e.modules, 'pdf', e.pdf, 'statut', e.statut) ORDER BY e.id), '[]'::jsonb)
                      FROM expeditions_loxam e
                     WHERE e.pdf ? 'id'),
    'ot', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'numero', f.numero_ot, 'code', f.code_planning,
                  'statut', f.statut, 'fichiers', f.documents->'fichiers') ORDER BY f.id), '[]'::jsonb)
             FROM ot_fiches f
            WHERE f.numero_ot IS NOT NULL AND jsonb_typeof(f.documents->'fichiers') = 'array'
              AND coalesce(btrim(f.code_planning), '') <> '')
  );
$function$;

REVOKE ALL ON FUNCTION public.modules_documents() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modules_documents() TO service_role;
