# CLAUDE.md — Module Génération PDF Lettre de Voiture (LV / CMR)

## Contexte du projet

PWA Sonotrad — Application web progressive de gestion des transports pour SONOTRAD (Javron-les-Chapelles, 53).
La PWA permet de créer, remplir et exporter des Lettres de Voiture Uniques (LV nationales) et des CMR (transport international).

**Fichier principal :** `index.html`
**Fonction de rendu recto :** `_lvuRecto()` — environ ligne 5960
**Fonction de rendu verso :** `_lvuVerso()` — à créer
**Librairie PDF :** jsPDF (coordonnées en mm, origine en haut à gauche)
**Format :** A4 portrait, 210 × 297 mm

---

## Documents de référence

Trois fichiers à conserver à la racine du projet :

1. **`lv-layout-constants.js`** — toutes les constantes de mise en page (X, Y, W, H, couleurs, fontes)
2. **`LV_REFERENCE.pdf`** — PDF modèle validé (recto + verso) à reproduire fidèlement
3. **`lv_modele_corrige.html`** — source HTML/CSS du modèle, utile pour comprendre le layout cible

**Règle absolue :** toute modification de mise en page passe par `lv-layout-constants.js`, jamais en dur dans le code de rendu. Toute évolution doit produire un PDF visuellement identique au modèle de référence.

---

## Architecture du générateur PDF

Le PDF est entièrement construit par calcul de coordonnées dans `_lvuRecto()` et `_lvuVerso()`.
Aucun template externe — tout est code JS jsPDF.

```
index.html
  ├── _lvuRecto(lvData)  → page 1 du PDF
  └── _lvuVerso()        → page 2 du PDF (statique, conditions générales)
        └── importent toutes deux LV depuis lv-layout-constants.js
```

---

## Charte visuelle

### Couleurs

| Usage | Hex | RGB jsPDF |
|---|---|---|
| Bleu marine principal (titre, DATE, MARCHANDISES, bordures) | `#1f3a5f` | `[31, 58, 95]` |
| Bleu très clair (en-têtes colonnes marc, ligne TOTAL) | `#dde6f2` | `[221, 230, 242]` |
| Gris clair (séparateurs intra-tableau marchandises) | `#b8c6d9` | `[184, 198, 217]` |
| Fond ligne paire marchandises | `#f7f9fc` | `[247, 249, 252]` |
| Fond donneur d'ordre / refus signature | `#f3f6fb` | `[243, 246, 251]` |
| **Verso : texte corps** | `#c0c0c0` | `[192, 192, 192]` |
| **Verso : titres blocs** | `#b0b0b0` | `[176, 176, 176]` |
| **Verso : bordures** | `#efefef` | `[239, 239, 239]` |
| **Verso : fond en-têtes blocs** | `#fbfbfb` | `[251, 251, 251]` |

### Typographie

Police unique : **Helvetica** (jsPDF default).
Tailles en pt : 5.5 (mentions légales), 6.3 (labels colonnes), 7.5 (corps), 8 (sections), 10 (titre transporteur), 14 (titre principal), 22 (numéro LV).

---

## Structure du document RECTO

Le recto utilise une **architecture en 2 colonnes superposées sur les 3 premières sections**, puis pleine largeur ensuite.

```
┌──────────────────────────────────────┬──────────────┐
│ TITRE bleu marine "LETTRE DE..."     │              │
├──────────────────┬───────────────────┤   N° 01449   │  ← bloc N° fait
│ ☒ NATIONALE      │ ☐ INTERNATIONALE  │  18.5 mm     │   18.5 mm de haut
│                  │       [CMR]       │              │   = titre + NAT/CMR
├──────────────────┼───────────────────┼──────────────┤
│ Mentions FR      │ Mentions CMR FR   │ ████ DATE ███│
│                  │ + EN              │ 24/04/2026   │
└──────────────────┴───────────────────┴──────────────┘
[zone pleine largeur en dessous]
Transporteur / Conducteurs / Immat.
Donneur d'ordre
MARCHANDISES (header) + 11 lignes
Refus signature
Réserves Chargement / Déchargement
Documents annexes / Convoi exceptionnel
Expéditeur / Destinataire
Signatures (3 colonnes)
```

### Tableau des sections

