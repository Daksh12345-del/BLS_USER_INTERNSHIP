// ═══════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════
// DB access ab backend ke through hota hai — koi DB key frontend mein nahi hai.
// NOTE: server.js router ko '/api/users' pe mount karta hai, isliye yahan bhi wahi prefix hai.
const API_BASE = '/api/users/appointment';
const EMAILJS_SERVICE_ID  = 'service_hd3wres';
const EMAILJS_TEMPLATE_ID = 'template_99fbko5';
const EMAILJS_PUBLIC_KEY  = 'QeXIWsIv2vyo-lEJH';

// ═══════════════════════════════════════════
//  COUNTER & SLOT CONFIG
//  Counters, time slots, and lunch-break settings are loaded live from
//  Supabase (counters, time_slots, appointment_settings tables).
// ═══════════════════════════════════════════
let COUNTERS = [];        // counter name strings, e.g. ['Counter A','Counter B']
let NUM_COUNTERS = 0;

// ═══════════════════════════════════════════
//  DOCUMENT CHECKLIST — pending documents for this applicant
//  (missing ones only — see doc-shared.js). Linked by the
//  Application Reference Number found via the applicant's email.
// ═══════════════════════════════════════════
let linkedVisaRef = null;
let apptMissingDocTypes = []; // doc types still pending for this applicant
let apptPassportForDocs = '';

async function loadMissingAppointmentDocs(refNumber, passportNumber) {
  apptPassportForDocs = passportNumber || '';
  const section = document.getElementById('apptDocSection');
  const wrap = document.getElementById('apptDocUploads');
  if (!section || !wrap) return;

  const [allTypes, uploaded] = await Promise.all([
    docLoadTypes('appointment'),
    docLoadUploaded(refNumber),
  ]);

  apptMissingDocTypes = allTypes.filter(dt => !uploaded[dt.key]);

  if (!apptMissingDocTypes.length) {
    section.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }

  wrap.innerHTML = apptMissingDocTypes.map(dt => docBuildUploadBoxHtml(dt, null)).join('');
  docWireUploadBoxes(wrap);
  section.style.display = 'block';
}

let LUNCH_START   = 13;   // used only when LUNCH_ENABLED is true
let LUNCH_END     = 13;
let LUNCH_ENABLED = false; // set by admin panel via appointment_settings

let BASE_SLOTS = []; // [{ id, label }] from the time_slots table (active only)
let TOTAL_SLOTS_PER_DAY = 0;

// Returns the slot's display label, e.g. "9:00 AM – 9:30 AM"
function slotLabel(s) {
  return s ? s.label : '';
}

// Extracts the slot's starting hour (24h) from its label, used only for lunch-break filtering.
function slotStartHour(label) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(label || '');
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (/PM/i.test(m[3])) h += 12;
  return h;
}

// ═══════════════════════════════════════════
//  VALUE ADDED SERVICES — fetched from the `service_catalogue` table in
//  Supabase (single source of truth, shared with admin_updated.html).
//  Prices are FIXED by BLS International and cannot be edited by the user.
// ═══════════════════════════════════════════
let SERVICE_CATALOGUE = [];
let vasServices = []; // { name, amount, qty }

async function loadServiceCatalogue() {
  try {
    const res = await fetch(`${API_BASE}/service-catalogue`);
    if (!res.ok) throw new Error('service catalogue fetch failed');
    const { services } = await res.json();
    SERVICE_CATALOGUE = (services || []).map(r => ({ id: r.id, name: r.name, price: parseFloat(r.price) }));
  } catch (e) {
    console.error('Failed to load service catalogue:', e);
    SERVICE_CATALOGUE = [];
  }
  populateVasServiceSelect(true);
}

