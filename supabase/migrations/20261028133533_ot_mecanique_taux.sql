-- Fiches d'opérations : la MO suit le taux horaire (mécanique de la matrice Excel).
-- Une seule source : le paramètre taux_horaire (et taux_base = 35, rouage du calcul).
--   mode temps  : base = temps (min) × taux_base ÷ 60, arrondie à l'€ sup. ; MO = base × taux_horaire ÷ taux_base, arrondie au 0,50 sup.
--   mode base   : MO = montant de base × taux_horaire ÷ taux_base, arrondie au 0,50 sup.
--   mode heure  : MO = taux_horaire (SON-0102) ; mode minute : MO = taux_horaire ÷ 60 (SON-0101)
--   mode impose : prix noté en dur, ne suit pas le taux (à revoir à chaque hausse)
--   mode NULL   : pas de main-d'œuvre (pièce seule, sanitaire refacturé en pièces)
-- Forfaits A–S : montant de base, suivent le taux comme le mode base.
-- La colonne mo reste la MO en vigueur (lue par le calcul des fiches) : elle est recalculée ici.

ALTER TABLE public.ot_references ADD COLUMN mode text
  CHECK (mode IN ('temps', 'base', 'heure', 'minute', 'impose'));
ALTER TABLE public.ot_forfaits ADD COLUMN mo_base numeric;

-- Arrondi au 0,50 supérieur (tolérance pour les bases non entières des forfaits).
CREATE FUNCTION public._ot_arrondi_sup(x numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT round(ceil(x * 2 - 0.000001) / 2, 2);
$function$;

-- MO calculée d'une réf. pour un taux donné (NULL pour impose / sans MO : la valeur reste celle stockée).
CREATE FUNCTION public._ot_mo_calculee(p_mode text, p_temps numeric, p_base numeric, p_taux numeric, p_taux_base numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE p_mode
    WHEN 'temps'  THEN _ot_arrondi_sup(ceil(p_temps * p_taux_base / 60) * p_taux / p_taux_base)
    WHEN 'base'   THEN _ot_arrondi_sup(p_base * p_taux / p_taux_base)
    WHEN 'heure'  THEN p_taux
    WHEN 'minute' THEN round(p_taux / 60, 4)
  END;
$function$;

-- Classement des réf. existantes : seules celles qui suivent déjà exactement la règle passent en calcul.
UPDATE public.ot_references SET mode = CASE
    WHEN ref = 'SON-0102' THEN 'heure'
    WHEN ref = 'SON-0101' THEN 'minute'
    WHEN temps_min > 0 AND mo = _ot_arrondi_sup(ceil(temps_min * 35 / 60) * 1.2) THEN 'temps'
    WHEN coalesce(temps_min, 0) = 0 AND mo_base > 0 AND mo = _ot_arrondi_sup(mo_base * 1.2) THEN 'base'
    WHEN mo > 0 THEN 'impose'
  END;
UPDATE public.ot_references SET mo_base = ceil(temps_min * 35 / 60) WHERE mode = 'temps';
UPDATE public.ot_forfaits SET mo_base = mo * 35 / 42;

-- Recalcule la MO en vigueur de toutes les réf. et forfaits qui suivent le taux. Renvoie le nombre de lignes changées.
CREATE FUNCTION public._ot_recalculer_tarifs()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t  numeric := _ot_parametre('taux_horaire');
  v_tb numeric := _ot_parametre('taux_base');
  v_n1 integer;
  v_n2 integer;
BEGIN
  UPDATE ot_references r SET mo = c.mo, mo_base = CASE WHEN r.mode = 'temps' THEN ceil(r.temps_min * v_tb / 60) ELSE r.mo_base END,
         modifie_le = now()
    FROM (SELECT ref, _ot_mo_calculee(mode, temps_min, mo_base, v_t, v_tb) AS mo FROM ot_references
           WHERE mode IN ('temps', 'base', 'heure', 'minute')) c
   WHERE r.ref = c.ref AND r.mo IS DISTINCT FROM c.mo;
  GET DIAGNOSTICS v_n1 = ROW_COUNT;
  UPDATE ot_forfaits SET mo = _ot_arrondi_sup(mo_base * v_t / v_tb), modifie_le = now()
   WHERE mo_base IS NOT NULL AND mo IS DISTINCT FROM _ot_arrondi_sup(mo_base * v_t / v_tb);
  GET DIAGNOSTICS v_n2 = ROW_COUNT;
  RETURN v_n1 + v_n2;
END;
$function$;

-- Aperçu d'un changement de taux : ce qui bouge, et les prix imposés à revoir.
CREATE FUNCTION public.ot_taux_apercu(p_taux numeric)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH p AS (SELECT _ot_parametre('taux_horaire') AS t, _ot_parametre('taux_base') AS tb),
  ch AS (
    SELECT 'reference' AS type, r.ref AS cle, r.description, r.mo AS avant,
           _ot_mo_calculee(r.mode, r.temps_min, r.mo_base, p_taux, p.tb) AS apres
      FROM ot_references r, p WHERE r.mode IN ('temps', 'base', 'heure', 'minute')
    UNION ALL
    SELECT 'forfait', f.lettre, f.intitule, f.mo, _ot_arrondi_sup(f.mo_base * p_taux / p.tb)
      FROM ot_forfaits f, p WHERE f.mo_base IS NOT NULL
  )
  SELECT jsonb_build_object(
    'taux_actuel', (SELECT t FROM p), 'taux_nouveau', p_taux,
    'nb', (SELECT count(*) FROM ch WHERE avant IS DISTINCT FROM apres),
    'changements', coalesce((SELECT jsonb_agg(jsonb_build_object('type', type, 'cle', cle, 'description', description,
                     'avant', avant, 'apres', apres) ORDER BY type DESC, cle) FROM ch WHERE avant IS DISTINCT FROM apres), '[]'::jsonb),
    'imposes', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', ref, 'description', description, 'mo', mo, 'temps_min', temps_min)
                     ORDER BY ref) FROM ot_references WHERE mode = 'impose'), '[]'::jsonb));
