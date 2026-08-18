-- ═══════════════════════════════════════════════════════════════════════════
-- SONOTRAD — Module Pointage : badge NFC — transport Realtime Broadcast
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Remplace le transport WebSocket maison du pont Raspberry Pi
-- (nfc-bridge/nfc_bridge.py), cassé en prod par le contenu mixte : une page
-- HTTPS (https://rh-metal.vercel.app) ne peut pas ouvrir de WebSocket non
-- chiffrée (ws://), même vers 127.0.0.1 — confirmé le 2026-07-31 (voir
-- RH-Metal/CLAUDE.md, section "Module Pointage — Badge NFC").
--
-- Le pont appelle désormais cette RPC en HTTPS (comme n'importe quel appel
-- REST Supabase classique) au lieu d'exposer son propre serveur — le
-- navigateur, lui, ne parle qu'à Supabase (déjà en WSS avec un vrai
-- certificat), jamais directement au pont. Même mécanisme realtime.send()
-- que employes_broadcast_change() (20260728000001_employes_broadcast_change.sql),
-- généralisé ici à deux usages : diffusion d'un scan (event 'nfc_scan',
-- payload {uid}) et heartbeat périodique (event 'heartbeat', payload {})
-- pour que le kiosque sache si le pont est toujours en vie.
CREATE OR REPLACE FUNCTION emettre_signal_nfc(p_event text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM realtime.send(p_payload, p_event, 'nfc-badge-scans', false);
END;
$$;

GRANT EXECUTE ON FUNCTION emettre_signal_nfc(text, jsonb) TO anon;