| # | Section | Hauteur | Notes |
|---|---|---|---|
| 1 | Titre principal | 11 mm | Fond `#1f3a5f`, texte blanc 14pt bold, lettre-spacing 1pt |
| 2 | NATIONALE / INTERNATIONALE+CMR | 7 mm | 2 colonnes égales (78 mm chacune), checkbox 3.8mm |
| 3 | Mentions légales FR / CMR | 18 mm | 2 colonnes égales (78 mm chacune), texte 5.5pt italique pour EN |
| 4 | Bloc N° + DATE (colonne droite) | 18.5 mm + reste | Largeur fixe 42 mm |
| 5 | Transporteur / Conducteurs / Immatriculations | 34 mm | Gauche 116mm + droite 82mm (cond 13mm + immat reste) |
| 6 | Donneur d'ordre | 9 mm | Fond `#f3f6fb`, label gauche 34mm + valeur reste |
| 7 | Header MARCHANDISES / GOODS | 6 mm | Fond `#1f3a5f`, texte blanc centré |
| 8 | En-têtes colonnes marchandises | 6 mm | Fond `#dde6f2`, 4 colonnes : 24/flex/30/22 mm |
| 9 | 10 lignes marchandises + 1 ligne TOTAL | 11 × 8.5 mm | Alternance fond `#f7f9fc` / blanc, ligne TOTAL fond `#dde6f2` |
| 10 | Refus signature (2 colonnes) | 7 mm | Fond `#f3f6fb`, texte 5.8pt italique |
| 11 | Réserves Chargement / Déchargement | 20 mm | 2 colonnes égales |
| 12 | Documents annexes / Convoi exceptionnel | 10 mm | Gauche flex + droite avec OUI/NON |
| 13 | Expéditeur / Destinataire | 26 mm | 2 colonnes égales |
| 14 | Signatures (3 colonnes) | 32 mm | Égales, en-tête fond `#dde6f2`, ligne pointillée en bas |

**Total : 285 mm** (= 297 - 2×6 mm de marge)

---

## Spécifications détaillées des sections critiques

### Bloc N° + DATE (colonne droite, largeur 42 mm)

```
┌──────────────┐
│              │  ← 18.5 mm (titre 11mm + NAT/CMR 7mm + 0.5mm bordure)
│  N°  01449   │     fond blanc, N° 10pt bold, 01449 22pt bold
│              │     couleur #1f3a5f
├──────────────┤
│ ████ DATE ██ │  ← 6 mm, fond #1f3a5f, texte blanc 8pt bold
├──────────────┤
│              │
│  24/04/2026  │  ← reste, fond blanc, 13pt bold #1f3a5f, centré
│              │
└──────────────┘
```

**Important :** la séparation horizontale entre le bloc N° et le bandeau DATE doit tomber **exactement au même niveau** que la séparation entre la zone NATIONALE/CMR et les mentions légales. Calage : `y = 18.5 mm` après marge haute.

### Logo CMR (case INTERNATIONALE)

À côté du texte "INTERNATIONALE" et de la checkbox, ajouter une étiquette encadrée "CMR" :
- Bordure : 0.8pt `#1f3a5f`
- Border-radius : 1.2 mm
- Padding : 0.5mm vertical, 2mm horizontal
- Texte : "CMR" 7pt bold `#1f3a5f`, letter-spacing 0.3pt
- Fond : blanc
- Marge gauche : 4 mm depuis le texte INTERNATIONALE

### Tableau marchandises

- 10 lignes de saisie + 1 ligne TOTAL
- Hauteur ligne : **8.5 mm** (compactes pour permettre 11 lignes au total)
- Colonnes : `Nombre` 24mm | `Nature` flex | `Poids/M.L.` 30mm | `Note` 22mm
- En-tête colonnes : fond `#dde6f2`, texte `#1f3a5f` 6.3pt bold UPPERCASE letter-spacing 0.3pt
- Lignes : alternance blanc / `#f7f9fc`, séparateurs `#b8c6d9` 0.3pt
- Ligne TOTAL : fond `#dde6f2`, bordure haute `#1f3a5f` 0.6pt, texte 7.8pt bold `#1f3a5f`, libellé "TOTAL / Total" aligné à droite dans la colonne Nature

### Zone signatures

3 colonnes égales (largeur ~64.7 mm), hauteur 32 mm.
Pour chaque colonne :
- En-tête : fond `#dde6f2`, texte `#1f3a5f` 7pt bold UPPERCASE centré, padding 1.2mm
- Sous-titre anglais : 6pt italique `#555` centré
- Zone vide pour cachet/signature
- Ligne pointillée en bas : `border-bottom 0.8pt dashed #1f3a5f`, marges latérales 3mm, position 2mm du bas

---

## Structure du document VERSO (filigrane gris discret)

Le verso présente les conditions générales de transport. **Rendu volontairement très discret** — l'information juridique est présente mais ne doit pas dominer visuellement.

### Layout global

