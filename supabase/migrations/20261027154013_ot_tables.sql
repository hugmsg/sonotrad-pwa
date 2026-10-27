-- Fiches d'opérations (OT) : tables de référence reprises de la matrice Excel
-- « Matrice opérations et fournitures » (feuilles TABLEAU REF, groupes, catalogue).
-- Lues et écrites uniquement côté serveur (clé secrète).

CREATE TABLE public.ot_parametres (
  cle          text PRIMARY KEY CHECK (btrim(cle) <> ''),
  valeur       numeric NOT NULL,
  libelle      text NOT NULL DEFAULT ''
);

-- Une ligne par référence (pièce Pidem, réf. LOXAM, code SON-xxxx interne).
-- mo = main-d'œuvre facturée par unité (déjà au taux en vigueur) ; mo_base = au taux de base.
-- prix_piece = prix d'achat d'une pièce refacturée en « main-d'œuvre pièces » (non majoré).
CREATE TABLE public.ot_references (
  ref            text PRIMARY KEY CHECK (btrim(ref) <> ''),
  description    text NOT NULL DEFAULT '',
  categorie      text NOT NULL DEFAULT '',
  prix_achat     numeric,
  op_code        text,
  op_libelle     text,
  mo             numeric,
  mo_base        numeric,
  temps_min      numeric,
  unite          text NOT NULL DEFAULT 'unité',
  prix_piece     numeric,
  qte_defaut     numeric,
  ref_fabricant  text,
  modifie_le     timestamptz NOT NULL DEFAULT now()
);

-- Forfaits (lettres A, B, … de la matrice) et pièces qu'ils consomment.
CREATE TABLE public.ot_forfaits (
  lettre       text PRIMARY KEY CHECK (btrim(lettre) <> ''),
  intitule     text NOT NULL,
  mo           numeric NOT NULL DEFAULT 0,
  prix_piece   numeric NOT NULL DEFAULT 0,
  modifie_le   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ot_forfait_pieces (
  lettre       text NOT NULL REFERENCES public.ot_forfaits (lettre) ON UPDATE CASCADE ON DELETE CASCADE,
  ref          text NOT NULL CHECK (btrim(ref) <> ''),
  qte          numeric NOT NULL CHECK (qte > 0),
  PRIMARY KEY (lettre, ref)
);

ALTER TABLE public.ot_parametres     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_references     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_forfaits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_forfait_pieces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ot_parametres, public.ot_references, public.ot_forfaits,
              public.ot_forfait_pieces FROM PUBLIC, anon, authenticated;
