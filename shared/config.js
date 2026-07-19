// ════════════════════════════════════════════════════════════
//  shared/config.js
//
//  Single source of truth for values every page needs: the backend
//  API origin, and the Supabase project config used for client-side
//  Auth calls (OTP sign-in) only — see the note in script.js about
//  why Supabase is called directly from the browser for auth but
//  nothing else.
//
//  WHY THIS EXISTS:
//  Before this file, 'http://localhost:5000' was a literal string
//  typed out separately in script.js, appointment.js, login.js,
//  track.js, document.js, and dashboard.js (6 copies), and the
//  Supabase URL + anon key were duplicated across 3 of those files.
//  Moving a deployment from localhost to a real domain meant
//  hunting down and editing every one of those copies by hand —
//  easy to miss one. Now it's one file, included first, on every page.
//
//  Include this <script> tag BEFORE any other page script that
//  references window.APP_CONFIG.
// ════════════════════════════════════════════════════════════

window.APP_CONFIG = {
  // Change this one value when moving from local dev to staging/production.
  API_ORIGIN: 'http://localhost:5000',

  // Public anon key — safe to expose in the browser by Supabase's own
  // design (it only allows what your Row Level Security policies
  // permit). This is NOT the service role key, which stays backend-only.
  SUPABASE_URL: 'https://cnpuceqzubaolbfxqpge.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucHVjZXF6dWJhb2xiZnhxcGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTYxNzcsImV4cCI6MjA5NjU3MjE3N30.ZaxtjTXyVQIZytf3ChiCgr1tf-N7er2yqZ4pzv0za7E',
};

// Convenience getters so call sites read `apiUsersBase()` instead of
// re-concatenating the path every time.
function apiUsersBase() {
  return `${window.APP_CONFIG.API_ORIGIN}/api/users`;
}
function apiDocumentsBase() {
  return `${apiUsersBase()}/documents`;
}
