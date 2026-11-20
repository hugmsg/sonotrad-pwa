-- 2026-11-20 (demande de Hugo) : ordres d'expédition LOXAM (« commandes de transport »).
-- Même mise en page qu'une commande de reconditionnement, mais fournisseur MESNAGER TRANSPORTS : un ordre liste
-- plusieurs modules (Commentaires), l'agence (« POUR MULHOUSE 7303 »), la date « A PARTIR DU », l'adresse ; il est
-- suivi d'un bon de transfert (BT n°, page 2 du scan). C'est le n° de cet ordre qui va au Planning (colonne U),
-- dans Demandes (colonne N) et sur la LV (« Commande n° »), le BT dans « Doc annexe ».
-- La PWA lit le PDF (presque toujours un scan → OCR), le contrôle, puis masterfile l'enregistre ici (actions exp_*,
-- admins et activité LOXAM), range le PDF sur Drive et écrit le n° au Planning sur chaque module.
-- Accès : clé secrète seulement (masterfile).

CREATE TABLE public.expeditions_loxam (
  id               bigserial PRIMARY KEY,
  numero           text NOT NULL,                 -- n° de l'ordre d'expédition LOXAM
  date_commande    date,
  agence           text,                          -- code agence (4 chiffres), « POUR … 7303 »
  destination      text,                          -- « MULHOUSE 7303 » (après POUR)
  adresse          text,                          -- « Expédier l'article ci-dessus à » (lignes séparées par « | »)
  a_partir_du      date,                          -- « A PARTIR DU 30/11 »
  bt               text,                          -- n° du bon de transfert
  modules          jsonb NOT NULL DEFAULT '[]',   -- [{ref, code}] : n° LOXAM du module, code SONOTRAD (Planning B)
  source           text NOT NULL DEFAULT 'ocr' CHECK (source IN ('texte', 'ocr', 'manuel')),
  pdf              jsonb,                         -- { id, url, nom } sur Drive
  statut           text NOT NULL DEFAULT 'validee' CHECK (statut IN ('validee', 'annulee')),
  motif_annulation text,
  saisi_par        text,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  modifie_par      text,
  modifie_le       timestamptz,
  annule_par       text,
  annule_le        timestamptz
);

CREATE UNIQUE INDEX expeditions_loxam_numero_actif ON public.expeditions_loxam (numero) WHERE statut <> 'annulee';

ALTER TABLE public.expeditions_loxam ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.expeditions_loxam FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.expeditions_loxam_id_seq FROM PUBLIC, anon, authenticated;

-- Modules normalisés : [{ref, code}] sans doublon, code en majuscules.
CREATE OR REPLACE FUNCTION public._expedition_modules(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object('ref', x.ref, 'code', x.code) ORDER BY x.ord), '[]'::jsonb)
    FROM (SELECT DISTINCT ON (upper(coalesce(nullif(code, ''), ref))) ref, code, ord
            FROM (SELECT btrim(coalesce(e->>'ref', '')) AS ref, upper(btrim(coalesce(e->>'code', ''))) AS code, ord
                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END)
                         WITH ORDINALITY AS t(e, ord)) m
           WHERE ref <> '' OR code <> ''
           ORDER BY upper(coalesce(nullif(code, ''), ref)), ord) x;
$function$;

-- Contrôle avant enregistrement. p_numeros = ['5483723', …] → [{numero, deja}]
CREATE OR REPLACE FUNCTION public.expeditions_verifier(p_numeros text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'numero', n.numero,
           'deja', (SELECT jsonb_build_object('id', e.id, 'le', e.cree_le, 'par', e.saisi_par)
                      FROM expeditions_loxam e WHERE e.numero = n.numero AND e.statut <> 'annulee' LIMIT 1)
         ) ORDER BY n.ord), '[]'::jsonb)
    FROM unnest(coalesce(p_numeros, '{}'::text[])) WITH ORDINALITY AS n(numero, ord);
$function$;

-- N° d'ordres encore valables parmi p_numeros (annulation de LV : la commande reste au Planning si elle est valable).
CREATE OR REPLACE FUNCTION public.expeditions_actives(p_numeros text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(DISTINCT e.numero), '[]'::jsonb)
    FROM expeditions_loxam e
   WHERE e.statut <> 'annulee' AND e.numero = ANY (coalesce(p_numeros, '{}'::text[]));
$function$;

