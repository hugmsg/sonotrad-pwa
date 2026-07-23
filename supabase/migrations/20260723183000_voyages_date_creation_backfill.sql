-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Correctif date_creation pour le backfill Historique (2026-07-23)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- enregistrer_voyage() n'a jamais accepté de date_creation explicite : la
-- colonne retombait toujours sur son DEFAULT now(). Sans conséquence tant que
-- la fonction n'était appelée qu'à la création réelle d'une LV (la date est
-- alors correcte) — mais le backfill de l'Archive Sheets vers Supabase (pour
-- combler l'Historique sur les entrées créées avant l'ajout de
-- conducteur/immat/expéditeur/pdf_url) a donc écrit "maintenant" comme date
-- pour 150 lignes historiques, cassant le tri par date de
-- lire_historique_voyages(). Ce correctif ajoute p_date_creation (optionnel,
-- NULL → comportement inchangé pour les créations réelles) pour permettre
-- une seconde passe de backfill avec les vraies dates.
--
-- DROP nécessaire : CREATE OR REPLACE ne remplace une fonction que si la
-- liste de paramètres est identique. Ajouter un paramètre, même optionnel,
-- crée une nouvelle surcharge sinon (déjà rencontré 2x sur cette fonction).
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS enregistrer_voyage(text,text,text,text,text,text,numeric,numeric,boolean,text,boolean,text,text,text,text,text,text,boolean,text);

CREATE OR REPLACE FUNCTION enregistrer_voyage(
  p_numero_lv           text,
  p_type                text,
  p_destination         text,
  p_doc_annexe          text,
  p_commande            text,
  p_commentaire         text,
  p_poids               numeric,
  p_ml                  numeric,
  p_grutage             boolean,
  p_transporteur        text,
  p_parti               boolean     DEFAULT false,
  p_marchandises_desc   text        DEFAULT NULL,
  p_destination_adresse text        DEFAULT NULL,
  p_conducteur          text        DEFAULT NULL,
  p_immat_moteur        text        DEFAULT NULL,
  p_immat_semi          text        DEFAULT NULL,
  p_expediteur          text        DEFAULT NULL,
  p_convoi              boolean     DEFAULT false,
  p_pdf_url             text        DEFAULT NULL,
  p_date_creation       timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_numero_lv IS NULL OR length(trim(p_numero_lv)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'numero_lv manquant');
  END IF;

  INSERT INTO voyages (numero_lv, type, date_creation, destination, commentaire, poids, ml, grutage, transporteur, parti, parti_le, marchandises_desc, destination_adresse)
  VALUES (p_numero_lv, COALESCE(NULLIF(p_type, ''), 'LV'), COALESCE(p_date_creation, now()), p_destination, NULLIF(p_commentaire, ''),
          p_poids, p_ml, COALESCE(p_grutage, false), NULLIF(p_transporteur, ''),
          COALESCE(p_parti, false), CASE WHEN COALESCE(p_parti, false) THEN now() ELSE NULL END,
          NULLIF(p_marchandises_desc, ''), NULLIF(p_destination_adresse, ''))
  ON CONFLICT (numero_lv) DO UPDATE SET
    type                = EXCLUDED.type,
    date_creation        = EXCLUDED.date_creation,
    destination         = EXCLUDED.destination,
    commentaire         = EXCLUDED.commentaire,
    poids               = EXCLUDED.poids,
    ml                  = EXCLUDED.ml,
    grutage             = EXCLUDED.grutage,
    transporteur        = EXCLUDED.transporteur,
    marchandises_desc   = EXCLUDED.marchandises_desc,
    destination_adresse = EXCLUDED.destination_adresse;
    -- parti volontairement absent du DO UPDATE : une fois le voyage enregistré,
    -- seul marquer_parti() doit pouvoir faire évoluer ce statut

  INSERT INTO voyages_internes (numero_lv, doc_annexe, commande, conducteur, immat_moteur, immat_semi, expediteur, convoi, pdf_url)
  VALUES (p_numero_lv, NULLIF(p_doc_annexe, ''), NULLIF(p_commande, ''), NULLIF(p_conducteur, ''),
          NULLIF(p_immat_moteur, ''), NULLIF(p_immat_semi, ''), NULLIF(p_expediteur, ''),
          COALESCE(p_convoi, false), NULLIF(p_pdf_url, ''))
  ON CONFLICT (numero_lv) DO UPDATE SET
    doc_annexe   = EXCLUDED.doc_annexe,
    commande     = EXCLUDED.commande,
    conducteur   = EXCLUDED.conducteur,
    immat_moteur = EXCLUDED.immat_moteur,
    immat_semi   = EXCLUDED.immat_semi,
    expediteur   = EXCLUDED.expediteur,
    convoi       = EXCLUDED.convoi,
    pdf_url      = EXCLUDED.pdf_url;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'message', sqlerrm);
END;
$$;
