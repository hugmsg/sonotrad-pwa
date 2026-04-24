# CLAUDE.md — Module Génération PDF Lettre de Voiture (LV / CMR)

## Contexte du projet

PWA Sonotrad — Application web progressive de gestion des transports pour SONOTRAD (Javron-les-Chapelles, 53).
La PWA permet de créer, remplir et exporter des Lettres de Voiture Uniques (LV nationales) et des CMR (transport international).

**Fichier principal :** `index.html`
**Fonction de rendu :** `_lvuRecto()` — environ ligne 5960
**Librairie PDF :** jsPDF (coordonnées en mm, origine en haut à gauche)
**Format :** A4 portrait, 210 × 297 mm

---

## Architecture du générateur PDF

Le PDF est **entièrement construit par calcul de coordonnées** dans `_lvuRecto()`.
Il n'y a pas de template externe ni de fichier modèle : tout est code JS.

Les coordonnées sont externalisées dans **`lv-layout-constants.js`** (à la racine du projet).
**Toujours modifier les dimensions et positions via ce fichier, jamais en dur dans `_lvuRecto()`.**

```
index.html
  └── _lvuRecto()
        └── importe LV depuis lv-layout-constants.js
              └── toutes les constantes Y, H, X, W, couleurs, fontes
```

---

## Structure du document LV (de haut en bas)

| Section | Constantes clés | Description |
|---|---|---|
| 1. Titre | `HEADER_Y`, `HEADER_H` | "LETTRE DE VOITURE UNIQUE" + N° |
| 2. Nationale/CMR | `NAT_CMR_Y`, `CHECKBOX_SIZE` | Cases à cocher + labels bilingues |
| 3. Mentions légales | `LEGAL_Y`, `DATE_X` | Texte réglementaire FR + EN + date |
| 4. Transporteur | `TRANS_Y`, `TRANS_COL_W` | Coordonnées transporteur + conducteurs + immatriculations |
| 5. Donneur d'ordre | `DO_Y`, `DO_H` | Ligne identité donneur d'ordre |
| 6. Marchandises | `MARC_HEADER_Y`, `MARC_ROW_H` | Tableau articles (N lignes) |
| 7. Refus signature | `REFUS_Y` (calculé) | Mention légale refus |
| 8. Réserves | `RESERVES_Y` (calculé) | Réserves chargement / déchargement |
| 9. Docs / Convoi | `DOCS_Y` (calculé) | Documents annexes + case convoi exceptionnel |
| 10. Expéditeur/Dest. | `ADDR_Y` (calculé) | Adresses expéditeur et destinataire |
| 11. Signatures | `SIG_Y` (calculé) | 3 colonnes : expéditeur, conducteur, destinataire |

Les sections 7 à 11 ont des `Y` calculés (getters) qui dépendent du nombre de lignes marchandises.
**Si tu modifies `MARC_ROWS`, toutes les sections en dessous se décalent automatiquement.**

---

## Règles de rendu jsPDF à respecter

```javascript
// Coordonnées toujours en mm depuis le coin haut-gauche
// Origine : doc.setPage() → (0,0) = haut gauche

// Police : toujours explicite avant chaque drawText
doc.setFont('Helvetica', 'bold');     // ou 'normal', 'italic'
doc.setFontSize(LV.FONT_SECTION);

// Cellule avec fond coloré
doc.setFillColor(...LV.COLOR_SECTION_BG);
doc.rect(x, y, w, h, 'F');           // 'F' = filled, 'FD' = filled+bordered

// Texte aligné à gauche (défaut)
doc.text('MON TEXTE', x + 2, y + h/2 + doc.getFontSize()/4);
// Le +2 est le padding interne, h/2 + size/4 centre verticalement

// Texte centré
doc.text('TITRE', LV.MARGIN + LV.CONTENT_W/2, y + h/2, { align: 'center' });

// Bordure seule
doc.setDrawColor(...LV.COLOR_BORDER);
doc.setLineWidth(0.3);
doc.rect(x, y, w, h, 'S');           // 'S' = stroke seulement

// Ligne de séparation
doc.line(x1, y, x2, y);
```

---

## Données dynamiques injectées dans le PDF

Les valeurs viennent de l'objet `lvData` passé en paramètre à `_lvuRecto(lvData)` :

