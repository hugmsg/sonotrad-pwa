-- Stock : chaque mouvement renvoyé porte son id ; une saisie renvoie les mouvements créés ;
-- annulation d'une opération par ids exacts, avec trace (stock_mouvements_supprimes).

CREATE OR REPLACE FUNCTION public._stock_mouvement_json(m stock_mouvements)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('id', m.id, 'date', _stock_iso(m.date), 'ref', m.ref, 'type', m.type,
                            'qty', m.quantite, 'user', m.utilisateur, 'note', m.note);
$function$;

CREATE OR REPLACE FUNCTION public.stock_ajouter(p_type text, p_user text, p_note text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type text := btrim(coalesce(p_type, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_date timestamptz := now();
  v_op   uuid := gen_random_uuid();
  v_n    integer;
BEGIN
  IF v_type NOT IN ('entrée', 'sortie', 'inventaire') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Type invalide : ' || v_type);
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Aucun article dans le batch');
  END IF;

  WITH lignes AS (
    SELECT btrim(coalesce(i->>'ref', '')) AS ref, _stock_nombre(i->'qty') AS qty,
           v_note || CASE WHEN coalesce(i->>'note', '') <> ''
                          THEN CASE WHEN v_note <> '' THEN ' · ' ELSE '' END || (i->>'note') ELSE '' END AS note,
           n
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(i, n)
  ), ok AS (
    INSERT INTO stock_mouvements (date, ref, type, quantite, utilisateur, note, operation)
    SELECT v_date, l.ref, v_type, l.qty, btrim(coalesce(p_user, '')), l.note, v_op
      FROM lignes l
     WHERE l.ref <> '' AND CASE WHEN v_type = 'inventaire' THEN l.qty >= 0 ELSE l.qty > 0 END
     ORDER BY l.n
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM ok;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Aucun mouvement valide');
  END IF;
  RETURN jsonb_build_object('ok', true, 'count', v_n, 'type', v_type, 'date', _stock_iso(v_date),
    'mouvements', (SELECT jsonb_agg(_stock_mouvement_json(m) ORDER BY m.id)
                     FROM stock_mouvements m WHERE m.operation = v_op));
END;
$function$;

-- Annule une opération : supprime les mouvements donnés (ids exacts) et garde leur trace.
CREATE FUNCTION public.stock_annuler_operation(p_ids bigint[], p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supprimes jsonb;
BEGIN
  IF coalesce(array_length(p_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Aucun mouvement à annuler');
  END IF;
  IF (SELECT count(*) FROM stock_mouvements WHERE id = ANY (p_ids)) <> (SELECT count(DISTINCT x) FROM unnest(p_ids) x) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Opération déjà annulée ou modifiée : rechargez l''historique');
  END IF;
  WITH sup AS (
    DELETE FROM stock_mouvements WHERE id = ANY (p_ids) RETURNING *
  ), trace AS (
    INSERT INTO stock_mouvements_supprimes (mouvement, supprime_par)
    SELECT to_jsonb(s), btrim(coalesce(p_par, '')) FROM sup s ORDER BY s.id
    RETURNING mouvement
  )
  SELECT jsonb_agg(jsonb_build_object('id', (t.mouvement->>'id')::bigint, 'ref', t.mouvement->>'ref',
                                      'type', t.mouvement->>'type', 'qty', (t.mouvement->>'quantite')::numeric))
    INTO v_supprimes FROM trace t;
  RETURN jsonb_build_object('ok', true, 'count', jsonb_array_length(v_supprimes), 'supprimes', v_supprimes);
END;
$function$;

REVOKE ALL ON FUNCTION public.stock_annuler_operation(bigint[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_annuler_operation(bigint[], text) TO service_role;
