// ════════════════════════════════════════════════════════════
//  DASHBOARD — shown after login. Every "Home" link across the
//  site points here. If there's no active session, we bounce
//  back to the login page.
// ════════════════════════════════════════════════════════════

const API_BASE = apiUsersBase(); // from shared/config.js


document.addEventListener('DOMContentLoaded', function () {

  // ✅ Keep "Book Appointment" / "Manage Appointment" nav visible once the user has applied
  if (sessionStorage.getItem('bls_has_application') === '1') {
    const navBtn = document.getElementById('navBookAppointment');
    if (navBtn) navBtn.style.display = 'flex';
    const navManage = document.getElementById('navManageAppointment');
    if (navManage) navManage.style.display = 'flex';
  }

  const email = sessionStorage.getItem('bls_logged_email');
  const token = sessionStorage.getItem('bls_token');
  if (!email || !token) {
    // No active session (or no token — e.g. leftover from before this
    // fix) — send them to login instead of showing an empty dashboard
    window.location.href = '../login/login.html';
    return;
  }

  setupAvatarMenu();
  loadDashboard(email);

  // View Application Form modal — close via the X button or by clicking
  // the dark overlay outside the card.
  document.getElementById('vfModalCloseBtn').addEventListener('click', closeApplicationFormModal);
  document.getElementById('vfModalOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeApplicationFormModal();
  });
});

