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

// ── SAFETY NET ──────────────────────────────────────────────
// This file calls i18nT()/i18nInit()/i18nDateLocale() (defined in
// i18n-shared.js). If that file fails to load for any reason (wrong path,
// missing from the folder, network hiccup), those calls would throw
// "is not defined" and break the whole page. These fallbacks make sure
// that NEVER happens — worst case, translations just don't apply.
if (typeof i18nT !== 'function') {
  window.i18nT = function (key, fallback) { return fallback !== undefined ? fallback : key; };
  console.warn('i18n-shared.js did not load — check it is in the same folder as this page. Falling back to English.');
}
if (typeof i18nDateLocale !== 'function') {
  window.i18nDateLocale = function () { return 'en-IN'; };
}
if (typeof i18nInit !== 'function') {
  window.i18nInit = function () { /* no-op fallback */ };
}

document.addEventListener('DOMContentLoaded', function() {
  if (typeof i18nInit === 'function') i18nInit({ switcherEl: '#langSwitcher' });
});
document.addEventListener('DOMContentLoaded', function() {
  drawCaptcha('pwd');
  drawCaptcha('otp');

  // ✅ Keep "Book Appointment" nav visible across pages once applied
  if (sessionStorage.getItem('bls_has_application') === '1') {
    const navBtn = document.getElementById('navBookAppointment');
    if (navBtn) navBtn.style.display = 'flex';
  }

  // ✅ If the user already has an active session (logged in, or just
  // finished submitting a visa application), show their application
  // straight away instead of the login form — this is what makes
  // clicking "Home" show the submitted application.
  const existingEmail = sessionStorage.getItem('bls_logged_email');
  if (existingEmail) {
    loginSuccess(existingEmail);
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

// After successful login — fetch application and render profile
async function loginSuccess(email) {
  // ✅ Save email in sessionStorage so appointment.html knows user is logged in
  sessionStorage.setItem('bls_logged_email', email.trim().toLowerCase());

  document.getElementById('loginCard').style.display = 'none';
  let app = null;
  try {
    const res = await fetch(`http://localhost:5000/api/users/visa/application/${encodeURIComponent(email.trim().toLowerCase())}`);
    const data = await res.json();
    app = data.application; // backend sends { application: null } or { application: {...} }
  } catch (err) {
    console.error('Application fetch failed:', err);
  }
  renderProfile(email, app);
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

    await loginSuccess(email);
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
    await loginSuccess(_otpEmail || 'demo@example.com');
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
    await loginSuccess(_otpEmail);

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

// ════════════════════════════════════════════════════════════
//  RENDER PROFILE
// ════════════════════════════════════════════════════════════
function renderProfile(email, app) {
  const fullName = app ? ((app.first_name||'') + ' ' + (app.last_name||'')).trim() : email.split('@')[0];
  document.getElementById('profileName').textContent  = fullName || 'Applicant';
  document.getElementById('profileEmail').textContent = email;

  const body = document.getElementById('profileBody');

  if (!app) {
    body.innerHTML = `<div class="no-apps">
      <i class="fa fa-folder-open"></i>
      No application found for this account.<br>
      <a href="../Visa application/index.html" style="color:var(--gold);font-weight:600;text-decoration:none;margin-top:8px;display:inline-block;">
        <i class="fa fa-plus-circle"></i> Start a New Application
      </a></div>`;
  } else {
    const sc = 'status-'+(app.status||'submitted');
    const sl = (app.status||'submitted').replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
    body.innerHTML = `
      <div class="ref-box">
        <i class="fa fa-barcode"></i>
        <div><div class="ref-label">Applicant ID</div><div class="ref-num">${esc(app.reference_number)}</div></div>
        <div style="margin-left:auto;text-align:right;">
          <div class="ref-label">Status</div>
          <span class="status-badge ${sc}">${esc(sl)}</span>
        </div>
      </div>

      <div class="section-label"><i class="fa fa-user"></i> Personal Information</div>
      <div class="info-grid">
        <div class="info-item"><label>First Name</label><div class="val">${esc(app.first_name)}</div></div>
        <div class="info-item"><label>Last Name</label><div class="val">${esc(app.last_name)}</div></div>
        <div class="info-item"><label>Date of Birth</label><div class="val">${fmt(app.date_of_birth)}</div></div>
        <div class="info-item"><label>Gender</label><div class="val">${esc(app.gender)}</div></div>
        <div class="info-item"><label>Nationality</label><div class="val">${esc(app.nationality)}</div></div>
        <div class="info-item">
          <label>Email <i class="fa fa-lock" style="color:#bbb;font-size:10px;margin-left:3px;"></i></label>
          <div class="val locked"><i class="fa fa-lock"></i>${esc(app.email)}</div>
        </div>
        <div class="info-item">
          <label>Mobile <i class="fa fa-lock" style="color:#bbb;font-size:10px;margin-left:3px;"></i></label>
          <div class="val locked"><i class="fa fa-lock"></i>${esc(app.mobile)}</div>
        </div>
      </div>

      <div class="section-label"><i class="fa fa-passport"></i> Passport Details</div>
      <div class="info-grid">
        <div class="info-item">
          <label>Passport No. <i class="fa fa-lock" style="color:#bbb;font-size:10px;margin-left:3px;"></i></label>
          <div class="val locked"><i class="fa fa-lock"></i>${esc(app.passport_number)}</div>
        </div>
        <div class="info-item"><label>Place of Issue</label><div class="val">${esc(app.place_of_issue)}</div></div>
        <div class="info-item"><label>Issue Date</label><div class="val">${fmt(app.passport_issue)}</div></div>
        <div class="info-item"><label>Expiry Date</label><div class="val">${fmt(app.passport_expiry)}</div></div>
      </div>

      <div class="section-label"><i class="fa fa-plane"></i> Travel Details</div>
      <div class="info-grid">
        <div class="info-item"><label>Visa Type</label><div class="val">${esc(app.visa_type)}</div></div>
        <div class="info-item"><label>Stay Type</label><div class="val">${app.stay_type==='short'?'Short Stay — Type C':'Long Stay — Type D'}</div></div>
        <div class="info-item"><label>Departure</label><div class="val">${fmt(app.departure_date)}</div></div>
        <div class="info-item"><label>Return</label><div class="val">${fmt(app.return_date)}</div></div>
        <div class="info-item"><label>Duration</label><div class="val">${esc(String(app.duration_days))} days</div></div>
        <div class="info-item"><label>City</label><div class="val">${esc(app.appointment_city)}</div></div>
      </div>

      ${app.stay_type==='long'?`
      <div class="section-label"><i class="fa fa-briefcase"></i> Long Stay Details</div>
      <div class="info-grid">
        <div class="info-item"><label>Employer / Institution</label><div class="val">${esc(app.employer_name||'—')}</div></div>
        <div class="info-item"><label>Sponsor</label><div class="val">${esc(app.sponsor_name||'—')}</div></div>
        <div class="info-item"><label>Address in Spain</label><div class="val">${esc(app.address_in_spain||'—')}</div></div>
        <div class="info-item"><label>Specific Purpose</label><div class="val">${esc(app.long_stay_purpose||'—')}</div></div>
      </div>`:''}

      <div style="margin-top:18px;font-size:11px;color:#bbb;display:flex;align-items:center;gap:6px;">
        <i class="fa fa-info-circle" style="color:var(--gold);"></i>
        Submitted on ${fmtFull(app.created_at)}.
        Fields marked <i class="fa fa-lock" style="margin:0 2px;"></i> cannot be changed after submission.
      </div>`;
  }

  document.getElementById('profileCard').style.display = 'block';
  document.getElementById('profileCard').scrollIntoView({ behavior:'smooth', block:'start' });
}

// ════════════════════════════════════════════════════════════
//  LOGOUT
// ════════════════════════════════════════════════════════════
function doLogout() {
  sessionStorage.removeItem('bls_logged_email');
  document.getElementById('profileCard').style.display = 'none';
  document.getElementById('loginCard').style.display   = 'block';
  document.getElementById('pwdEmail').value    = '';
  document.getElementById('pwdPass').value     = '';
  document.getElementById('otpEmail').value    = '';
  hideAlert('pwdError'); hideAlert('otpReqError'); hideAlert('otpVerifyError');
  clearInterval(_resendTimer);
  backToOtpStep1();
  refreshCaptcha('pwd');
  refreshCaptcha('otp');
  window.scrollTo({ top:0, behavior:'smooth' });
}

// ── Micro helpers ────────────────────────────────────────────
function esc(s) { if(!s)return'—'; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(d) { if(!d)return'—'; const x=new Date(d); return isNaN(x)?d:x.toLocaleDateString(i18nDateLocale(),{day:'2-digit',month:'short',year:'numeric'}); }
function fmtFull(d) { if(!d)return'—'; const x=new Date(d); return isNaN(x)?d:x.toLocaleString(i18nDateLocale(),{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function delay(ms) { return new Promise(r=>setTimeout(r,ms)); }