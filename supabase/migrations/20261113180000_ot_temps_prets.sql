-- 2026-11-13 (demande de Hugo) : deux lignes « Temps passé » prêtes à remplir sur chaque nouvelle fiche,
-- SANS quantité : elles ne comptent pas et n'apparaissent pas dans les documents tant qu'elles restent vides.
--   Enlever silicone et goudron supplémentaire  (min → SON-0101)
--   Coupe panneaux                               (h   → SON-0102)
-- Origine « atelier » : supprimables comme n'importe quelle ligne saisie.
CREATE OR REPLACE FUNCTION public.ot_fiche_ouvrir(p_code text, p_module jsonb, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_id   bigint;
BEGIN
  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Code planning manquant');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ot_fiche:' || v_code));

  SELECT id INTO v_id FROM ot_fiches
   WHERE code_planning = v_code AND statut IN ('brouillon', 'a_valider', 'validee')
   ORDER BY cree_le DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN _ot_fiche_json(v_id) || jsonb_build_object('ok', true, 'existante', true);
  END IF;

  INSERT INTO ot_fiches (code_planning, numero_module, agence, type_module, commentaire, saisi_par)
  VALUES (v_code, btrim(coalesce(p_module->>'numero_module', '')), btrim(coalesce(p_module->>'agence', '')),
          btrim(coalesce(p_module->>'type_module', '')), btrim(coalesce(p_module->>'commentaire', '')),
          btrim(coalesce(p_par, '')))
  RETURNING id INTO v_id;

  -- Lignes d'office (modèle « OPERATIONS (2) std » de la matrice) : le bureau retire ce qui ne s'applique pas.
  INSERT INTO ot_lignes (fiche_id, ordre, bloc, ref, libelle, quantite, unite, origine)
  SELECT v_id, o.ordre, 'diverses', o.ref,
         coalesce(f.intitule, r.description, o.ref), 1, 'u', 'office'
    FROM (VALUES (1000, 'E'), (1001, 'SON-0074'), (1002, 'SON-0072')) AS o(ordre, ref)
    LEFT JOIN ot_forfaits f ON f.lettre = o.ref
    LEFT JOIN ot_references r ON r.ref = o.ref;

  -- Temps passé fréquents, prêts à remplir (sans quantité).
  INSERT INTO ot_lignes (fiche_id, ordre, bloc, ref, libelle, quantite, unite, origine)
  VALUES (v_id, 2000, 'travaux', 'SON-0101', 'Enlever silicone et goudron supplémentaire', NULL, 'min', 'atelier'),
         (v_id, 2001, 'travaux', 'SON-0102', 'Coupe panneaux', NULL, 'h', 'atelier');

  -- Poses 🔧 déjà enregistrées dans le stock pour ce code planning.
  INSERT INTO ot_lignes (fiche_id, ordre, bloc, ref, libelle, quantite, unite, origine)
  SELECT v_id, (row_number() OVER (ORDER BY min(m.date), m.ref))::integer, 'pieces', m.ref,
         coalesce(nullif(max(r.description), ''), nullif(max(a.description), ''), m.ref),
         sum(m.quantite), 'u', 'atelier'
    FROM stock_mouvements m
    LEFT JOIN ot_references r ON r.ref = m.ref
    LEFT JOIN stock_articles a ON a.ref = m.ref
   WHERE m.type = 'sortie' AND m.note ~ ('^\[Pose ' || v_code || '\]')
   GROUP BY m.ref
  HAVING sum(m.quantite) > 0;

  RETURN _ot_fiche_json(v_id) || jsonb_build_object('ok', true, 'existante', false);
END;
$function$;