// ════════════════════════════════════════════════════════════
//  AVATAR DROPDOWN
// ════════════════════════════════════════════════════════════
function setupAvatarMenu() {
  const menu = document.getElementById('avatarMenu');
  const btn = document.getElementById('avatarBtn');

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    const isOpen = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  document.addEventListener('click', function (e) {
    if (!menu.contains(e.target)) {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ════════════════════════════════════════════════════════════
//  LOAD — fetch application + appointment, then render
// ════════════════════════════════════════════════════════════
async function loadDashboard(email) {
  const cleanEmail = email.trim().toLowerCase();
  const token = sessionStorage.getItem('bls_token');
  const authHeaders = { Authorization: `Bearer ${token}` };

  let app = null;
  try {
    const res = await fetch(`${API_BASE}/visa/application/${encodeURIComponent(cleanEmail)}`, { headers: authHeaders });
    const data = await res.json();
    app = data.application; // backend sends { application: null } or { application: {...} }
  } catch (err) {
    console.error('Application fetch failed:', err);
  }

  let appointments = [];
  try {
    const res2 = await fetch(`${API_BASE}/appointment/my-appointments/${encodeURIComponent(cleanEmail)}`, { headers: authHeaders });
    const data2 = await res2.json();
    appointments = data2.appointments || [];
  } catch (err) {
    console.error('Appointment fetch failed:', err);
  }

  renderDashboard(cleanEmail, app, appointments);
}

// ════════════════════════════════════════════════════════════
//  RENDER
// ════════════════════════════════════════════════════════════
function renderDashboard(email, app, appointments) {
  const appointment = appointments && appointments.length ? appointments[0] : null; // most recent, for the status card's track link
  const fullName  = app ? ((app.first_name || '') + ' ' + (app.last_name || '')).trim() : '';
  const showName  = fullName || email.split('@')[0];
  const initial   = showName.trim().charAt(0).toUpperCase() || '?';

  // Avatar + dropdown
  document.getElementById('avatarInitial').textContent = initial;
  document.getElementById('ddName').textContent  = showName;
  document.getElementById('ddEmail').textContent = email;

  // Hero
  document.getElementById('heroName').textContent = showName;
  document.getElementById('heroSub').textContent = app
    ? 'Here\'s a quick overview of your visa application.'
    : 'You haven\'t started a visa application yet.';

  // ── PERSONAL DETAILS CARD ──────────────────────────────────
  const personalBody = document.getElementById('personalBody');
  if (!app) {
    personalBody.innerHTML = `
      <div class="detail-row"><span class="dlabel">Email</span><span class="dval">${esc(email)}</span></div>
      <div class="no-data" style="padding-top:16px;">
        <i class="fa fa-user-slash"></i>
        No personal details on file yet.
      </div>`;
  } else {
    personalBody.innerHTML = `
      <div class="detail-row"><span class="dlabel">Full Name</span><span class="dval">${esc(fullName)}</span></div>
      <div class="detail-row"><span class="dlabel">Email</span><span class="dval">${esc(app.email || email)}</span></div>
      <div class="detail-row"><span class="dlabel">Mobile</span><span class="dval">${esc(app.mobile)}</span></div>
      <div class="detail-row"><span class="dlabel">Nationality</span><span class="dval">${esc(app.nationality)}</span></div>
      <div class="detail-row"><span class="dlabel">Date of Birth</span><span class="dval">${fmt(app.date_of_birth)}</span></div>`;
  }

  // ── APPLICATION STATUS CARD ────────────────────────────────
  const statusBody = document.getElementById('statusBody');
  if (!app) {
    statusBody.innerHTML = `
      <div class="no-data">
        <i class="fa fa-folder-open"></i>
        No application submitted yet.
        <div>
          <a href="../Visa application/index.html" class="btn-gold">
            <i class="fa fa-plus-circle"></i> Start Application
          </a>
        </div>
      </div>`;
  } else {
    const sc = 'status-' + (app.status || 'submitted');
    const sl = (app.status || 'submitted').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    // ⚠️ Tracking looks up the `appointments` table, not `visa_applications` —
    // so it needs the APPOINTMENT's reference number + passport, not the
    // application's. It only works once an appointment has been booked.
    const trackLink = appointment
      ? `<a href="../track/track.html?ref=${encodeURIComponent(appointment.reference_number || '')}&passport=${encodeURIComponent(appointment.passport_number || '')}" class="dcard-link"><i class="fa fa-arrow-right"></i> Track Application Progress</a>`
      : `<div class="dcard-hint"><i class="fa fa-circle-info"></i> Book an appointment to enable tracking</div>`;
    statusBody.innerHTML = `
      <div class="status-hero">
        <div>
          <div class="reflabel">Reference No.</div>
          <div class="ref">${esc(app.reference_number)}</div>
        </div>
        <span class="status-badge ${sc}">${esc(sl)}</span>
      </div>
      <div class="detail-row"><span class="dlabel">Visa Type</span><span class="dval">${esc(app.visa_type)}</span></div>
      <div class="detail-row"><span class="dlabel">Destination</span><span class="dval">${esc(app.destination_country)}</span></div>
      <a href="#" class="dcard-link" id="viewFormLink"><i class="fa fa-file-lines"></i> View Application Form</a>
      ${trackLink}`;

    // Wire up the "View Application Form" link — reuses the same `app`
    // object already fetched above, no extra request needed.
    document.getElementById('viewFormLink').addEventListener('click', function (e) {
      e.preventDefault();
      openApplicationFormModal(app);
    });
  }

  // ── APPOINTMENT CARD ───────────────────────────────────────
  const apptBody = document.getElementById('apptBody');
  if (!appointments || !appointments.length) {
    apptBody.innerHTML = `
      <div class="no-data">
        <i class="fa fa-calendar-xmark"></i>
        No appointment booked yet.
        <div>
          <a href="../appointment/appointment.html" class="btn-gold">
            <i class="fa fa-calendar-plus"></i> Book Appointment
          </a>
        </div>
      </div>`;
  } else {
    const countNote = appointments.length > 1
      ? `<div class="dcard-hint" style="margin-bottom:12px;"><i class="fa fa-circle-info"></i> You have <strong>${appointments.length}</strong> appointments booked. Showing the most recent one below.</div>`
      : '';
    apptBody.innerHTML = `
      ${countNote}
      <div class="appt-grid">
        <div class="appt-item"><label>Reference</label><div class="val">${esc(appointment.reference_number)}</div></div>
        <div class="appt-item"><label>Date</label><div class="val">${fmt(appointment.appointment_date)}</div></div>
        <div class="appt-item"><label>Time Slot</label><div class="val">${esc(appointment.slot_time)}</div></div>
        <div class="appt-item"><label>Centre</label><div class="val">${esc(appointment.appointment_centre)}</div></div>
        <div class="appt-item"><label>Counter</label><div class="val">${esc(String(appointment.counter))}</div></div>
        <div class="appt-item"><label>Purpose</label><div class="val">${esc(appointment.purpose_of_visit)}</div></div>
      </div>
      <div style="display:flex;gap:16px;margin-top:14px;flex-wrap:wrap;">
        <a href="../appointment/manage.html" class="dcard-link"><i class="fa fa-list-check"></i> Manage Appointments</a>
        <a href="../appointment/appointment.html" class="dcard-link"><i class="fa fa-calendar-plus"></i> Book Another</a>
      </div>`;
  }

  document.getElementById('dashLoading').style.display = 'none';
  document.getElementById('dashContent').style.display = 'block';
}

// ════════════════════════════════════════════════════════════
//  VIEW APPLICATION FORM — read-only view of everything the
//  applicant submitted on the Visa Application page.
// ════════════════════════════════════════════════════════════
function openApplicationFormModal(app) {
  if (!app) return;

  const isLong = app.stay_type === 'long';

  const section = (title, rows) => `
    <div class="vf-section">
      <div class="vf-section-title">${title}</div>
      <div class="vf-section-grid">
        ${rows.map(([label, val]) => `
          <div class="vf-item"><label>${label}</label><div class="vf-val">${esc(val)}</div></div>
        `).join('')}
      </div>
    </div>`;

  let html = '';
  html += section('Application', [
    ['Reference No.', app.reference_number],
    ['Stay Type', app.stay_type === 'long' ? 'Long Stay' : 'Short Stay'],
    ['Status', (app.status || 'submitted').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())],
    ['Submitted On', fmt(app.created_at)],
  ]);
  html += section('Personal Details', [
    ['First Name', app.first_name],
    ['Last Name', app.last_name],
    ['Date of Birth', fmt(app.date_of_birth)],
    ['Gender', app.gender],
    ['Nationality', app.nationality],
    ['Email', app.email],
    ['Mobile', app.mobile],
  ]);
  html += section('Passport Details', [
    ['Passport Number', app.passport_number],
    ['Issue Date', fmt(app.passport_issue)],
    ['Expiry Date', fmt(app.passport_expiry)],
    ['Place of Issue', app.place_of_issue],
    ['Issuing Authority', app.issuing_authority],
  ]);
  html += section('Travel Details', [
    ['Visa Type', app.visa_type],
    ['Destination', app.destination_country],
    ['Departure Date', fmt(app.departure_date)],
    ['Return Date', fmt(app.return_date)],
    ['Duration (days)', app.duration_days],
    ['Appointment City', app.appointment_city],
    ['Purpose of Visit', app.purpose_of_visit],
  ]);
  if (isLong) {
    html += section('Long Stay Details', [
      ['Employer Name', app.employer_name],
      ['Sponsor Name', app.sponsor_name],
      ['Address in Spain', app.address_in_spain],
      ['Long Stay Purpose', app.long_stay_purpose],
    ]);
  }

  document.getElementById('vfModalBody').innerHTML = html;
  document.getElementById('vfModalOverlay').classList.add('show');
}

function closeApplicationFormModal() {
  document.getElementById('vfModalOverlay').classList.remove('show');
}

// ════════════════════════════════════════════════════════════
//  LOGOUT
// ════════════════════════════════════════════════════════════
function doLogout() {
  sessionStorage.removeItem('bls_logged_email');
  sessionStorage.removeItem('bls_token');
  window.location.href = '../login/login.html';
}

// ── Micro helpers ────────────────────────────────────────────
function esc(s) { if (!s) return '—'; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmt(d) { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? d : x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }