# CLAUDE.md — Module Portail Transporteur

## Contexte du projet

Portail externe en lecture seule, à partager avec les transporteurs (LOXAM notamment), qui affiche en temps réel les voyages disponibles à planifier — 1 LV/CMR = 1 voyage. Vue commune à tous les transporteurs (pas de personnalisation par transporteur pour l'instant).

**Fichier principal :** `portail-transporteur.html` (page statique autonome, aucune dépendance au reste de la PWA)
**Base de données :** Supabase (même projet que le module Pointage, voir `CLAUDE_POINTAGE.md`)
**Migration :** `supabase/migrations/20260722000000_voyages_schema.sql`

---

## Amélioration future — marquer "Parti" par voyage depuis la PWA (pas encore fait)

Confirmé avec Hugo (2026-07-23) : le marquage manuel de la case Parti se fait bien dans
**Planning Sonotrad → onglet Départs, colonne J** (c'est là que `onEditPartiSync` est bindé —
correct, rien à changer). Le bouton "marquer parti" existant dans la PWA (action
`dep_mark_parti` / `_markParti()`) n'est en pratique pas utilisé pour ça : les départs se font
**par voyage** (un camion peut embarquer plusieurs modules/LV en même temps), et retrouver
manuellement dans la PWA tous les modules d'un même voyage pour les cocher un par un serait plus
lent et plus source d'erreur que de cocher directement la ou les lignes correspondantes dans le
tableur.

Piste retenue par Hugo pour plus tard : une vraie fonctionnalité "marquer un voyage entier comme
parti" dans la PWA (sélection groupée de tous les modules/LV d'un même voyage en un geste),
pour que ça redevienne plus fiable de le faire depuis la PWA plutôt que depuis le tableur.
Pas de scope, pas de priorité fixée pour l'instant — juste noté pour ne pas perdre l'idée.

---

## Pourquoi Supabase et pas une lecture directe de la Google Sheet

**Correction (2026-07-23)** : la vraie source de gestion interne pour TOUS les LV/CMR (LOXAM
et BCB confondus) est l'onglet **Archive** du fichier LV/CMR
(`1yB1QNVcevrOq_KknbpdFWkEbymgPCoCu6HYJLNPaQoI`, colonnes Date, N°LV, Expéditeur, Destination,
Doc annexe, Chargement, Commande, Type, Convoi, Chauffeur, Immat moteur, Immat semi, Note,
Poids, ML, **Parti** en colonne P) — pas l'onglet Départs de "Planning Sonotrad" comme indiqué
initialement dans ce fichier. Ce dernier (`1sXx9_kGs9DGLY6-ra6NRWVtj45WVxyP95ufvZi8n0cY`) n'a
qu'un miroir partiel, LOXAM uniquement (voir `masterfile/pwa_master.js → _saveLv/_markParti`
dans sonotrad-scripts). Mais une lecture périodique du tableur ne donne pas de vrai temps réel et exposerait des colonnes internes (Commande, BT) au portail public.

Le choix retenu : une table Supabase `voyages`, alimentée à la source (au moment où la LV est créée dans la PWA), avec Realtime activé — le portail se met à jour à la seconde près, sans repasser par le tableur.

---

## Les deux points d'écriture

### 1. Création d'un voyage — déjà en place, aucune action manuelle requise

