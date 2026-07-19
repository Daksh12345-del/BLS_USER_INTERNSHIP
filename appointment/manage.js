// ════════════════════════════════════════════════════════════
//  MANAGE APPOINTMENT — lists every appointment booked under the
//  logged-in email (multiple are allowed) and lets the applicant
//  cancel any of them. Visa application stays one-per-email; this
//  page is only about appointments.
// ════════════════════════════════════════════════════════════

const API_BASE = `${apiUsersBase()}/appointment`; // from shared/config.js

let pendingCancelRef = null;

document.addEventListener('DOMContentLoaded', function () {
  const email = sessionStorage.getItem('bls_logged_email');
  const token = sessionStorage.getItem('bls_token');

  if (!email || !token) {
    document.getElementById('accessGuard').style.display = 'block';
    return;
  }

  document.getElementById('manageMain').style.display = 'block';
  loadAppointments(email);

  document.getElementById('cancelModalNoBtn').addEventListener('click', closeCancelModal);
  document.getElementById('cancelModalOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeCancelModal();
  });
  document.getElementById('cancelModalYesBtn').addEventListener('click', confirmCancel);
});

async function loadAppointments(email) {
  const token = sessionStorage.getItem('bls_token');
  const loading = document.getElementById('manageLoading');
  const empty = document.getElementById('manageEmpty');
  const list = document.getElementById('apptList');

  loading.style.display = 'flex';
  empty.style.display = 'none';
  list.innerHTML = '';

  try {
    const res = await fetch(`${API_BASE}/my-appointments/${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    const appointments = data.appointments || [];

    loading.style.display = 'none';

    if (!appointments.length) {
      empty.style.display = 'flex';
      return;
    }

    list.innerHTML = appointments.map(renderCard).join('');

    list.querySelectorAll('[data-cancel-ref]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openCancelModal(btn.getAttribute('data-cancel-ref'));
      });
    });
  } catch (err) {
    loading.innerHTML = '<i class="fa fa-triangle-exclamation"></i> <span>Could not load your appointments. Please refresh and try again.</span>';
  }
}

function renderCard(appt) {
  const isCancelled = appt.status === 'cancelled';
  const statusClass = isCancelled ? 'st-cancelled' : 'st-confirmed';
  const statusLabel = isCancelled ? 'Cancelled' : 'Confirmed';

  return `
    <div class="appt-card ${isCancelled ? 'is-cancelled' : ''}">
      <div class="appt-card-top">
        <div class="appt-ref"><i class="fa fa-hashtag"></i> ${esc(appt.reference_number)}</div>
        <span class="appt-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="appt-card-grid">
        <div class="appt-field"><label>Date</label><div class="v">${fmt(appt.appointment_date)}</div></div>
        <div class="appt-field"><label>Time</label><div class="v">${esc(appt.slot_time)}</div></div>
        <div class="appt-field"><label>Counter</label><div class="v">${esc(String(appt.counter))}</div></div>
        <div class="appt-field"><label>Centre</label><div class="v">${esc(appt.appointment_centre)}</div></div>
        <div class="appt-field"><label>Destination</label><div class="v">${esc(appt.destination_country)}</div></div>
        <div class="appt-field"><label>Purpose</label><div class="v">${esc(appt.purpose_of_visit)}</div></div>
      </div>
      <div class="appt-card-actions">
        <a href="../track/track.html?ref=${encodeURIComponent(appt.reference_number)}&passport=${encodeURIComponent(appt.passport_number || '')}" class="btn-outline btn-sm">
          <i class="fa fa-magnifying-glass"></i> <span>Track</span>
        </a>
        ${isCancelled ? '' : `
        <button type="button" class="btn-danger btn-sm" data-cancel-ref="${esc(appt.reference_number)}">
          <i class="fa fa-ban"></i> <span>Cancel</span>
        </button>`}
      </div>
    </div>`;
}

function openCancelModal(refNumber) {
  pendingCancelRef = refNumber;
  document.getElementById('cancelRefText').textContent = refNumber;
  document.getElementById('cancelModalOverlay').classList.add('show');
}

function closeCancelModal() {
  pendingCancelRef = null;
  document.getElementById('cancelModalOverlay').classList.remove('show');
}

async function confirmCancel() {
  if (!pendingCancelRef) return;
  const token = sessionStorage.getItem('bls_token');
  const yesBtn = document.getElementById('cancelModalYesBtn');
  const refNumber = pendingCancelRef;

  yesBtn.disabled = true;
  yesBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> <span>Cancelling…</span>';

  try {
    const res = await fetch(`${API_BASE}/cancel/${encodeURIComponent(refNumber)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cancel failed');

    closeCancelModal();
    const email = sessionStorage.getItem('bls_logged_email');
    loadAppointments(email);
  } catch (err) {
    alert(err.message || 'Could not cancel this appointment. Please try again.');
  } finally {
    yesBtn.disabled = false;
    yesBtn.innerHTML = '<i class="fa fa-ban"></i> <span>Yes, Cancel</span>';
  }
}

// ── Micro helpers ────────────────────────────────────────────
function esc(s) { if (!s) return '—'; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmt(d) { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? d : x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
