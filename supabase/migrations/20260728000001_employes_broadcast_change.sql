-- Diffuse un événement "employes-changes" (canal public, payload minimal
-- {op, id} — jamais pin_hash/nfc_uid) à chaque INSERT/UPDATE/DELETE sur
-- employes. Utilise realtime.send() plutôt que realtime.broadcast_changes()
-- car ce dernier diffuse la ligne complète (pin_hash inclus), ce qui
-- exposerait le hash bcrypt du PIN kiosque à quiconque a la clé anon.
-- Les clients (rh-metal, sonotrad-pwa) s'abonnent à ce canal et rappellent
-- get_employes_rh() pour rafraîchir — pas de miroir de données sensibles.
CREATE OR REPLACE FUNCTION public.employes_broadcast_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_row employes;
BEGIN
  v_row := COALESCE(NEW, OLD);
  PERFORM realtime.send(
    jsonb_build_object('op', TG_OP, 'id', v_row.id),
    'employes_changed',
    'employes-changes',
    false
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS employes_broadcast_trigger ON public.employes;
CREATE TRIGGER employes_broadcast_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.employes
  FOR EACH ROW EXECUTE FUNCTION public.employes_broadcast_change();
