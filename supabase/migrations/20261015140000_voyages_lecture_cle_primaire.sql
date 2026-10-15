-- 2026-10-15 : Realtime n'envoie le contenu d'une ligne que si le rôle peut lire sa clé
-- primaire ; sans elle, le portail reçoit des événements vides.
GRANT SELECT (id) ON public.voyages TO anon, authenticated;