```
┌─────────────────────────────────────────────┐
│ CONDITIONS DE TRANSPORT — PLAFONDS DE...    │  ← titre 13pt #b5b5b5
│ Articles L.133-1 et suivants...             │  ← sous-titre 8pt italique #c8c8c8
├─────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌─────────────────┐   │
│ │ TRAFIC INT. ≥3T │  │ MASSES INDIVIS. │   │
│ ├─────────────────┤  ├─────────────────┤   │
│ │ TRAFIC INT. <3T │  │ VÉHICULES ROUL. │   │
│ ├─────────────────┤  ├─────────────────┤   │  ← 2 colonnes
│ │ TEMP. DIRIGÉE   │  │ CMR INTERNATL.  │   │     5 blocs gauche
│ ├─────────────────┤  ├─────────────────┤   │     4 blocs droite
│ │ CITERNES        │  │ LITIGES         │   │     flex:1 pour étirer
│ ├─────────────────┤  ├─────────────────┤   │
│ │ ANIMAUX VIVANTS │  │ DÉCL. VALEUR    │   │
│ └─────────────────┘  └─────────────────┘   │
├─────────────────────────────────────────────┤
│ TRANSPORTS MESNAGER — La Perrière · ...     │  ← footer
└─────────────────────────────────────────────┘
```

### Spécifications de rendu verso

**En-tête** :
- Titre : 13pt bold, `#b5b5b5`, letter-spacing 0.6pt, centré
- Sous-titre : 8pt italique, `#c8c8c8`, centré
- Bordure inférieure : 0.3pt `#ececec`

**Blocs de conditions** (9 blocs) :
- Bordure : 0.3pt `#efefef`
- En-tête bloc : fond `#fbfbfb`, texte `#b0b0b0` 8.5pt bold, padding 1.8mm × 3mm
- Corps bloc : padding 2.5mm × 3mm, texte 7.8pt `#c0c0c0`, line-height 1.55
- Listes : puces `·` (point central) en `#d5d5d5` 13pt, items 7.5pt `#c0c0c0`
- Mention "Retard" : bordure haute pointillée 0.3pt `#ececec`, italique `#c8c8c8` 7.5pt
- Étirement uniforme : flex:1 sur chaque bloc

**Footer** :
- Bordure haute 0.3pt `#efefef`
- Coordonnées TRANSPORTS MESNAGER en `#d0d0d0` 6.5pt
- "TRANSPORTS MESNAGER" en `#b8b8b8` UPPERCASE letter-spacing 0.3pt

### Contenu textuel des 9 blocs

**Colonne gauche :**

1. **TRAFIC INTÉRIEUR · ENVOIS ≥ 3 TONNES** (réf. Décret 2017-461 du 31 mars 2017)
   - Perte ou avarie : 20 €/kg de poids brut manquant ou avarié, plafond global nb tonnes × 3 200 €
   - Note : "La plus faible des deux limites s'applique."
   - Retard : indemnisation limitée au prix du transport

2. **TRAFIC INTÉRIEUR · ENVOIS < 3 TONNES** (réf. Décret 2017-461)
   - Perte ou avarie : 33 €/kg, max 1 000 €/colis
   - Retard : prix du transport

3. **TRANSPORT SOUS TEMPÉRATURE DIRIGÉE**
   - Envois ≥ 3 t : 14 €/kg, plafond nb t × 4 000 €
   - Envois < 3 t : 23 €/kg, plafond 750 €/colis
   - Retard : prix du transport

4. **TRANSPORT EN CITERNES**
   - Marchandise : 3 €/kg ou litre, plafond 55 000 €/envoi
   - Autres dommages : plafond 300 000 €/envoi
   - Retard : prix du transport

5. **TRANSPORT D'ANIMAUX VIVANTS**
   - Indemnisation selon plafond par animal (art. D3222-4 Code des transports)
   - Retard : prix du transport

**Colonne droite :**

6. **TRANSPORT DE MASSES INDIVISIBLES**
   - Dommages directs : 60 000 €/envoi
   - Autres dommages : double du prix du transport
   - Retard : prix du transport

7. **TRANSPORT DE VÉHICULES ROULANTS**
   - Véhicule neuf : valeur de remplacement HT au tarif constructeur
   - Occasion coté Argus : valeur Argus
   - Occasion non coté : 800 €
   - Autres dommages : 500 €/véhicule
   - Retard : prix du transport

8. **TRAFIC INTERNATIONAL · CONVENTION CMR**
   - Indemnisation limitée à **8,33 DTS par kg** de poids brut (sauf déclaration de valeur, intérêt spécial, vol ou faute lourde)
   - Remboursement aussi : prix du transport, droits de douane, frais liés
   - Retard : prix du transport sauf déclaration intérêt spécial (CMR art. 23 et 29)

9. **LITIGES · COMPÉTENCE JURIDICTIONNELLE**
   - Compétence exclusive des tribunaux du siège social du transporteur

10. **DÉCLARATIONS DE VALEUR**
    - Limites non applicables en cas de déclaration de valeur ou d'intérêt spécial à la livraison

---