function populateVasServiceSelect(force) {
  const sel = g('vasServiceSelect');
  if (!sel) return;
  if (!force && sel.options.length > 1) return;
  sel.innerHTML = '<option value="">— Select a service —</option>';
  SERVICE_CATALOGUE.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${s.name} — ₹${s.price.toFixed(2)}`;
    sel.appendChild(opt);
  });
}

function onVasServiceChange() {
  const idx = g('vasServiceSelect').value;
  const priceField = g('vasPriceField');
  if (idx === '') { priceField.value = ''; return; }
  const svc = SERVICE_CATALOGUE[parseInt(idx, 10)];
  priceField.value = svc ? svc.price.toFixed(2) : '';
}

function addVasService() {
  const sel = g('vasServiceSelect');
  const idx = sel.value;
  if (idx === '') return;
  const svc = SERVICE_CATALOGUE[parseInt(idx, 10)];
  if (!svc) return;
  let qty = parseInt(g('vasQtyField').value, 10);
  if (!qty || qty < 1) qty = 1;
  if (qty > 20) qty = 20;
  // If already added, just bump the quantity instead of duplicating the row
  const existing = vasServices.find(s => s.name === svc.name);
  if (existing) { existing.qty += qty; }
  else { vasServices.push({ name: svc.name, amount: svc.price, qty }); }
  sel.value = '';
  g('vasPriceField').value = '';
  g('vasQtyField').value = '1';
  renderVasTable();
}

function removeVasService(idx) {
  vasServices.splice(idx, 1);
  renderVasTable();
}

function renderVasTable() {
  const tbody = g('vasTbody');
  const totalRow = g('vasTotalRow');
  if (!vasServices.length) {
    tbody.innerHTML = '<tr class="vas-empty-row" id="vasEmptyRow"><td colspan="6"><i class="fa fa-hand-point-up"></i> No services added yet</td></tr>';
    totalRow.style.display = 'none';
    return;
  }
  tbody.innerHTML = vasServices.map((s, i) => `
    <tr>
      <td style="color:#aaa;font-size:12px;">${i+1}</td>
      <td style="font-weight:600;">${s.name}</td>
      <td style="text-align:center;">${s.qty}</td>
      <td style="text-align:right;">₹${s.amount.toFixed(2)}</td>
      <td style="text-align:right;font-weight:700;">₹${(s.amount*s.qty).toFixed(2)}</td>
      <td><button type="button" class="btn-vas-remove" onclick="removeVasService(${i})"><i class="fa fa-trash"></i></button></td>
    </tr>
  `).join('');
  totalRow.style.display = '';
  const total = vasServices.reduce((a,s)=>a+s.amount*s.qty, 0);
  g('vasTotalAmt').textContent = '₹' + total.toFixed(2);
}


const NATIONAL_HOLIDAYS = {
  '2025-01-26': 'Republic Day',
  '2025-03-14': 'Holi',
  '2025-04-14': 'Dr. Ambedkar Jayanti',
  '2025-04-18': 'Good Friday',
  '2025-05-12': 'Buddha Purnima',
  '2025-08-15': 'Independence Day',
  '2025-08-27': 'Janmashtami',
  '2025-10-02': 'Gandhi Jayanti',
  '2025-10-20': 'Dussehra',
  '2025-10-21': 'Diwali',
  '2025-11-05': 'Guru Nanak Jayanti',
  '2025-12-25': 'Christmas Day',
  '2026-01-26': 'Republic Day',
  '2026-03-03': 'Holi',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Dr. Ambedkar Jayanti / Baisakhi',
  '2026-05-01': 'Labour Day',
  '2026-08-15': 'Independence Day',
  '2026-08-17': 'Janmashtami',
  '2026-10-02': 'Gandhi Jayanti',
  '2026-10-09': 'Dussehra',
  '2026-10-19': 'Diwali',
  '2026-11-24': 'Guru Nanak Jayanti',
  '2026-12-25': 'Christmas Day',
};

// Admin-blocked dates — loaded from Supabase blocked_dates table
const BLOCKED_DATES = new Map(); // key: date string, value: reason

// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════
let registrationData = null;    // cached response from /registration/:email
let calYear = 0, calMonth = 0;  // current calendar view
let selectedDate = null;         // Date object
let selectedSlotIdx = null;      // index in BASE_SLOTS
let selectedCounter = null;      // 'A' or 'B'
// bookedData[dateKey] = array of {slot_index, counter}
let bookedData = {};
let apptRef = '';

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
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

document.addEventListener('DOMContentLoaded', () => {
  if (typeof i18nInit === 'function') i18nInit({ switcherEl: '#langSwitcher' });
});
document.addEventListener('DOMContentLoaded', async () => {
  const loggedEmail = sessionStorage.getItem('bls_logged_email');
  if (!loggedEmail) {
    document.getElementById('accessGuard').style.display = 'block';
    return;
  }
  document.getElementById('apptMain').style.display = 'block';

  // Set calendar to current month
  const now = new Date();
  calYear = now.getFullYear(); calMonth = now.getMonth();

  try {
    // Load settings, locations, counters & blocked dates from backend first
    await loadSettings(); // lunch break on/off + hours (time slots below depend on this)
    await Promise.all([loadCounters(), loadLocations(), loadBlockedDates(), loadBookedData(), loadServiceCatalogue()]);
    await loadTimeSlots(); // depends on LUNCH_ENABLED loaded above

    // Update UI with loaded settings
    const counterNames = COUNTERS.join(' & ');
    const el1 = document.getElementById('counterInfoText');
    const el2 = document.getElementById('slotHeaderText');
    if (el1) el1.innerHTML = NUM_COUNTERS
      ? `We have <strong>${NUM_COUNTERS} Counter${NUM_COUNTERS>1?'s':''} (${counterNames})</strong> running in parallel. Counter assigned automatically.`
      : `Counter information is currently unavailable.`;
    if (el2) el2.textContent = BASE_SLOTS.length
      ? `${NUM_COUNTERS} counters · ${BASE_SLOTS.length * NUM_COUNTERS} slots/day`
      : `No time slots available — please check back later`;

    // Check if user has completed registration form
    const hasRegistration = await checkRegistrationExists(loggedEmail);
    if (!hasRegistration) return; // shows "fill registration" screen

    // Check if user already has an appointment (by email OR mobile)
    const alreadyBooked = await checkAlreadyBooked(loggedEmail);
    if (alreadyBooked) return; // will redirect

    await autoFillFromRegistration(loggedEmail);
  } catch(e) {
    console.warn('Backend not reachable, demo mode:', e);
    setVal('af_email', loggedEmail);
    populateVasServiceSelect(true);
  }

  renderCalendar();
});

function showNotRegisteredScreen(email) {
  document.getElementById('apptMain').style.display = 'none';
  document.getElementById('accessGuard').style.display = 'block';
  document.getElementById('guardNotLoggedIn').style.display = 'none';
  document.getElementById('guardNotRegistered').style.display = 'block';
  document.getElementById('guardEmail').textContent = email;
}

async function checkRegistrationExists(email) {
  try {
    const res = await fetch(`${API_BASE}/registration/${encodeURIComponent(email)}`);
    if (!res.ok) throw new Error('registration lookup failed');
    const data = await res.json();

    if (data.registered && data.application) {
      registrationData = data.application; // cache for autoFillFromRegistration
      return true;
    }
    showNotRegisteredScreen(email);
    return false;
  } catch(_) {
    showNotRegisteredScreen(email);
    return false;
  }
}

async function checkAlreadyBooked(email) {
  try {
    const res = await fetch(`${API_BASE}/check-booked/${encodeURIComponent(email)}`);
    if (!res.ok) return false;
    const data = await res.json();
    if (data.alreadyBooked && data.appointment) {
      showAlreadyBookedScreen(data.appointment);
      return true;
    }
  } catch(_) {}
  return false;
}

function showAlreadyBookedScreen(appt) {
  document.getElementById('apptMain').style.display = 'none';
  document.getElementById('accessGuard').style.display = 'none';

  const screen = document.createElement('div');
  screen.style.cssText = 'max-width:520px;margin:60px auto;padding:0 16px;text-align:center;';
  screen.innerHTML = `
    <div style="background:#fff;border-radius:10px;border:1px solid #ddd;box-shadow:0 2px 16px rgba(0,0,0,.08);padding:48px 36px;">
      <div style="font-size:52px;color:#e74c3c;margin-bottom:16px;"><i class="fa fa-calendar-times"></i></div>
      <h2 style="font-size:20px;color:#3a3a3a;margin-bottom:10px;">Appointment Already Booked</h2>
      <p style="font-size:13px;color:#777;line-height:1.7;margin-bottom:20px;">
        You already have an active appointment. Only <strong>one appointment</strong> is allowed per applicant.
      </p>
      <div style="background:#fdf8ed;border:2px solid #C8A951;border-radius:8px;padding:18px 20px;margin:20px 0;text-align:left;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="padding:5px 0;color:#999;width:45%;">Reference No.</td><td style="font-weight:700;color:#C8A951;">${appt.reference_number}</td></tr>
          <tr><td style="padding:5px 0;color:#999;">Date</td><td style="font-weight:600;color:#333;">${appt.appointment_date}</td></tr>
          <tr><td style="padding:5px 0;color:#999;">Time</td><td style="font-weight:600;color:#333;">${appt.slot_time}</td></tr>
          <tr><td style="padding:5px 0;color:#999;">Counter</td><td style="font-weight:600;color:#333;">${appt.counter}</td></tr>
        </table>
      </div>
      <p style="font-size:12px;color:#999;margin-bottom:24px;">Redirecting to home in <strong id="countdown">5</strong> seconds...</p>
      <a href="../login/login.html" style="padding:11px 28px;background:#C8A951;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:8px;">
        <i class="fa fa-home"></i> Go to Home Now
      </a>
    </div>
  `;
  document.body.appendChild(screen);

  // Countdown redirect
  let secs = 5;
  const timer = setInterval(() => {
    secs--;
    const el = document.getElementById('countdown');
    if (el) el.textContent = secs;
    if (secs <= 0) {
      clearInterval(timer);
      window.location.href = '../login/login.html';
    }
  }, 1000);
}

async function autoFillFromRegistration(email) {
  try {
    const app = registrationData; // already fetched in checkRegistrationExists()

    if (app) {
      linkedVisaRef = app.reference_number || null;
      if (linkedVisaRef) loadMissingAppointmentDocs(linkedVisaRef, app.passport_number);
      setVal('af_name',    (app.first_name||'').trim() + ' ' + (app.last_name||'').trim());
      setVal('af_email',   app.email || email);
      setVal('af_passport',app.passport_number);
      setVal('af_mobile',  app.mobile);
      if (app.passport_issue)  g('af_issue').value  = app.passport_issue;
      if (app.passport_expiry) g('af_expiry').value = app.passport_expiry;

      // Purpose
      if (app.purpose_of_visit) {
        const map = {'Tourist':'Tourist','Business':'Business','Family Visit':'Family Visit','Family Visit (Short-term)':'Family Visit','Medical':'Medical','Medical (Short-term)':'Medical','Student / Education':'Study / Education','Study / Education':'Study / Education','Work / Employment':'Work / Employment','Transit':'Transit','Other':'Other'};
        const sel = g('af_purpose');
        const v = map[app.purpose_of_visit] || app.purpose_of_visit;
        for (let o of sel.options) if (o.value===v) { sel.value=v; break; }
      }
      // Country → State → City — restore all 3 levels by matching saved names to IDs
      const savedCountry = (app.destination_country || '').trim();
      const savedState   = (app.appointment_state   || '').trim();
      const savedCity    = (app.appointment_city    || '').trim();

      if (savedCountry) {
        // Find country ID by name
        const countryObj = GEO_COUNTRIES.find(c => c.name.toLowerCase() === savedCountry.toLowerCase());
        if (countryObj) {
          populateCountryDropdown(countryObj.id);  // fills country dropdown

          if (savedState) {
            // Find state ID by name within that country
            const stateObj = GEO_STATES.find(s => String(s.country_id) === String(countryObj.id) && s.name.toLowerCase() === savedState.toLowerCase());
            if (stateObj) {
              _apptLoadStates(countryObj.id, stateObj.id); // fills state dropdown

              if (savedCity) {
                // Find city ID by name within that state
                const cityObj = GEO_CITIES.find(c => String(c.state_id) === String(stateObj.id) && c.name.toLowerCase() === savedCity.toLowerCase());
                if (cityObj) _apptLoadCities(countryObj.id, stateObj.id, cityObj.id);
              }
            } else {
              _apptLoadStates(countryObj.id); // at least populate states
            }
          } else {
            _apptLoadStates(countryObj.id);
          }
        }
      }

      // Read-only styling
      ['af_name','af_email','af_passport','af_mobile'].forEach(id => {
        const el = g(id);
        if (el && el.value) { el.readOnly = true; }
      });
      ['af_issue','af_expiry'].forEach(id => {
        const el = g(id);
        if (el && el.value) { el.readOnly = true; }
      });

      // Show notice
      g('autofillNotice').style.display = 'flex';
      g('autofillMsg').textContent = `Welcome back, ${app.first_name || ''}! Your registration details are auto-filled. Just pick your appointment slot.`;
    } else {
      setVal('af_email', email);
      g('af_email').readOnly = true;
    }
  } catch(e) {
    setVal('af_email', email);
    g('af_email').readOnly = true;
  }
}

async function loadSettings() {
  // Lunch break is still a simple on/off + hour range, stored in appointment_settings.
  try {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error('settings fetch failed');
    const { settings } = await res.json();
    (settings || []).forEach(row => {
      if (row.setting_key === 'lunch_start_hour')  LUNCH_START   = parseInt(row.setting_value);
      if (row.setting_key === 'lunch_end_hour')    LUNCH_END     = parseInt(row.setting_value);
      if (row.setting_key === 'lunch_enabled')     LUNCH_ENABLED = (row.setting_value === 'true' || row.setting_value === '1');
    });
  } catch(e) { console.warn('Lunch settings load failed, using defaults'); }
}

async function loadCounters() {
  try {
    const res = await fetch(`${API_BASE}/counters`);
    if (!res.ok) throw new Error('counters fetch failed');
    const { counters } = await res.json();
    COUNTERS = (counters || []).map(c => c.name);
    NUM_COUNTERS = COUNTERS.length;
  } catch(e) {
    console.warn('Counters load failed:', e);
    COUNTERS = [];
    NUM_COUNTERS = 0;
  }
}

async function loadTimeSlots() {
  try {
    const res = await fetch(`${API_BASE}/time-slots`);
    if (!res.ok) throw new Error('time slots fetch failed');
    const { slots: rawSlots } = await res.json();
    let slots = (rawSlots || []).map(s => ({ id: s.id, label: s.label }));
    if (LUNCH_ENABLED) {
      slots = slots.filter(s => {
        const h = slotStartHour(s.label);
        return h === null || h < LUNCH_START || h >= LUNCH_END;
      });
    }
    BASE_SLOTS = slots;
  } catch(e) {
    console.warn('Time slots load failed:', e);
    BASE_SLOTS = [];
  }
  TOTAL_SLOTS_PER_DAY = BASE_SLOTS.length * NUM_COUNTERS;
}

// ── COUNTRY → STATE → CITY  (3 separate Supabase tables) ────────
// countries : id, name, active, sort_order
// states    : id, country_id, name, active, sort_order
// cities    : id, state_id, country_id, name, active, sort_order

let GEO_COUNTRIES = [];
let GEO_STATES    = [];
let GEO_CITIES    = [];

async function loadLocations() {
  try {
    const res = await fetch(`${API_BASE}/locations`);
    if (!res.ok) throw new Error('locations fetch failed');
    const data = await res.json();
    GEO_COUNTRIES = data.countries || [];
    GEO_STATES    = data.states    || [];
    GEO_CITIES    = data.cities    || [];
  } catch (e) {
    console.warn('Geo data load failed:', e);
  }
  populateCountryDropdown();
}

// Helper — reset a select to a placeholder and optionally disable it
function _apptResetSel(id, placeholder, disable) {
  const el = g(id);
  if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>`;
  el.disabled = !!disable;
}

