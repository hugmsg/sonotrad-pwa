/**
 * LV_LAYOUT — Constantes de mise en page pour la génération PDF jsPDF
 * Lettre de Voiture Unique (Nationale / CMR) — Sonotrad
 *
 * SOURCE DE VÉRITÉ : ces valeurs sont calées sur LV_REFERENCE.pdf
 * Toute modification de mise en page doit passer par ce fichier.
 *
 * UNITÉS : mm depuis le coin haut-gauche de la page A4
 * COULEURS : tableaux RGB pour jsPDF (doc.setFillColor(...COLOR))
 */

const LV = {

  // ═══ PAGE ═══════════════════════════════════════════════════════════════
  PAGE_W: 210,            // largeur A4 en mm
  PAGE_H: 297,            // hauteur A4
  MARGIN: 6,              // marge gauche/droite/haut/bas
  get CONTENT_W() { return this.PAGE_W - this.MARGIN * 2; },  // 198 mm
  get CONTENT_H() { return this.PAGE_H - this.MARGIN * 2; },  // 285 mm

  // ═══ TYPOGRAPHIE (en pt) ════════════════════════════════════════════════
  FONT_TITLE_MAIN:    14,   // "LETTRE DE VOITURE UNIQUE"
  FONT_NUM_LABEL:     10,   // "N°"
  FONT_NUM_VALUE:     22,   // "01449"
  FONT_DATE_HEADER:    8,   // "DATE" (bandeau bleu)
  FONT_DATE_VALUE:    13,   // "24/04/2026"
  FONT_NATCMR:         8,   // "NATIONALE", "INTERNATIONALE"
  FONT_CMR_LOGO:       7,   // étiquette "CMR"
  FONT_LEGAL:        5.5,   // mentions légales FR/CMR
  FONT_LABEL:        6.3,   // labels de section ("Transporteur / Carrier...")
  FONT_BODY:         7.5,   // contenu courant
  FONT_TRANS_NAME:    10,   // "TRANSPORTS MESNAGER"
  FONT_SECTION:        8,   // "MARCHANDISES / GOODS"
  FONT_MARC_COL:     6.3,   // headers colonnes marchandises
  FONT_MARC_ROW:     7.5,   // contenu lignes marchandises
  FONT_MARC_TOTAL:   7.8,   // ligne TOTAL
  FONT_REFUS:        5.8,   // texte refus signature
  FONT_SIG_HEADER:     7,   // "CACHET EXPÉDITEUR"
  FONT_SIG_SUB:        6,   // "Sender's stamp"

  // ═══ COULEURS RECTO ═════════════════════════════════════════════════════
  COLOR_PRIMARY:        [31, 58, 95],     // #1f3a5f bleu marine principal
  COLOR_LIGHT_BLUE:     [221, 230, 242],  // #dde6f2 fond en-têtes marc, ligne TOTAL
  COLOR_GREY_BLUE:      [184, 198, 217],  // #b8c6d9 séparateurs marchandises
  COLOR_ALT_ROW:        [247, 249, 252],  // #f7f9fc fond lignes paires marc
  COLOR_SOFT_BG:        [243, 246, 251],  // #f3f6fb donneur d'ordre, refus
  COLOR_WHITE:          [255, 255, 255],
  COLOR_BLACK:          [0, 0, 0],
  COLOR_TEXT_MUTED:     [85, 85, 85],     // #555 sous-titres signatures

  // ═══ COULEURS VERSO (filigrane gris) ════════════════════════════════════
  V_TEXT:               [192, 192, 192],  // #c0c0c0 corps de texte
  V_TITLE_BLOCK:        [176, 176, 176],  // #b0b0b0 titres de blocs
  V_TITLE_MAIN:         [181, 181, 181],  // #b5b5b5 titre principal
  V_SUBTITLE:           [200, 200, 200],  // #c8c8c8 sous-titres
  V_REF:                [208, 208, 208],  // #d0d0d0 références (décrets...)
  V_BORDER:             [239, 239, 239],  // #efefef bordures blocs
  V_BORDER_LIGHTER:     [236, 236, 236],  // #ececec séparateurs internes
  V_BG_HEADER:          [251, 251, 251],  // #fbfbfb fond en-têtes blocs
  V_BULLET:             [213, 213, 213],  // #d5d5d5 puces
  V_FOOTER_TEXT:        [184, 184, 184],  // #b8b8b8 footer "TRANSPORTS MESNAGER"

  // ═══ ZONE SUPÉRIEURE (3 premières sections) ═════════════════════════════
  // Layout : colonne gauche (156 mm) + colonne droite (42 mm)
  TOP_LEFT_W:    156,    // largeur zone gauche (titre + NAT/CMR + légal)
  TOP_RIGHT_W:    42,    // largeur zone droite (N° + DATE)

  // SECTION 1 : Titre principal (dans zone gauche)
  H_TITLE:        11,    // hauteur bandeau titre
  Y_TITLE:         6,    // y de départ (= MARGIN)

  // SECTION 2 : NATIONALE / INTERNATIONALE+CMR (dans zone gauche)
  H_NATCMR:        7,    // hauteur ligne choix
  get Y_NATCMR()  { return this.Y_TITLE + this.H_TITLE; },     // 17
  W_NATCMR_HALF:  78,    // largeur de chaque option (NAT et CMR)
  CHECKBOX_SIZE: 3.8,    // taille des cases à cocher

  // CMR logo (étiquette encadrée à côté de INTERNATIONALE)
  CMR_LOGO_W:    9.5,    // largeur étiquette CMR
  CMR_LOGO_H:      4,    // hauteur
  CMR_LOGO_RADIUS: 1.2,  // border-radius
  CMR_LOGO_PAD_X:  2,    // padding horizontal interne
  CMR_LOGO_OFFSET: 4,    // marge gauche depuis "INTERNATIONALE"

  // SECTION 3 : Mentions légales FR / CMR (dans zone gauche)
  H_LEGAL:        18,    // hauteur bloc mentions légales
  get Y_LEGAL()   { return this.Y_NATCMR + this.H_NATCMR; },   // 24
  W_LEGAL_HALF:   78,    // largeur de chaque colonne (FR et CMR)

  // SECTION 4 : Bloc N° + DATE (zone droite)
  X_TOP_RIGHT:   162,    // x du début de la colonne droite (MARGIN + TOP_LEFT_W)
  H_NUM_BLOCK:  18.5,    // hauteur bloc N° (calé sur titre + NAT/CMR + bordure)
  get Y_NUM_BLOCK() { return this.Y_TITLE; },                  // 6
  H_DATE_HEADER:   6,    // hauteur bandeau "DATE"
  get Y_DATE_HEADER() { return this.Y_NUM_BLOCK + this.H_NUM_BLOCK; },  // 24.5
  // Note : H_DATE_VALUE = ce qui reste pour atteindre Y_TRANSPORTEUR

  // ═══ ZONE PLEINE LARGEUR ════════════════════════════════════════════════
  get Y_TRANSPORTEUR() { return this.Y_LEGAL + this.H_LEGAL; },  // 42

  // SECTION 5 : Transporteur / Conducteurs / Immatriculations
  H_TRANSPORTEUR:   34,
  W_TRANS_LEFT:    116,    // colonne transporteur (gauche)
  W_TRANS_RIGHT:    82,    // colonne conducteurs+immat (droite)
  H_COND:           13,    // hauteur sous-bloc CONDUCTEURS
  // H_IMMAT calculé : H_TRANSPORTEUR - H_COND

  // SECTION 6 : Donneur d'ordre
  H_DONNEUR:         9,
  get Y_DONNEUR()  { return this.Y_TRANSPORTEUR + this.H_TRANSPORTEUR; },
  W_DONNEUR_LABEL:  34,

  // SECTION 7 : Header MARCHANDISES / GOODS
  H_MARC_HEADER:     6,
  get Y_MARC_HEADER() { return this.Y_DONNEUR + this.H_DONNEUR; },

  // SECTION 8 : En-têtes colonnes marchandises
  H_MARC_COLS:       6,
  W_MARC_NOMBRE:    24,
  W_MARC_POIDS:     30,
  W_MARC_NOTE:      22,
  // W_MARC_NATURE = CONTENT_W - (24+30+22) = 122

  // SECTION 9 : Lignes marchandises (10 + 1 TOTAL)
  H_MARC_ROW:      8.5,
  N_MARC_ROWS:      10,    // nombre de lignes de saisie
  // Ligne TOTAL : même hauteur, fond LIGHT_BLUE, bordure haute 0.6pt PRIMARY

  // SECTION 10 : Refus signature (2 colonnes égales)
  H_REFUS:           7,

  // SECTION 11 : Réserves Chargement / Déchargement
  H_RESERVES:       16,

  // SECTION 12 : Documents annexes / Convoi exceptionnel
  H_DOCS:           14,

  // SECTION 13 : Expéditeur / Destinataire
  H_ADDR:           26,

  // SECTION 14 : Signatures (3 colonnes égales)
  H_SIG:            32,
  N_SIG_COLS:        3,
  H_SIG_HEADER:    4.5,    // hauteur bandeau "CACHET EXPÉDITEUR"
  SIG_LINE_MARGIN:   3,    // marge latérale ligne pointillée
  SIG_LINE_BOTTOM:   2,    // distance bas de la ligne pointillée

  // ═══ VERSO ══════════════════════════════════════════════════════════════
  V_HEADER_TITLE_FONT: 13,
  V_HEADER_SUB_FONT:    8,
  V_BLOCK_TITLE_FONT: 8.5,
  V_BLOCK_BODY_FONT:  7.8,
  V_BLOCK_LIST_FONT:  7.5,
  V_FOOTER_FONT:      6.5,

  V_HEADER_PAD_BOTTOM: 4,
  V_HEADER_MARGIN_BOTTOM: 6,
  V_COL_GAP:           6,    // espace entre colonnes gauche/droite
  V_BLOCK_GAP:         4,    // espace vertical entre blocs d'une colonne
  V_BLOCK_PAD_X:       3,
  V_BLOCK_PAD_Y:     2.5,
  V_BLOCK_TITLE_PAD_X: 3,
  V_BLOCK_TITLE_PAD_Y: 1.8,

  // 10 blocs : 5 à gauche, 5 à droite (étirement uniforme via flex)
  V_BLOCKS_LEFT:  5,
  V_BLOCKS_RIGHT: 5,

  // ═══ HELPERS ═══════════════════════════════════════════════════════════
  // Padding interne standard pour les cellules avec texte
  CELL_PAD_X: 2,
  CELL_PAD_Y: 1.3,

  // Épaisseurs de traits
  STROKE_DOC_BORDER: 0.6,    // bordure externe du document
  STROKE_SECTION:    0.4,    // séparateurs de sections
  STROKE_INTRA:      0.3,    // séparateurs internes (lignes marchandises)
  STROKE_TOTAL:      0.6,    // bordure haute ligne TOTAL
  STROKE_SIG_LINE:   0.8,    // ligne pointillée signatures
  STROKE_VERSO:      0.3,    // toutes bordures verso

};

// Export ES module
if (typeof module !== 'undefined') module.exports = { LV };