```javascript
lvData = {
  numero:         '01449',
  date:           '24/04/2026',
  type:           'nationale',       // ou 'cmr'
  transporteur: {
    nom:          'TRANSPORTS MESNAGER',
    adresse:      'La Perrière',
    cp_ville:     '61360 SAINT-DENIS-DE-VILLENETTE',
    siret:        '803 611 093 00026',
    telephone:    '06 08 39 91 53',
    rcs:          'RCS LAVAL 314 901 869',
  },
  conducteur:     '',
  vehicule:       '',
  remorque:       '',
  donneurOrdre:   '',
  marchandises: [
    { nombre: '1/1', nature: '', poids: '', note: '1' },
    { nombre: '1/2', nature: '', poids: '', note: '2' },
    // ... jusqu'à LV.MARC_ROWS lignes
  ],
  reservesChargement:   '',
  reservesDechargement: '',
  documentsAnnexes:     '',
  convoiExceptionnel:   false,        // true/false → case cochée
  expediteur: {
    nom:     'SONOTRAD',
    adresse: 'ZA Renardières',
    cp_ville:'53250 Javron-les-Chapelles',
  },
  destinataire: {
    nom:     '',
    adresse: '',
    cp_ville:'',
  },
}
```

---

## Points d'amélioration prioritaires (v2)

### Corrections immédiates
- [ ] **Titre** : passer le fond de gris neutre à bleu marine `[15, 52, 96]` — différenciation visuelle forte
- [ ] **DATE** : mettre en gras, ajouter un fond légèrement coloré pour la faire ressortir
- [ ] **Zone signatures** : augmenter `SIG_H` à 28 mm minimum + ajouter ligne pointillée de signature dans chaque cellule
- [ ] **Réserves** : `RESERVES_H` à 15 mm pour permettre l'écriture manuscrite
- [ ] **Colonne NOTE** : `MARC_COL_NOTE_W` à 35 mm (trop étroite actuellement)

### Améliorations esthétiques
- [ ] Alternance de couleur sur les lignes du tableau marchandises (pair/impair)
- [ ] Logo SONOTRAD en haut à gauche du titre (si fichier PNG dispo dans `/assets/`)
- [ ] Filet séparateur plus épais entre colonnes transporteur et conducteurs
- [ ] Padding interne homogène : `+2 mm` à gauche de chaque cellule texte

### Fonctionnalités à venir
- [ ] **Mode remplissage progressif** : certains champs sont remplis à l'étape chargement (transporteur, expéditeur), d'autres à la livraison (réserves, destinataire, signatures)
- [ ] **Version CMR** : adaptation bilingue FR/EN de toutes les sections (même layout, textes différents)
- [ ] **Verso** : conditions de transport et plafonds de responsabilité (voir LV_VERSO_CONDITIONS)
- [ ] **QR code** : insérer un QR code en haut à droite renvoyant vers l'URL de la LV en ligne

---

## Comment modifier le layout — procédure

1. Ouvrir `lv-layout-constants.js`
2. Modifier la constante concernée (ex : `SIG_H: 28`)
3. Lancer la génération d'une LV de test dans la PWA
4. Vérifier visuellement dans le PDF — les sections calculées (Y getters) se repositionnent automatiquement
5. Si un chevauchement apparaît, augmenter la hauteur de la section en cause

**Ne jamais** patcher une coordonnée directement dans `_lvuRecto()` sans reporter la valeur dans `lv-layout-constants.js`.

---

## Contraintes réglementaires à respecter

- Le document doit être **lisible par la police** (contrôle routier) → taille de fonte minimum 6pt pour les mentions légales, 7pt pour le contenu
- Les champs **réserves** doivent rester **modifiables à la main** à l'impression → hauteur minimum 12 mm
- La case **NATIONALE / CMR** doit être cochée avec un **X visible** (taille checkbox 3.5 mm minimum)
- Le numéro de LV doit figurer **en haut à droite en grands caractères** (min 12pt, bold)
- Conserver les deux langues (FR/EN) pour les sections concernées par la CMR

---

## Fichiers liés

```
sonotrad-pwa/
├── index.html                    ← fonction _lvuRecto() ~ligne 5960
├── lv-layout-constants.js        ← CE FICHIER — source de vérité du layout
├── assets/
│   └── logo-sonotrad.png         ← à créer/intégrer pour le logo
└── CLAUDE.md                     ← CE FICHIER — contexte pour Claude Code
```