// Resolve human-readable names from stored IDs
function _apptCountryName(id) { return (GEO_COUNTRIES.find(c => String(c.id) === String(id)) || {}).name || id; }
function _apptStateName(id)   { return (GEO_STATES.find(s => String(s.id) === String(id))    || {}).name || id; }
function _apptCityName(id)    { return (GEO_CITIES.find(c => String(c.id) === String(id))    || {}).name || id; }

// ── Step 1 : Populate Country dropdown ───────────────────────────
function populateCountryDropdown(preselectId) {
  const sel = g('af_country');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select country —</option>';
  GEO_COUNTRIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  _apptResetSel('af_state',  '— Select country first —', true);
  _apptResetSel('af_centre', '— Select state first —',   true);

  if (preselectId) {
    sel.value = preselectId;
    _apptLoadStates(preselectId);
  }
}

// ── Step 2 : Country changed → load States ────────────────────────
function onCountryChange() {
  const countryId = g('af_country').value;
  _apptResetSel('af_state',  '— Select country first —', true);
  _apptResetSel('af_centre', '— Select state first —',   true);
  if (countryId) _apptLoadStates(countryId);
}

function _apptLoadStates(countryId, preselectStateId) {
  const states = GEO_STATES.filter(s => String(s.country_id) === String(countryId));
  const sel = g('af_state');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select state —</option>';
  states.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
  sel.disabled = states.length === 0;
  _apptResetSel('af_centre', '— Select state first —', true);

  if (preselectStateId) {
    sel.value = preselectStateId;
    _apptLoadCities(countryId, preselectStateId);
  }
}

