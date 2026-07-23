-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Module Portail Transporteur
-- Fix : voyages_portail doit s'exécuter avec les droits de l'appelant
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le linter de sécurité Supabase (get_advisors) signale les vues créées sans
-- security_invoker comme "Security Definer View" : sans cette option, une vue
-- Postgres applique les droits de son propriétaire (postgres, qui contourne
-- RLS) plutôt que ceux du rôle qui interroge la vue. Sans impact ici (la vue
-- ne lit que voyages, déjà lisible par anon via une policy ouverte), mais on
-- corrige pour rester cohérent avec les bonnes pratiques et fermer le lint.
--
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW voyages_portail
WITH (security_invoker = true) AS
SELECT numero_lv, type, date_creation, destination, poids, ml, grutage, commentaire, parti, parti_le
FROM voyages
ORDER BY parti ASC, date_creation DESC;

GRANT SELECT ON voyages_portail TO anon;
