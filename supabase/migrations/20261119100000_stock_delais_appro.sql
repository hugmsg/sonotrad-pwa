-- Stock Pidem — délais d'approvisionnement (2026-11-19) : un délai (jours) par fournisseur, dérogation possible
-- par référence. Sert aux prévisions de la PWA : « à commander avant » = date de rupture prévue − délai.
-- Appelées uniquement par Apps Script (clé secrète), comme le reste du stock.

ALTER TABLE public.stock_articles
  ADD COLUMN delai_appro integer CHECK (delai_appro BETWEEN 0 AND 365);

CREATE TABLE public.stock_fournisseurs (
  fournisseur  text PRIMARY KEY CHECK (btrim(fournisseur) <> ''),
  delai_appro  integer NOT NULL CHECK (delai_appro BETWEEN 0 AND 365),
  date_modif   date NOT NULL DEFAULT current_date
);
ALTER TABLE public.stock_fournisseurs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_fournisseurs FROM PUBLIC, anon, authenticated;

-- Catalogue : + delaiRef (dérogation), delaiFourn (délai du fournisseur), delai (celui qui s'applique).
CREATE OR REPLACE FUNCTION public.stock_catalogue()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH tout AS (
    SELECT a.*, CASE WHEN e.ref IS NULL THEN NULL
                     WHEN e.inv_qty IS NOT NULL THEN e.inv_qty + e.delta
                     ELSE e.delta END AS qte,
           f.delai_appro AS delai_fourn
      FROM stock_articles a LEFT JOIN _stock_etat() e ON e.ref = a.ref
      LEFT JOIN stock_fournisseurs f ON f.fournisseur = btrim(a.fournisseur)
  ), lignes AS (
    SELECT * FROM tout WHERE actif OR coalesce(qte, 0) <> 0
  )
  SELECT jsonb_build_object(
    'data', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'ref', l.ref, 'description', l.description, 'famille', l.famille,
        'fournisseur', l.fournisseur, 'refFourn', l.ref_fourn,
        'prixHT', nullif(l.prix_ht, 0), 'qte', l.qte, 'seuil', l.seuil,
        'delaiRef', l.delai_appro, 'delaiFourn', l.delai_fourn, 'delai', coalesce(l.delai_appro, l.delai_fourn),
        'stockStatus', CASE WHEN l.qte IS NOT NULL AND l.seuil IS NOT NULL
                            THEN CASE WHEN l.qte >= l.seuil THEN 'ok' ELSE 'low' END
                            WHEN l.qte IS NOT NULL THEN 'ok' ELSE 'unknown' END)
        || CASE WHEN l.actif THEN '{}'::jsonb ELSE '{"retiree": true}'::jsonb END
        ORDER BY l.actif DESC, l.ordre) FROM lignes l), '[]'::jsonb),
    'count', (SELECT count(*) FROM lignes),
    'familles', coalesce((SELECT jsonb_agg(f ORDER BY f COLLATE "C")
                            FROM (SELECT DISTINCT famille AS f FROM lignes WHERE famille <> '') x), '[]'::jsonb));
$function$;

-- action save_stock_delai : dérogation d'une réf. (NULL = reprend le délai du fournisseur)
CREATE FUNCTION public.stock_definir_delai(p_ref text, p_delai integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_delai IS NOT NULL AND (p_delai < 0 OR p_delai > 365) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Délai invalide (0 à 365 jours)');
  END IF;
  UPDATE stock_articles SET delai_appro = p_delai, date_modif = current_date WHERE ref = btrim(coalesce(p_ref, ''));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Référence introuvable : ' || btrim(coalesce(p_ref, '')));
  END IF;
  RETURN jsonb_build_object('ok', true, 'ref', btrim(p_ref), 'delai', p_delai);
END;
$function$;

-- action save_fournisseur_delai : délai d'un fournisseur (NULL = supprimé)
CREATE FUNCTION public.stock_definir_delai_fournisseur(p_fournisseur text, p_delai integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_f text := btrim(coalesce(p_fournisseur, ''));
BEGIN
  IF v_f = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Fournisseur manquant');
  END IF;
  IF p_delai IS NULL THEN
    DELETE FROM stock_fournisseurs WHERE fournisseur = v_f;
  ELSIF p_delai < 0 OR p_delai > 365 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Délai invalide (0 à 365 jours)');
  ELSE
    INSERT INTO stock_fournisseurs (fournisseur, delai_appro) VALUES (v_f, p_delai)
    ON CONFLICT (fournisseur) DO UPDATE SET delai_appro = EXCLUDED.delai_appro, date_modif = current_date;
  END IF;
  RETURN jsonb_build_object('ok', true, 'fournisseur', v_f, 'delai', p_delai);
END;
$function$;

REVOKE ALL ON FUNCTION public.stock_definir_delai(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_definir_delai(text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.stock_definir_delai_fournisseur(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_definir_delai_fournisseur(text, integer) TO service_role;