$function$;

-- Tarifs : mode et montant de base en plus.
CREATE OR REPLACE FUNCTION public.ot_tarifs()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'parametres', (SELECT jsonb_object_agg(cle, valeur) FROM ot_parametres),
    'forfaits', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'lettre', f.lettre, 'intitule', f.intitule, 'mo', f.mo, 'mo_base', f.mo_base, 'prix_piece', f.prix_piece,
        'pieces', coalesce((SELECT jsonb_agg(jsonb_build_object('ref', p.ref, 'qte', p.qte) ORDER BY p.ref)
                              FROM ot_forfait_pieces p WHERE p.lettre = f.lettre), '[]'::jsonb))
        ORDER BY f.lettre) FROM ot_forfaits f), '[]'::jsonb),
    'references', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'ref', r.ref, 'description', r.description, 'categorie', r.categorie, 'unite', r.unite,
        'op_code', r.op_code, 'mode', r.mode, 'temps_min', r.temps_min, 'mo_base', r.mo_base, 'mo', r.mo,
        'prix_piece', r.prix_piece, 'mo_plafond', r.mo_plafond) ORDER BY r.ref) FROM ot_references r), '[]'::jsonb));
$function$;

-- Modification d'un tarif (trace dans ot_tarifs_journal) :
--   reference : {description?, categorie?, unite?, mode?, temps_min?, mo_base?, mo? (prix imposé), prix_piece?, mo_plafond?}
--               la MO des modes calculés est recalculée ; mode NULL = pas de MO
--   forfait   : {intitule?, mo? (prix au taux actuel → base déduite exactement), mo_base?, prix_piece?}
--   parametre : {valeur} — taux_horaire / taux_base : toutes les MO calculées sont recalculées
CREATE OR REPLACE FUNCTION public.ot_tarif_modifier(p_type text, p_cle text, p_valeurs jsonb, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cle   text := btrim(coalesce(p_cle, ''));
  v       jsonb := coalesce(p_valeurs, '{}'::jsonb);
  v_avant jsonb;
  v_apres jsonb;
  v_n     integer := 0;
BEGIN
  IF v_cle = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Clé manquante');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(v) e
              WHERE e.key IN ('mo', 'mo_base', 'temps_min', 'prix_piece', 'mo_plafond', 'valeur')
                AND (jsonb_typeof(e.value) NOT IN ('number', 'null')
                     OR (jsonb_typeof(e.value) = 'number' AND (e.value #>> '{}')::numeric < 0))) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Montant invalide');
  END IF;
  IF v ? 'mode' AND jsonb_typeof(v->'mode') <> 'null'
     AND v->>'mode' NOT IN ('temps', 'base', 'heure', 'minute', 'impose') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Mode inconnu');
  END IF;

  IF p_type = 'reference' THEN
    SELECT to_jsonb(r) INTO v_avant FROM ot_references r WHERE r.ref = v_cle;
    INSERT INTO ot_references (ref, description)
    VALUES (v_cle, coalesce(v->>'description', (SELECT description FROM stock_articles WHERE ref = v_cle), ''))
    ON CONFLICT (ref) DO NOTHING;
    UPDATE ot_references SET
      description = CASE WHEN v ? 'description' THEN btrim(coalesce(v->>'description', '')) ELSE description END,
      categorie   = CASE WHEN v ? 'categorie' THEN btrim(coalesce(v->>'categorie', '')) ELSE categorie END,
      unite       = CASE WHEN v ? 'unite' THEN coalesce(nullif(btrim(v->>'unite'), ''), 'unité') ELSE unite END,
      mode        = CASE WHEN v ? 'mode' THEN v->>'mode' ELSE mode END,
      temps_min   = CASE WHEN v ? 'temps_min' THEN (v->>'temps_min')::numeric ELSE temps_min END,
      mo_base     = CASE WHEN v ? 'mo_base' THEN (v->>'mo_base')::numeric ELSE mo_base END,
      mo          = CASE WHEN v ? 'mo' THEN (v->>'mo')::numeric ELSE mo END,
      prix_piece  = CASE WHEN v ? 'prix_piece' THEN (v->>'prix_piece')::numeric ELSE prix_piece END,
      mo_plafond  = CASE WHEN v ? 'mo_plafond' THEN (v->>'mo_plafond')::numeric ELSE mo_plafond END,
      modifie_le  = now()
     WHERE ref = v_cle;
    -- Cohérence du mode choisi : ce qu'il faut pour calculer, sinon refus (tout est annulé).
    IF EXISTS (SELECT 1 FROM ot_references WHERE ref = v_cle AND (
         (mode = 'temps' AND NOT coalesce(temps_min, 0) > 0) OR
         (mode = 'base'  AND mo_base IS NULL) OR
         (mode = 'impose' AND mo IS NULL))) THEN
      RAISE EXCEPTION USING MESSAGE = 'Mode incomplet : indiquez le temps, le montant de base ou le prix';
    END IF;
    UPDATE ot_references SET
      mo_base = CASE WHEN mode = 'temps' THEN ceil(temps_min * _ot_parametre('taux_base') / 60) ELSE mo_base END,
      mo = CASE WHEN mode IN ('temps', 'base', 'heure', 'minute')
                THEN _ot_mo_calculee(mode, temps_min, mo_base, _ot_parametre('taux_horaire'), _ot_parametre('taux_base'))
                WHEN mode IS NULL THEN NULL ELSE mo END
     WHERE ref = v_cle;
    SELECT to_jsonb(r) INTO v_apres FROM ot_references r WHERE r.ref = v_cle;
  ELSIF p_type = 'forfait' THEN
    SELECT to_jsonb(f) INTO v_avant FROM ot_forfaits f WHERE f.lettre = v_cle;
    IF v_avant IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Forfait inconnu : ' || v_cle);
    END IF;
    UPDATE ot_forfaits SET
      intitule   = CASE WHEN v ? 'intitule' AND btrim(coalesce(v->>'intitule', '')) <> '' THEN btrim(v->>'intitule') ELSE intitule END,
      mo_base    = CASE WHEN v ? 'mo' THEN coalesce((v->>'mo')::numeric, 0) * _ot_parametre('taux_base') / _ot_parametre('taux_horaire')
                        WHEN v ? 'mo_base' THEN coalesce((v->>'mo_base')::numeric, 0) ELSE mo_base END,
      prix_piece = CASE WHEN v ? 'prix_piece' THEN coalesce((v->>'prix_piece')::numeric, 0) ELSE prix_piece END,
      modifie_le = now()
     WHERE lettre = v_cle;
    UPDATE ot_forfaits SET mo = _ot_arrondi_sup(mo_base * _ot_parametre('taux_horaire') / _ot_parametre('taux_base'))
     WHERE lettre = v_cle;
    SELECT to_jsonb(f) INTO v_apres FROM ot_forfaits f WHERE f.lettre = v_cle;
  ELSIF p_type = 'parametre' THEN
    SELECT to_jsonb(p) INTO v_avant FROM ot_parametres p WHERE p.cle = v_cle;
    IF v_avant IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Paramètre inconnu : ' || v_cle);
    END IF;
    IF jsonb_typeof(v->'valeur') <> 'number' OR (v->>'valeur')::numeric <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Valeur invalide');
    END IF;
    UPDATE ot_parametres SET valeur = (v->>'valeur')::numeric WHERE cle = v_cle;
    IF v_cle IN ('taux_horaire', 'taux_base') THEN
      v_n := _ot_recalculer_tarifs();
    END IF;
    SELECT to_jsonb(p) INTO v_apres FROM ot_parametres p WHERE p.cle = v_cle;
    v_apres := v_apres || jsonb_build_object('tarifs_recalcules', v_n);
  ELSE
    RETURN jsonb_build_object('ok', false, 'message', 'Type inconnu : ' || coalesce(p_type, '?'));
  END IF;

  INSERT INTO ot_tarifs_journal (par, type, cle, avant, apres)
  VALUES (btrim(coalesce(p_par, '')), p_type, v_cle, v_avant, v_apres);
  RETURN jsonb_build_object('ok', true, 'avant', v_avant, 'apres', v_apres, 'recalcules', v_n);
EXCEPTION WHEN raise_exception THEN
  RETURN jsonb_build_object('ok', false, 'message', SQLERRM);
END;
$function$;

-- ── Droits : clé secrète seulement ──────────────────────────────────────────
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    '_ot_arrondi_sup(numeric)', '_ot_mo_calculee(text, numeric, numeric, numeric, numeric)',
    '_ot_recalculer_tarifs()', 'ot_taux_apercu(numeric)', 'ot_tarifs()', 'ot_tarif_modifier(text, text, jsonb, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END;
$$;
