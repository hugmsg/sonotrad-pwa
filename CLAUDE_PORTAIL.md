# CLAUDE.md — Module Portail Transporteur

## Contexte du projet

Portail externe en lecture seule, à partager avec les transporteurs (LOXAM notamment), qui affiche en temps réel les voyages disponibles à planifier — 1 LV/CMR = 1 voyage. Vue commune à tous les transporteurs (pas de personnalisation par transporteur pour l'instant).

**Fichier principal :** `portail-transporteur.html` (page statique autonome, aucune dépendance au reste de la PWA)
**Base de données :** Supabase (même projet que le module Pointage, voir `CLAUDE_POINTAGE.md`)
**Migration :** `supabase/migrations/20260722000000_voyages_schema.sql`

---

## Pourquoi Supabase et pas une lecture directe de la Google Sheet

Le tableur ("Planning Sonotrad", onglet **Départs**) reste la source de gestion interne (colonnes Date, N° LV, Destination, Doc annexe, Chargement, Commande, Commentaire, Poids, ML, **Parti** en colonne J). Mais une lecture périodique du tableur ne donne pas de vrai temps réel et exposerait des colonnes internes (Commande, BT) au portail public.

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

### 2. Marquage "Parti" — reste manuel dans la sheet, à finir de brancher

Décision prise avec Hugo (2026-07-22) : les équipes continuent de cocher la case Parti (colonne J, onglet Départs) comme aujourd'hui — pas de bouton ajouté dans la PWA pour ça.

Un fichier de référence est prêt : `apps-script/sync-parti-supabase.gs.txt`. Il contient un déclencheur `onEdit` installable qui, dès que la case J est cochée/décochée sur l'onglet Départs, appelle le RPC Supabase `marquer_parti(numero_lv, parti)`.

**Ce fichier n'est pas déployé automatiquement** — pas d'accès direct à l'éditeur Apps Script depuis cet environnement. Étapes manuelles restantes pour Hugo :
1. Ouvrir "Planning Sonotrad" → Extensions → Apps Script
2. Créer un fichier `.gs`, coller le contenu de `apps-script/sync-parti-supabase.gs.txt`
3. Ajouter un déclencheur installable (Sur modification) sur la fonction `onEditPartiSync`

Voir les instructions détaillées en tête de ce fichier.

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

---

## Limites connues du portail actuel

- **Carte approximative** : positionnement par ville via une table de correspondance mot-clé → coordonnées codée en dur dans `portail-transporteur.html` (variable `VILLES`). Une nouvelle destination non reconnue apparaît quand même dans la liste, mais sans repère sur la carte. Ajouter une ville = une ligne dans le tableau `VILLES`.
- **Pas d'authentification** : la page est accessible à quiconque a le lien (cohérent avec la décision "vue commune à tous les transporteurs"). Si un contrôle d'accès devient nécessaire plus tard, il faudra soit un mot de passe partagé simple, soit une vraie fiche transporteur (actuellement le formulaire LV n'a que "Transports Mesnager" ou un champ libre "autre").
- **Hébergement** : le fichier `portail-transporteur.html` n'est pas encore déployé publiquement — à héberger (Vercel, comme le reste du projet, ou toute autre solution statique).

---

## Fichiers du module Portail

```
sonotrad-pwa/
├── portail-transporteur.html                        ← page publique, autonome
├── supabase/migrations/20260722000000_voyages_schema.sql
├── apps-script/sync-parti-supabase.gs.txt            ← à coller à la main dans Apps Script
├── index.html                                         ← _syncVoyageSupabase() ajoutée après lvuSaveToDrive()
└── CLAUDE_PORTAIL.md (ce fichier)
```
