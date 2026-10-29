-- Fiches d'opérations : ordre des lignes dans les documents OT = ordre de la feuille OPERATIONS de la matrice.
-- Ordre reconstitué à partir des 425 OT 2026 (fusion, des plus récents aux plus anciens : la matrice a reçu des
-- lignes au fil de l'année). Réf. absentes de la liste (créées depuis) : après, dans l'ordre des numéros.

ALTER TABLE public.ot_references ADD COLUMN ordre integer;
ALTER TABLE public.ot_forfaits ADD COLUMN ordre integer;

WITH o AS (SELECT ref, (n * 10)::int AS ordre FROM unnest(ARRAY[
  'L', 'M', 'Q', 'N', 'O', 'S', 'P', '304187', '304188', '304234', '304233', '2403023', '2403024', '608004',
  '2401296', '2401295', '2401294', '2401293', '600', 'SON-0068', 'SON-0067', 'K', 'J', 'E', 'A', 'C', 'F',
  '75', '162', '212', '146', '147', '149', '148', '177', '152', '216', '218', '154', '87', '88', '97',
  '237', '101', '3', '7', '12', '224', '227', '341', '220', '222', '174', '175', '176', '178', '102', '169',
  '170', '10', '450', '171', '236', '172', '165', '167', '168', '156', '155', '221', '229', '158', '200',
  '201', '256', '202', '13', '159', '157', '81', '82', '143', '93', '86', '84', '123', '150', '163', '331',
  '309', '334', '332', '230', '322', '300', '337', '353', '317', '318', '348', '355', '349', '351', '320',
  '321', '303', '350', '301', '302', '307', '304', '346', '306', '305', '324', '338', '339', '85', '385',
  '393', '374', '83', '345', '131', '132', '133', '134', '135', '130', '365', '366', '250', '500', '243',
  '359', '363', '364', '356', '106', '310', '311', '340', '354', '381', '391', '380', '375', '379', '386',
  'B10', 'B923', 'B935', 'B936', 'B938', 'B994', 'B6714', 'B6715', 'B1451', 'B6178', 'B210322', 'B210323',
  'B213160', 'SON-0002', 'SON-0065', 'SON-0049', 'SON-0028', 'SON-0030', 'SON-0066', 'SON-0054', 'SON-0052',
  'SON-0053', 'SON-0050', 'SON-0051', 'SON-0017', 'SON-0076', 'SON-0004', 'SON-0020', 'SON-0032', '394',
  'SON-0055', 'I', 'SON-0080', 'SON-0058', 'SON-0025', 'SON-0026', 'SON-0027', 'SON-0061', 'SON-0048',
  'SON-0012', 'SON-0060', 'SON-0013', 'SON-0078', 'SON-0077', 'SON-0024', 'SON-0016', '399', '388', '389',
  '390', '371', '376', '378', '377', '362', '397', '367', '238', '219', '226', 'SON-0046', 'SON-0014',
  'SON-0015', 'SON-0043', 'SON-0007', 'SON-0057', 'SON-0059', 'SON-0003', 'SON-0075', 'SON-0062',
  'SON-0063', 'SON-0079', 'SON-0018', 'SON-0006', 'SON-0064', 'SON-0005', 'SON-0011', 'SON-0000',
  'SON-0100', 'SON-0074', 'SON-0072', 'SON-0073', 'SON-0071', 'SON-0081', 'SON-0082'
]) WITH ORDINALITY AS u(ref, n))
, r AS (UPDATE public.ot_references t SET ordre = o.ordre FROM o WHERE t.ref = o.ref RETURNING 1)
UPDATE public.ot_forfaits t SET ordre = o.ordre FROM o WHERE t.lettre = o.ref;

CREATE OR REPLACE FUNCTION public.ot_fiche_documents(p_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN f.id IS NULL THEN jsonb_build_object('ok', false, 'message', 'Fiche introuvable')
  ELSE _ot_fiche_json(f.id) || jsonb_build_object(
    'lignes', coalesce((SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'description', coalesce(nullif(c.libelle, ''), fo.intitule, r.description, c.ref),
        'op_code', r.op_code, 'forfait', fo.lettre IS NOT NULL)
        -- ordre de la matrice, puis réf. numériques croissantes, puis le reste
        ORDER BY coalesce(fo.ordre, r.ordre, 1000000), (c.ref ~ '^[0-9]+$') DESC,
                 CASE WHEN c.ref ~ '^[0-9]+$' THEN c.ref::numeric END, c.ref, c.ordre, c.id)
      FROM _ot_lignes_calcul(f.id) c
      LEFT JOIN ot_forfaits fo ON fo.lettre = c.ref
      LEFT JOIN ot_references r ON r.ref = c.ref AND fo.lettre IS NULL), '[]'::jsonb),
    'fournitures', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM _ot_fournitures(f.id) x), '[]'::jsonb))
  END
  FROM (SELECT p_id AS id) q LEFT JOIN ot_fiches f ON f.id = q.id;
$function$;