La génération du PDF (LV/CMR) est 100% côté PWA (jsPDF, voir `CLAUDE_LV.md`). La sauvegarde (numérotation, PDF sur Drive, ligne dans l'onglet Départs) passe par un Apps Script Web App, appelé depuis `lvuSaveToDrive()` dans `index.html`.

Cette fonction appelle maintenant, juste après le succès de l'enregistrement AppScript existant :

```js
this._syncVoyageSupabase(d, savedDisplay);
```

qui appelle le RPC Supabase `enregistrer_voyage(...)` avec les champs déjà calculés à ce moment-là dans la PWA : `poids`, `ml`, `grutage` (booléen, pas du texte libre), `destination`, `commentaire`. Best-effort : si Supabase est injoignable, la création de la LV n'est pas bloquée, seule une trace `console.warn` est laissée.

**Aucune modification de l'Apps Script existant n'était nécessaire pour cette partie.**

### 2. Marquage "Parti" — code déployé, reste 1 clic manuel pour Hugo

Décision prise avec Hugo (2026-07-22) : les équipes continuent de cocher la case Parti (colonne J, onglet Départs) comme aujourd'hui — pas de bouton ajouté dans la PWA pour ça.

**Déployé le 2026-07-23** via le repo `sonotrad-scripts` (accès clasp disponible dans cet environnement, contrairement à ce qu'on pensait au départ) : `planning/SyncPartiSupabase.js` contient le déclencheur `onEditPartiSync` qui, dès que la case J est cochée/décochée sur l'onglet Départs, appelle le RPC Supabase `marquer_parti(numero_lv, parti)`. Poussé en HEAD sur le projet Apps Script `planning` (`clasp push`, commit `9d98e97` dans sonotrad-scripts).

`apps-script/sync-parti-supabase.gs.txt` (ce repo) reste la copie de référence/historique — la source de vérité est maintenant `sonotrad-scripts/planning/SyncPartiSupabase.js`.

**Dernière étape, 100% manuelle (confirmé impossible à automatiser depuis cet environnement)** : le code est poussé mais le déclencheur n'est pas encore actif tant que la fonction d'installation n'a pas tourné au moins une fois.

`clasp run installPartiTrigger` a été tenté à fond (déploiement en "API exécutable" créé, manifest mis à jour) mais échoue toujours : le token OAuth utilisé par clasp n'a pas consenti aux scopes du manifeste du script (Drive, Spreadsheets, Calendar, envoi d'email...) — requis par l'API d'exécution Google, indépendamment du toggle de compte "Google Apps Script API" (déjà activé par Hugo, vérifié). Corriger ça demanderait un `clasp login` avec écran de consentement large — jugé disproportionné pour économiser un clic, décision prise avec Hugo (2026-07-23).

Pour Hugo :
1. Ouvrir "Planning Sonotrad" → Extensions → Apps Script (projet `planning`)
2. Sélectionner `installPartiTrigger` dans le menu déroulant des fonctions, cliquer **Exécuter** (autoriser les permissions si demandé — première exécution de cette fonction)
3. Vérifier dans le menu Déclencheurs (icône horloge) qu'un déclencheur `onEditPartiSync` / "Sur modification" apparaît bien

Pour désactiver/rollback : exécuter `removePartiTrigger` une fois de la même façon. `listTriggers()` permet de vérifier l'état sans rien modifier.

---

## Schéma Supabase

| Table | Rôle |
|-------|------|
| `voyages` | Exposée au portail (Realtime activé). Colonnes non sensibles uniquement : numero_lv, type, date_creation, destination, poids, ml, grutage, commentaire, transporteur, parti, parti_le |
| `voyages_internes` | BT (doc_annexe) et n° de commande Loxam — jamais lue par anon, aucune policy RLS dessus |
| `voyages_portail` (vue) | Confort de lecture, triée voyages disponibles en premier |

RLS : aucune écriture directe possible pour `anon` — tout passe par les fonctions `security definer` `enregistrer_voyage()` et `marquer_parti()`. Lecture (`SELECT`) ouverte sur `voyages` pour que Realtime fonctionne (nécessaire : Realtime écoute la table, pas une vue).

---

## Anomalies connues dans la donnée source (relevées le 2026-07-22)

- Le champ Poids est presque toujours vide dans l'onglet Départs — mais la PWA calcule bien un poids à la création (somme des lignes marchandises). Une fois `_syncVoyageSupabase` en production, `voyages.poids` sera alimenté même si la colonne Poids de la sheet reste vide.
- Au moins 2 LV avaient une date de livraison commentée déjà dépassée mais la case Parti jamais cochée (LV 01498, 01600 au 21/07/2026) — probablement oubliées, à vérifier côté équipe.
- Une cellule ML contenait une date au lieu d'un nombre (LV 01647) — erreur de saisie ponctuelle dans la sheet, sans impact sur `voyages` puisque la valeur vient directement de la PWA.

## Bug corrigé le 2026-07-23 — CMR BCB jamais marquées "parti" à la création

Repéré par Hugo : contrairement à LOXAM (la LV est créée en avance, le vrai départ suit plus
tard), pour l'activité BCB **la CMR est créée au moment même où le matériel part** — donc
`parti` aurait toujours dû être `true` dès la création pour ces documents. Ce n'était le cas ni
dans l'onglet **Archive** du fichier LV/CMR (`1yB1QNVcevrOq_KknbpdFWkEbymgPCoCu6HYJLNPaQoI` —
et non "Planning Sonotrad" comme supposé au départ, voir section précédente), ni dans
`enregistrer_voyage()` côté Supabase. Résultat : du matériel BCB déjà parti apparaissait comme
disponible sur le portail transporteur.

