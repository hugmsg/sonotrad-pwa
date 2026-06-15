# Module Pointage — Contexte pour Claude Code

## Décision d'architecture

Le module Pointage utilise **Supabase (PostgreSQL)** comme base de données — pas Google Sheets.
Ce choix est délibéré : écriture concurrente, conformité légale 5 ans, RLS, temps réel.
Google Sheets reste utilisé pour les autres modules (LV, CMR, planning) et pour les exports paie.

## Projet Supabase

- **URL** : `https://ajewxwxerrjnnervzjwm.supabase.co`
- **Région** : EU West (Ireland) — eu-west-1
- **Anon key** : à récupérer dans Supabase Dashboard → Settings → API → "anon public"
- **Schéma source** : `pointage_schema.sql` (dans le repo, à la racine ou dans `/supabase/migrations/`)

## Tables

| Table | Rôle |
|-------|------|
| `employes` | Référentiel employés + hash PIN bcrypt + UID NFC optionnel |
| `pointages` | Registre légal immuable — jamais de DELETE, annulation = `valide: false` |
| `heures_journalieres` | Vue calculée, mise à jour automatiquement par trigger après chaque pointage |

## Fonctions RPC (appel depuis la PWA)

```js
// Authentifier un employé par PIN
const { data } = await supabase.rpc('authentifier_par_pin', { p_pin: '1234' })
// Retourne : { ok: true, id: "uuid", nom: "Dupont", prenom: "Jean" }
// ou        : { ok: false, message: "Code PIN incorrect." }

// Vérifier la cohérence avant d'insérer un pointage
const { data } = await supabase.rpc('verifier_pointage', {
  p_employe_id: 'uuid',
  p_type: 'ENTREE' // ENTREE | SORTIE | PAUSE_DEBUT | PAUSE_FIN
})
// Retourne : { ok: true, message: "OK" }
// ou        : { ok: false, message: "Déjà en service — pointez votre sortie d'abord." }
```

## Flux d'un pointage (ordre des appels)

```
1. Employé saisit son PIN sur l'écran kiosque
2. PWA appelle authentifier_par_pin(pin)          → récupère employe_id + nom/prénom
3. PWA appelle verifier_pointage(employe_id, type) → vérifie cohérence
4. Si ok → INSERT dans pointages                   → trigger recalcule heures_journalieres
5. Afficher feedback visuel 3s (nom + type pointage) → retour écran accueil
```

## Règles métier importantes

- **Jamais de DELETE** sur `pointages` — annuler = `UPDATE SET valide = false` + renseigner `raison_modif` et `modifie_par`
- **Pause légale** : si durée brute > 6h et 0 pause pointée → 20 min déduites automatiquement (convention transport)
- **Oubli de sortie** : si ENTREE sans SORTIE à J+1 → créer anomalie (`statut = 'ANOMALIE'` dans `heures_journalieres`)
- **Anti-doublon** : toujours appeler `verifier_pointage` avant d'insérer

## Écran kiosque (à développer)

- Activité dédiée dans la PWA : `/pointage`
- Interface minimaliste : pavé numérique PIN → validation → feedback 3s → reset
- Mode kiosque Android : utiliser le "pinning d'écran" natif pour bloquer sur cette activité
- Offline-first : si perte WiFi → stocker dans IndexedDB → sync au retour de connexion (Service Worker)
- Afficher en permanence : liste des personnes actuellement "en service" (requête temps réel Supabase)

## Installation du client Supabase dans la PWA

```bash
npm install @supabase/supabase-js
```

```js
// src/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ajewxwxerrjnnervzjwm.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY // stocker dans .env

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

## Variables d'environnement requises

Fichier `.env` à la racine du projet (ne pas committer) :
```
VITE_SUPABASE_URL=https://ajewxwxerrjnnervzjwm.supabase.co
VITE_SUPABASE_ANON_KEY=<ta_anon_key>
```

Fichier `.env.example` à committer :
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## MCP Supabase pour Claude Code (optionnel)

Permet à Claude Code d'accéder directement à la base pour lire les tables, vérifier les données, etc.
Token à générer sur : https://supabase.com/dashboard/account/tokens

Config dans `~/.claude/claude_desktop_config.json` :
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase", "--access-token", "TON_TOKEN"]
    }
  }
}
```
