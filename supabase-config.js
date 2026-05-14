/* ═══════════════════════════════════════════════════════════════════════════
   Buildcored — runtime config
   Paste your Supabase anon key + admin email below, commit, push.
   The anon key is safe in the browser — RLS protects data.
   While the anon key is empty the site falls back to projects.json (read-only,
   no auth, no newsletter).
   ═══════════════════════════════════════════════════════════════════════════ */
window.BC_CONFIG = {
  SUPABASE_URL:      'https://vktsagmwyqiiicjmhzek.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Q6kU50lUbr7oBNy7Ir9LyQ_8VrTdeY8',
  ADMIN_EMAIL:       'team@buildcored.com',
  NEWSLETTER_FROM:   'Buildcored <team@buildcored.com>',
};
