// ════════════════════════════════════════════════════════════
//  CONFIGURATION — paste your Supabase credentials here
// ════════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://cnpuceqzubaolbfxqpge.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucHVjZXF6dWJhb2xiZnhxcGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTYxNzcsImV4cCI6MjA5NjU3MjE3N30.ZaxtjTXyVQIZytf3ChiCgr1tf-N7er2yqZ4pzv0za7E';

const configured = SUPABASE_URL !== 'YOUR_SUPABASE_URL';
let db = null;
if (configured) {
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  document.getElementById('configBanner').style.display = 'none';
}

// ── Active OTP state ─────────────────────────────────────────
let _otpEmail      = '';   // email user entered for OTP login
let _resendTimer   = null;

// ════════════════════════════════════════════════════════════
//  CAPTCHA — random code, redrawn on load / refresh / each attempt
// ════════════════════════════════════════════════════════════
const _captchaCode = { pwd: '', otp: '' };

function genCaptchaText() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function drawCaptcha(which) {
  const canvas = document.getElementById(which + 'CaptchaCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const code = genCaptchaText();
  _captchaCode[which] = code;

  // background
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, w, h);

  // noise lines
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = `rgba(${100 + Math.random()*100|0},${100 + Math.random()*100|0},${100 + Math.random()*100|0},0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.random()*w, Math.random()*h);
    ctx.lineTo(Math.random()*w, Math.random()*h);
    ctx.stroke();
  }

  // noise dots
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(${Math.random()*180|0},${Math.random()*180|0},${Math.random()*180|0},0.4)`;
    ctx.fillRect(Math.random()*w, Math.random()*h, 1.5, 1.5);
  }

  // characters
  const charWidth = w / code.length;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const fontSize = 22 + Math.floor(Math.random() * 5);
    const angle = (Math.random() - 0.5) * 0.5; // ±~14deg
    const x = charWidth * i + charWidth / 2;
    const y = h / 2 + (Math.random() - 0.5) * 8;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = `bold ${fontSize}px Segoe UI, Tahoma, sans-serif`;
    ctx.fillStyle = ['#4a4a4a','#6B6B6B','#C8A951','#3a3a3a'][Math.floor(Math.random()*4)];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }
}

function refreshCaptcha(which) {
  drawCaptcha(which);
  const input = document.getElementById(which + 'CaptchaInput');
  if (input) input.value = '';
  const err = document.getElementById(which + 'CaptchaErr');
  if (err) err.classList.remove('show');
  const inputEl = document.getElementById(which + 'CaptchaInput');
  if (inputEl) inputEl.classList.remove('error');
}

function checkCaptcha(which) {
  const input = document.getElementById(which + 'CaptchaInput');
  const err   = document.getElementById(which + 'CaptchaErr');
  const entered = (input.value || '').trim().toUpperCase();
  const expected = _captchaCode[which];

  if (!entered || entered !== expected) {
    err.textContent = 'Incorrect security code. Please try again.';
    err.classList.add('show');
    input.classList.add('error');
    refreshCaptcha(which); // new code on every failed/empty attempt
    return false;
  }
  err.classList.remove('show');
  input.classList.remove('error');
  return true;
}

document.addEventListener('DOMContentLoaded', function() {
  drawCaptcha('pwd');
  drawCaptcha('otp');

  // ✅ Keep "Book Appointment" nav visible across pages once applied
  if (sessionStorage.getItem('bls_has_application') === '1') {
    const navBtn = document.getElementById('navBookAppointment');
    if (navBtn) navBtn.style.display = 'flex';
  }

  // ✅ If the user already has an active session (logged in, or just
  // finished submitting a visa application), send them straight to
  // the dashboard instead of showing the login form — this is what
  // makes clicking "Home" show the dashboard.
  //
  // IMPORTANT: must check bls_token too, not just bls_logged_email.
  // After submitting a Visa Application, script.js sets bls_logged_email
  // alone (no token yet, since submitting isn't the same as logging in).
  // If we redirected on email alone, a user who came here specifically
  // to log in (e.g. from the Appointment page's "please login" guard)
  // would get bounced straight back to dashboard.html without ever
  // seeing the login form — and dashboard.js would bounce them right
  // back here for lacking a token, causing an infinite redirect loop.
  const existingEmail = sessionStorage.getItem('bls_logged_email');
  const existingToken = sessionStorage.getItem('bls_token');
  if (existingEmail && existingToken) {
    window.location.href = '../dashboard/dashboard.html';
  }
});

