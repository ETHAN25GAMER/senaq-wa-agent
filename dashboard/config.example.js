// Copy this file to dashboard/config.js and fill in the two values below.
// dashboard/config.js is gitignored.
//
//   1. SUPABASE_URL          → Supabase dashboard → Project Settings → API → Project URL
//   2. SUPABASE_ANON_KEY     → Supabase dashboard → Project Settings → API → anon / public
//
// The anon key is safe to ship in a browser ONLY because the SQL migration
// 0003_dashboard_realtime.sql grants the anon role read-only access and
// nothing else. Do NOT paste the service-role key here.

window.__SENAQ_CONFIG__ = {
  SUPABASE_URL:      "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "paste-anon-public-key-here",
};