// ── Step 3 : State changed → load Cities ─────────────────────────
function onStateChange() {
  const countryId = g('af_country').value;
  const stateId   = g('af_state').value;
  _apptResetSel('af_centre', '— Select state first —', true);
  if (stateId) _apptLoadCities(countryId, stateId);
}

function _apptLoadCities(countryId, stateId, preselectCityId) {
  const cities = GEO_CITIES.filter(
    c => String(c.state_id) === String(stateId) && String(c.country_id) === String(countryId)
  );
  const sel = g('af_centre');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select city —</option>';
  cities.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  sel.disabled = cities.length === 0;

  if (preselectCityId) sel.value = preselectCityId;
}

async function loadBlockedDates() {
  try {
    const res = await fetch(`${API_BASE}/blocked-dates`);
    if (!res.ok) throw new Error('blocked dates fetch failed');
    const { blockedDates } = await res.json();
    if (blockedDates) {
      blockedDates.forEach(row => BLOCKED_DATES.set(row.blocked_date, row.reason));
      console.log('Blocked dates loaded:', blockedDates.length);
    }
  } catch(e) { console.warn('Blocked dates load failed'); }
}

async function loadBookedData() {
  try {
    const res = await fetch(`${API_BASE}/booked-data`);
    if (!res.ok) throw new Error('booked data fetch failed');
    const { booked } = await res.json();
    if (booked) {
      booked.forEach(row => {
        if (!bookedData[row.appointment_date]) bookedData[row.appointment_date] = [];
        bookedData[row.appointment_date].push({ slot_index: row.slot_index, counter: row.counter });
      });
    }
  } catch(e) { console.warn('Could not load booked data'); }
}

