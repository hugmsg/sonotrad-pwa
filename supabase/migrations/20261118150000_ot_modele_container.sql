-- 2026-11-18 (demande de Hugo, maquette https://claude.ai/artifact/6rcWFsqcqBdYDPzxjUgx6b) :
-- fiche d'opérations « container » pour les modules LC… (références et forfaits différents).
--   * ot_fiches.modele : 'module' (par défaut, fiches existantes) ou 'container'.
--   * ot_fiche_ouvrir : type commençant par LC → fiche container ; lignes d'office L (base), P (peinture),
--     600 × 2 (plaques à souder, fourniture seule), toutes retirables ; pas d'électricité / consommables /
--     préparation module, pas de temps passé prêts. Les poses 🔧 sont converties en forfaits (voir plus bas).
--   * ot_fiche_modele : passer d'un modèle à l'autre tant que la fiche n'est pas validée. Ce qui a été saisi
--     est gardé ; une ligne d'office de l'ancien modèle n'est retirée que si elle est restée telle quelle ;
--     les lignes d'office du nouveau modèle sont ajoutées sauf si la réf. est déjà là.
--   * _ot_container_convertir : planches 212 neuves → forfait N (même quantité : MO 50 €/planche et autant de
--     planches 212 en fourniture et en stock) ; paire de battants 304234 + 304233 → forfait O,
--     304187 + 304188 → forfait S (un battant seul reste tel quel). Lignes sans montant tapé seulement.
-- Rien ne change pour les fiches module, les tarifs, les documents ni le stock (les forfaits N, O, S ont
-- déjà leurs pièces dans ot_forfait_pieces).

ALTER TABLE public.ot_fiches ADD COLUMN modele text DEFAULT 'module'::text NOT NULL;
ALTER TABLE public.ot_fiches ADD CONSTRAINT ot_fiches_modele_check CHECK ((modele = ANY (ARRAY['module'::text, 'container'::text])));

CREATE OR REPLACE FUNCTION public._ot_container_convertir(p_fiche bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_paire record;
  v_g numeric;
  v_d numeric;
  v_n numeric;
  v_ordre integer;
BEGIN
  -- Planches neuves 212 → forfait N (mêmes quantités)
  UPDATE ot_lignes l
     SET ref = 'N', libelle = coalesce((SELECT f.intitule FROM ot_forfaits f WHERE f.lettre = 'N'), 'Planche pour container')
   WHERE l.fiche_id = p_fiche AND l.ref = '212' AND NOT l.occasion AND l.mo_saisi IS NULL AND coalesce(l.quantite, 0) > 0;

  -- Paires de battants → forfait portes complètes
  FOR v_paire IN SELECT * FROM (VALUES ('304234', '304233', 'O'), ('304187', '304188', 'S')) AS x(g, d, lettre) LOOP
    SELECT coalesce(sum(quantite), 0) INTO v_g FROM ot_lignes
     WHERE fiche_id = p_fiche AND ref = v_paire.g AND NOT occasion AND mo_saisi IS NULL AND coalesce(quantite, 0) > 0;
    SELECT coalesce(sum(quantite), 0) INTO v_d FROM ot_lignes
     WHERE fiche_id = p_fiche AND ref = v_paire.d AND NOT occasion AND mo_saisi IS NULL AND coalesce(quantite, 0) > 0;
    v_n := floor(least(v_g, v_d));
    CONTINUE WHEN v_n < 1;
    SELECT min(ordre) INTO v_ordre FROM ot_lignes
     WHERE fiche_id = p_fiche AND ref IN (v_paire.g, v_paire.d) AND NOT occasion AND mo_saisi IS NULL AND coalesce(quantite, 0) > 0;
    DELETE FROM ot_lignes
     WHERE fiche_id = p_fiche AND ref IN (v_paire.g, v_paire.d) AND NOT occasion AND mo_saisi IS NULL AND coalesce(quantite, 0) > 0;
    INSERT INTO ot_lignes (fiche_id, ordre, bloc, ref, libelle, quantite, unite, origine)
    SELECT p_fiche, v_ordre, 'pieces', v_paire.lettre, coalesce(f.intitule, v_paire.lettre), v_n, 'u', 'atelier'
      FROM (SELECT 1) s LEFT JOIN ot_forfaits f ON f.lettre = v_paire.lettre;
    -- Battant(s) en plus de la paire : gardés tels quels
    INSERT INTO ot_lignes (fiche_id, ordre, bloc, ref, libelle, quantite, unite, origine)
    SELECT p_fiche, v_ordre, 'pieces', x.ref, coalesce(r.description, x.ref), x.reste, 'u', 'atelier'
      FROM (VALUES (v_paire.g, v_g - v_n), (v_paire.d, v_d - v_n)) AS x(ref, reste)
      LEFT JOIN ot_references r ON r.ref = x.ref
     WHERE x.reste > 0;
  END LOOP;
END;
$function$;

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
    'modele', f.modele,
    'saisi_par', f.saisi_par, 'cree_le', _stock_iso(f.cree_le), 'modifie_le', _stock_iso(f.modifie_le),
    'version', _stock_iso(f.modifie_le),
    'valide_par', f.valide_par, 'valide_le', _stock_iso(f.valide_le), 'envoye_le', _stock_iso(f.envoye_le),
    'stock_le', _stock_iso(f.stock_le),
    'documents', f.documents,
    'totaux', _ot_totaux(f.id),
    'lignes', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM _ot_lignes_calcul(f.id) c), '[]'::jsonb))
    FROM ot_fiches f WHERE f.id = p_id;