## Données dynamiques (objet `lvData` passé à `_lvuRecto()`)

```javascript
lvData = {
  numero:         '01449',
  date:           '24/04/2026',
  type:           'nationale',       // 'nationale' | 'cmr'
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
    { nombre: '', nature: '', poids: '', note: '' },
    // ... jusqu'à 10 lignes
  ],
  total:          { poids: '' },     // pour la 11ème ligne TOTAL
  reservesChargement:   '',
  reservesDechargement: '',
  documentsAnnexes:     '',
  convoiExceptionnel:   false,
  expediteur:    { nom: '', adresse: '', cp_ville: '' },
  destinataire:  { nom: '', adresse: '', cp_ville: '' },
}
```

---

## Règles de rendu jsPDF

```javascript
// Coordonnées en mm depuis le coin haut-gauche
doc.setFont('Helvetica', 'bold');     // 'normal' | 'italic'
doc.setFontSize(LV.FONT_SECTION);

// Cellule avec fond
doc.setFillColor(...LV.COLOR_HEADER_BG);
doc.rect(x, y, w, h, 'F');           // F=filled, FD=filled+bordered, S=stroke

// Texte aligné gauche (avec padding interne 2mm)
doc.text('TEXTE', x + 2, y + h/2 + size/4);

// Texte centré
doc.text('TITRE', x + w/2, y + h/2 + size/4, { align: 'center' });

// Bordure
doc.setDrawColor(...LV.COLOR_BORDER);
doc.setLineWidth(0.3);
doc.line(x1, y, x2, y);

// Ligne pointillée (signature)
doc.setLineDashPattern([1, 1], 0);
doc.line(x1, y, x2, y);
doc.setLineDashPattern([], 0);
```

---

## Points de vigilance — règles non-négociables

### 1. Alignement vertical NATIONALE/CMR ↔ FR/CMR
La séparation entre NATIONALE et INTERNATIONALE doit tomber **exactement** au milieu de la zone gauche (78 mm depuis le bord), pile au-dessus de la séparation entre les mentions légales FR et CMR.

### 2. Alignement horizontal N°/DATE ↔ NATIONALE/CMR / mentions légales
La séparation horizontale entre le bloc N° et le bandeau DATE doit tomber **exactement** au même niveau (`y = 18.5 mm` après marge haute) que la séparation entre la ligne NATIONALE/CMR et les mentions légales.

### 3. Aucun texte ne doit dépasser de sa cellule
- Toute valeur dynamique (donneur d'ordre, immatriculations, marchandises) doit être tronquée si trop longue
- Utiliser `doc.splitTextToSize(text, maxWidth)` ou troncature manuelle avec ellipsis "…"

### 4. Verso obligatoirement en gris filigrane
Aucune couleur saturée sur le verso. Le verso est un support juridique, pas un élément graphique. Toutes les valeurs gris entre `#b0b0b0` (le plus foncé) et `#efefef` (le plus clair).

### 5. Logo CMR toujours présent
Même si la case INTERNATIONALE n'est pas cochée, l'étiquette "CMR" doit apparaître à côté pour signaler la nature du document aux contrôles étrangers.

---

## Procédure de modification du layout

1. Ouvrir `lv-layout-constants.js`
2. Identifier la constante concernée (ex : `H_NUM_BLOCK: 18.5`)
3. Modifier la valeur
4. Lancer la génération d'une LV de test dans la PWA
5. Comparer visuellement avec `LV_REFERENCE.pdf`
6. Si écart visible, ajuster jusqu'à correspondance parfaite

**Ne jamais** patcher une coordonnée directement dans `_lvuRecto()` ou `_lvuVerso()` sans reporter la valeur dans `lv-layout-constants.js`.

---

## Évolutions futures prévues

- [ ] **Mode remplissage progressif** : transporteur + expéditeur à l'étape chargement, réserves + destinataire + signatures à la livraison
- [ ] **QR code** en haut à droite renvoyant vers l'URL de la LV en ligne (intégrable dans le bloc N°)
- [ ] **Export multi-pages** si plus de 10 marchandises (page recto principale + pages annexes)
- [ ] **Logo SONOTRAD** à intégrer dans la zone titre (en haut à gauche, à gauche du texte "LETTRE DE VOITURE UNIQUE")
- [ ] **Signature électronique** avec horodatage cryptographique au lieu de signature manuscrite

---

## Fichiers du module LV

```
sonotrad-pwa/
├── index.html                           ← _lvuRecto() ~ligne 5960, _lvuVerso() à créer
├── lv-layout-constants.js               ← source de vérité du layout
├── LV_REFERENCE.pdf                     ← PDF modèle validé à reproduire
├── lv_modele_corrige.html               ← source HTML du modèle (référence)
└── CLAUDE.md (ce fichier)
```
