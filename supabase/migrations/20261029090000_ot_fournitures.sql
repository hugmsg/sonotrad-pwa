-- Fiches d'opérations : fournitures déduites de la fiche (onglet « FOURNITURES » des documents OT).
-- Règle de la matrice Excel (vérifiée sur 385/425 OT 2026), corrigée sur un point à la demande de Hugo :
--   lignes avec quantité, hors pièces d'occasion et hors temps passé (SON-0100/0101/0102) ;
--   un forfait donne ses pièces (ot_forfait_pieces) × la quantité du forfait (la matrice ne multipliait pas) ;
--   quantité fournie = quantité × coefficient de fourniture de la réf. (101/102 : 15 m² par pose ; 106 : ½ pot) ;
--   coût = prix du catalogue du Stock (stock_articles.prix_ht), à défaut celui repris de la matrice.

ALTER TABLE public.ot_references ADD COLUMN coef_fourniture numeric NOT NULL DEFAULT 1 CHECK (coef_fourniture > 0);
UPDATE public.ot_references SET coef_fourniture = 15 WHERE ref IN ('101', '102');
UPDATE public.ot_references SET coef_fourniture = 0.5 WHERE ref = '106';

CREATE FUNCTION public._ot_fournitures(p_fiche bigint)
 RETURNS TABLE(ref text, description text, quantite numeric, prix_unitaire numeric, cout numeric, interne boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH lignes AS (
    SELECT l.ref, l.quantite FROM ot_lignes l
     WHERE l.fiche_id = p_fiche AND coalesce(l.quantite, 0) > 0 AND NOT l.occasion
       AND l.ref IS NOT NULL AND l.ref NOT IN ('SON-0100', 'SON-0101', 'SON-0102')
  ), pieces AS (
    SELECT p.ref, l.quantite * p.qte AS qte                      -- forfait : ses pièces × sa quantité
      FROM lignes l JOIN ot_forfait_pieces p ON p.lettre = l.ref
    UNION ALL
    SELECT l.ref, l.quantite FROM lignes l                        -- réf. ordinaire (un forfait sans pièces ne donne rien)
     WHERE NOT EXISTS (SELECT 1 FROM ot_forfaits f WHERE f.lettre = l.ref)
  ), totaux AS (
    SELECT pc.ref, sum(pc.qte * coalesce(r.coef_fourniture, 1)) AS quantite
      FROM pieces pc LEFT JOIN ot_references r ON r.ref = pc.ref
     GROUP BY pc.ref
  )
  SELECT t.ref,
         coalesce(nullif(a.description, ''), nullif(r.description, ''), t.ref),
         t.quantite,
         coalesce(a.prix_ht, r.prix_achat, 0),
         round(t.quantite * coalesce(a.prix_ht, r.prix_achat, 0), 2),
         t.ref LIKE 'SON-%'
    FROM totaux t
    LEFT JOIN stock_articles a ON a.ref = t.ref
    LEFT JOIN ot_references r ON r.ref = t.ref
   -- Ordre de la matrice : réf. Pidem croissantes (numériques d'abord), puis les codes SON.
   ORDER BY t.ref LIKE 'SON-%', (t.ref ~ '^[0-9]+$') DESC,
            CASE WHEN t.ref ~ '^[0-9]+$' THEN t.ref::numeric END, t.ref;
$function$;

REVOKE ALL ON FUNCTION public._ot_fournitures(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ot_fournitures(bigint) TO service_role;
