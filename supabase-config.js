window.SQUADUP_SUPABASE_CONFIG = {
  url: "",
  anonKey: ""
};

if (window.supabase && window.SQUADUP_SUPABASE_CONFIG.url && window.SQUADUP_SUPABASE_CONFIG.anonKey) {
  window.squadUpSupabase = window.supabase.createClient(
    window.SQUADUP_SUPABASE_CONFIG.url,
    window.SQUADUP_SUPABASE_CONFIG.anonKey
  );
}
