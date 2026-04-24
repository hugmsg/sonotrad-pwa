/**
 * LV_LAYOUT — Constantes de mise en page pour la génération PDF jsPDF
 * Lettre de Voiture Unique (Nationale / CMR)
 * 
 * FORMAT : A4 portrait — 210 × 297 mm
 * Marges : 8 mm de chaque côté (zone utile : 194 mm de large)
 * 
 * USAGE : importer ces constantes en tête de _lvuRecto() pour remplacer
 * les coordonnées numériques en dur. Toute modification de mise en page
 * doit passer par ce fichier, jamais directement dans le code de rendu.
 * 
 * SECTIONS (de haut en bas) :
 *   1. En-tête titre + N°
 *   2. Bande NATIONALE / INTERNATIONALE CMR
 *   3. Bloc mentions légales + DATE
 *   4. Bloc TRANSPORTEUR / CONDUCTEURS / IMMATRICULATIONS
 *   5. Ligne DONNEUR D'ORDRE
 *   6. Tableau MARCHANDISES (header + lignes)
 *   7. Pied de tableau (refus signature)
 *   8. RÉSERVES CHARGEMENT / DÉCHARGEMENT
 *   9. DOCUMENTS ANNEXES / CONVOI EXCEPTIONNEL
 *  10. EXPÉDITEUR / DESTINATAIRE
 *  11. Signatures (3 colonnes)
 */

const LV = {

  // ─── PAGE ──────────────────────────────────────────────────────────────────
  PAGE_W: 210,          // largeur A4 en mm
  PAGE_H: 297,          // hauteur A4 en mm
  MARGIN: 8,            // marge gauche et droite
  get CONTENT_W() { return this.PAGE_W - this.MARGIN * 2; }, // 194 mm

  // ─── TYPOGRAPHIE ───────────────────────────────────────────────────────────
  FONT_TITLE:     12,   // "LETTRE DE VOITURE UNIQUE"
  FONT_SECTION:    7,   // labels de section (TRANSPORTEUR, MARCHANDISES…)
  FONT_BODY:       7,   // contenu courant
  FONT_SMALL:      6,   // texte légal (mentions CMR)
  FONT_NUM:       14,   // numéro de LV (ex : 01449) — gras

  // ─── COULEURS ──────────────────────────────────────────────────────────────
  COLOR_HEADER_BG:     [15, 52, 96],    // fond titre principal (bleu marine)
  COLOR_SECTION_BG:    [220, 220, 220], // fond headers de sections (gris clair)
  COLOR_MARCHANDISES:  [60, 60, 60],    // fond bande MARCHANDISES (gris foncé)
  COLOR_BORDER:        [80, 80, 80],    // bordures des cellules
  COLOR_WHITE:         [255, 255, 255],
  COLOR_BLACK:         [0, 0, 0],
  COLOR_TEXT_LIGHT:    [80, 80, 80],    // texte secondaire

  // ─── SECTION 1 : EN-TÊTE TITRE ─────────────────────────────────────────────
  HEADER_Y:        8,   // Y de départ (haut de la page)
  HEADER_H:       11,   // hauteur du bandeau titre
  HEADER_TITLE_X: 90,   // X centré approximatif du titre (jsPDF gère le centrage)
  HEADER_NUM_X:  170,   // X du bloc N° (droite)
  HEADER_NUM_W:   32,   // largeur du bloc N°

  // ─── SECTION 2 : NATIONALE / INTERNATIONALE CMR ────────────────────────────
  NAT_CMR_Y:      19,   // Y de la bande de choix
  NAT_CMR_H:       7,   // hauteur
  NAT_COL_W:      50,   // largeur colonne NATIONALE (checkbox + texte)
  CMR_COL_X:      66,   // X de départ INTERNATIONALE/CMR
  CHECKBOX_SIZE:   3.5, // taille des cases à cocher
  CHECKBOX_OFFSET_Y: 1.8, // décalage vertical case dans la ligne

  // ─── SECTION 3 : MENTIONS LÉGALES + DATE ───────────────────────────────────
  LEGAL_Y:        26,   // Y du bloc mentions légales
  LEGAL_H:        20,   // hauteur totale du bloc
  LEGAL_FR_W:     55,   // largeur colonne texte français
  LEGAL_CMR_X:    63,   // X de la colonne texte CMR anglais
  LEGAL_CMR_W:    52,   // largeur colonne texte CMR (limité pour ne pas déborder sur zone DATE)
  DATE_X:        162,   // X du bloc DATE
  DATE_W:         40,   // largeur du bloc DATE
  DATE_LABEL_Y:   29,   // Y du label "DATE"
  DATE_VALUE_Y:   35,   // Y de la valeur de date

  // ─── SECTION 4 : TRANSPORTEUR / CONDUCTEURS ────────────────────────────────
  TRANS_Y:        46,   // Y de départ du bloc transporteur
  TRANS_H:        30,   // hauteur totale
  TRANS_COL_W:    95,   // largeur colonne transporteur (gauche)
  COND_COL_X:    111,   // X colonne conducteurs (droite)
  COND_COL_W:     40,   // largeur colonne conducteurs
  IMMAT_COL_X:   111,   // X colonne immatriculations
  IMMAT_COL_W:    91,   // largeur colonne immatriculations
  TRANS_LINE_H:    4.5, // hauteur d'une ligne d'adresse

  // ─── SECTION 5 : DONNEUR D'ORDRE ───────────────────────────────────────────
  DO_Y:           76,   // Y de la ligne donneur d'ordre
  DO_H:            8,   // hauteur

  // ─── SECTION 6 : TABLEAU MARCHANDISES ──────────────────────────────────────
  MARC_HEADER_Y:  84,   // Y de l'en-tête MARCHANDISES/GOODS
  MARC_HEADER_H:   5,   // hauteur bandeau
  MARC_COLS_Y:    89,   // Y des sous-colonnes (NOMBRE, POIDS, NOTE)
  MARC_COLS_H:     7,   // hauteur des labels de colonnes
  MARC_ROW_Y:     96,   // Y de la première ligne de données
  MARC_ROW_H:      7,   // hauteur d'une ligne article
  MARC_ROWS:      10,   // nombre de lignes affichées (à ajuster)
  MARC_COL_DESC_W:120,  // largeur colonne description article
  MARC_COL_POIDS_X:128, // X colonne poids
  MARC_COL_POIDS_W: 40, // largeur colonne poids
  MARC_COL_NOTE_X: 172, // X colonne NOTE
  MARC_COL_NOTE_W:  35, // largeur colonne NOTE

  // ─── SECTION 7 : PIED DE TABLEAU (refus signature) ─────────────────────────
  get REFUS_Y() {
    return this.MARC_ROW_Y + (this.MARC_ROWS * this.MARC_ROW_H);
  },
  REFUS_H:         6,   // hauteur

  // ─── SECTION 8 : RÉSERVES ──────────────────────────────────────────────────
  get RESERVES_Y() { return this.REFUS_Y + this.REFUS_H; },
  RESERVES_H:     15,   // hauteur des blocs réserves
  RESERVES_HALF_W: 97,  // largeur de chaque colonne (gauche / droite)

  // ─── SECTION 9 : DOCUMENTS / CONVOI EXCEPTIONNEL ──────────────────────────
  get DOCS_Y() { return this.RESERVES_Y + this.RESERVES_H; },
  DOCS_H:          9,
  DOCS_COL_W:     97,   // largeur colonne documents
  CONVOI_COL_X:  105,   // X colonne convoi exceptionnel
  CONVOI_COL_W:   97,

  // ─── SECTION 10 : EXPÉDITEUR / DESTINATAIRE ────────────────────────────────
  get ADDR_Y() { return this.DOCS_Y + this.DOCS_H; },
  ADDR_H:         28,   // hauteur des blocs adresse
  ADDR_COL_W:     97,   // largeur colonne expéditeur
  DEST_COL_X:    105,   // X colonne destinataire

  // ─── SECTION 11 : SIGNATURES ───────────────────────────────────────────────
  get SIG_Y() { return this.ADDR_Y + this.ADDR_H; },
  SIG_H:          28,   // hauteur zone signatures
  SIG_COL_W:      64,   // largeur de chaque colonne (3 colonnes égales ~194/3)
  SIG_COL2_X:     72,   // X colonne centrale (conducteur)
  SIG_COL3_X:    138,   // X colonne droite (destinataire)

};

