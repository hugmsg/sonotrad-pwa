-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Module Pointage
-- Migration v4 : vue heures_rapport_vue pour les rapports admin
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW heures_rapport_vue AS
SELECT
  hj.employe_id,
  e.nom,
  e.prenom,
  hj.date,
  hj.heure_entree,
  hj.heure_sortie,
  hj.duree_brute,
  hj.duree_pause,
  hj.duree_nette,
  hj.statut,
  hj.pause_legale_appliquee
FROM heures_journalieres hj
JOIN employes e ON e.id = hj.employe_id
ORDER BY e.nom, e.prenom, hj.date;

-- Accessible en lecture pour le client anonyme (PWA rapports admin)
GRANT SELECT ON heures_rapport_vue TO anon;
