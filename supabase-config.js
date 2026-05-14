/* ═══════════════════════════════════════════════════════════════════════════
   Buildcored — runtime config
   Paste your Supabase anon key + admin email below, commit, push.
   The anon key is safe in the browser — RLS protects data.
   While the anon key is empty the site falls back to projects.json (read-only,
   no auth, no newsletter).
   ═══════════════════════════════════════════════════════════════════════════ */
window.BC_CONFIG = {
  SUPABASE_URL:      'https://pfvvangcpvjcmahrgvwv.supabase.co',
  SUPABASE_ANON_KEY: '',  // ← paste anon key here (Supabase → Settings → API → anon public)
  ADMIN_EMAIL:       '',  // ← paste the email allowed to admin-write
};