$function$;

-- Lignes d'office d'un modèle, ajoutées en fin de fiche si la réf. n'y est pas déjà.
CREATE OR REPLACE FUNCTION public._ot_fiche_office(p_fiche bigint, p_modele text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base integer;
BEGIN
  SELECT coalesce(max(ordre), 0) INTO v_base FROM ot_lignes WHERE fiche_id = p_fiche;
  IF p_modele = 'container' THEN
    INSERT INTO ot_lignes (fiche_id, ordre, bloc, ref, libelle, quantite, unite, origine)
    SELECT p_fiche, v_base + o.n, 'pieces', o.ref, coalesce(f.intitule, r.description, o.ref), o.q, 'u', 'office'
      FROM (VALUES (1, 'L', 1), (2, 'P', 1), (3, '600', 2)) AS o(n, ref, q)
      LEFT JOIN ot_forfaits f ON f.lettre = o.ref
      LEFT JOIN ot_references r ON r.ref = o.ref
     WHERE NOT EXISTS (SELECT 1 FROM ot_lignes l WHERE l.fiche_id = p_fiche AND l.ref = o.ref);
  ELSE
    INSERT INTO ot_lignes (fiche_id, ordre, bloc, ref, libelle, quantite, unite, origine)
    SELECT p_fiche, v_base + o.n, 'diverses', o.ref, coalesce(f.intitule, r.description, o.ref), 1, 'u', 'office'
      FROM (VALUES (1, 'E'), (2, 'SON-0074'), (3, 'SON-0072')) AS o(n, ref)
      LEFT JOIN ot_forfaits f ON f.lettre = o.ref
      LEFT JOIN ot_references r ON r.ref = o.ref
     WHERE NOT EXISTS (SELECT 1 FROM ot_lignes l WHERE l.fiche_id = p_fiche AND l.ref = o.ref);
    -- Temps passé fréquents, prêts à remplir (sans quantité)
    INSERT INTO ot_lignes (fiche_id, ordre, bloc, ref, libelle, quantite, unite, origine)
    SELECT p_fiche, v_base + o.n, 'travaux', o.ref, o.lib, NULL, o.unite, 'atelier'
      FROM (VALUES (4, 'SON-0101', 'Enlever silicone et goudron supplémentaire', 'min'),
                   (5, 'SON-0102', 'Coupe panneaux', 'h')) AS o(n, ref, lib, unite)
     WHERE NOT EXISTS (SELECT 1 FROM ot_lignes l WHERE l.fiche_id = p_fiche AND l.ref = o.ref);
  END IF;
END;
$function$;

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
   WHERE code_planning = v_code AND statut IN ('brouillon', 'a_valider', 'validee')
   ORDER BY cree_le DESC LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.ot_fiche_modele(p_id bigint, p_modele text, p_par text, p_version text, p_admin boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_f ot_fiches;
BEGIN
  IF p_modele NOT IN ('module', 'container') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Modèle inconnu');
  END IF;
  SELECT * INTO v_f FROM ot_fiches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Fiche introuvable');
  END IF;
  IF _stock_iso(v_f.modifie_le) IS DISTINCT FROM p_version THEN
    RETURN jsonb_build_object('ok', false, 'conflit', true,
                              'message', 'La fiche a été modifiée par ailleurs : rechargez-la');
  END IF;
  IF NOT (v_f.statut = 'brouillon' OR (v_f.statut = 'a_valider' AND p_admin)) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Fiche non modifiable (' || v_f.statut || ')');
  END IF;
  IF v_f.modele = p_modele THEN
    RETURN _ot_fiche_json(p_id) || jsonb_build_object('ok', true);
  END IF;

  -- Lignes d'office de l'ancien modèle restées telles quelles (ou mises à zéro) ; lignes prêtes restées vides.
  IF v_f.modele = 'module' THEN
    DELETE FROM ot_lignes WHERE fiche_id = p_id AND origine = 'office' AND mo_saisi IS NULL
       AND ref IN ('E', 'SON-0074', 'SON-0072') AND (quantite IS NULL OR quantite IN (0, 1));
    DELETE FROM ot_lignes WHERE fiche_id = p_id AND bloc = 'travaux' AND quantite IS NULL
       AND ref IN ('SON-0101', 'SON-0102');
  ELSE
    DELETE FROM ot_lignes WHERE fiche_id = p_id AND origine = 'office' AND mo_saisi IS NULL
       AND ((ref IN ('L', 'P') AND (quantite IS NULL OR quantite IN (0, 1)))
         OR (ref = '600' AND (quantite IS NULL OR quantite IN (0, 2))));
  END IF;

  PERFORM _ot_fiche_office(p_id, p_modele);
  IF p_modele = 'container' THEN
    PERFORM _ot_container_convertir(p_id);
  END IF;

  UPDATE ot_fiches SET modele = p_modele, modifie_le = clock_timestamp() WHERE id = p_id;
  RETURN _ot_fiche_json(p_id) || jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public._ot_container_convertir(p_fiche bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ot_container_convertir(p_fiche bigint) TO service_role;
REVOKE ALL ON FUNCTION public._ot_fiche_office(p_fiche bigint, p_modele text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ot_fiche_office(p_fiche bigint, p_modele text) TO service_role;
REVOKE ALL ON FUNCTION public.ot_fiche_modele(p_id bigint, p_modele text, p_par text, p_version text, p_admin boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ot_fiche_modele(p_id bigint, p_modele text, p_par text, p_version text, p_admin boolean) TO service_role;
