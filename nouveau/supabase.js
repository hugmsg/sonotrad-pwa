// Client Supabase de la PWA
// Clé publique (« publishable ») — RLS et droits protègent les données côté Supabase
// Récupérer la clé sur : Dashboard Supabase → Settings → API Keys → Publishable key
// (remplace l'ancienne clé « anon », désactivée fin 2026 — changé le 2026-10-26)
(function () {
  const SUPABASE_URL  = 'https://ajewxwxerrjnnervzjwm.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_Bvglc1RUZsIFR7oMtmE_bQ_eOAohcQS';

  if (typeof window.supabase === 'undefined') {
    console.warn('[supabase.js] Le CDN Supabase n\'est pas encore chargé — SupabaseDB non disponible.');
    return;
  }
  window.SupabaseDB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
})();
