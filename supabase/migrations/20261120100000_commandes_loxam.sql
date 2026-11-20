-- 2026-11-20 (demande de Hugo) : bons de commande LOXAM (commandes de reconditionnement reçues après l'OT).
-- La PWA lit les PDF (texte ou OCR), les contrôle (module du Planning, agence, montant de l'OT), puis masterfile
-- les enregistre ici (actions cde_*, admins), range le PDF sur Drive et écrit le n° dans le Planning (colonne U).
-- Sert ensuite à pré-remplir les LV et à produire le fichier d'import EBP (format du lecteur de commandes, v6).
-- Accès : clé secrète seulement (masterfile), comme les fiches d'opérations.

CREATE TABLE public.commandes_loxam (
  id               bigserial PRIMARY KEY,
  numero           text NOT NULL,                 -- n° de commande LOXAM (dédoublé)
  date_commande    date,
  quantite         numeric(10,2),
  libelle          text,                          -- « SOUS ENSEMBLE IMMOBILISE MATER »
  total_ht         numeric(12,2),
  affaire          text,                          -- « 2026-098 »
  ref_module       text,                          -- 1re ligne des commentaires = n° du module chez LOXAM
  destination      text,                          -- « ARNAGE 1043 » (après POUR)
  client           text,                          -- code agence (4 chiffres)
  adresse          text,                          -- « Expédier l'article ci-dessus à » (lignes séparées par « | »)
  date_souhaitee   date,
  code_planning    text,                          -- code SONOTRAD du module (colonne B du Planning)
  ot_numero        text,                          -- OT comparé au moment de l'enregistrement
  ot_total         numeric(12,2),
  verif_prix       text,                          -- OK / ECART PDF=… OT=… / SANS OT / CODE NON TROUVE
  source           text NOT NULL DEFAULT 'texte' CHECK (source IN ('texte', 'ocr', 'manuel')),
  pdf              jsonb,                         -- { id, url, nom } sur Drive
  statut           text NOT NULL DEFAULT 'validee' CHECK (statut IN ('validee', 'annulee')),
  motif_annulation text,
  saisi_par        text,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  annule_par       text,
  annule_le        timestamptz,
  ebp_le           timestamptz,                   -- exportée dans un fichier d'import EBP
  ebp_par          text
);

CREATE UNIQUE INDEX commandes_loxam_numero_actif ON public.commandes_loxam (numero) WHERE statut <> 'annulee';
CREATE INDEX commandes_loxam_code ON public.commandes_loxam (upper(code_planning));

ALTER TABLE public.commandes_loxam ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commandes_loxam FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.commandes_loxam_id_seq FROM PUBLIC, anon, authenticated;

-- OT de référence d'un module : fiche PWA validée ou envoyée, sinon historique (matrice Excel + reports),
-- sinon fiche PWA pas encore validée. Par code SONOTRAD s'il est connu, sinon par n° de module (dernier passage).
CREATE OR REPLACE FUNCTION public._commande_ot(p_code text, p_ref text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT x.j FROM (
    SELECT 1 AS rang, f.valide_le AS quand,
           jsonb_build_object('numero', f.numero_ot, 'total', f.total_ht, 'code', upper(btrim(f.code_planning)),
                              'source', 'fiche', 'statut', f.statut) AS j
      FROM ot_fiches f
     WHERE f.statut IN ('validee', 'envoyee')
       AND ((p_code <> '' AND upper(btrim(f.code_planning)) = upper(p_code))
         OR (p_code = '' AND p_ref <> '' AND upper(btrim(f.numero_module)) = upper(p_ref)))
    UNION ALL
    SELECT 2, h.date_fin::timestamptz,
           jsonb_build_object('numero', h.numero, 'total', h.total, 'code', upper(btrim(h.code_planning)),
                              'source', 'historique', 'statut', 'historique')
      FROM ot_historique h
     WHERE (p_code <> '' AND upper(btrim(h.code_planning)) = upper(p_code))
        OR (p_code = '' AND p_ref <> '' AND upper(btrim(h.numero_module)) = upper(p_ref))
    UNION ALL
    SELECT 3, f.modifie_le,
           jsonb_build_object('numero', f.numero_ot, 'total', f.total_ht, 'code', upper(btrim(f.code_planning)),
                              'source', 'fiche', 'statut', f.statut)
      FROM ot_fiches f
     WHERE f.statut = 'a_valider'
       AND ((p_code <> '' AND upper(btrim(f.code_planning)) = upper(p_code))
         OR (p_code = '' AND p_ref <> '' AND upper(btrim(f.numero_module)) = upper(p_ref)))
  ) x
  ORDER BY x.rang, x.quand DESC NULLS LAST
  LIMIT 1;
$function$;

-- Contrôle avant enregistrement. p_lignes = [{numero, ref_module, code}] → [{numero, deja, autres, ot}]
--   deja   : commande déjà enregistrée avec ce n° ;
--   autres : autres commandes actives sur le même module (code) ;
--   ot     : OT de référence (voir _commande_ot).
CREATE OR REPLACE FUNCTION public.commandes_verifier(p_lignes jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'numero', l.numero,
           'deja', (SELECT jsonb_build_object('id', c.id, 'code', c.code_planning, 'le', c.cree_le, 'par', c.saisi_par)
                      FROM commandes_loxam c WHERE c.numero = l.numero AND c.statut <> 'annulee' LIMIT 1),
           'autres', (SELECT coalesce(jsonb_agg(c.numero ORDER BY c.id), '[]'::jsonb)
                        FROM commandes_loxam c
                       WHERE l.code <> '' AND upper(c.code_planning) = upper(l.code)
                         AND c.statut <> 'annulee' AND c.numero <> l.numero),
           'ot', public._commande_ot(l.code, l.ref)
         ) ORDER BY l.ord), '[]'::jsonb)
    FROM (SELECT ord,
                 btrim(coalesce(e->>'numero', '')) AS numero,
                 btrim(coalesce(e->>'ref_module', '')) AS ref,
                 btrim(coalesce(e->>'code', '')) AS code
            FROM jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord)) l;
