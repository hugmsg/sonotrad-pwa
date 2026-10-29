-- Fiches d'opérations : les documents OT reprennent l'ordre de saisie de la fiche (= ordre de la fiche papier),
-- choix de Hugo du 2026-10-29. Annule le tri par ordre de la matrice de 20261029120000_ot_ordre_matrice
-- (les colonnes ordre de ot_references / ot_forfaits restent, inutilisées par les documents).

CREATE OR REPLACE FUNCTION public.ot_fiche_documents(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN f.id IS NULL THEN jsonb_build_object('ok', false, 'message', 'Fiche introuvable')
  ELSE _ot_fiche_json(f.id) || jsonb_build_object(
    'lignes', coalesce((SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'description', coalesce(nullif(c.libelle, ''), fo.intitule, r.description, c.ref),
        'op_code', r.op_code, 'forfait', fo.lettre IS NOT NULL)
        -- ordre de saisie de la fiche (= ordre de la fiche papier), choix de Hugo du 2026-10-29
        ORDER BY c.ordre, c.id)
      FROM _ot_lignes_calcul(f.id) c
      LEFT JOIN ot_forfaits fo ON fo.lettre = c.ref
      LEFT JOIN ot_references r ON r.ref = c.ref AND fo.lettre IS NULL), '[]'::jsonb),
    'fournitures', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM _ot_fournitures(f.id) x), '[]'::jsonb))
  END
  FROM (SELECT p_id AS id) q LEFT JOIN ot_fiches f ON f.id = q.id;
$function$;
