-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Module Pointage
-- Migration v2 : vue admin "passages du jour"
-- ═══════════════════════════════════════════════════════════════════════════

-- Vue sécurisée : passages du jour avec nom/prénom, sans pin_hash
-- Utilisée par le tableau admin de la PWA
CREATE OR REPLACE VIEW pointages_today_vue AS
SELECT
  p.id,
  p.employe_id,
  e.nom,
  e.prenom,
  p.type,
  p.horodatage,
  p.source,
  p.valide
FROM pointages p
JOIN employes  e ON e.id = p.employe_id
WHERE (p.horodatage AT TIME ZONE 'Europe/Paris')::date = current_date
ORDER BY p.horodatage DESC;

-- Accessible en lecture pour le client anonyme (PWA kiosque)
GRANT SELECT ON pointages_today_vue TO anon;
