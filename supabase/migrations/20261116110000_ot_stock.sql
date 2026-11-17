-- 2026-11-16 (décision de Hugo du 2026-10-29, appliquée à la sortie d'essai) :
-- la sortie de stock des poses vient de la FICHE D'OPÉRATIONS du module, plus de la 🔧.
--  * Quantités à sortir = lignes avec quantité, hors occasion et hors temps passé ; un forfait donne ses pièces
--    × sa quantité ; coefficient de STOCK par réf. (101/102 = 1 lot par pose, 106 = ½ pot par pose ; ≠ coefficient
--    des documents LOXAM, en m²) ; seulement les réf. du catalogue du Stock.
--  * Déjà sorti = mouvements dont la note commence par « [Pose <code planning>] » (sorties − entrées) : poses 🔧
--    d'avant la bascule, ou bouton « Sortir du stock maintenant » de la fiche.
--  * ot_fiche_stock ne passe que la DIFFÉRENCE (sortie si manque, entrée « correction » si trop sorti) : on peut
--    l'appeler autant de fois qu'on veut, jamais de double sortie. Appelée à la validation (hors essai).

ALTER TABLE public.ot_references ADD COLUMN IF NOT EXISTS coef_stock numeric NOT NULL DEFAULT 1 CHECK (coef_stock > 0);
UPDATE public.ot_references SET coef_stock = 0.5 WHERE ref = '106';
ALTER TABLE public.ot_fiches ADD COLUMN IF NOT EXISTS stock_le timestamptz;

-- Quantités que la fiche doit avoir sorties du stock, par réf.
CREATE OR REPLACE FUNCTION public._ot_stock_cible(p_fiche bigint)
 RETURNS TABLE(ref text, quantite numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH lignes AS (
    SELECT l.ref, l.quantite FROM ot_lignes l
     WHERE l.fiche_id = p_fiche AND coalesce(l.quantite, 0) > 0 AND NOT l.occasion
       AND l.ref IS NOT NULL AND l.ref NOT IN ('SON-0100', 'SON-0101', 'SON-0102')
  ), pieces AS (
    SELECT p.ref, l.quantite * p.qte AS qte FROM lignes l JOIN ot_forfait_pieces p ON p.lettre = l.ref
    UNION ALL
    SELECT l.ref, l.quantite FROM lignes l WHERE NOT EXISTS (SELECT 1 FROM ot_forfaits f WHERE f.lettre = l.ref)
  )
  SELECT pc.ref, sum(pc.qte * coalesce(r.coef_stock, 1))
    FROM pieces pc
    JOIN stock_articles a ON a.ref = pc.ref
    LEFT JOIN ot_references r ON r.ref = pc.ref
   GROUP BY pc.ref;
$function$;

-- Met le stock à jour pour une fiche : ne passe que la différence entre la fiche et ce qui est déjà sorti.
CREATE OR REPLACE FUNCTION public.ot_fiche_stock(p_id bigint, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_f       ot_fiches;
  v_prefixe text;
  v_note    text;
  v_sorties jsonb;
  v_entrees jsonb;
  v_r1      jsonb;
  v_r2      jsonb;
BEGIN
  SELECT * INTO v_f FROM ot_fiches WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Fiche introuvable'); END IF;
  IF v_f.statut = 'annulee' THEN RETURN jsonb_build_object('ok', false, 'message', 'Fiche annulée'); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ot_stock:' || v_f.code_planning));
  v_prefixe := '[Pose ' || v_f.code_planning || ']';
  v_note := v_prefixe || ' ' || coalesce(nullif(btrim(concat_ws(' ', v_f.type_module, v_f.numero_module)), ''), v_f.code_planning)
            || ' · fiche OT ' || coalesce(v_f.numero_ot, 'n° ' || v_f.id);

  WITH cible AS (SELECT * FROM _ot_stock_cible(p_id)),
  deja AS (
    SELECT m.ref, sum(CASE m.type WHEN 'sortie' THEN m.quantite WHEN 'entrée' THEN -m.quantite ELSE 0 END) AS q
      FROM stock_mouvements m
     WHERE left(m.note, length(v_prefixe)) = v_prefixe
     GROUP BY m.ref
  ), ecart AS (
    SELECT coalesce(c.ref, d.ref) AS ref, round(coalesce(c.quantite, 0) - coalesce(d.q, 0), 3) AS e
      FROM cible c FULL JOIN deja d ON d.ref = c.ref
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('ref', ref, 'qty', e) ORDER BY ref) FILTER (WHERE e > 0), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('ref', ref, 'qty', -e) ORDER BY ref) FILTER (WHERE e < 0), '[]'::jsonb)
    INTO v_sorties, v_entrees
    FROM ecart;

  IF jsonb_array_length(v_sorties) > 0 THEN
    v_r1 := stock_ajouter('sortie', p_par, v_note, v_sorties);
    IF (v_r1->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Sortie de stock impossible : %', v_r1->>'message'; END IF;
  END IF;
  IF jsonb_array_length(v_entrees) > 0 THEN
    v_r2 := stock_ajouter('entrée', p_par, v_note || ' · correction (trop sorti)', v_entrees);
    IF (v_r2->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Retour en stock impossible : %', v_r2->>'message'; END IF;
  END IF;
  UPDATE ot_fiches SET stock_le = now() WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'sorties', v_sorties, 'entrees', v_entrees);
END;
$function$;

-- Validation hors essai : le stock est mis à jour dans la même transaction (tout ou rien).
CREATE OR REPLACE FUNCTION public.ot_fiche_statut(p_id bigint, p_statut text, p_par text, p_admin boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_f      ot_fiches;
  v_de     text;
  v_jour   text;
  v_n      integer;
  v_stock  jsonb;
BEGIN
  SELECT * INTO v_f FROM ot_fiches WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Fiche introuvable');
  END IF;
  v_de := v_f.statut;

  IF NOT ((v_de = 'brouillon' AND p_statut = 'a_valider')
       OR (v_de = 'a_valider' AND p_statut = 'brouillon')
       OR (p_admin AND v_de = 'a_valider' AND p_statut = 'validee')
       OR (p_admin AND v_de = 'validee' AND p_statut IN ('a_valider', 'envoyee'))
       OR (p_admin AND v_de <> 'envoyee' AND v_de <> 'annulee' AND p_statut = 'annulee')) THEN
    RETURN jsonb_build_object('ok', false, 'message',
                              'Passage impossible : ' || v_de || ' → ' || coalesce(p_statut, '?'));
  END IF;

  IF p_statut = 'validee' THEN
    IF NOT EXISTS (SELECT 1 FROM ot_lignes WHERE fiche_id = p_id AND coalesce(quantite, 0) > 0) THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Aucune ligne avec quantité');
    END IF;
    UPDATE ot_lignes l SET mo_unitaire = c.mo_unitaire, prix_piece_unitaire = c.prix_piece_unitaire
      FROM _ot_lignes_calcul(p_id) c WHERE c.id = l.id;
    -- Une fiche numérotée en essai reçoit un vrai numéro si elle est revalidée hors essai.
    IF v_f.numero_ot IS NULL OR (v_f.numero_ot LIKE 'ESSAI-%' AND _ot_parametre('essai') <> 1) THEN
      PERFORM pg_advisory_xact_lock(hashtext('ot_numero'));
      v_jour := to_char(now() AT TIME ZONE 'Europe/Paris', 'YYMMDD');
      IF _ot_parametre('essai') = 1 THEN
        SELECT coalesce(max(substring(numero_ot FROM '-([0-9]{4})$')::integer), 0) + 1 INTO v_n
          FROM ot_fiches WHERE numero_ot LIKE 'ESSAI-' || left(v_jour, 2) || '____-____';
        v_f.numero_ot := 'ESSAI-' || v_jour || '-' || lpad(v_n::text, 4, '0');
      ELSE
        v_f.numero_ot := v_jour || '-' || lpad(_ot_prochain_numero()::text, 4, '0');
      END IF;
    END IF;
    UPDATE ot_fiches
       SET statut = 'validee', numero_ot = v_f.numero_ot, total_ht = (_ot_totaux(p_id)->>'total')::numeric,
           valide_par = btrim(coalesce(p_par, '')), valide_le = now(), modifie_le = clock_timestamp()
     WHERE id = p_id;
    IF _ot_parametre('essai') <> 1 THEN
      v_stock := ot_fiche_stock(p_id, p_par);
    END IF;
  ELSIF v_de = 'validee' AND p_statut = 'a_valider' THEN
    UPDATE ot_lignes SET mo_unitaire = NULL, prix_piece_unitaire = NULL WHERE fiche_id = p_id;
    UPDATE ot_fiches SET statut = 'a_valider', total_ht = NULL, valide_par = NULL, valide_le = NULL,
                         modifie_le = clock_timestamp()
     WHERE id = p_id;
  ELSE
    UPDATE ot_fiches
       SET statut = p_statut, modifie_le = clock_timestamp(),
           envoye_le = CASE WHEN p_statut = 'envoyee' THEN now() ELSE envoye_le END
     WHERE id = p_id;
  END IF;
  RETURN _ot_fiche_json(p_id) || jsonb_build_object('ok', true)
         || CASE WHEN v_stock IS NOT NULL THEN jsonb_build_object('stock', v_stock) ELSE '{}'::jsonb END;
END;
$function$;

-- La fiche renvoie aussi stock_le (date de la dernière mise à jour du stock).
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
    'stock_le', _stock_iso(f.stock_le),
    'documents', f.documents,
    'totaux', _ot_totaux(f.id),
    'lignes', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM _ot_lignes_calcul(f.id) c), '[]'::jsonb))
    FROM ot_fiches f WHERE f.id = p_id;
$function$;

-- Mode de la chaîne OT (affiché dans la PWA) : essai ou non.
CREATE OR REPLACE FUNCTION public.ot_mode()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('essai', _ot_parametre('essai'));
$function$;

UPDATE public.ot_parametres
   SET libelle = 'Fiches en essai : numéro ESSAI-…, aucune sortie de stock (1 = oui, 0 = non : vrais numéros, stock sorti à la validation)'
 WHERE cle = 'essai';

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['_ot_stock_cible(bigint)', 'ot_fiche_stock(bigint, text)',
                           'ot_fiche_statut(bigint, text, text, boolean)', 'ot_mode()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
