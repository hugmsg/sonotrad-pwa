// Client Supabase pour le module Pointage
// La clé anon est publique — RLS protège les données côté Supabase
// Récupérer la clé sur : Dashboard Supabase → Settings → API → "anon public"
(function () {
  const SUPABASE_URL  = 'https://ajewxwxerrjnnervzjwm.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqZXd4d3hlcnJqbm5lcnZ6andtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDU5MDEsImV4cCI6MjA5NzA4MTkwMX0.NJcm1_tb4BcCSileiODYP0pKJ1LRVXFTIr2idQBrALg';

  if (typeof window.supabase === 'undefined') {
    console.warn('[supabase.js] Le CDN Supabase n\'est pas encore chargé — SupabaseDB non disponible.');
    return;
  }
  window.SupabaseDB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
})();
