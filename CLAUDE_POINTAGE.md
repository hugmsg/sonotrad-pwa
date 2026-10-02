# Module Pointage / RH — Contexte pour Claude Code

> **État revérifié le 2026-09-25** (base Supabase + `index.html` + déploiements Vercel).
> La version précédente de ce fichier décrivait le kiosque comme « à développer » et
> l'installation du client via `npm install` — les deux étaient faux depuis juin 2026.

---

## Décision d'architecture

Le module Pointage utilise **Supabase (PostgreSQL)** comme base de données — pas Google Sheets.
Ce choix est délibéré : écriture concurrente, conformité légale 5 ans, RLS, temps réel.
Google Sheets reste utilisé pour les autres modules (LOXAM, BCB, Stock, LV/CMR) et pour les
exports paie.

## Projet Supabase

- **URL** : `https://ajewxwxerrjnnervzjwm.supabase.co`
- **Région** : EU West (Ireland) — eu-west-1
- **Anon key** : Supabase Dashboard → Settings → API → « anon public »
- **Accès depuis Claude Code** : MCP Supabase déjà configuré (`list_tables`, `list_migrations`,
  `execute_sql`…) — s'en servir plutôt que de se fier aux fichiers du dépôt (voir l'avertissement
  sur les migrations plus bas).

**Intégration dans la PWA** : le client est chargé par **CDN en UMD** (`index.html`, wrappé par
`supabase.js`), il n'y a **aucun bundler ni `npm install`** dans ce projet. Les
`package.json`/`package-lock.json` non trackés à la racine sont des reliquats morts — ne pas s'en
servir, ne pas les ressusciter (voir `../CLAUDE.md`).

---

## ⚠️ Le code RH n'est pas tout dans ce dépôt

Deux fronts différents tapent dans la même base :

| Front | Où | Ce qu'il fait |
|---|---|---|
| **PWA** `index.html` | ce dépôt, vues `view-pointage`, `view-ptg-admin`, `view-ptg-rapport` | kiosque PIN, correction/ajout de pointages par l'admin, rapport d'heures |
| **`rh-metal`** | dépôt GitHub `hugmsg/rh-metal` (cloné dans `dev/rh-metal/`), lié à Vercel `rh-metal.vercel.app`, SSO activé | congés, contrats, contrôle hebdomadaire, portail salarié, association des badges NFC |

Conséquence pratique : si une RPC ou une
table existe en base sans aucun appelant dans `index.html`, **elle est probablement utilisée par
`rh-metal`** — ne pas la supprimer en croyant à du code mort.

Exemple concret : `pointer_par_nfc`, `associer_badge_nfc`, `dissocier_badge_nfc`,
`emettre_signal_nfc` (migrations de juillet/août 2026) ne sont appelées **nulle part** dans
`index.html` — seul le champ `nfc_uid` y apparaît.

---

## Tables réelles (2026-09-25)

| Table | Rôle |
|---|---|
| `employes` | Référentiel employés + hash PIN bcrypt + `nfc_uid` + coordonnées/profil |
| `pointages` | Registre légal immuable — jamais de DELETE, annulation = `valide = false` |
| `heures_journalieres` | Agrégat par jour, recalculé par trigger (multi-sessions depuis le 2026-08-19) |
| `heures_corrections` | Corrections d'heures saisies par l'admin |
| `conges` | Congés (respecte le verrouillage de semaine) |
| `jours_statut` / `semaines_validees` | Contrôle hebdomadaire : statut d'un jour, verrouillage d'une semaine |
| `contrats` | Contrats de travail + alertes d'échéance (`contrat_alerte_vue`) |
| `voyages` / `voyages_internes` | **Pas RH** — portail transporteur, voir `CLAUDE_PORTAIL.md` |
| `config_interne` | Config divers — ⚠️ **RLS désactivée** (voir Points ouverts) |

**Vues lues par la PWA** : `en_service_vue`, `pointages_today_vue`, `employes_actifs_vue`,
`heures_rapport_vue`.

