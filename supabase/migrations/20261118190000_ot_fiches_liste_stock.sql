-- 2026-11-18 (demande de Hugo) : la liste des fiches renvoie aussi stock_le (fournitures sorties du stock :
-- indication dans Reconditionnement et dans Production) et modele (module / container).
CREATE OR REPLACE FUNCTION public.ot_fiches_liste(p_statuts text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'code_planning', f.code_planning, 'numero_module', f.numero_module,
      'agence', f.agence, 'type_module', f.type_module, 'numero_ot', f.numero_ot, 'statut', f.statut,
      'commentaire', f.commentaire, 'modele', f.modele,
      'total_ht', coalesce(f.total_ht, (_ot_totaux(f.id)->>'total')::numeric),
      'saisi_par', f.saisi_par, 'cree_le', _stock_iso(f.cree_le), 'modifie_le', _stock_iso(f.modifie_le),
      'valide_le', _stock_iso(f.valide_le), 'envoye_le', _stock_iso(f.envoye_le),
      'stock_le', _stock_iso(f.stock_le),
      'documents', f.documents,
      'nb_lignes', (SELECT count(*) FROM ot_lignes l WHERE l.fiche_id = f.id AND coalesce(l.quantite, 0) > 0))
      ORDER BY f.modifie_le DESC, f.id DESC), '[]'::jsonb)
    FROM ot_fiches f
   WHERE CASE WHEN coalesce(array_length(p_statuts, 1), 0) = 0 THEN f.statut <> 'annulee'
              ELSE f.statut = ANY (p_statuts) END;
$function$;
