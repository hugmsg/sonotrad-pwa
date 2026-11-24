-- 2026-11-24 — ot_fiche_ouvrir : une fiche ENVOYÉE compte aussi comme la fiche du module.
-- Avant : seules brouillon / à valider / validée étaient retrouvées ; la 🔧 (Poses) d'un module dont l'OT était déjà
-- envoyé à LOXAM créait une 2e fiche (cas DIFZJR signalé par Hugo). Maintenant la fiche existante est rouverte
-- (en consultation si elle est envoyée) ; une fiche en cours reste prioritaire sur une fiche envoyée.
CREATE OR REPLACE FUNCTION public.ot_fiche_ouvrir(p_code text, p_module jsonb, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code   text := upper(btrim(coalesce(p_code, '')));
  v_type   text := btrim(coalesce(p_module->>'type_module', ''));
  v_modele text := CASE WHEN v_type ~* '^LC' THEN 'container' ELSE 'module' END;
  v_id     bigint;
BEGIN
  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Code planning manquant');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ot_fiche:' || v_code));

  SELECT id INTO v_id FROM ot_fiches
   WHERE code_planning = v_code AND statut IN ('brouillon', 'a_valider', 'validee', 'envoyee')
   ORDER BY (statut = 'envoyee'), cree_le DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN _ot_fiche_json(v_id) || jsonb_build_object('ok', true, 'existante', true);
  END IF;

  INSERT INTO ot_fiches (code_planning, numero_module, agence, type_module, commentaire, saisi_par, modele)
  VALUES (v_code, btrim(coalesce(p_module->>'numero_module', '')), btrim(coalesce(p_module->>'agence', '')),
          v_type, btrim(coalesce(p_module->>'commentaire', '')), btrim(coalesce(p_par, '')), v_modele)
  RETURNING id INTO v_id;

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

  -- Lignes d'office du modèle (le bureau retire ce qui ne s'applique pas) ; poses converties en forfaits (container).
  PERFORM _ot_fiche_office(v_id, v_modele);
  IF v_modele = 'container' THEN
    PERFORM _ot_container_convertir(v_id);
  END IF;

  RETURN _ot_fiche_json(v_id) || jsonb_build_object('ok', true, 'existante', false);
END;
$function$;
