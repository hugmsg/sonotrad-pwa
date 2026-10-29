-- Fiches d'opérations : documents créés à la validation (Excel LOXAM / SONOTRAD + PDF, par Apps Script)
-- et mail groupé à LOXAM (brouillon Outlook .eml). Choix de Hugo du 2026-10-29.
-- ot_fiches.documents = { genere_le, dossier, fichiers: [{ type: loxam|sonotrad|pdf, nom, url, id }] }

ALTER TABLE public.ot_fiches ADD COLUMN documents jsonb;

CREATE OR REPLACE FUNCTION public._ot_fiche_json(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', f.id, 'code_planning', f.code_planning, 'numero_module', f.numero_module,
    'agence', f.agence, 'type_module', f.type_module, 'commentaire', f.commentaire,
    'numero_ot', f.numero_ot, 'statut', f.statut, 'notes', f.notes, 'total_ht', f.total_ht,
    'saisi_par', f.saisi_par, 'cree_le', _stock_iso(f.cree_le), 'modifie_le', _stock_iso(f.modifie_le),
    'version', _stock_iso(f.modifie_le),
    'valide_par', f.valide_par, 'valide_le', _stock_iso(f.valide_le), 'envoye_le', _stock_iso(f.envoye_le),
    'documents', f.documents,
    'totaux', _ot_totaux(f.id),
    'lignes', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM _ot_lignes_calcul(f.id) c), '[]'::jsonb))
    FROM ot_fiches f WHERE f.id = p_id;
$function$;

CREATE OR REPLACE FUNCTION public.ot_fiches_liste(p_statuts text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'code_planning', f.code_planning, 'numero_module', f.numero_module,
      'agence', f.agence, 'type_module', f.type_module, 'numero_ot', f.numero_ot, 'statut', f.statut,
      'commentaire', f.commentaire,
      'total_ht', coalesce(f.total_ht, (_ot_totaux(f.id)->>'total')::numeric),
      'saisi_par', f.saisi_par, 'cree_le', _stock_iso(f.cree_le), 'modifie_le', _stock_iso(f.modifie_le),
      'valide_le', _stock_iso(f.valide_le), 'envoye_le', _stock_iso(f.envoye_le),
      'documents', f.documents,
      'nb_lignes', (SELECT count(*) FROM ot_lignes l WHERE l.fiche_id = f.id AND coalesce(l.quantite, 0) > 0))
      ORDER BY f.modifie_le DESC, f.id DESC), '[]'::jsonb)
    FROM ot_fiches f
   WHERE CASE WHEN coalesce(array_length(p_statuts, 1), 0) = 0 THEN f.statut <> 'annulee'
              ELSE f.statut = ANY (p_statuts) END;
$function$;

-- Enregistre les liens des documents d'une fiche (appelée par Apps Script après la création des fichiers).
-- Ne touche pas à modifie_le : ce n'est pas une modification du contenu de la fiche.
CREATE FUNCTION public.ot_fiche_documents_noter(p_id bigint, p_documents jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE ot_fiches SET documents = p_documents WHERE id = p_id
  RETURNING jsonb_build_object('ok', true);
$function$;

REVOKE ALL ON FUNCTION public.ot_fiche_documents_noter(bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ot_fiche_documents_noter(bigint, jsonb) TO service_role;