// ═══════════════════════════════════════════
//  CALENDAR RENDER
// ═══════════════════════════════════════════
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function toKey(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function changeMonth(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

function getAvailableSlots(dateKey) {
  // Returns count of available "seats" (each time slot has seats = one per counter)
  const booked = bookedData[dateKey] || [];
  return TOTAL_SLOTS_PER_DAY - booked.length;
}

function renderCalendar() {
  g('calTitle').textContent = MONTH_NAMES[calMonth] + ' ' + calYear;
  const grid = g('calGrid');
  grid.innerHTML = '';
  const today = new Date(); today.setHours(0,0,0,0);

  // Day-of-week headers
  DAY_NAMES.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-dow'; el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();

  // Empty cells
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div'); el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(calYear, calMonth, day);
    const key = toKey(d);
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = !!NATIONAL_HOLIDAYS[key];
    const isBlocked = BLOCKED_DATES.has(key);
    const blockReason = BLOCKED_DATES.get(key) || 'Closed';
    const isPast = d < today;
    const avail = getAvailableSlots(key);
    const isFull = avail <= 0;
    const isSelected = selectedDate && toKey(selectedDate) === key;

    const el = document.createElement('div');
    el.className = 'cal-day';

    let cls = '';
    if (isPast)        cls = 'past';
    else if (isWeekend)cls = 'weekend';
    else if (isHoliday)cls = 'holiday';
    else if (isBlocked)cls = 'blocked';
    else if (isFull)   cls = 'full';
    else               cls = 'available' + (avail <= 4 ? ' few' : '');

    if (isSelected) cls += ' selected';
    el.className = 'cal-day ' + cls.trim();

    let slotsText = '';
    if (cls.includes('available')) slotsText = avail + ' left';
    else if (cls.includes('full')) slotsText = 'Full';
    else if (isHoliday) slotsText = '🎉';
    else if (isWeekend) slotsText = 'Closed';
    else if (isPast) slotsText = '';
    else if (isBlocked) slotsText = blockReason;

    const holName = NATIONAL_HOLIDAYS[key] || '';
    el.innerHTML = `
      <span class="d-num">${day}</span>
      <span class="d-slots">${slotsText}</span>
      ${holName ? `<span class="hol-tip">${holName}</span>` : ''}
    `;

    if (cls.includes('available') && !isSelected) {
      el.onclick = () => selectDate(d, key);
    } else if (isSelected) {
      el.onclick = () => selectDate(d, key);
    }

    grid.appendChild(el);
  }
}

function selectDate(d, key) {
  selectedDate = d;
  selectedSlotIdx = null;
  selectedCounter = null;
  g('btnConfirm').disabled = true;
  g('selBanner').classList.remove('show');
  renderCalendar();
  buildSlotGrid(key);
  g('slotSection').classList.add('show');
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  g('slotDateLabel').textContent = d.getDate()+' '+MONTHS_SHORT[d.getMonth()]+' '+d.getFullYear();
  setTimeout(() => g('slotSection').scrollIntoView({ behavior:'smooth', block:'start' }), 100);
}

// ═══════════════════════════════════════════
//  SLOT GRID
//  Each BASE_SLOT has counters = one seat per counter
//  User picks time → system assigns counter
// ═══════════════════════════════════════════
function buildSlotGrid(dateKey) {
  const grid = g('slotGrid');
  grid.innerHTML = '';
  const booked = bookedData[dateKey] || [];

  BASE_SLOTS.forEach((slot, idx) => {
    const time = slotLabel(slot);
    // Check which counters are booked for this slot
    const bookedCounters = booked.filter(b => b.slot_index === idx).map(b => b.counter);
    const allBooked = bookedCounters.length >= NUM_COUNTERS;
    const btn = document.createElement('button');

    // Counter to assign if user picks this slot
    const nextCounter = COUNTERS.find(c => !bookedCounters.includes(c));
    const isSelected = selectedSlotIdx === idx;

    btn.className = 'slot-btn' + (allBooked ? ' booked' : '') + (isSelected ? ' selected' : '');
    btn.innerHTML = `
      <span class="sl-time">${time}</span>
      ${allBooked ? '<span class="sl-counter">Fully Booked</span>' : ''}
    `;

    if (!allBooked) {
      btn.onclick = () => pickSlot(idx, nextCounter, time, btn);
    }
    grid.appendChild(btn);
  });
}

function pickSlot(idx, counter, time, btn) {
  selectedSlotIdx = idx;
  selectedCounter = counter;
  // Re-render slot grid to reflect selection
  buildSlotGrid(toKey(selectedDate));
  g('btnConfirm').disabled = false;

  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateStr = selectedDate.getDate()+' '+MONTHS_SHORT[selectedDate.getMonth()]+' '+selectedDate.getFullYear();
  g('bannerText').textContent = dateStr + ' — ' + time;
  g('bannerCounter').textContent = 'Assigned Counter: ' + counter;
  g('selBanner').classList.add('show');
}

// ═══════════════════════════════════════════
//  STEPS
// ═══════════════════════════════════════════
function showPanel(n) {
  [1,2,3,4].forEach(i => g('panel'+i).classList.toggle('active', i===n));
  for (let i=1;i<=4;i++) {
    const sc = g('sc'+i), sl = g('sl'+i), ln = g('line'+i);
    sc.className = 'step-circle'+(i<n?' done':i===n?' active':'');
    if (i<n) sc.innerHTML='<i class="fa fa-check"></i>'; else if(i>n) sc.textContent=i;
    sl.className = 'step-label'+(i<n?' done':i===n?' active':'');
    if (ln) ln.className='step-line'+(i<n?' done':'');
  }
  window.scrollTo({top:0,behavior:'smooth'});
}
function goBack(n) { showPanel(n); }

// ═══════════════════════════════════════════
//  VALIDATE
// ═══════════════════════════════════════════
function validateForm() {
  let ok = true;
  const checks = [
    {id:'af_name',err:'af_name_err',msg:'Full name required.'},
    {id:'af_email',err:'af_email_err',msg:'Valid email required.',email:true},
    {id:'af_mobile',err:'af_mobile_err',msg:'Mobile required.'},
    {id:'af_passport',err:'af_passport_err',msg:'Passport number required.'},
    {id:'af_issue',err:'af_issue_err',msg:'Issue date required.'},
    {id:'af_expiry',err:'af_expiry_err',msg:'Expiry date required.'},
    {id:'af_purpose',err:'af_purpose_err',msg:'Purpose required.'},
    {id:'af_country',err:'af_country_err',msg:'Destination country required.'},
    {id:'af_state',err:'af_state_err',msg:'State / Region required.'},
    {id:'af_centre',err:'af_centre_err',msg:'City / Centre required.'},
  ];
  checks.forEach(c => {
    const el=g(c.id), err=g(c.err), val=el.value.trim();
    let bad = !val;
    if (!bad && c.email) bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    if (bad) { el.classList.add('error'); err.textContent=c.msg; err.classList.add('show'); ok=false; }
    else { el.classList.remove('error'); err.classList.remove('show'); }
  });
  const iss=g('af_issue').value, exp=g('af_expiry').value;
  if (iss&&exp&&exp<=iss) { g('af_expiry').classList.add('error'); const e=g('af_expiry_err'); e.textContent='Expiry must be after issue.'; e.classList.add('show'); ok=false; }

  // Required pending documents (from document_types_config)
  const missingRequired = apptMissingDocTypes.filter(dt => {
    const fileMissing = dt.required && !(g('doc_'+dt.key) && g('doc_'+dt.key).files && g('doc_'+dt.key).files[0]);
    const numberMissing = dt.required && dt.number_label && !docGetNumberValue(dt.key);
    return fileMissing || numberMissing;
  });
  if (missingRequired.length) {
    ok = false;
    g('apptDocSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
    alert(i18nT('appt.alert.missing_docs', 'Please upload the following required document(s) before continuing:') + ' ' + missingRequired.map(d=>d.label).join(', '));
  }
  return ok;
}

function goToSlots() {
  if (!validateForm()) return;
  showPanel(2);
}

// ═══════════════════════════════════════════
//  CONFIRM PANEL
// ═══════════════════════════════════════════
function goToConfirm() {
  if (selectedDate===null || selectedSlotIdx===null) return;
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const name    = g('af_name').value.trim();
  const email   = g('af_email').value.trim();
  const mobile  = g('af_mobile').value.trim();
  const passport= g('af_passport').value.trim().toUpperCase();
  const issue   = g('af_issue').value;
  const expiry  = g('af_expiry').value;
  const purpose = g('af_purpose').value;
  const country = _apptCountryName(g('af_country').value);
  const state   = _apptStateName(g('af_state').value);
  const centre  = _apptCityName(g('af_centre').value);
  const dateStr = selectedDate.getDate()+' '+MONTHS_SHORT[selectedDate.getMonth()]+' '+selectedDate.getFullYear();
  const slotTime= slotLabel(BASE_SLOTS[selectedSlotIdx]);

  g('confirmEmail').textContent = email;
  g('confirmGrid').innerHTML =
    row('Full Name',name)+row('Email',email)+
    row('Mobile',mobile)+row('Passport No.',passport)+
    row('Issue Date',fmt(issue))+row('Expiry Date',fmt(expiry))+
    row('Purpose',purpose)+
    row('Destination Country',country)+
    (state ? row('State / Region', state) : '')+
    row('Appointment Centre',centre);

  g('slotConfirmGrid').innerHTML =
    row('Date',dateStr)+row('Time',slotTime)+
    row('Counter','<span class="counter-badge"><i class="fa fa-desktop"></i> Counter '+selectedCounter+'</span>')+
    row('Duration','30 Minutes');

  // Value added services summary (shown only if the user added any)
  let vasBox = g('vasConfirmBox');
  if (vasServices.length) {
    const vasTotal = vasServices.reduce((a,s)=>a+s.amount*s.qty,0);
    const rowsHtml = vasServices.map(s =>
      `<tr><td style="padding:6px 0;">${s.name} ${s.qty>1?'× '+s.qty:''}</td><td style="padding:6px 0;text-align:right;font-weight:700;">₹${(s.amount*s.qty).toFixed(2)}</td></tr>`
    ).join('');
    if (!vasBox) {
      vasBox = document.createElement('div');
      vasBox.id = 'vasConfirmBox';
      g('slotConfirmGrid').insertAdjacentElement('afterend', vasBox);
    }
    vasBox.innerHTML = `
      <div class="section-label" style="margin-top:24px;"><i class="fa fa-star"></i> Value Added Services Requested</div>
      <div class="confirm-box"><table style="width:100%;font-size:13px;">${rowsHtml}
        <tr><td style="padding-top:8px;border-top:1px solid #eee;font-weight:700;">Estimated Total</td><td style="padding-top:8px;border-top:1px solid #eee;text-align:right;font-weight:800;color:var(--dark);">₹${vasTotal.toFixed(2)}</td></tr>
      </table></div>`;
  } else if (vasBox) {
    vasBox.innerHTML = '';
  }

  showPanel(3);
}

function row(l,v) { return `<div class="confirm-item"><label>${l}</label><div class="val">${v||'—'}</div></div>`; }

// ═══════════════════════════════════════════
//  SUBMIT
// ═══════════════════════════════════════════
async function submitAppointment() {
  const btn = g('btnSubmit');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Booking...';
  g('submitAlert').classList.remove('show');

  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateKey  = toKey(selectedDate);
  const name     = g('af_name').value.trim();
  const email    = g('af_email').value.trim();
  const mobile   = g('af_mobile').value.trim();
  const passport = g('af_passport').value.trim().toUpperCase();
  const issue    = g('af_issue').value;
  const expiry   = g('af_expiry').value;
  const purpose  = g('af_purpose').value;
  // Resolve IDs → human-readable names for storage & display
  const countryId = g('af_country').value;
  const stateId   = g('af_state').value;
  const centreId  = g('af_centre').value;
  const country   = _apptCountryName(countryId);
  const state     = _apptStateName(stateId);
  const centre    = _apptCityName(centreId);
  const notes    = g('af_notes').value.trim();
  const slotTime = slotLabel(BASE_SLOTS[selectedSlotIdx]);
  const dateStr  = selectedDate.getDate()+' '+MONTHS_SHORT[selectedDate.getMonth()]+' '+selectedDate.getFullYear();

  // Quick local check for instant UI feedback — the backend re-validates
  // this itself (with a row lock) before actually inserting, so this is
  // just to avoid an unnecessary round trip when it's obviously taken.
  const currentBooked = bookedData[dateKey] || [];
  const bookedForSlot = currentBooked.filter(b => b.slot_index===selectedSlotIdx).map(b=>b.counter);
  if (bookedForSlot.includes(selectedCounter)) {
    g('submitAlertMsg').textContent = 'This slot was just taken! Please go back and pick another.';
    g('submitAlert').classList.add('show');
    btn.disabled=false; btn.innerHTML='<i class="fa fa-paper-plane"></i> Book & Send Confirmation Email';
    return;
  }

  // Book via backend — server generates the reference number and does the
  // already-booked / slot-taken checks itself (race-condition safe).
  try {
    const res = await fetch(`${API_BASE}/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name:           name,
        email:               email,
        mobile:              mobile,
        passport_number:     passport,
        passport_issue:      issue || null,
        passport_expiry:     expiry || null,
        purpose_of_visit:    purpose,
        destination_country: country,
        appointment_country: country,
        appointment_centre:  centre,
        appointment_date:    dateKey,
        slot_index:          selectedSlotIdx,
        slot_time:           slotTime,
        counter:             selectedCounter,
        notes:               notes,
        requested_services:  vasServices,
      }),
    });
    const result = await res.json();

    if (!res.ok) {
      g('submitAlertMsg').textContent = result.error ||
        'Booking failed. Please go back and try again.';
      g('submitAlert').classList.add('show');
      btn.disabled=false; btn.innerHTML='<i class="fa fa-paper-plane"></i> Book & Send Confirmation Email';
      return;
    }

    apptRef = result.reference_number;
    if (!bookedData[dateKey]) bookedData[dateKey]=[];
    bookedData[dateKey].push({slot_index:selectedSlotIdx, counter:selectedCounter});

    // Upload any pending documents the applicant filled in on this page.
    // Linked to the Application Reference Number (visa_applications), not
    // the appointment's own reference number — documents live with the
    // applicant, not the appointment.
    if (linkedVisaRef && apptMissingDocTypes.length) {
      for (const dt of apptMissingDocTypes) {
        const inp = g('doc_' + dt.key);
        if (inp && inp.files && inp.files[0]) {
          try {
            await docUploadFile({
              referenceNumber: linkedVisaRef,
              passportNumber: passport || apptPassportForDocs,
              documentKey: dt.key,
              file: inp.files[0],
              uploadedBy: 'user',
              documentNumber: dt.number_label ? docGetNumberValue(dt.key) : undefined,
            });
          } catch (upErr) {
            console.warn('Document upload failed for', dt.key, upErr);
          }
        }
      }
    }
  } catch(e) {
    console.error('Booking error:', e);
    g('submitAlertMsg').textContent = 'Server se connect nahi ho paaya. Please try again.';
    g('submitAlert').classList.add('show');
    btn.disabled=false; btn.innerHTML='<i class="fa fa-paper-plane"></i> Book & Send Confirmation Email';
    return;
  }

  // Send email
  sendEmail({name,email,mobile,passport,issue,expiry,purpose,country,state,centre,dateStr,slotTime,counter:selectedCounter,apptRef,notes,vasServices});

  // Success screen
  g('finalRef').textContent = apptRef;
  g('finalEmail').textContent = email;
  g('finalGrid').innerHTML =
    row('Reference',apptRef)+row('Name',name)+
    row('Date',dateStr)+row('Time',slotTime)+
    row('Counter','Counter '+selectedCounter)+
    row('Country',country)+
    (state ? row('State / Region', state) : '')+
    row('Centre',centre)+row('Purpose',purpose)+
    (vasServices.length ? row('Value Added Services', vasServices.map(s=>`${s.name}${s.qty>1?' x'+s.qty:''}`).join(', ')) : '');

  showPanel(4);
}

// ═══════════════════════════════════════════
//  EMAIL
// ═══════════════════════════════════════════
function sendEmail(p) {
  if (typeof emailjs==='undefined') {
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    s.onload=()=>{ emailjs.init(EMAILJS_PUBLIC_KEY); doEmail(p); };
    document.head.appendChild(s);
  } else { doEmail(p); }
}
function doEmail(p) {
  if (EMAILJS_SERVICE_ID==='YOUR_EMAILJS_SERVICE_ID') {
    console.info('[Demo] Email not sent — configure EmailJS keys in appointment.js');
    return;
  }
  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email:        p.email,
    to_name:         p.name,
    applicant_name:  p.name,
    email:           p.email,
    mobile:          p.mobile,
    passport_number: p.passport,
    passport_issue:  fmt(p.issue),
    passport_expiry: fmt(p.expiry),
    purpose:         p.purpose,
    destination_country: p.country,
    centre:          p.centre,
    appointment_date:p.dateStr,
    appointment_time:p.slotTime,
    counter:         i18nT('email.counter_label', 'Counter')+' '+p.counter,
    reference:       p.apptRef,
    notes:           p.notes||i18nT('email.none', 'None'),
    letter_body: `${i18nT('email.dear', 'Dear')} ${p.name},

${i18nT('email.confirmed_intro', 'Your visa appointment at BLS International — Spain Visa Application Centre has been confirmed.')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${i18nT('email.letter_heading', 'APPOINTMENT CONFIRMATION LETTER')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${i18nT('email.reference_no', 'Reference No.')}    : ${p.apptRef}
${i18nT('email.applicant_name', 'Applicant Name')}   : ${p.name}
${i18nT('email.passport_no', 'Passport No.')}     : ${p.passport}
${i18nT('email.appointment_date', 'Appointment Date')} : ${p.dateStr}
${i18nT('email.appointment_time', 'Appointment Time')} : ${p.slotTime} (${i18nT('email.thirty_min', '30 minutes')})
${i18nT('email.counter_label', 'Counter')}          : ${i18nT('email.counter_label', 'Counter')} ${p.counter}
${i18nT('email.centre', 'Centre')}           : ${p.centre}
${i18nT('email.purpose_of_visit', 'Purpose of Visit')} : ${p.purpose}
${i18nT('email.destination', 'Destination')}      : ${p.country || '—'}
${(p.vasServices && p.vasServices.length) ? `
${i18nT('email.vas_requested', 'VALUE ADDED SERVICES REQUESTED:')}
${p.vasServices.map((s,i)=>`  ${i+1}. ${s.name}${s.qty>1?' x'+s.qty:''} — ₹${(s.amount*s.qty).toFixed(2)}`).join('\n')}
  ${i18nT('email.est_services_total', 'Estimated Services Total:')} ₹${p.vasServices.reduce((a,s)=>a+s.amount*s.qty,0).toFixed(2)}
  (${i18nT('email.final_charges_note', 'Final charges will be confirmed by the centre at the time of your visit.')})
` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${i18nT('email.important_instructions', 'IMPORTANT INSTRUCTIONS:')}
${i18nT('email.instr_arrive', '• Please arrive 15 minutes before your scheduled time.')}
${i18nT('email.instr_carry', '• Carry this confirmation letter (print or digital).')}
${i18nT('email.instr_bring_docs', '• Bring all original documents + photocopies.')}
${i18nT('email.instr_report', '• Report to Counter')} ${p.counter} ${i18nT('email.instr_report_end', 'at the centre.')}

${i18nT('email.change_slot_heading', 'NEED TO CHANGE YOUR DATE OR TIME SLOT?')}
${i18nT('email.change_slot_body', 'Visit our booking page or reply to this email with your reference number and preferred new date/time.')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLS International — Spain Visa Application Centre
${i18nT('email.phone_label', 'Phone:')} +91-11-43750006
${i18nT('email.email_label', 'Email:')} info@blsindia-spain.com
${i18nT('email.hours_label', 'Hours:')} Mon–Fri, 9:00 AM – 5:00 PM
`.trim()
  })
  .then(()=>console.info('Email sent to',p.email))
  .catch(e=>console.error('EmailJS error:',e));
}

// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════
function g(id) { return document.getElementById(id); }
function setVal(id,v) { const el=g(id); if(el&&v) el.value=String(v).trim(); }
function fmt(d) { if(!d) return '—'; const x=new Date(d); return isNaN(x)?d:x.toLocaleDateString(i18nDateLocale(),{day:'2-digit',month:'short',year:'numeric'}); }