// ════════════════════════════════════════════════════════════
//  TAB SWITCH
// ════════════════════════════════════════════════════════════
function switchTab(tab) {
  document.getElementById('panelPwd').classList.toggle('active', tab === 'pwd');
  document.getElementById('panelOtp').classList.toggle('active', tab === 'otp');
  document.getElementById('tabBtnPwd').classList.toggle('active', tab === 'pwd');
  document.getElementById('tabBtnOtp').classList.toggle('active', tab === 'otp');
}

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════
function togglePass(inputId, iconId) {
  const inp = document.getElementById(inputId);
  const ico = document.getElementById(iconId);
  inp.type  = inp.type === 'password' ? 'text' : 'password';
  ico.className = inp.type === 'password' ? 'fa fa-eye' : 'fa fa-eye-slash';
}

function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

function setLoading(btnId, loading, defaultHTML) {
  const btn = document.getElementById(btnId);
  btn.disabled = loading;
  btn.innerHTML = loading ? '<i class="fa fa-spinner fa-spin"></i> Please wait…' : defaultHTML;
}

function showAlert(id, msgId, msg) {
  document.getElementById(msgId).textContent = msg;
  document.getElementById(id).classList.add('show');
}
function hideAlert(id) { document.getElementById(id).classList.remove('show'); }

