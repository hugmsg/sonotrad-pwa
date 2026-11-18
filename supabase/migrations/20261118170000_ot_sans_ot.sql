-- 2026-11-18 (demande de Hugo) : modules qui n'auront PAS d'OT (trop abîmés, vendus en l'état…).
-- Marquage par code planning, motif vente / epave / autre (+ précision), qui et quand. Annulable (ligne
-- supprimée). Pas de fiche, donc ni numéro d'OT, ni document, ni stock. Lu avec ot_liste (masterfile) :
-- le module sort de « À compléter » (Reconditionnement) et de « OT à faire » / « partis sans OT » (Production).
-- Les destinations de vente RBSA, BCBJ, DRCB sont reconnues côté PWA sans marquage ; Saint-Paterne (0102)
-- est seulement proposé (des modules y sont partis avec un OT).

CREATE TABLE public.ot_sans_ot (
  code_planning text NOT NULL,
  motif text NOT NULL,
  detail text DEFAULT ''::text NOT NULL,
  par text DEFAULT ''::text NOT NULL,
  le timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT ot_sans_ot_pkey PRIMARY KEY (code_planning),
  CONSTRAINT ot_sans_ot_code_check CHECK ((btrim(code_planning) <> ''::text)),
  CONSTRAINT ot_sans_ot_motif_check CHECK ((motif = ANY (ARRAY['vente'::text, 'epave'::text, 'autre'::text])))
);
ALTER TABLE public.ot_sans_ot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ot_sans_ot FROM PUBLIC, anon, authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ot_sans_ot TO service_role;

CREATE OR REPLACE FUNCTION public.ot_sans_ot_liste()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object('code_planning', s.code_planning, 'motif', s.motif, 'detail', s.detail,
                                               'par', s.par, 'le', _stock_iso(s.le)) ORDER BY s.le DESC), '[]'::jsonb)
    FROM ot_sans_ot s;
$function$;

-- p_motif NULL ou '' : retire le marquage (« Remettre à faire »).
CREATE OR REPLACE FUNCTION public.ot_sans_ot_definir(p_code text, p_motif text, p_detail text, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
BEGIN
  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Code planning manquant');
  END IF;
  IF v_motif IS NULL THEN
    DELETE FROM ot_sans_ot WHERE code_planning = v_code;
    RETURN jsonb_build_object('ok', true, 'sans_ot', null);
  END IF;
  IF v_motif NOT IN ('vente', 'epave', 'autre') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Motif inconnu');
  END IF;
  IF EXISTS (SELECT 1 FROM ot_fiches WHERE code_planning = v_code AND statut IN ('brouillon', 'a_valider', 'validee', 'envoyee')) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Ce module a déjà une fiche d''opérations : annulez-la d''abord');
  END IF;
  INSERT INTO ot_sans_ot (code_planning, motif, detail, par)
  VALUES (v_code, v_motif, btrim(coalesce(p_detail, '')), btrim(coalesce(p_par, '')))
  ON CONFLICT (code_planning) DO UPDATE SET motif = EXCLUDED.motif, detail = EXCLUDED.detail, par = EXCLUDED.par, le = now();
  RETURN jsonb_build_object('ok', true, 'sans_ot', (SELECT jsonb_build_object('code_planning', s.code_planning, 'motif', s.motif,
           'detail', s.detail, 'par', s.par, 'le', _stock_iso(s.le)) FROM ot_sans_ot s WHERE s.code_planning = v_code));
END;
$function$;

REVOKE ALL ON FUNCTION public.ot_sans_ot_liste() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ot_sans_ot_liste() TO service_role;
REVOKE ALL ON FUNCTION public.ot_sans_ot_definir(p_code text, p_motif text, p_detail text, p_par text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ot_sans_ot_definir(p_code text, p_motif text, p_detail text, p_par text) TO service_role;
