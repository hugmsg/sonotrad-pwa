-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Module Pointage
-- Migration v3 : sync PIN app → Supabase
-- ═══════════════════════════════════════════════════════════════════════════

-- Index unique sur (nom, prenom) pour l'upsert ON CONFLICT
-- (même clé métier que dans Google Sheets)
CREATE UNIQUE INDEX IF NOT EXISTS employes_nom_prenom_unique
  ON employes (nom, prenom);


-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTION : upsert_employe_pointage
-- Appelée par le panneau admin de la PWA lors de la création ou du reset PIN.
-- Crée l'employé s'il n'existe pas, met à jour son hash PIN sinon.
-- Le PIN brut transite en HTTPS et est haché bcrypt côté serveur.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_employe_pointage(
  p_nom    text,
  p_prenom text,
  p_pin    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF length(p_pin) <> 4 OR p_pin !~ '^\d{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'PIN invalide (4 chiffres attendus).');
  END IF;

  IF trim(p_nom) = '' OR trim(p_prenom) = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Nom et prénom requis.');
  END IF;

  INSERT INTO employes (nom, prenom, pin_hash)
  VALUES (p_nom, p_prenom, crypt(p_pin, gen_salt('bf', 12)))
  ON CONFLICT (nom, prenom) DO UPDATE SET
    pin_hash   = EXCLUDED.pin_hash,
    actif      = true,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_employe_pointage(text, text, text) TO anon;