Corrigé aux deux endroits (détection : `expediteur === 'BCB OFF MARKET'` / `source === 'bcb'`) :
- **masterfile/pwa_master.js → `_saveLv()`** : colonne Parti de l'Archive mise à `true` dès la
  création si `source === 'bcb'`. Déployé en prod le 2026-07-23 (`clasp redeploy`, v69).
- **Supabase `enregistrer_voyage()`** : nouveau paramètre `p_parti`, passé par
  `_syncVoyageSupabase()` dans `index.html` (`p_parti: d.source === 'bcb'`).
- **Correction rétroactive Supabase** : les 16 voyages BCB déjà backfillés à tort en
  "disponible" ont été corrigés directement (`parti = true`) le 2026-07-23.
- **Correction rétroactive Google Sheet (Archive, historique complet, pas seulement les 50
  dernières lignes)** : fonction `backfillBcbParti()` ajoutée à `masterfile/pwa_master.js` —
  dry-run par défaut (ne fait qu'un rapport dans les logs), passer `false` en paramètre pour
  appliquer réellement. **Reste à exécuter manuellement par Hugo** depuis l'éditeur Apps Script
  du projet `masterfile` (menu Exécuter → `backfillBcbParti`) — même limite `clasp run` que
  pour `installPartiTrigger` (scopes OAuth insuffisants).

---

## Backfill des voyages existants (2026-07-22)

Au moment de la mise en prod, la table `voyages` était vide alors que 35 LV/CMR de l'onglet
Départs étaient déjà non-partis. Ces 35 voyages ont été importés une fois, manuellement, via
le MCP Supabase (`execute_sql`), à partir de l'action `lv_history` de l'API existante (limitée
aux 50 derniers documents — les non-partis plus anciens que ça, comme l'anomalie LV 01498
citée plus bas, ne sont pas dans ce backfill et devront être ajoutés à la main si besoin, ou
attendre que Hugo les traite/décoche dans la sheet).

Point d'attention découvert pendant l'import : le champ `date` renvoyé par `lv_history` est
incohérent selon l'ancienneté de la ligne — les dates récentes sont en `DD/MM/YYYY`, un bloc
plus ancien (LV 01615 à 01648 environ) était en `MM/DD/YYYY` (bug de génération de date côté
PWA à l'époque, corrigé depuis). Le script de backfill a résolu l'ambiguïté par continuité
chronologique (une date ne peut pas être postérieure à la précédente vu que les numéros de LV
sont strictement croissants dans le temps). Ce backfill n'est pas un script réutilisable dans
le repo — c'est un import ponctuel exécuté une fois en session ; toute nouvelle LV passe
normalement par `_syncVoyageSupabase()`.

Le champ `transporteur` et `grutage` n'existent pas dans `lv_history` : les 35 voyages
backfillés ont `transporteur = NULL` et `grutage = false` par défaut (impossible à reconstituer
a posteriori de façon fiable).

**Extension à 100 lignes (2026-07-23)** : Hugo a repéré des voyages non-partis plus anciens que
la fenêtre initiale de 50. `_getLvHistory()` accepte maintenant `?limit=N` (défaut 50, plafond
500, déployé en prod v70) — un second backfill avec `limit=100` a ajouté 4 voyages manquants
(`01610`, `01600` — l'anomalie déjà repérée le 2026-07-22 —, `01578`, `01575`). **`01498` reste
hors de portée** (au-delà de la fenêtre 100, pas encore rechargé) ; relancer un backfill avec
`limit=200` ou plus si besoin de le récupérer aussi.

---

## Mise en page (2026-07-23) — liste + carte côte à côte

Sur demande de Hugo, la page n'a plus d'onglets Liste/Carte : les deux sont affichées en
permanence, liste à gauche / carte à droite (`.layout { grid-template-columns: 1fr 1fr }`),
empilées verticalement sous 900px de large (une seule colonne, carte au-dessus de la liste dans
le flux DOM). La carte est en `position: sticky` côté desktop pour rester visible pendant le
scroll de la liste.

**Révision (2026-07-23, suite retour Hugo)** : passage temporaire à des cartes (une par
voyage) abandonné — Hugo préfère le `<table>` d'origine (une ligne par voyage, en-tête de
colonnes), donc revenu à un tableau classique, avec en plus la colonne Marchandise (extrait
tronqué avec ellipsis CSS, `title` pour le texte complet). Colonnes : LV (+ badge type), Créée
le, Destination, Marchandise, Poids, ML, Grutage, Contrainte — toutes tronquées sur une ligne
sauf LV/Poids/ML/Grutage. `table-layout: fixed` avec largeurs en `%` par colonne ;
`#voyage-table-wrap` scrolle horizontalement en dernier recours sur très petit écran. Le total
"Mètres linéaires cumulés" reste retiré des cartes statistiques (ne restent que Voyages
disponibles / Destinations distinctes).

**Sélection croisée liste ↔ carte (2026-07-23)** : un marqueur = une ville, qui peut regrouper
plusieurs voyages (plusieurs `<tr>` du tableau). `cityMarkers` / `cityToNumeros` / `numeroToCity`
relient les deux sens :
- Survoler une ligne du tableau → surligne la ligne + son marqueur (`highlightCity`), aperçu
  temporaire qui revient à l'état sélectionné (`selectedCity`) à la sortie de la souris.
- Cliquer une ligne → sélection persistante + `leafletMap.flyTo()` vers le marqueur
  correspondant (zoom mini 8).
- Survoler/cliquer un marqueur → surligne toutes les lignes de la même ville ; le clic scrolle
  en plus la première ligne correspondante dans la vue (`scrollIntoView`).
- Si la ville sélectionnée disparaît d'un rafraîchissement à l'autre (voyage marqué parti), la
  sélection est nettoyée automatiquement (`renderMapMarkers`).

`marchandises_desc` est une nouvelle colonne sur `voyages` (migration
`20260723100000_voyages_marchandises_desc.sql`), alimentée par `_syncVoyageSupabase()` dans
`index.html` (`(d.marchandises || []).map(m => m.description)...`), comme le fait déjà le
payload envoyé à l'Apps Script pour l'archive PDF.

**Correction 2026-07-23** : Hugo a remarqué que cette info existe bien dans Google Sheets —
côté Planning Sonotrad → Départs (colonne "Chargement", embarquée dans le libellé "LV n°xxxxx,
<description>") — mais n'était jamais copiée dans l'onglet **Archive** du fichier LV/CMR (la
vraie source de `lv_history`, voir plus haut). Corrigé dans `masterfile/pwa_master.js →
_saveLv()` : la description marchandises est maintenant écrite en colonne R de l'Archive, et
`_getLvHistory()` la renvoie (`marchandises_desc`) quand elle existe. Déployé en prod (v70).

## Mise en page (2026-07-23, suite) — colonnes réordonnées + carte détail au clic

Sur demande de Hugo : la colonne **Contrainte** est déplacée avant Poids/ML/Grutage dans le
tableau (ordre final : LV, Créée le, Destination, Marchandise, Contrainte, Poids, ML, Grutage).

Cliquer sur une ligne ouvre désormais une **carte de détail** (`#voyage-modal`,
`openVoyageModal(numero)`/`closeVoyageModal()`) en plus du comportement déjà existant (sélection
croisée sur la carte) — les deux actions coexistent, le clic déclenche toujours le
recentrage carte + surlignage ET ouvre la modale. Contenu : destinataire, **adresse de
livraison complète** (nouveau, voir ci-dessous), marchandise complète (non tronquée),
contrainte complète, poids/ML/grutage, date de création. Fermeture : bouton ✕, clic en dehors
de la carte, ou touche Échap.

**Nouvelle colonne `voyages.destination_adresse`** (migration
`20260723153802_voyages_destination_adresse.sql`) : jusqu'ici seul le *nom* du destinataire
était synchronisé (`destination`), jamais son adresse. Alimentée par `_syncVoyageSupabase()`
dans `index.html` (`[d.destinataire?.adresse, d.destinataire?.ville].filter(Boolean).join(', ')`
— déjà saisies à la création de la LV/CMR, juste jamais transmises avant). **NULL pour tout
voyage créé avant ce commit** — même limite que `marchandises_desc`, rien à récupérer
rétroactivement (la donnée n'existe nulle part côté Archive/Sheet dans un format exploitable en
masse). Le portail affiche "Non renseignée" dans ce cas plutôt qu'un champ vide silencieux.

Testé en local dans Chrome : réordonnancement des colonnes, ouverture/fermeture de la modale,
recentrage carte simultané, affichage correct du "Non renseignée" sur un voyage historique
sans adresse.

**Reste `NULL` pour tous les voyages créés avant ce commit** (backfill du 2026-07-22 et 2e
backfill du 2026-07-23 inclus) — la donnée n'a jamais été écrite dans l'Archive avant le fix,
donc rien à récupérer rétroactivement pour ces entrées-là. Seules les nouvelles LV/CMR créées
après le 2026-07-23 auront un extrait visible sur le portail.

## Carte du portail

La carte est une vraie carte interactive **Leaflet + tuiles OpenStreetMap**
(zoom, déplacement, tuiles réelles) — chargée via CDN (`unpkg.com/leaflet@1.9.4`), cohérent
avec le principe "page statique autonome" : pas de clé API, pas de compte à créer.

- La carte Leaflet est initialisée directement au chargement de la page (`initMap()`) —
  possible depuis le passage à la mise en page liste+carte côte à côte (le conteneur n'est
  plus jamais `display:none`, donc plus besoin d'init lazy + `invalidateSize()` au clic comme
  avant le 2026-07-23). Un `invalidateSize()` reste appelé au `resize` de la fenêtre (utile pour
  le passage desktop ↔ mobile).
- Les marqueurs sont des `L.circleMarker` (taille = nombre de voyages) avec un tooltip
  permanent affichant `Ville (n)`, regénérés à chaque `render()` via `renderMapMarkers()`.
- Le géocodage reste la table `VILLES` (mot-clé → ville/lat/lon) codée en dur — Leaflet ne
  résout pas ça tout seul, il affiche juste les coordonnées qu'on lui donne. Limite connue,
  inchangée par ce passage à Leaflet.
- Un premier essai avait utilisé un contour SVG statique de la France (dessiné à la main,
  sans interactivité) — remplacé par la demande explicite de Hugo (2026-07-23) pour une vraie
  carte zoomable.

- **Carte approximative** : positionnement par ville via une table de correspondance mot-clé → coordonnées codée en dur dans `portail-transporteur.html` (variable `VILLES`). Une nouvelle destination non reconnue apparaît quand même dans la liste, mais sans repère sur la carte. Ajouter une ville = une ligne dans le tableau `VILLES`.
- **Pas d'authentification** : la page est accessible à quiconque a le lien (cohérent avec la décision "vue commune à tous les transporteurs"). Si un contrôle d'accès devient nécessaire plus tard, il faudra soit un mot de passe partagé simple, soit une vraie fiche transporteur (actuellement le formulaire LV n'a que "Transports Mesnager" ou un champ libre "autre").
- **Hébergement — CORRIGÉ le 2026-07-23** : l'affirmation initiale ci-dessus était fausse.
  Un push sur `dev` du repo `sonotrad-pwa` crée un déploiement Vercel **preview**, protégé par
  authentification Vercel (SSO) — pas de config de "Deployment Protection" spécifique, c'est le
  comportement par défaut. Seul un merge vers `main` déclenche un déploiement **production**,
  qui seul met à jour le domaine public `sonotrad-pwa.vercel.app`. `portail-transporteur.html`
  n'était donc jamais réellement accessible aux transporteurs tant qu'on ne l'avait pas
  explicitement publié.

  **Solution retenue (choix de Hugo)** : projet Vercel séparé et indépendant,
  `sonotrad-portail-transporteur` (pas lié à un repo git, déployé via l'API Vercel/MCP en
  copiant le contenu du fichier), déployé directement en `production`. URL publique stable :
  **https://sonotrad-portail-transporteur.vercel.app/** — c'est cette URL qu'il faut partager
  avec les transporteurs (LOXAM, etc.), pas une URL sur `sonotrad-pwa.vercel.app`.

  **Contrepartie à connaître** : ce déploiement n'est pas lié au repo — il ne se met **pas**
  à jour automatiquement quand `sonotrad-pwa/portail-transporteur.html` change dans le repo.
  Après toute modification du fichier, il faut redéployer manuellement ce projet séparé (via
  `mcp__plugin_vercel_vercel__deploy_to_vercel`, target `production`, même nom de projet
  `sonotrad-portail-transporteur`, en fournissant le contenu à jour en tant que `index.html`).
  Ne pas oublier cette étape après un futur changement du portail, sous peine de désynchro
  entre le fichier du repo et ce qui est réellement affiché aux transporteurs.

---

## État réel au 2026-07-22 (vérifié en conditions réelles)

- **Migration appliquée** sur le projet Supabase `ajewxwxerrjnnervzjwm` via MCP Supabase, en 2 étapes : `voyages_schema` (tables, RPC, RLS, realtime) puis `voyages_portail_security_invoker` (correction d'un lint sécurité — la vue `voyages_portail` était créée sans `security_invoker`, donc exécutée avec les droits du propriétaire au lieu de l'appelant ; sans impact pratique ici mais corrigé par bonne pratique). Les deux fichiers sont dans `supabase/migrations/`.
- **Test bout en bout réalisé et nettoyé** : `enregistrer_voyage(...)` insère bien dans `voyages` + `voyages_internes` ; `marquer_parti(...)` met bien à jour `parti`/`parti_le` ; une requête `anon` directe sur `voyages_internes` retourne 0 ligne (RLS bloque, malgré des GRANT larges hérités par défaut du schéma `public` sur ce projet — détail ci-dessous) ; `anon` ne peut ni `UPDATE` ni `DELETE` directement sur `voyages` (seule la lecture est ouverte, l'écriture passe exclusivement par les RPC security definer).
- **Point de vigilance découvert (pas une régression de cette migration)** : ce projet Supabase a des privilèges par défaut (`ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES`) qui donnent à `anon`/`authenticated` tous les droits SQL bruts (INSERT/UPDATE/DELETE/...) sur toute nouvelle table du schéma `public`, y compris `voyages` et `voyages_internes`. C'est sans conséquence ici car **RLS est activée sans policy d'écriture** sur les deux tables (testé et confirmé), donc ces GRANT restent inertes en pratique — mais si une policy d'écriture était ajoutée un jour sans y penser, elle s'appliquerait immédiatement à `anon`. À garder en tête pour toute évolution future du schéma.
- **Portail testé en local** (`npx serve`, Chrome piloté) : page servie sans erreur console, requête REST Supabase (`GET .../rest/v1/voyages?select=...`) répond 200, canal Realtime se connecte (`Connecté — mise à jour en direct`). Un voyage de test inséré pendant que la page était ouverte est apparu **instantanément sans rafraîchissement**, avec toutes les colonnes correctement mappées (numero_lv, date, destination, poids, ml, grutage, commentaire).
- **Refactor index.html appliqué** : le calcul de grutage (dupliqué entre le payload Apps Script et `_syncVoyageSupabase`) est factorisé dans `_lvuCalcGrutage(d)`. Le poids envoyé à Supabase réutilise `d.total.poids` (déjà calculé avec quantités par `_lvuCollectFormData`) au lieu d'être recalculé — le payload Apps Script existant garde lui son propre calcul de poids (sans quantités), volontairement inchangé.
- **Apps Script** : toujours 100% manuel, aucun `.clasp.json` ni credentials clasp dans ce repo — impossible de pousser automatiquement. Les 3 étapes manuelles restent à faire par Hugo (voir section précédente et l'en-tête de `apps-script/sync-parti-supabase.gs.txt`) : coller le fichier dans l'éditeur Apps Script existant et créer le déclencheur installable `onEditPartiSync`.
- **MCP Supabase** : reconfiguré en scope `local` pour cette session (`claude mcp add supabase -s local -- ...`, token personnel existant). Fonctionnel et utilisé pour toute la vérification ci-dessus.

---

## Positionnement précis par géocodage (2026-07-24)

Le positionnement carte reposait entièrement sur la table `VILLES` (mots-clés codés en dur,
testés contre le **nom du destinataire**) — imprécis (centre-ville) et fragile (ne matche que
si ce nom contient un nom de ville reconnu ; ex. "TRANSPORTS MESNAGER" ne matchait rien).

Ajout de `destination_lat`/`destination_lon` sur `voyages`, alimentés par un géocodage réel
(Nominatim/OpenStreetMap, même fournisseur que la carte — pas de clé API) de
`destination_adresse` à la création d'une LV (`_geocodeAdresse()` dans `index.html`, un seul
appel par création, repli sur la ville seule si l'adresse complète échoue — utile pour les
formats "ZA ... - B.P ..." fréquents en zone industrielle que Nominatim ne sait pas parser).

Côté portail, `resolveLocation(v)` utilise les coordonnées précises quand disponibles (clé de
regroupement = coordonnées arrondies à ~3 décimales, ≈110 m, pour que deux voyages à la même
adresse partagent un marqueur), sinon repli sur `trouverVille()` — **aucune régression** pour
les voyages créés avant ce commit, qui continuent d'utiliser la table VILLES.

Pas de backfill des voyages existants (risque de dépasser la politique d'usage Nominatim — 1
req/s max — pour un gain limité vu que la table VILLES reste un repli correct).

## Historique LV/CMR via Supabase (2026-07-23)

L'écran Historique de la PWA (`view-lvu-history`, `lvuLoadHistory()`) lit désormais l'Historique
depuis Supabase plutôt que l'Archive Google Sheets, pour la réactivité — même table `voyages` /
`voyages_internes` que le portail, pas une base séparée.

### Le problème de fond : données internes vs portail public

`voyages`/`voyages_internes` sont conçues pour un accès `anon` public (le portail, clé anon en
clair dans le JS). L'Historique interne a besoin de champs sensibles (conducteur, immatriculation,
lien PDF Drive) que le portail ne doit jamais voir. Sans vrai système d'authentification Supabase
(jugé disproportionné pour le gain, cf. discussion avec Hugo), la solution retenue : un **secret
partagé**, connu uniquement d'Apps Script (jamais expédié à un navigateur), qui protège une RPC
dédiée à la lecture complète.

- **Colonnes ajoutées à `voyages_internes`** : `conducteur`, `immat_moteur`, `immat_semi`,
  `expediteur`, `convoi` (bool), `pdf_url`. Alimentées par `_syncVoyageSupabase()` (index.html) à
  la création — mêmes limites que `marchandises_desc`/`destination_adresse` : NULL pour tout ce
  qui a été créé avant ce commit.
- **Secret** : stocké dans la table Supabase `config_interne` (`cle`/`valeur`, **jamais** dans un
  fichier de migration versionné — insertion faite via `execute_sql` direct, hors git) ET dans les
  Script Properties d'Apps Script (`SUPABASE_HISTORY_SECRET`, Project Settings → Script
  Properties dans l'éditeur — pas dans le code source `pwa_master.js` non plus).
- **RPC `lire_historique_voyages(p_secret, p_limit)`** : SECURITY DEFINER, `GRANT EXECUTE TO anon`
  (nécessaire car Apps Script appelle avec la même anon key que le portail — la protection vient
  du secret, pas du rôle). Renvoie **tous** les voyages non-partis (volume toujours faible) + les
  `p_limit` derniers partis, triés par `numero_lv::int DESC` (pas par date, voir bug ci-dessous).
- **RPC `supprimer_voyage(p_secret, p_numero_lv)`** : même principe, appelée par `_deleteLv()`
  (Apps Script) après toute suppression Archive — y compris quand la LV n'est déjà plus dans
  l'Archive (évite les orphelines Supabase, cf. bug ci-dessous).
- **Apps Script** : nouvelle action `lv_history_supabase` (`_getLvHistorySupabase()` dans
  `masterfile/pwa_master.js`) — reshape la réponse RPC vers le **même contrat exact** que
  `lv_history` (Archive Sheets), donc `_renderLvHistoryList()` côté PWA n'a jamais eu besoin de
  changer. `lv_history` (Sheets) reste intacte, inutilisée par défaut mais toujours fonctionnelle
  en secours.

### Bugs découverts et corrigés en cours de route

1. **`CREATE OR REPLACE FUNCTION` avec des paramètres en plus crée une nouvelle surcharge
   Postgres, pas un vrai remplacement**, tant que la liste de paramètres ne matche pas
   exactement. `enregistrer_voyage()` avait accumulé 4 surcharges (10 à 19 arguments) avant
   d'être nettoyée en une seule version canonique. **Réflexe à avoir** : toujours `DROP FUNCTION
   IF EXISTS <ancienne signature exacte>` avant un `CREATE OR REPLACE` qui ajoute des paramètres.
2. **Bug de locale Google Sheets** : les dates de l'Archive (col A), écrites en texte
   `dd/MM/yyyy HH:mm` par `_saveLv`, sont parfois auto-converties par Sheets en vraie Date en
   réinterprétant le texte en `MM/dd/yyyy` — uniquement quand jour ET mois sont tous les deux
   ≤12 (ambigu). Corrompt `date_creation` pour les entrées backfillées depuis l'Archive (LV
   01600 affichait "7 janvier" au lieu de "1er juillet"). Les vraies créations (via l'app,
   `now()` côté serveur) ne sont pas concernées. **Conséquence** : ne jamais trier par une date
   dérivée de l'Archive Sheets sans vérifier d'abord la cohérence avec l'ordre des `numero_lv`
   (qui, lui, est un compteur fiable, jamais corrompu). `lire_historique_voyages()` trie
   désormais par `numero_lv`, pas par date.
3. **`lv_delete` (suppression d'une LV) ne touchait jamais Supabase** — seulement l'Archive
   Sheets + Drive. Une LV supprimée restait orpheline (visible portail + Historique), et une
   deuxième tentative de suppression échouait ("introuvable dans Archive") sans jamais pouvoir
   nettoyer l'orpheline. Corrigé : `_deleteLv()` appelle systématiquement `supprimer_voyage()`,
   y compris quand la LV n'est plus dans l'Archive.
4. **Filtrer après avoir limité une requête peut sous-compter** : la première version de
   `lire_historique_voyages()` faisait `ORDER BY date DESC LIMIT N` puis le filtre "disponibles"
   s'appliquait côté client sur ce sous-ensemble — un voyage non-parti ancien pouvait tomber hors
   de la fenêtre. Corrigé en renvoyant toujours la totalité des non-partis (indépendamment de
   `p_limit`) + les `p_limit` derniers partis pour l'historique récent.

### Backfill (one-shot, déjà exécuté — pas un mécanisme permanent)

Les 150 dernières lignes de l'Archive ont été réinjectées dans Supabase via une fonction Apps
Script temporaire (`_backfillHistoriqueSupabase`, déjà retirée du code après exécution) pour
combler conducteur/immat/expéditeur/pdf_url sur l'historique existant. **Point de sécurité
important pour toute future opération de ce type** : `voyages` a Realtime activé et est lu par le
portail public — un backfill en masse (INSERT ou UPDATE) déclenche de faux évènements
("Nouveau voyage" / "LV enlevée") si le portail est ouvert en direct. Procédure suivie à chaque
fois : `ALTER PUBLICATION supabase_realtime DROP TABLE voyages` → opération en masse → `ALTER
PUBLICATION supabase_realtime ADD TABLE voyages`.

### Ce qui reste ouvert / pas fait

- **Realtime direct navigateur pour l'Historique** : actuellement, l'Historique PWA re-fetch
  entièrement via Apps Script à chaque évènement Realtime détecté sur `voyages`
  (`_lvuSubscribeHistoryRealtime()`), plutôt que de s'abonner en direct comme le portail. Un vrai
  Realtime direct navigateur rouvrirait la question du secret (même souci qu'au début : anon key
  publique ne doit pas donner accès à `voyages_internes`) — pas fait, jugé pas nécessaire pour
  l'instant (le re-fetch complet reste raisonnable vu le volume).
- **Filtres Tous/Disponibles/Partis de l'Historique** : observé (pas creusé) qu'ils ne réagissaient
  pas au clic lors d'un test manuel — signalé par Claude à Hugo, pas encore confirmé comme un
  vrai bug ni corrigé (possiblement un souci d'automatisation du test, à revérifier en usage réel).
- Le plan détaillé "refonte Historique" (`~/.claude/plans/squishy-discovering-lightning.md`,
  session précédente) est largement exécuté : tableau, modal note/grutage, toggle Parti, filtres
  — tout existait déjà avant cette session. Cette session a ajouté l'axe "lecture Supabase" qui
  n'était pas dans ce plan initial.

---

## Fichiers du module Portail

```
sonotrad-pwa/
├── portail-transporteur.html                        ← page publique, autonome
├── supabase/migrations/20260722000000_voyages_schema.sql
├── supabase/migrations/20260722170839_voyages_portail_security_invoker.sql
├── apps-script/sync-parti-supabase.gs.txt            ← à coller à la main dans Apps Script
├── index.html                                         ← _syncVoyageSupabase() + _lvuCalcGrutage() après lvuSaveToDrive()
└── CLAUDE_PORTAIL.md (ce fichier)
```