**RPC appelées par la PWA** : `authentifier_par_pin`, `verifier_pointage`,
`upsert_employe_pointage`, `get_employes_rh`, `supprimer_employe_rh`, `admin_add_pointage`,
`admin_modifier_pointage`, `admin_annuler_pointage`.

**Realtime** : canaux `ptg-hj-kiosk` et `ptg-hj-admin` (rafraîchissement live du kiosque et de
l'écran admin), `employes-changes` (broadcast sur modification d'un employé).

---

## Flux d'un pointage (kiosque PIN)

```
1. L'employé saisit son PIN sur l'écran kiosque (view-pointage)
2. authentifier_par_pin(pin)           → employe_id + nom/prénom
3. verifier_pointage(employe_id, type) → cohérence (anti-doublon)
4. Si ok → INSERT dans pointages       → trigger recalcule heures_journalieres
5. Feedback visuel 3 s → retour à l'écran d'accueil
```

Types : `ENTREE` | `SORTIE` | `PAUSE_DEBUT` | `PAUSE_FIN`.

---

## Règles métier importantes

- **Jamais de DELETE** sur `pointages` — annuler = `UPDATE SET valide = false` + `raison_modif` et
  `modifie_par` renseignés.
- **Pause légale** : durée brute > 6 h et 0 pause pointée → 20 min déduites (convention transport).
- **Oubli de sortie** : ENTREE sans SORTIE à J+1 → anomalie (`statut = 'ANOMALIE'` dans
  `heures_journalieres`).
- **Anti-doublon** : toujours appeler `verifier_pointage` avant d'insérer.
- **Verrouillage de semaine** : une semaine validée (`semaines_validees`) bloque les écritures
  rétroactives, y compris côté congés.

---

## ⚠️ Les migrations du dépôt ne font pas foi

`supabase/migrations/` s'arrête au **2026-08-18** alors que la base compte **38 migrations
appliquées jusqu'au 2026-08-28**. Manquent notamment `conges_table_and_rpc`,
`heures_journalieres_multi_sessions`, `controle_hebdomadaire`, `heures_recup`/`corrections`,
`contrats_table_and_sync`, `contrat_alerte_vue`, `auth_gate_rh_admin`,
`portail_salarie_mes_donnees`, `employes_profil_complet`, `employes_corbeille_purge`.

De plus les horodatages des fichiers locaux **ne correspondent pas** aux versions appliquées
(ex. `20260722000000_voyages_schema.sql` local ↔ `20260722170620` en base) : les fichiers sont des
brouillons locaux, pas l'historique réel.

**Toujours interroger la base** (MCP Supabase) avant de conclure sur le schéma.

---

## Points ouverts

- [x] **`config_interne` verrouillée le 2026-10-02** — RLS activée, aucun droit pour
      anon/authenticated (migration `20261002000000_config_interne_verrouillage.sql`). Seuls
      lecteurs : `lire_historique_voyages` et `supprimer_voyage`, SECURITY DEFINER → non affectés.
- [ ] **`historique_secret` à changer** — il a été lisible publiquement jusqu'au 2026-10-02.
      Changer la valeur dans `config_interne` **et** dans la propriété de script
      `SUPABASE_HISTORY_SECRET` du masterfile, en même temps.
- [ ] **Vues RH lisibles par anon** — `en_service_vue`, `pointages_today_vue`,
      `employes_actifs_vue`, `heures_rapport_vue` (+ `pointages_rapport_vue`) sont SECURITY DEFINER
      et GRANT anon. La PWA les lit avec la clé anon (pas de session Supabase côté PWA) : les
      restreindre casserait kiosque/admin/rapport. Prérequis : authentifier la PWA auprès de Supabase.
- [x] **SQL « manquant » et source `rh-metal` retrouvés le 2026-10-02** — tout est dans le dépôt
      GitHub `hugmsg/rh-metal` (lié à Vercel, cloné dans `dev/rh-metal/`), migrations comprises.
- [ ] **Offline-first du kiosque** : perte WiFi → IndexedDB → sync au retour (jamais implémenté).