// After successful login — before handing off to the dashboard, make sure
// this applicant has actually submitted a Visa Application. If they
// haven't, don't let them through to the dashboard at all — show the
// "Registration Not Done" popup instead (see regRequiredModal in login.html).
async function loginSuccess(email, token) {
  const cleanEmail = email.trim().toLowerCase();

  try {
    const res = await fetch(
      `http://localhost:5000/api/users/appointment/registration/${encodeURIComponent(cleanEmail)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();

    if (!res.ok) {
      // Auth/server error on the check itself (expired token, backend
      // hiccup, etc) — NOT the same as "not registered". Don't punish
      // the user with the wrong popup for an error that isn't theirs;
      // fall through to the dashboard like the network-failure case below.
      console.warn('Registration check returned an error:', data.error);
    } else if (!data.registered) {
      showRegistrationRequiredPopup(cleanEmail);
      return; // 🚫 do NOT set session / do NOT go to dashboard
    }
  } catch (e) {
    // Backend unreachable — don't hard-lock the user out over a network
    // blip; fall through and let the dashboard's own (already-existing)
    // empty-state handle it.
    console.warn('Registration check failed:', e);
  }

  // ✅ Save email AND the login token in sessionStorage — dashboard.js
  // requires both (`bls_logged_email` + `bls_token`) or it bounces back
  // to this login page. Previously only the email was saved here, which
  // meant a successful password login still got redirected straight back
  // to login.html because bls_token was never set.
  sessionStorage.setItem('bls_logged_email', cleanEmail);
  if (token) sessionStorage.setItem('bls_token', token);
  window.location.href = '../dashboard/dashboard.html';
}

// Shows the popup and wires its two buttons. Called instead of navigating
// to the dashboard whenever /appointment/registration/:email comes back
// with { registered: false }.
function showRegistrationRequiredPopup(email) {
  const modal = document.getElementById('regRequiredModal');
  if (!modal) { // fallback in case the modal markup isn't present for some reason
    alert('Registration not done. Please register first.');
    return;
  }
  modal.classList.add('show');

  document.getElementById('regModalGoBtn').onclick = () => {
    window.location.href = '../Visa application/index.html';
  };
  document.getElementById('regModalCloseBtn').onclick = () => {
    modal.classList.remove('show');
  };
}

// ════════════════════════════════════════════════════════════
//  PASSWORD LOGIN
// ════════════════════════════════════════════════════════════
async function doPasswordLogin() {
  hideAlert('pwdError');
  const email = document.getElementById('pwdEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('pwdPass').value;

  // Client-side validation
  let ok = true;
  const eErr = document.getElementById('pwdEmailErr');
  const pErr = document.getElementById('pwdPassErr');
  eErr.classList.remove('show'); pErr.classList.remove('show');
  document.getElementById('pwdEmail').classList.remove('error');
  document.getElementById('pwdPass').classList.remove('error');

  if (!validEmail(email)) {
    eErr.textContent = 'Enter a valid email address.';
    eErr.classList.add('show');
    document.getElementById('pwdEmail').classList.add('error');
    ok = false;
  }
  if (!pass) {
    pErr.textContent = 'Please enter your password.';
    pErr.classList.add('show');
    document.getElementById('pwdPass').classList.add('error');
    ok = false;
  }
  if (!ok) return;

  // ── CAPTCHA check ────────────────────────────────────────────
  if (!checkCaptcha('pwd')) {
    document.getElementById('pwdCaptchaInput').closest('.field').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  setLoading('pwdLoginBtn', true, '<i class="fa fa-sign-in-alt"></i> Sign In');

  if (!configured) {
    await delay(800);
    setLoading('pwdLoginBtn', false, '<i class="fa fa-sign-in-alt"></i> Sign In');
    showAlert('pwdError','pwdErrorMsg','Demo mode: Supabase is not configured.');
    return;
  }

  try {
    const res = await fetch('http://localhost:5000/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Login failed. Please try again.');

    await loginSuccess(email, data.token);
  } catch (err) {
    showAlert('pwdError', 'pwdErrorMsg', err.message || 'Login failed. Please try again.');
    refreshCaptcha('pwd');
  } finally {
    setLoading('pwdLoginBtn', false, '<i class="fa fa-sign-in-alt"></i> Sign In');
  }
}

// Enter key on password tab
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.getElementById('panelPwd').classList.contains('active')) doPasswordLogin();
  }
});

// ════════════════════════════════════════════════════════════
//  OTP — SEND  (Supabase Auth built-in — no backend needed)
//  Supabase generates the OTP and emails it directly to the
//  user. We never see the code at all.
// ════════════════════════════════════════════════════════════
async function doSendOtp(isResend) {
  hideAlert('otpReqError');
  const emailInput = document.getElementById('otpEmail');
  const email = (isResend ? _otpEmail : emailInput.value.trim().toLowerCase());
  const eErr  = document.getElementById('otpEmailErr');

  if (!isResend) {
    eErr.classList.remove('show');
    emailInput.classList.remove('error');
    if (!validEmail(email)) {
      eErr.textContent = 'Enter a valid email address.';
      eErr.classList.add('show');
      emailInput.classList.add('error');
      return;
    }
    // ── CAPTCHA check (only on first send) ──────────────────────
    if (!checkCaptcha('otp')) {
      document.getElementById('otpCaptchaInput').closest('.field').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }

  if (!isResend) setLoading('sendOtpBtn', true, '<i class="fa fa-paper-plane"></i> Send OTP to Email');
  else { document.getElementById('resendBtn').disabled = true; }

  // Check the email exists in our visa_applications (registered users only)
  if (configured) {
    const { data: app } = await db
      .from('visa_applications')
      .select('email')
      .eq('email', email)
      .limit(1)
      .single();

    if (!app) {
      if (!isResend) setLoading('sendOtpBtn', false, '<i class="fa fa-paper-plane"></i> Send OTP to Email');
      else document.getElementById('resendBtn').disabled = false;
      showAlert('otpReqError','otpReqErrorMsg',
        'No application found for this email. Please register first.');
      return;
    }
  }

  _otpEmail = email;

  if (!configured) {
    // Demo mode — skip real send
    document.getElementById('otpStep1').style.display = 'none';
    document.getElementById('otpStep2').style.display = 'block';
    document.getElementById('otpSentEmail').textContent = email;
    clearOtpBoxes();
    startResendTimer();
    if (!isResend) setLoading('sendOtpBtn', false, '<i class="fa fa-paper-plane"></i> Send OTP to Email');
    return;
  }

  try {
    // ── Supabase Auth OTP — sends 6-digit code directly to user ──
    // No Edge Function, no SMTP, no custom table.
    // Supabase generates the OTP and emails it from their servers.
    // The OTP never touches our code at all.
    const { error } = await db.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,   // creates auth user silently if not exists
      }
    });

    if (error) throw error;

    // OTP sent — show step 2
    document.getElementById('otpStep1').style.display = 'none';
    document.getElementById('otpStep2').style.display = 'block';
    document.getElementById('otpSentEmail').textContent = email;
    document.getElementById('otp0').focus();
    clearOtpBoxes();
    startResendTimer();

  } catch (err) {
    showAlert('otpReqError', 'otpReqErrorMsg',
      err.message || 'Could not send OTP. Please try again.');
  } finally {
    if (!isResend) setLoading('sendOtpBtn', false, '<i class="fa fa-paper-plane"></i> Send OTP to Email');
    else document.getElementById('resendBtn').disabled = false;
  }
}

function backToOtpStep1() {
  document.getElementById('otpStep2').style.display = 'none';
  document.getElementById('otpStep1').style.display = 'block';
  clearInterval(_resendTimer);
  hideAlert('otpVerifyError');
}

// ════════════════════════════════════════════════════════════
//  OTP — VERIFY  (Supabase Auth built-in)
//  We pass the entered code to Supabase Auth.
//  Supabase checks it server-side — we never see the real OTP.
// ════════════════════════════════════════════════════════════
async function doVerifyOtp() {
  hideAlert('otpVerifyError');
  const entered = Array.from({length:6},(_,i) => document.getElementById('otp'+i).value).join('');

  if (entered.length < 6) {
    showAlert('otpVerifyError','otpVerifyErrorMsg','Please enter all 6 digits.');
    document.querySelectorAll('.otp-box').forEach(b => b.classList.add('error-box'));
    return;
  }

  setLoading('verifyOtpBtn', true, '<i class="fa fa-check-circle"></i> Verify &amp; Sign In');

  if (!configured) {
    // Demo mode — accept any 6-digit code
    await delay(700);
    setLoading('verifyOtpBtn', false, '<i class="fa fa-check-circle"></i> Verify &amp; Sign In');
    await loginSuccess(_otpEmail || 'demo@example.com', 'demo-token');
    return;
  }

  try {
    // ── Supabase Auth verifyOtp — checks the code server-side ──
    // Returns a session if correct, error if wrong/expired.
    const { data, error } = await db.auth.verifyOtp({
      email: _otpEmail,
      token: entered,
      type:  'email'        // 'email' = magic-link / OTP type
    });

    if (error) {
      // Map Supabase error messages to user-friendly text
      const msg = error.message.toLowerCase();
      if (msg.includes('expired'))       throw new Error('OTP has expired. Please request a new one.');
      if (msg.includes('invalid'))       throw new Error('Incorrect OTP. Please try again.');
      if (msg.includes('token'))         throw new Error('Incorrect OTP. Please try again.');
      throw error;
    }

    clearInterval(_resendTimer);
    const otpToken = data && data.session ? data.session.access_token : null;
    await loginSuccess(_otpEmail, otpToken);

  } catch(err) {
    document.querySelectorAll('.otp-box').forEach(b => b.classList.add('error-box'));
    showAlert('otpVerifyError','otpVerifyErrorMsg', err.message || 'Verification failed.');
  } finally {
    setLoading('verifyOtpBtn', false, '<i class="fa fa-check-circle"></i> Verify &amp; Sign In');
  }
}

// ── OTP Box UX (auto-advance, backspace, paste) ──────────────
function clearOtpBoxes() {
  for (let i = 0; i < 6; i++) {
    const b = document.getElementById('otp'+i);
    b.value = '';
    b.classList.remove('filled','error-box');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  for (let i = 0; i < 6; i++) {
    const box = document.getElementById('otp'+i);

    box.addEventListener('input', function() {
      this.value = this.value.replace(/\D/g,'').slice(-1);
      this.classList.toggle('filled', this.value !== '');
      this.classList.remove('error-box');
      if (this.value && i < 5) document.getElementById('otp'+(i+1)).focus();
      // Auto-verify when all filled
      const all = Array.from({length:6},(_,j)=>document.getElementById('otp'+j).value).join('');
      if (all.length === 6) setTimeout(doVerifyOtp, 200);
    });

    box.addEventListener('keydown', function(e) {
      if (e.key === 'Backspace' && !this.value && i > 0) {
        document.getElementById('otp'+(i-1)).focus();
      }
    });

    box.addEventListener('paste', function(e) {
      e.preventDefault();
      const pasted = (e.clipboardData||window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
      pasted.split('').forEach((ch, idx) => {
        const b = document.getElementById('otp'+idx);
        if (b) { b.value = ch; b.classList.add('filled'); }
      });
      const next = document.getElementById('otp'+Math.min(pasted.length, 5));
      if (next) next.focus();
      if (pasted.length === 6) setTimeout(doVerifyOtp, 200);
    });
  }
});

// ── Resend countdown ─────────────────────────────────────────
function startResendTimer() {
  let secs = 60;
  document.getElementById('resendTimer').style.display = 'inline';
  document.getElementById('resendLink').style.display  = 'none';
  document.getElementById('resendCount').textContent   = secs;
  clearInterval(_resendTimer);
  _resendTimer = setInterval(function() {
    secs--;
    document.getElementById('resendCount').textContent = secs;
    if (secs <= 0) {
      clearInterval(_resendTimer);
      document.getElementById('resendTimer').style.display = 'none';
      document.getElementById('resendLink').style.display  = 'inline';
      document.getElementById('resendBtn').disabled = false;
    }
  }, 1000);
}


// ── Micro helpers ────────────────────────────────────────────
function esc(s) { if(!s)return'—'; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function delay(ms) { return new Promise(r=>setTimeout(r,ms)); }