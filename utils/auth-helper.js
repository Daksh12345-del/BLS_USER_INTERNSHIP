// ════════════════════════════════════════════════════════════
//  utils/auth-helper.js
//
//  Shared client-side session helpers. login.html, dashboard.html,
//  and appointment.html all already include this file via:
//    <script src="../utils/auth-helper.js"></script>
//  but the file itself was missing from the project, which is why
//  the browser console showed a 404 + "Refused to execute script"
//  error on every page that loads it.
//
//  Session is stored in sessionStorage under two keys, set by
//  login.js on successful login:
//    bls_logged_email — the applicant's email
//    bls_token        — the JWT returned by /api/users/login
//
//  dashboard.js, appointment.js, and manage.js each currently read
//  those keys directly with their own copy of this logic. This file
//  doesn't change any of that (nothing is rewired to call it yet),
//  it just gives every page a shared, non-duplicated place to read
//  from — the same pattern shared/config.js already uses for the
//  API origin.
// ════════════════════════════════════════════════════════════

function getAuthToken() {
  return sessionStorage.getItem('bls_token');
}

function getLoggedInEmail() {
  return sessionStorage.getItem('bls_logged_email');
}

function isLoggedIn() {
  return !!(getAuthToken() && getLoggedInEmail());
}

// Spread this into a fetch() headers object for authenticated API calls:
//   fetch(url, { headers: { ...authHeaders() } })
function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Call at the top of a protected page. Redirects to login if there's
// no active session. Returns true/false so callers can bail out early:
//   if (!requireAuth()) return;
function requireAuth(redirectUrl) {
  if (!isLoggedIn()) {
    window.location.href = redirectUrl || '../login/login.html';
    return false;
  }
  return true;
}

function logout(redirectUrl) {
  sessionStorage.removeItem('bls_token');
  sessionStorage.removeItem('bls_logged_email');
  window.location.href = redirectUrl || '../login/login.html';
}