$function$;

-- Enregistrement d'une commande contrôlée (masterfile, après dépôt du PDF sur Drive).
CREATE OR REPLACE FUNCTION public.commande_enregistrer(p jsonb, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_num text := btrim(coalesce(p->>'numero', ''));
  v_row commandes_loxam;
  v_d   date;
BEGIN
  IF v_num = '' OR v_num !~ '^[0-9A-Za-z-]{4,20}$' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'N° de commande invalide : « ' || v_num || ' »');
  END IF;
  IF EXISTS (SELECT 1 FROM commandes_loxam WHERE numero = v_num AND statut <> 'annulee') THEN
    RETURN jsonb_build_object('ok', false, 'deja', true, 'message', 'Commande n° ' || v_num || ' déjà enregistrée');
  END IF;
  INSERT INTO commandes_loxam (numero, date_commande, quantite, libelle, total_ht, affaire, ref_module, destination,
                               client, adresse, date_souhaitee, code_planning, ot_numero, ot_total, verif_prix,
                               source, pdf, saisi_par)
  VALUES (v_num,
          nullif(p->>'date_commande', '')::date,
          nullif(p->>'quantite', '')::numeric,
          nullif(btrim(p->>'libelle'), ''),
          nullif(p->>'total_ht', '')::numeric,
          nullif(btrim(p->>'affaire'), ''),
          nullif(btrim(p->>'ref_module'), ''),
          nullif(btrim(p->>'destination'), ''),
          nullif(btrim(p->>'client'), ''),
          nullif(btrim(p->>'adresse'), ''),
          nullif(p->>'date_souhaitee', '')::date,
          nullif(upper(btrim(p->>'code_planning')), ''),
          nullif(btrim(p->>'ot_numero'), ''),
          nullif(p->>'ot_total', '')::numeric,
          nullif(btrim(p->>'verif_prix'), ''),
          CASE WHEN p->>'source' IN ('texte', 'ocr', 'manuel') THEN p->>'source' ELSE 'texte' END,
          CASE WHEN jsonb_typeof(p->'pdf') = 'object' THEN p->'pdf' END,
          nullif(btrim(p_par), ''))
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok', true, 'commande', to_jsonb(v_row));
END;
$function$;

-- Commandes : les actives non exportées dans EBP, plus les 200 dernières (actives ou annulées).
CREATE OR REPLACE FUNCTION public.commandes_liste()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id DESC), '[]'::jsonb)
    FROM commandes_loxam c
   WHERE (c.statut <> 'annulee' AND c.ebp_le IS NULL)
      OR c.id IN (SELECT id FROM commandes_loxam ORDER BY id DESC LIMIT 200);
$function$;

-- Annulation (erreur de lecture, commande remplacée…) : la ligne reste, le n° redevient libre.
CREATE OR REPLACE FUNCTION public.commande_annuler(p_id bigint, p_motif text, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row commandes_loxam;
BEGIN
  IF btrim(coalesce(p_motif, '')) = '' THEN RETURN jsonb_build_object('ok', false, 'message', 'Motif obligatoire'); END IF;
  UPDATE commandes_loxam
     SET statut = 'annulee', motif_annulation = btrim(p_motif), annule_par = nullif(btrim(p_par), ''), annule_le = now()
   WHERE id = p_id AND statut <> 'annulee'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Commande introuvable ou déjà annulée'); END IF;
  RETURN jsonb_build_object('ok', true, 'commande', to_jsonb(v_row));
END;
$function$;

-- Marque des commandes comme exportées dans un fichier d'import EBP (p_ids vide = rien).
CREATE OR REPLACE FUNCTION public.commandes_ebp_marquer(p_ids bigint[], p_par text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH m AS (
    UPDATE commandes_loxam SET ebp_le = now(), ebp_par = nullif(btrim(p_par), '')
     WHERE id = ANY (coalesce(p_ids, '{}'::bigint[])) AND statut <> 'annulee'
    RETURNING id)
  SELECT jsonb_build_object('ok', true, 'nb', (SELECT count(*) FROM m));
$function$;

REVOKE ALL ON FUNCTION public._commande_ot(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commandes_verifier(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commande_enregistrer(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commandes_liste() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commande_annuler(bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commandes_ebp_marquer(bigint[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._commande_ot(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commandes_verifier(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.commande_enregistrer(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commandes_liste() TO service_role;
GRANT EXECUTE ON FUNCTION public.commande_annuler(bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commandes_ebp_marquer(bigint[], text) TO service_role;
GRANT ALL ON TABLE public.commandes_loxam TO service_role;
GRANT ALL ON SEQUENCE public.commandes_loxam_id_seq TO service_role;