CREATE OR REPLACE FUNCTION public.expedition_enregistrer(p jsonb, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_num  text := btrim(coalesce(p->>'numero', ''));
  v_mods jsonb := public._expedition_modules(p->'modules');
  v_row  expeditions_loxam;
BEGIN
  IF v_num = '' OR v_num !~ '^[0-9A-Za-z-]{4,20}$' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'N° de commande invalide : « ' || v_num || ' »');
  END IF;
  IF jsonb_array_length(v_mods) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Aucun module');
  END IF;
  IF EXISTS (SELECT 1 FROM expeditions_loxam WHERE numero = v_num AND statut <> 'annulee') THEN
    RETURN jsonb_build_object('ok', false, 'deja', true, 'message', 'Commande n° ' || v_num || ' déjà enregistrée');
  END IF;
  INSERT INTO expeditions_loxam (numero, date_commande, agence, destination, adresse, a_partir_du, bt, modules, source, pdf, saisi_par)
  VALUES (v_num,
          nullif(p->>'date_commande', '')::date,
          nullif(btrim(p->>'agence'), ''),
          nullif(btrim(p->>'destination'), ''),
          nullif(btrim(p->>'adresse'), ''),
          nullif(p->>'a_partir_du', '')::date,
          nullif(btrim(p->>'bt'), ''),
          v_mods,
          CASE WHEN p->>'source' IN ('texte', 'ocr', 'manuel') THEN p->>'source' ELSE 'ocr' END,
          CASE WHEN jsonb_typeof(p->'pdf') = 'object' THEN p->'pdf' END,
          nullif(btrim(p_par), ''))
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok', true, 'expedition', to_jsonb(v_row));
END;
$function$;

-- Correction après enregistrement (agence, adresse, date, BT, modules). Renvoie l'ancienne et la nouvelle ligne :
-- masterfile en déduit les modules ajoutés / retirés pour le Planning.
CREATE OR REPLACE FUNCTION public.expedition_modifier(p_id bigint, p jsonb, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_avant expeditions_loxam;
  v_row   expeditions_loxam;
  v_mods  jsonb := public._expedition_modules(p->'modules');
BEGIN
  SELECT * INTO v_avant FROM expeditions_loxam WHERE id = p_id AND statut <> 'annulee' FOR UPDATE;
  IF v_avant.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Commande introuvable ou annulée'); END IF;
  IF jsonb_array_length(v_mods) = 0 THEN RETURN jsonb_build_object('ok', false, 'message', 'Aucun module'); END IF;
  UPDATE expeditions_loxam
     SET agence = nullif(btrim(p->>'agence'), ''),
         destination = nullif(btrim(p->>'destination'), ''),
         adresse = nullif(btrim(p->>'adresse'), ''),
         a_partir_du = nullif(p->>'a_partir_du', '')::date,
         date_commande = coalesce(nullif(p->>'date_commande', '')::date, date_commande),
         bt = nullif(btrim(p->>'bt'), ''),
         modules = v_mods,
         modifie_par = nullif(btrim(p_par), ''), modifie_le = now()
   WHERE id = p_id
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok', true, 'avant', to_jsonb(v_avant), 'expedition', to_jsonb(v_row));
END;
$function$;

-- Les actives, plus les 200 dernières (actives ou annulées).
CREATE OR REPLACE FUNCTION public.expeditions_liste()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id DESC), '[]'::jsonb)
    FROM expeditions_loxam e
   WHERE e.statut <> 'annulee'
      OR e.id IN (SELECT id FROM expeditions_loxam ORDER BY id DESC LIMIT 200);
$function$;

-- Annulation par id (écran Expéditions) ou par n° (annulation de LV, case « la commande est aussi annulée »).
CREATE OR REPLACE FUNCTION public.expedition_annuler(p_id bigint, p_numero text, p_motif text, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row expeditions_loxam;
BEGIN
  IF btrim(coalesce(p_motif, '')) = '' THEN RETURN jsonb_build_object('ok', false, 'message', 'Motif obligatoire'); END IF;
  UPDATE expeditions_loxam
     SET statut = 'annulee', motif_annulation = btrim(p_motif), annule_par = nullif(btrim(p_par), ''), annule_le = now()
   WHERE statut <> 'annulee'
     AND ((p_id IS NOT NULL AND id = p_id) OR (p_id IS NULL AND numero = btrim(coalesce(p_numero, ''))))
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Commande introuvable ou déjà annulée'); END IF;
  RETURN jsonb_build_object('ok', true, 'expedition', to_jsonb(v_row));
END;
$function$;

REVOKE ALL ON FUNCTION public._expedition_modules(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expeditions_verifier(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expeditions_actives(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expedition_enregistrer(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expedition_modifier(bigint, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expeditions_liste() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expedition_annuler(bigint, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._expedition_modules(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.expeditions_verifier(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.expeditions_actives(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.expedition_enregistrer(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expedition_modifier(bigint, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expeditions_liste() TO service_role;
GRANT EXECUTE ON FUNCTION public.expedition_annuler(bigint, text, text, text) TO service_role;
GRANT ALL ON TABLE public.expeditions_loxam TO service_role;
GRANT ALL ON SEQUENCE public.expeditions_loxam_id_seq TO service_role;