/**
 * NOTES DE CORRECTIONS PRIORITAIRES (à partir de la LV 01449 générée)
 * 
 * 1. SECTION LÉGALE (Y:26) :
 *    - Le texte FR et CMR déborde sur la zone DATE → réduire LEGAL_CMR_W ou
 *      augmenter LEGAL_H pour laisser de l'air
 *    - La DATE est lisible mais le label "DATE" manque de hiérarchie visuelle
 *      → passer DATE en gras, augmenter légèrement FONT_NUM
 * 
 * 2. SECTION TRANSPORTEUR (Y:46) :
 *    - Bonne lisibilité globale
 *    - Ajouter un filet séparateur entre colonne transporteur et conducteurs
 *    - "CONDUCTEURS" et "IMMATRICULATIONS" : espacer davantage (TRANS_LINE_H += 1)
 * 
 * 3. TABLEAU MARCHANDISES :
 *    - Lignes vides trop nombreuses visuellement → si aucune donnée sur une ligne,
 *      griser le fond légèrement (alternance de couleur)
 *    - La colonne NOTE est trop étroite → MARC_COL_NOTE_W: 35
 * 
 * 4. RÉSERVES (Y calculé) :
 *    - Prévoir une hauteur min de 15 mm (RESERVES_H: 15) pour permettre
 *      l'écriture manuscrite à l'impression
 * 
 * 5. ZONE SIGNATURES :
 *    - SIG_H actuel trop juste pour les cachets (tampons entreprise)
 *      → SIG_H: 28 recommandé
 *    - Ajouter une ligne tirets pointillés dans chaque colonne signature
 *      pour guider la signature
 * 
 * 6. ESTHÉTIQUE GLOBALE :
 *    - Remplacer COLOR_HEADER_BG par [15, 52, 96] (bleu marine pro)
 *      pour différencier du gris des sections
 *    - Ajouter le logo SONOTRAD en haut à gauche du titre si disponible
 *    - Vérifier que toutes les polices sont Helvetica ou Arial
 *      (éviter le mélange de familles)
 */

// Export pour usage en module ES
if (typeof module !== 'undefined') module.exports = { LV };
