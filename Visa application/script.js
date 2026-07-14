// ══════════════════════════════════════════════════════════════════
//  BLS International — Visa Application Script
//  Data (locations, document types/uploads, application submit) now goes
//  through our own backend (userRoutes.js) — see loadLocations(),
//  docLoadTypes()/docUploadFile() (doc-shared.js), and the /visa/apply
//  fetch call further down.
//
//  supabaseClient below is kept ONLY for two things Supabase is designed
//  to be called directly from the browser for, with the public anon key:
//    - Email OTP sign-in (supabaseClient.auth.signInWithOtp/verifyOtp)
//    - Triggering the "send-confirmation" Edge Function
//  Neither of these touches the database with elevated privileges, so
//  there's no security reason to proxy them through the backend too.
//  (If you'd rather route these through the backend as well, that's a
//  separate follow-up — say the word and I'll wire it up.)
// ══════════════════════════════════════════════════════════════════

// ── 1. SUPABASE CONFIG (Auth + Edge Function only — see note above) ──
const SUPABASE_URL  = 'https://cnpuceqzubaolbfxqpge.supabase.co';       // e.g. https://xyzxyz.supabase.co
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucHVjZXF6dWJhb2xiZnhxcGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTYxNzcsImV4cCI6MjA5NjU3MjE3N30.ZaxtjTXyVQIZytf3ChiCgr1tf-N7er2yqZ4pzv0za7E';  // e.g. eyJhbGci...

const supabaseConfigured = SUPABASE_URL !== 'YOUR_SUPABASE_URL';
let supabaseClient = null;

if (supabaseConfigured) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  document.getElementById('configBanner').style.display = 'none';
}

// Load locations from DB as soon as the client is ready
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

document.addEventListener('DOMContentLoaded', function () { loadLocations(); });
document.addEventListener('DOMContentLoaded', function () {
  if (typeof i18nInit === 'function') i18nInit({ switcherEl: '#langSwitcher' });
});

// ── 2. COUNTRY CODE MAP ───────────────────────────────────────────
const COUNTRY_CODES = {
  'Indian':      { dial: '+91',  flag: '🇮🇳', name: 'India' },
  'Bangladeshi': { dial: '+880', flag: '🇧🇩', name: 'Bangladesh' },
  'Sri Lankan':  { dial: '+94',  flag: '🇱🇰', name: 'Sri Lanka' },
  'Nepali':      { dial: '+977', flag: '🇳🇵', name: 'Nepal' },
  'Pakistani':   { dial: '+92',  flag: '🇵🇰', name: 'Pakistan' },
  'Afghan':      { dial: '+93',  flag: '🇦🇫', name: 'Afghanistan' },
  'Bhutanese':   { dial: '+975', flag: '🇧🇹', name: 'Bhutan' },
  'Maldivian':   { dial: '+960', flag: '🇲🇻', name: 'Maldives' },
};

const COUNTRY_LOOKUP = {
  'afghanistan':{'dial':'+93','flag':'🇦🇫'},'albania':{'dial':'+355','flag':'🇦🇱'},
  'algeria':{'dial':'+213','flag':'🇩🇿'},'angola':{'dial':'+244','flag':'🇦🇴'},
  'argentina':{'dial':'+54','flag':'🇦🇷'},'armenia':{'dial':'+374','flag':'🇦🇲'},
  'australia':{'dial':'+61','flag':'🇦🇺'},'austria':{'dial':'+43','flag':'🇦🇹'},
  'azerbaijan':{'dial':'+994','flag':'🇦🇿'},'bahrain':{'dial':'+973','flag':'🇧🇭'},
  'bangladesh':{'dial':'+880','flag':'🇧🇩'},'belarus':{'dial':'+375','flag':'🇧🇾'},
  'belgium':{'dial':'+32','flag':'🇧🇪'},'bolivia':{'dial':'+591','flag':'🇧🇴'},
  'brazil':{'dial':'+55','flag':'🇧🇷'},'bulgaria':{'dial':'+359','flag':'🇧🇬'},
  'cambodia':{'dial':'+855','flag':'🇰🇭'},'cameroon':{'dial':'+237','flag':'🇨🇲'},
  'canada':{'dial':'+1','flag':'🇨🇦'},'chile':{'dial':'+56','flag':'🇨🇱'},
  'china':{'dial':'+86','flag':'🇨🇳'},'colombia':{'dial':'+57','flag':'🇨🇴'},
  'croatia':{'dial':'+385','flag':'🇭🇷'},'cuba':{'dial':'+53','flag':'🇨🇺'},
  'cyprus':{'dial':'+357','flag':'🇨🇾'},'czech':{'dial':'+420','flag':'🇨🇿'},
  'denmark':{'dial':'+45','flag':'🇩🇰'},'egypt':{'dial':'+20','flag':'🇪🇬'},
  'ethiopia':{'dial':'+251','flag':'🇪🇹'},'finland':{'dial':'+358','flag':'🇫🇮'},
  'france':{'dial':'+33','flag':'🇫🇷'},'georgia':{'dial':'+995','flag':'🇬🇪'},
  'germany':{'dial':'+49','flag':'🇩🇪'},'ghana':{'dial':'+233','flag':'🇬🇭'},
  'greece':{'dial':'+30','flag':'🇬🇷'},'hungary':{'dial':'+36','flag':'🇭🇺'},
  'indonesia':{'dial':'+62','flag':'🇮🇩'},'iran':{'dial':'+98','flag':'🇮🇷'},
  'iraq':{'dial':'+964','flag':'🇮🇶'},'ireland':{'dial':'+353','flag':'🇮🇪'},
  'israel':{'dial':'+972','flag':'🇮🇱'},'italy':{'dial':'+39','flag':'🇮🇹'},
  'japan':{'dial':'+81','flag':'🇯🇵'},'jordan':{'dial':'+962','flag':'🇯🇴'},
  'kazakhstan':{'dial':'+7','flag':'🇰🇿'},'kenya':{'dial':'+254','flag':'🇰🇪'},
  'korea':{'dial':'+82','flag':'🇰🇷'},'south korea':{'dial':'+82','flag':'🇰🇷'},
  'kuwait':{'dial':'+965','flag':'🇰🇼'},'kyrgyzstan':{'dial':'+996','flag':'🇰🇬'},
  'laos':{'dial':'+856','flag':'🇱🇦'},'latvia':{'dial':'+371','flag':'🇱🇻'},
  'lebanon':{'dial':'+961','flag':'🇱🇧'},'libya':{'dial':'+218','flag':'🇱🇾'},
  'lithuania':{'dial':'+370','flag':'🇱🇹'},'malaysia':{'dial':'+60','flag':'🇲🇾'},
  'mexico':{'dial':'+52','flag':'🇲🇽'},'moldova':{'dial':'+373','flag':'🇲🇩'},
  'mongolia':{'dial':'+976','flag':'🇲🇳'},'morocco':{'dial':'+212','flag':'🇲🇦'},
  'mozambique':{'dial':'+258','flag':'🇲🇿'},'myanmar':{'dial':'+95','flag':'🇲🇲'},
  'nepal':{'dial':'+977','flag':'🇳🇵'},'netherlands':{'dial':'+31','flag':'🇳🇱'},
  'new zealand':{'dial':'+64','flag':'🇳🇿'},'nigeria':{'dial':'+234','flag':'🇳🇬'},
  'norway':{'dial':'+47','flag':'🇳🇴'},'oman':{'dial':'+968','flag':'🇴🇲'},
  'pakistan':{'dial':'+92','flag':'🇵🇰'},'palestine':{'dial':'+970','flag':'🇵🇸'},
  'peru':{'dial':'+51','flag':'🇵🇪'},'philippines':{'dial':'+63','flag':'🇵🇭'},
  'poland':{'dial':'+48','flag':'🇵🇱'},'portugal':{'dial':'+351','flag':'🇵🇹'},
  'qatar':{'dial':'+974','flag':'🇶🇦'},'romania':{'dial':'+40','flag':'🇷🇴'},
  'russia':{'dial':'+7','flag':'🇷🇺'},'saudi':{'dial':'+966','flag':'🇸🇦'},
  'saudi arabia':{'dial':'+966','flag':'🇸🇦'},'senegal':{'dial':'+221','flag':'🇸🇳'},
  'serbia':{'dial':'+381','flag':'🇷🇸'},'singapore':{'dial':'+65','flag':'🇸🇬'},
  'slovakia':{'dial':'+421','flag':'🇸🇰'},'somalia':{'dial':'+252','flag':'🇸🇴'},
  'south africa':{'dial':'+27','flag':'🇿🇦'},'spain':{'dial':'+34','flag':'🇪🇸'},
  'sri lanka':{'dial':'+94','flag':'🇱🇰'},'sudan':{'dial':'+249','flag':'🇸🇩'},
  'sweden':{'dial':'+46','flag':'🇸🇪'},'switzerland':{'dial':'+41','flag':'🇨🇭'},
  'syria':{'dial':'+963','flag':'🇸🇾'},'taiwan':{'dial':'+886','flag':'🇹🇼'},
  'tajikistan':{'dial':'+992','flag':'🇹🇯'},'tanzania':{'dial':'+255','flag':'🇹🇿'},
  'thailand':{'dial':'+66','flag':'🇹🇭'},'tunisia':{'dial':'+216','flag':'🇹🇳'},
  'turkey':{'dial':'+90','flag':'🇹🇷'},'turkmenistan':{'dial':'+993','flag':'🇹🇲'},
  'uganda':{'dial':'+256','flag':'🇺🇬'},'ukraine':{'dial':'+380','flag':'🇺🇦'},
  'uae':{'dial':'+971','flag':'🇦🇪'},'united arab emirates':{'dial':'+971','flag':'🇦🇪'},
  'uk':{'dial':'+44','flag':'🇬🇧'},'united kingdom':{'dial':'+44','flag':'🇬🇧'},
  'usa':{'dial':'+1','flag':'🇺🇸'},'united states':{'dial':'+1','flag':'🇺🇸'},
  'uzbekistan':{'dial':'+998','flag':'🇺🇿'},'venezuela':{'dial':'+58','flag':'🇻🇪'},
  'vietnam':{'dial':'+84','flag':'🇻🇳'},'yemen':{'dial':'+967','flag':'🇾🇪'},
  'zambia':{'dial':'+260','flag':'🇿🇲'},'zimbabwe':{'dial':'+263','flag':'🇿🇼'},
};

// ── 3. STAY CONFIG ────────────────────────────────────────────────
const stayConfig = {
  short: {
    title: 'Spain Schengen Visa — Short Stay (Type C)',
    tag: 'Short Stay — Type C (Schengen)',
    rule: 'Max duration: 180 days &nbsp;|&nbsp; Max 90 days in any 180-day window',
    maxDays: 180, minDays: 1,
    durationTip: 'Short Stay: max 180 days (Schengen rule: max 90 days in any 180-day window)',
    visaTypes: ['Tourist','Business','Transit','Family Visit (Short-term)','Medical (Short-term)','Cultural / Sports'],
  },
  long: {
    title: 'Spain National Visa — Long Stay (Type D)',
    tag: 'Long Stay — Type D (National Visa)',
    rule: 'Duration: More than 180 days &nbsp;|&nbsp; Renewable in Spain',
    maxDays: 9999, minDays: 181,
    durationTip: 'Long Stay: enter total intended stay (minimum 181 days)',
    visaTypes: ['Work / Employment','Student / Education','Family Reunification','Residence Permit','Highly Qualified Professional','Entrepreneur / Self-employed','Research / Scientist'],
  }
};

let currentStay = null;

// ── COUNTRY → STATE → CITY  (3 separate Supabase tables) ────────
// countries : id, name, active, sort_order
// states    : id, country_id, name, active, sort_order
// cities    : id, state_id, country_id, name, active, sort_order

let GEO_COUNTRIES = [];   // [{ id, name }]
let GEO_STATES    = [];   // [{ id, country_id, name }]
let GEO_CITIES    = [];   // [{ id, state_id, country_id, name }]

// Load all three tables up-front (small data, fast) — now via backend
async function loadLocations() {
  try {
    const res = await fetch('/api/users/appointment/locations');
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to load locations');
    GEO_COUNTRIES = result.countries || [];
    GEO_STATES    = result.states    || [];
    GEO_CITIES    = result.cities    || [];
  } catch (e) {
    console.warn('Geo data load failed:', e);
  }
  populateDestCountryDropdown();
}

// ── Step 1 : populate Country dropdown ───────────────────────────
function populateDestCountryDropdown(preselectId) {
  const sel = document.getElementById('destinationCountry');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select country —</option>';
  GEO_COUNTRIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;           // store numeric id as value
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  // reset dependents
  _resetSel('appointmentState', '— Select country first —', true);
  _resetSel('appointmentCity',  '— Select state first —',   true);

  if (preselectId) {
    sel.value = preselectId;
    _loadStates(preselectId);
  }
}

// ── Step 2 : Country changed → load States ────────────────────────
window.onDestCountryChange = function () {
  const countryId = document.getElementById('destinationCountry').value;
  _resetSel('appointmentState', '— Select country first —', true);
  _resetSel('appointmentCity',  '— Select state first —',   true);
  if (countryId) _loadStates(countryId);
};

function _loadStates(countryId, preselectStateId) {
  const states = GEO_STATES.filter(s => String(s.country_id) === String(countryId));
  const sel = document.getElementById('appointmentState');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select state —</option>';
  states.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
  sel.disabled = states.length === 0;
  _resetSel('appointmentCity', '— Select state first —', true);

  if (preselectStateId) {
    sel.value = preselectStateId;
    _loadCities(countryId, preselectStateId);
  }
}

// ── Step 3 : State changed → load Cities ─────────────────────────
window.onDestStateChange = function () {
  const countryId = document.getElementById('destinationCountry').value;
  const stateId   = document.getElementById('appointmentState').value;
  _resetSel('appointmentCity', '— Select state first —', true);
  if (stateId) _loadCities(countryId, stateId);
};

function _loadCities(countryId, stateId, preselectCityId) {
  const cities = GEO_CITIES.filter(
    c => String(c.state_id) === String(stateId) && String(c.country_id) === String(countryId)
  );
  const sel = document.getElementById('appointmentCity');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select city —</option>';
  cities.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  sel.disabled = cities.length === 0;

  if (preselectCityId) {
    sel.value = preselectCityId;
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function _resetSel(id, placeholder, disable) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>`;
  el.disabled = !!disable;
}

// Resolve names from IDs (used when building the DB record)
function _countryName(id) { return (GEO_COUNTRIES.find(c => String(c.id) === String(id)) || {}).name || id; }
function _stateName(id)   { return (GEO_STATES.find(s => String(s.id) === String(id))    || {}).name || id; }
function _cityName(id)    { return (GEO_CITIES.find(c => String(c.id) === String(id))    || {}).name || id; }

document.addEventListener('DOMContentLoaded', function () {

  // ✅ If the user already submitted an application earlier this session,
  // keep the "Book Appointment" nav item visible on reloads too.
  if (sessionStorage.getItem('bls_has_application') === '1') {
    const navBtn = document.getElementById('navBookAppointment');
    if (navBtn) navBtn.style.display = 'flex';
  }

  // ── PASSWORD TOGGLE (Registration) ───────────────────────────
  window.toggleRegPass = function(inputId, iconId) {
    const inp = document.getElementById(inputId);
    const ico = document.getElementById(iconId);
    if (!inp || !ico) return;
    if (inp.type === 'password') { inp.type = 'text'; ico.className = 'fa fa-eye-slash'; }
    else { inp.type = 'password'; ico.className = 'fa fa-eye'; }
  };
  window.selectStay = function (type) {
    currentStay = type;
    const cfg = stayConfig[type];

    document.querySelectorAll('.stay-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('card' + type.charAt(0).toUpperCase() + type.slice(1)).classList.add('selected');

    document.getElementById('formTitle').textContent = cfg.title;
    document.getElementById('stayTag').textContent = cfg.tag;
    document.getElementById('stayTagBar').className = 'stay-tag-bar stay-tag-bar-' + type;
    document.getElementById('stayTagRule').innerHTML = cfg.rule;
    document.getElementById('stayTag').className = 'stay-tag stay-tag-' + type;

    const sel = document.getElementById('visaType');
    sel.innerHTML = '<option value="">Select visa type</option>';
    cfg.visaTypes.forEach(v => { const o = document.createElement('option'); o.textContent = v; sel.appendChild(o); });

    const dur = document.getElementById('duration');
    dur.min = cfg.minDays;
    dur.max = cfg.maxDays < 9999 ? cfg.maxDays : '';

    document.getElementById('longStayExtra').style.display = type === 'long' ? 'block' : 'none';

    updatePassportDateTips();
    document.getElementById('staySelector').style.display = 'none';
    document.getElementById('formCard').style.display = 'block';
    document.getElementById('formCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateProgress();
  };

  window.changeStay = function () {
    document.getElementById('formCard').style.display = 'none';
    document.getElementById('staySelector').style.display = 'block';
    document.getElementById('staySelector').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── NATIONALITY → DIAL CODE ──────────────────────────────────
  const natSel        = document.getElementById('nationality');
  const otherRow      = document.getElementById('otherNationalityRow');
  const otherIn       = document.getElementById('otherCountry');
  const otherCodeText = document.getElementById('otherCodeText');
  const dialFlag      = document.getElementById('dialCodeFlag');
  const dialVal       = document.getElementById('dialCodeValue');
  const dialBox       = document.getElementById('dialCodeBox');
  const mobileTip     = document.getElementById('mobileTip');

  function setDialCode(dial, flag, name) {
    dialFlag.textContent = flag;
    dialVal.textContent = dial;
    dialBox.classList.add('active');
    mobileTip.textContent = 'Country code for ' + name + ': ' + dial;
    const mob = document.getElementById('mobileNumber');
    if (!mob.value || mob.value === mob.dataset.lastDial) {
      mob.value = dial + ' ';
      mob.dataset.lastDial = dial + ' ';
    }
  }

  function clearDialCode() {
    dialFlag.textContent = '🌍';
    dialVal.textContent = '+__';
    dialBox.classList.remove('active');
    mobileTip.textContent = 'Select nationality to auto-fill country code.';
  }

  natSel.addEventListener('change', function () {
    const val = this.value;
    if (val === 'Other') {
      otherRow.style.display = 'grid';
      clearDialCode();
      otherIn.focus();
    } else {
      otherRow.style.display = 'none';
      otherIn.value = '';
      otherCodeText.textContent = '— enter country above —';
      if (val && COUNTRY_CODES[val]) {
        setDialCode(COUNTRY_CODES[val].dial, COUNTRY_CODES[val].flag, COUNTRY_CODES[val].name);
      } else clearDialCode();
    }
    updatePassportDateTips();
  });

  let lookupTimer = null;
  otherIn.addEventListener('input', function () {
    clearTimeout(lookupTimer);
    const typed = this.value.trim().toLowerCase();
    if (!typed) { otherCodeText.textContent = '— enter country above —'; clearDialCode(); return; }
    lookupTimer = setTimeout(function () {
      let found = COUNTRY_LOOKUP[typed];
      if (!found) {
        const keys = Object.keys(COUNTRY_LOOKUP);
        const k = keys.find(k => k.startsWith(typed) || typed.startsWith(k));
        if (k) found = COUNTRY_LOOKUP[k];
      }
      if (found) {
        otherCodeText.textContent = found.flag + '  ' + found.dial;
        document.getElementById('otherCountryErr').textContent = '';
        setDialCode(found.dial, found.flag, otherIn.value.trim());
      } else {
        otherCodeText.textContent = '⚠ Not found — check spelling';
        document.getElementById('otherCountryErr').textContent = 'Could not find this country. Please check the spelling.';
        clearDialCode();
      }
    }, 500);
  });

  // ── DEPARTURE / RETURN → AUTO DURATION ──────────────────────
  function calcDuration() {
    const depVal  = document.getElementById('travelDate').value;
    const retVal  = document.getElementById('returnDate').value;
    const display = document.getElementById('durationDisplay');
    const durText = document.getElementById('durationText');
    const durHid  = document.getElementById('duration');
    const durTip  = document.getElementById('durationTip');
    const durErr  = document.getElementById('durationErr');
    const retErr  = document.getElementById('returnDateErr');
    const depErr  = document.getElementById('travelDateErr');

    const today = new Date(); today.setHours(0,0,0,0);

    if (depVal) {
      const dep = new Date(depVal);
      if (dep < today) {
        depErr.textContent = 'Departure date cannot be in the past.';
        depErr.classList.add('show');
        document.getElementById('travelDate').classList.add('error');
      } else {
        depErr.textContent = ''; depErr.classList.remove('show');
        document.getElementById('travelDate').classList.remove('error');
      }
    }

    if (!depVal || !retVal) {
      durText.textContent = '— select both dates —';
      display.className = 'duration-display';
      durHid.value = '';
      durTip.textContent = '';
      return;
    }

    const dep = new Date(depVal), ret = new Date(retVal);

    if (ret <= dep) {
      retErr.textContent = 'Return date must be after departure date.';
      retErr.classList.add('show');
      document.getElementById('returnDate').classList.add('error');
      durText.textContent = '— invalid dates —';
      display.className = 'duration-display duration-error';
      durHid.value = '';
      return;
    } else {
      retErr.textContent = ''; retErr.classList.remove('show');
      document.getElementById('returnDate').classList.remove('error');
    }

    const days = Math.round((ret - dep) / 86400000);
    durHid.value = days;

    if (currentStay === 'short') {
      if (days > 180) {
        durText.textContent = days + ' days';
        display.className = 'duration-display duration-error';
        durErr.textContent = 'Short Stay cannot exceed 180 days. Please shorten your trip or switch to Long Stay.';
        durErr.classList.add('show');
        durTip.textContent = '';
      } else if (days > 90) {
        durText.textContent = days + ' days ⚠';
        display.className = 'duration-display duration-warn';
        durErr.textContent = ''; durErr.classList.remove('show');
        durTip.textContent = 'Note: Schengen rule limits max 90 days in any 180-day window. Verify your allowance.';
      } else {
        durText.textContent = days + ' day' + (days !== 1 ? 's' : '');
        display.className = 'duration-display duration-ok';
        durErr.textContent = ''; durErr.classList.remove('show');
        durTip.textContent = 'Within Schengen 90/180-day rule ✓';
      }
    } else if (currentStay === 'long') {
      if (days <= 180) {
        durText.textContent = days + ' days';
        display.className = 'duration-display duration-error';
        durErr.textContent = 'Long Stay must exceed 180 days. Please extend your return date or switch to Short Stay.';
        durErr.classList.add('show');
        durTip.textContent = '';
      } else {
        durText.textContent = days + ' days';
        display.className = 'duration-display duration-ok';
        durErr.textContent = ''; durErr.classList.remove('show');
        durTip.textContent = 'Qualifies as Long Stay (Type D) ✓';
      }
    } else {
      durText.textContent = days + ' day' + (days !== 1 ? 's' : '');
      display.className = 'duration-display duration-ok';
    }

    validatePassportDates();
    updateProgress();
  }

  document.getElementById('travelDate').addEventListener('change', calcDuration);
  document.getElementById('returnDate').addEventListener('change', calcDuration);

  // ── DATE OF BIRTH: block future dates ────────────────────────
  const dobInput = document.getElementById('dob');
  const todayStr = new Date().toISOString().split('T')[0];
  dobInput.setAttribute('max', todayStr);
  dobInput.addEventListener('change', function () {
    if (this.value > todayStr) {
      this.value = todayStr;
      const err = this.closest('.field').querySelector('.err-msg');
      if (err) { err.textContent = 'Date of birth cannot be a future date.'; err.classList.add('show'); }
      this.classList.add('error');
    } else {
      const err = this.closest('.field').querySelector('.err-msg');
      if (err) { err.classList.remove('show'); err.textContent = ''; }
      this.classList.remove('error');
    }
  });

  // ── PASSPORT DATE VALIDATION ─────────────────────────────────
  function updatePassportDateTips() {
    const iT = document.getElementById('issueTip');
    const eT = document.getElementById('expiryTip');
    if (!currentStay) return;
    if (currentStay === 'short') {
      iT.textContent = 'Must be within last 10 years. Cannot be a future date.';
      eT.textContent = 'Must be valid for at least 3 months after your return date.';
    } else {
      iT.textContent = 'Must be in the past.';
      eT.textContent = 'Must be valid for at least 6 months after your departure date.';
    }
  }

  function validatePassportDates() {
    const issueVal  = document.getElementById('passportIssue').value;
    const expiryVal = document.getElementById('passportExpiry').value;
    const depVal    = document.getElementById('travelDate').value;
    const retVal    = document.getElementById('returnDate').value;
    const issueErr  = document.getElementById('passportIssueErr');
    const expiryErr = document.getElementById('passportExpiryErr');
    let issueValid = true, expiryValid = true;
    const today = new Date(); today.setHours(0,0,0,0);

    if (issueVal) {
      const issueDate = new Date(issueVal);
      if (issueDate > today) {
        issueErr.textContent = 'Issue date cannot be in the future.';
        issueErr.classList.add('show');
        document.getElementById('passportIssue').classList.add('error');
        issueValid = false;
      } else if (currentStay === 'short') {
        const tenYearsAgo = new Date(today);
        tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
        if (issueDate < tenYearsAgo) {
          issueErr.textContent = 'Short Stay: passport must not be older than 10 years (Schengen requirement).';
          issueErr.classList.add('show');
          document.getElementById('passportIssue').classList.add('error');
          issueValid = false;
        } else { issueErr.textContent = ''; issueErr.classList.remove('show'); document.getElementById('passportIssue').classList.remove('error'); }
      } else { issueErr.textContent = ''; issueErr.classList.remove('show'); document.getElementById('passportIssue').classList.remove('error'); }
    }

    if (issueVal && expiryVal && new Date(issueVal) >= new Date(expiryVal)) {
      issueErr.textContent = 'Issue date must be before expiry date.';
      issueErr.classList.add('show');
      document.getElementById('passportIssue').classList.add('error');
      issueValid = false;
    }

    if (expiryVal) {
      const expiryDate = new Date(expiryVal);
      if (expiryDate <= today) {
        expiryErr.textContent = 'Passport has already expired.'; expiryErr.classList.add('show');
        document.getElementById('passportExpiry').classList.add('error');
        expiryValid = false;
      } else if (retVal && currentStay === 'short') {
        const minExpiry = new Date(retVal);
        minExpiry.setDate(minExpiry.getDate() + 90);
        if (expiryDate < minExpiry) {
          const fmt = minExpiry.toLocaleDateString(i18nDateLocale(), {day:'2-digit',month:'short',year:'numeric'});
          expiryErr.textContent = 'Passport must be valid until at least ' + fmt + ' (3 months after return date).';
          expiryErr.classList.add('show'); document.getElementById('passportExpiry').classList.add('error');
          expiryValid = false;
        } else { expiryErr.textContent = ''; expiryErr.classList.remove('show'); document.getElementById('passportExpiry').classList.remove('error'); }
      } else if (depVal && currentStay === 'long') {
        const minExpiry = new Date(depVal);
        minExpiry.setDate(minExpiry.getDate() + 180);
        if (expiryDate < minExpiry) {
          const fmt = minExpiry.toLocaleDateString(i18nDateLocale(), {day:'2-digit',month:'short',year:'numeric'});
          expiryErr.textContent = 'Long Stay: passport must be valid until at least ' + fmt + ' (6 months after departure).';
          expiryErr.classList.add('show'); document.getElementById('passportExpiry').classList.add('error');
          expiryValid = false;
        } else { expiryErr.textContent = ''; expiryErr.classList.remove('show'); document.getElementById('passportExpiry').classList.remove('error'); }
      } else { expiryErr.textContent = ''; expiryErr.classList.remove('show'); document.getElementById('passportExpiry').classList.remove('error'); }
    }

    return issueValid && expiryValid;
  }

  ['passportIssue','passportExpiry'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', validatePassportDates);
  });

  // ── PROGRESS BAR ─────────────────────────────────────────────
  const progressFill = document.getElementById('progressFill');
  window.updateProgress = function () {
    const inputs = document.querySelectorAll('#formCard input[type="text"], #formCard input[type="email"], #formCard input[type="tel"], #formCard input[type="date"], #formCard select');
    let filled = 0;
    inputs.forEach(el => { if (el.value && el.value.trim()) filled++; });
    progressFill.style.width = Math.round((filled / inputs.length) * 100) + '%';
  };
  document.getElementById('formCard').addEventListener('input', updateProgress);
  document.getElementById('formCard').addEventListener('change', updateProgress);

  // ── MOBILE NUMBER: digits only, block alphabets ──────────────
  const mobileInput = document.getElementById('mobileNumber');
  mobileInput.addEventListener('keydown', function (e) {
    // Allow: backspace, delete, tab, escape, enter, arrows, home, end
    const allowed = ['Backspace','Delete','Tab','Escape','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
    if (allowed.includes(e.key)) return;
    // Allow: + (for country code), space
    if (e.key === '+' || e.key === ' ') return;
    // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if (e.ctrlKey || e.metaKey) return;
    // Block everything that is NOT a digit
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  });
  // Also strip any non-numeric characters on paste
  mobileInput.addEventListener('paste', function (e) {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const cleaned = pasted.replace(/[^0-9+\s]/g, '');
    const start = this.selectionStart, end = this.selectionEnd;
    this.value = this.value.slice(0, start) + cleaned + this.value.slice(end);
    this.dispatchEvent(new Event('input'));
  });
  // Strip on input as safety net (handles autofill etc.)
  mobileInput.addEventListener('input', function () {
    const pos = this.selectionStart;
    const cleaned = this.value.replace(/[^0-9+\s]/g, '');
    if (cleaned !== this.value) {
      this.value = cleaned;
      this.setSelectionRange(pos - 1, pos - 1);
    }
  });

  // ── FILE UPLOAD DISPLAY + PHOTO FACE VALIDATION ──────────────
  // For the passport photo: use Canvas API to check the image contains
  // a human face by detecting skin-tone pixel ratio in the center region.
  // If the image has < 8% skin-tone pixels in the center, it is likely
  // not a human portrait and gets rejected.

  function isSkinTone(r, g, b) {
    // Standard skin tone detection heuristic (works across all skin tones)
    return (
      r > 60 && g > 40 && b > 20 &&
      r > g && r > b &&
      Math.abs(r - g) > 15 &&
      r - b > 20 &&
      r < 255 && g < 235 && b < 210
    );
  }

  function checkPhotoHasFace(file, callback) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      // Draw center crop
      const cropX = (img.width - img.width * 0.6) / 2;
      const cropY = (img.height - img.height * 0.7) / 2;
      ctx.drawImage(img, cropX, cropY, img.width * 0.6, img.height * 0.7, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let skinPixels = 0, total = size * size;
      for (let i = 0; i < data.length; i += 4) {
        if (isSkinTone(data[i], data[i+1], data[i+2])) skinPixels++;
      }
      URL.revokeObjectURL(url);
      const ratio = skinPixels / total;
      callback(ratio >= 0.06); // at least 6% skin-tone pixels in center
    };
    img.onerror = function () { URL.revokeObjectURL(url); callback(false); };
    img.src = url;
  }

  // ── DOCUMENT CHECKLIST — rendered from document_types_config (Supabase) ──
  // No document names/rules are hardcoded here; the master list lives in
  // the tracking_stage_config-style table `document_types_config` and is
  // managed from the Admin panel. See doc-shared.js for the helpers.
  let visaDocTypes = [];

  async function renderVisaDocUploads() {
    const container = document.getElementById('dynamicDocUploads');
    if (!container) return;
    visaDocTypes = await docLoadTypes('visa_application');

    if (!visaDocTypes.length) {
      container.innerHTML = '<div class="field"><p style="font-size:12px;color:#e74c3c;">Could not load document checklist. Please refresh the page.</p></div>';
      return;
    }

    container.innerHTML = visaDocTypes.map(dt => docBuildUploadBoxHtml(dt, null)).join('');
    docWireUploadBoxes(container);

    // Delegated change handler — special-cases the 'photo' document type
    // for the face-detection check; every other doc type just shows the filename.
    container.addEventListener('change', function (e) {
      const inp = e.target;
      if (!inp.matches('input[type="file"]')) return;
      const box = inp.closest('.upload-box');
      const nameEl = box.querySelector('.file-name');
      if (!inp.files || !inp.files[0]) return;
      const file = inp.files[0];
      const docKey = inp.getAttribute('data-doc-key');

      if (docKey === 'photo') {
        if (!file.type.startsWith('image/')) {
          nameEl.textContent = '✗ Only JPG/PNG images allowed.';
          nameEl.style.color = '#e74c3c';
          box.classList.remove('has-file');
          inp.value = '';
          return;
        }
        nameEl.textContent = '⏳ Checking image...';
        nameEl.style.color = '#C8A951';
        checkPhotoHasFace(file, function (hasFace) {
          if (hasFace) {
            box.classList.add('has-file');
            nameEl.textContent = '✓ ' + file.name;
            nameEl.style.color = '#6B6B6B';
            box.querySelector('.uicon').style.color = '#C8A951';
          } else {
            box.classList.remove('has-file');
            nameEl.textContent = '✗ No human face detected. Please upload a clear passport-size photo.';
            nameEl.style.color = '#e74c3c';
            box.querySelector('.uicon').style.color = '#e74c3c';
            inp.value = '';
          }
        });
      } else {
        box.classList.add('has-file');
        nameEl.textContent = '✓ ' + file.name;
        nameEl.style.color = '#6B6B6B';
        box.querySelector('.uicon').style.color = '#C8A951';
      }
    });
  }
  renderVisaDocUploads();

  // ── FIELD VALIDATION ─────────────────────────────────────────
  function validateField(input) {
    const field = input.closest('.field');
    if (!field) return true;
    const errMsg = field.querySelector('.err-msg');
    if (!input.hasAttribute('data-required')) return true;

    let valid = true, message = 'This field is required.';

    if (!input.value || !input.value.trim()) {
      valid = false;
    } else if (input.type === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) { valid = false; message = 'Enter a valid email address.'; }
    } else if (input.id === 'mobileNumber') {
      const digits = input.value.replace(/\D/g,'');
      if (digits.length < 7 || digits.length > 15) { valid = false; message = 'Enter a valid phone number (7–15 digits).'; }
    } else if (input.id === 'passportNumber') {
      if (!/^[A-Za-z][0-9]{7}$/.test(input.value)) { valid = false; message = 'Format: One letter + 7 digits (e.g. A1234567).'; }
    }

    input.classList.toggle('error', !valid);
    if (errMsg) { errMsg.textContent = valid ? '' : message; errMsg.classList.toggle('show', !valid); }
    return valid;
  }

  document.addEventListener('blur', e => { if (e.target.matches('[data-required]')) validateField(e.target); }, true);
  document.addEventListener('input', e => { if (e.target.matches('.error[data-required]')) validateField(e.target); });

  // ── 4. SUBMIT → SUPABASE ─────────────────────────────────────
  window.submitForm = async function () {
    if (!currentStay) { alert(i18nT('visa.alert.select_stay', 'Please select a stay type first.')); return; }

    // Validate all required fields
    let allValid = true;
    document.querySelectorAll('#formCard [data-required]').forEach(inp => { if (!validateField(inp)) allValid = false; });

    // Validate required documents (from document_types_config — configurable, not hardcoded)
    const missingDocs = [];
    visaDocTypes.forEach(dt => {
      if (!dt.required) return;
      const inp = document.getElementById('doc_' + dt.key);
      if (!inp || !inp.files || !inp.files[0]) missingDocs.push(dt.label);
      if (dt.number_label && !docGetNumberValue(dt.key)) missingDocs.push(dt.number_label);
    });
    if (missingDocs.length) {
      alert(i18nT('visa.alert.missing_docs', 'Please upload the following required document(s):') + ' ' + missingDocs.join(', '));
      document.getElementById('dynamicDocUploads').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (natSel.value === 'Other' && !otherIn.value.trim()) {
      document.getElementById('otherCountryErr').textContent = 'Please enter your country name.';
      allValid = false;
    }
    if (!validatePassportDates()) allValid = false;

    if (!document.getElementById('duration').value) {
      document.getElementById('durationErr').textContent = 'Please select both departure and return dates.';
      document.getElementById('durationErr').classList.add('show');
      allValid = false;
    }
    if (!document.getElementById('tnc').checked) { alert(i18nT('visa.alert.agree_tnc', 'Please agree to the Terms & Conditions.')); return; }
    if (!document.getElementById('consent').checked) { alert(i18nT('visa.alert.consent', 'Please provide your data processing consent.')); return; }

    // ── CAPTCHA check ──────────────────────────────────────────────
    if (!window._checkCaptcha('reg')) {
      document.getElementById('regCaptchaInput').closest('.field').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // ── Email verification check (anti-bot) ───────────────────────
    if (!_emailVerified || emailInput.value.trim().toLowerCase() !== _verifiedEmail) {
      document.getElementById('regOtpError').classList.remove('show');
      const vbtn = document.getElementById('verifyEmailBtn');
      vbtn.classList.add('error-box');
      setTimeout(() => vbtn.classList.remove('error-box'), 1200);
      emailInput.closest('.field').scrollIntoView({ behavior: 'smooth', block: 'center' });
      alert(i18nT('visa.alert.verify_email', 'Please verify your email address using the "Verify" button before submitting.'));
      return;
    }

    // ── Password validation ──────────────────────────────────────
    const pwdInput   = document.getElementById('regPassword');
    const pwdConfirm = document.getElementById('regPasswordConfirm');
    const pwdErr     = document.getElementById('regPasswordErr');
    const pwdCErr    = document.getElementById('regPasswordConfirmErr');
    pwdErr.classList.remove('show'); pwdCErr.classList.remove('show');
    pwdInput.classList.remove('error'); pwdConfirm.classList.remove('error');

    if (!pwdInput.value || pwdInput.value.length < 8) {
      pwdErr.textContent = 'Password must be at least 8 characters.';
      pwdErr.classList.add('show'); pwdInput.classList.add('error');
      pwdInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
    }
    if (pwdInput.value !== pwdConfirm.value) {
      pwdCErr.textContent = 'Passwords do not match. Please try again.';
      pwdCErr.classList.add('show'); pwdConfirm.classList.add('error');
      pwdConfirm.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
    }

    if (!allValid) {
      const firstErr = document.querySelector('#formCard input.error, #formCard select.error');
      if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Submitting...';
    document.getElementById('errorBanner').style.display = 'none';

    const dialCode = dialVal.textContent;
    const mob = document.getElementById('mobileNumber').value.trim();
    const fullMobile = mob.startsWith(dialCode.replace('+','')) ? '+' + mob : (mob.startsWith('+') ? mob : dialCode + ' ' + mob);

    // Build the data record — matches Supabase table columns
    const record = {
      stay_type:        currentStay,
      first_name:       document.getElementById('firstName').value.trim(),
      last_name:        document.getElementById('lastName').value.trim(),
      date_of_birth:    document.getElementById('dob').value,
      gender:           document.getElementById('gender').value,
      nationality:      natSel.value === 'Other' ? otherIn.value.trim() : natSel.value,
      email:            document.getElementById('email').value.trim().toLowerCase(),
      mobile:           fullMobile,
      passport_number:  document.getElementById('passportNumber').value.trim().toUpperCase(),
      passport_issue:   document.getElementById('passportIssue').value,
      passport_expiry:  document.getElementById('passportExpiry').value,
      place_of_issue:   document.getElementById('placeOfIssue').value.trim(),
      issuing_authority:document.getElementById('issuingAuth').value.trim(),
      visa_type:        document.getElementById('visaType').value,
      destination_country: _countryName(document.getElementById('destinationCountry').value),
      appointment_state:   _stateName(document.getElementById('appointmentState').value),
      appointment_city:    _cityName(document.getElementById('appointmentCity').value),
      departure_date:   document.getElementById('travelDate').value,
      return_date:      document.getElementById('returnDate').value,
      duration_days:    parseInt(document.getElementById('duration').value),
      purpose_of_visit: document.getElementById('purposeOfVisit').value.trim(),
      status:           'submitted',
      // Long stay extras (null for short stay)
      employer_name:    currentStay === 'long' ? document.getElementById('employerName').value.trim() : null,
      sponsor_name:     currentStay === 'long' ? document.getElementById('sponsorName').value.trim() : null,
      address_in_spain: currentStay === 'long' ? document.getElementById('addressInSpain').value.trim() : null,
      long_stay_purpose:currentStay === 'long' ? document.getElementById('longStayPurpose').value : null,
    };

    try {
      if (!supabaseConfigured) {
        // Demo mode — simulate success without real DB
        await new Promise(r => setTimeout(r, 1000));
        showSuccess(generateRef(), true);
      } else {
        // ── Send application + account creation to OUR BACKEND ──
        // Backend does: insert into visa_applications + bcrypt-hash the
        // password + upsert into user_accounts, all in one DB transaction.
        const emailVal = document.getElementById('email').value.trim().toLowerCase();
        const pwdVal   = document.getElementById('regPassword').value;

        const backendRecord = { ...record, email: emailVal, password: pwdVal };

        const applyRes = await fetch('http://localhost:5000/api/users/visa/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backendRecord)
        });
        const applyData = await applyRes.json();

        if (!applyRes.ok) throw new Error(applyData.error || 'Application submission failed');

        const referenceNumber = applyData.reference_number;

        // ── Upload any selected documents to Storage + applicant_documents ──
        // (Still goes direct to Supabase Storage — file uploads are a
        // separate concern from the application/account data above.)
        // Non-blocking for the user's success screen — a failed file upload
        // shouldn't undo their successful application, but we do warn them.
        const passportVal = record.passport_number;
        const failedUploads = [];
        for (const dt of visaDocTypes) {
          const inp = document.getElementById('doc_' + dt.key);
          if (inp && inp.files && inp.files[0]) {
            try {
              await docUploadFile({
                referenceNumber: referenceNumber,
                passportNumber: passportVal,
                documentKey: dt.key,
                file: inp.files[0],
                uploadedBy: 'user',
                documentNumber: dt.number_label ? docGetNumberValue(dt.key) : undefined,
              });
            } catch (upErr) {
              console.warn('Document upload failed for', dt.key, upErr);
              failedUploads.push(dt.label);
            }
          }
        }
        if (failedUploads.length) {
          console.warn('Some documents failed to upload:', failedUploads.join(', '));
        }

        // ── Send registration confirmation email (non-blocking) ──
        // Uses a Supabase Edge Function ("send-confirmation") + Resend.
        // If this fails, we don't block the user's success screen.
        supabaseClient.functions.invoke('send-confirmation', {
          body: {
            email: emailVal,
            first_name: record.first_name,
            last_name: record.last_name,
            reference_number: referenceNumber,
            visa_type: record.visa_type,
            destination_country: record.destination_country,
            appointment_city: record.appointment_city
          }
        }).catch(err => console.warn('Confirmation email failed to send:', err));

        showSuccess(referenceNumber || generateRef(), true);
      }
    } catch (err) {
      console.error('Supabase error:', err);

      // ✅ User-friendly error messages
      let userMsg = 'Could not save your application. Please try again.';

      if (err.message && err.message.includes('unique') && err.message.includes('email')) {
        userMsg = '⚠️ This email address is already registered. Please login instead or use a different email address.';
      } else if (err.message && err.message.includes('unique') && err.message.includes('passport')) {
        userMsg = '⚠️ This passport number is already registered in our system.';
      } else if (err.message && err.message.includes('unique') && err.message.includes('mobile')) {
        userMsg = '⚠️ This mobile number is already registered. Please use a different number.';
      } else if (err.message && err.message.includes('duplicate key')) {
        userMsg = '⚠️ An application with this email already exists. Please login to continue or contact support.';
      } else if (err.message && (err.message.includes('network') || err.message.includes('fetch'))) {
        userMsg = '⚠️ Network error. Please check your internet connection and try again.';
      }

      document.getElementById('errorMsg').textContent = userMsg;
      document.getElementById('errorBanner').style.display = 'flex';

      // Show "Login Instead" button only for duplicate email error
      const loginBtn = document.getElementById('errorLoginBtn');
      if (loginBtn) {
        if (err.message && (err.message.includes('unique') || err.message.includes('duplicate'))) {
          loginBtn.style.display = 'inline-flex';
        } else {
          loginBtn.style.display = 'none';
        }
      }

      document.getElementById('errorBanner').scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.refreshCaptcha('reg');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa fa-paper-plane"></i> Submit Application';
    }
  };

  // ── RESET ────────────────────────────────────────────────────
  window.resetForm = function () {
    document.querySelectorAll('#formCard input, #formCard select, #formCard textarea').forEach(el => {
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
      else el.value = '';
      el.classList.remove('error');
    });
    document.querySelectorAll('.err-msg').forEach(el => { el.classList.remove('show'); el.textContent = ''; });
    renderVisaDocUploads();
    clearDialCode();
    otherRow.style.display = 'none';
    // Reset country → state → city cascade
    populateDestCountryDropdown();
    _resetSel('appointmentState', '— Select country first —', true);
    _resetSel('appointmentCity',  '— Select state first —',   true);
    document.getElementById('durationText').textContent = '— select dates above —';
    document.getElementById('durationDisplay').className = 'duration-display';
    document.getElementById('durationTip').textContent = '';
    document.getElementById('successBanner').classList.remove('show');
    document.getElementById('errorBanner').style.display = 'none';
    progressFill.style.width = '0%';
    if (window.refreshCaptcha) window.refreshCaptcha('reg');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── HELPERS ──────────────────────────────────────────────────
  function showSuccess(ref, redirect) {
    progressFill.style.width = '100%';
    const banner = document.getElementById('successBanner');
    banner.classList.add('show');
    document.getElementById('refNumber').textContent = ref;
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // ✅ Persist session so "Home" and the nav bar on other pages know
    // this user is logged in and has a submitted application.
    if (_verifiedEmail) {
      sessionStorage.setItem('bls_logged_email', _verifiedEmail);
    }
    sessionStorage.setItem('bls_has_application', '1');

    // Reveal the "Book Appointment" nav item
    const navBtn = document.getElementById('navBookAppointment');
    if (navBtn) navBtn.style.display = 'flex';
  }

  function generateRef() {
    const year = new Date().getFullYear();
    const rand = Math.floor(100000 + Math.random() * 900000);
    return 'BLS-' + year + '-' + (currentStay === 'short' ? 'SC' : 'LS') + '-' + rand;
  }

  // ── Lock the rest of the form until email is verified ─────────
  const lockedSection = document.getElementById('lockedSection');
  const lockedOverlay = document.getElementById('lockedOverlay');
  const submitBtnEl   = document.getElementById('submitBtn');

  function lockRestOfForm() {
    lockedSection.classList.remove('unlocked');
    lockedOverlay.classList.remove('hidden');
    lockedSection.querySelectorAll('input, select, textarea, button').forEach(el => {
      el.setAttribute('data-locked-disabled', el.disabled ? '1' : '0');
      el.disabled = true;
    });
    if (submitBtnEl) submitBtnEl.disabled = true;
  }

  function unlockRestOfForm() {
    lockedSection.classList.add('unlocked');
    lockedOverlay.classList.add('hidden');
    lockedSection.querySelectorAll('input, select, textarea, button').forEach(el => {
      el.disabled = el.getAttribute('data-locked-disabled') === '1';
      el.removeAttribute('data-locked-disabled');
    });
    if (submitBtnEl) submitBtnEl.disabled = false;
  }

  lockRestOfForm();


  // Same mechanism as login.html's Email OTP — Supabase Auth sends
  // a real 6-digit code to the entered email. A bot can't receive
  // or read that email, so this blocks automated submissions while
  // also confirming the applicant's email address is real.
  let _emailVerified  = false;
  let _verifiedEmail  = '';
  let _regResendTimer = null;

  const emailInput = document.getElementById('email');

  // If the user edits the email after verifying, require re-verification
  emailInput.addEventListener('input', function () {
    if (_emailVerified && this.value.trim().toLowerCase() !== _verifiedEmail) {
      _emailVerified = false;
      const badge = document.getElementById('emailVerifiedBadge');
      const vbtn  = document.getElementById('verifyEmailBtn');
      badge.classList.remove('show');
      vbtn.disabled = false;
      vbtn.classList.remove('verified');
      vbtn.innerHTML = '<i class="fa fa-shield-halved"></i> Verify';
      document.getElementById('otpVerifyPanel').classList.remove('show');
    }
  });

  window.doSendRegOtp = async function (isResend) {
    const email = emailInput.value.trim().toLowerCase();
    const errMsg = emailInput.closest('.field').querySelector('.err-msg');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailInput.classList.add('error');
      if (errMsg) { errMsg.textContent = 'Enter a valid email address before verifying.'; errMsg.classList.add('show'); }
      emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (errMsg) { errMsg.textContent = ''; errMsg.classList.remove('show'); }
    emailInput.classList.remove('error');

    if (!supabaseConfigured) {
      alert(i18nT('visa.alert.supabase_required', 'Email verification requires Supabase to be configured. Please contact support.'));
      return;
    }

    const vbtn = document.getElementById('verifyEmailBtn');
    const resendBtn = document.getElementById('regResendBtn');

    if (!isResend) {
      vbtn.disabled = true;
      vbtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Sending...';
    } else {
      resendBtn.disabled = true;
    }

    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true }
      });
      if (error) throw error;
    } catch (err) {
      if (!isResend) {
        vbtn.disabled = false;
        vbtn.innerHTML = '<i class="fa fa-shield-halved"></i> Verify';
      } else {
        resendBtn.disabled = false;
      }
      const oe = document.getElementById('regOtpError');
      document.getElementById('regOtpErrorMsg').textContent = err.message || 'Could not send verification code. Please try again.';
      oe.classList.add('show');
      return;
    }

    if (!isResend) {
      vbtn.disabled = false;
      vbtn.innerHTML = '<i class="fa fa-shield-halved"></i> Verify';
    }

    document.getElementById('regOtpError').classList.remove('show');
    document.getElementById('otpVerifyEmailDisplay').textContent = email;
    document.getElementById('otpVerifyPanel').classList.add('show');

    for (let i = 0; i < 6; i++) {
      const box = document.getElementById('regOtp' + i);
      box.value = '';
      box.classList.remove('error-box');
    }
    document.getElementById('regOtp0').focus();
    document.getElementById('otpVerifyPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });

    startRegResendTimer();
  };

  window.doVerifyRegOtp = async function () {
    const email = emailInput.value.trim().toLowerCase();
    let code = '';
    for (let i = 0; i < 6; i++) code += document.getElementById('regOtp' + i).value.trim();

    const oe = document.getElementById('regOtpError');

    if (code.length !== 6) {
      document.getElementById('regOtpErrorMsg').textContent = 'Please enter the complete 6-digit code.';
      oe.classList.add('show');
      return;
    }

    const btn = document.getElementById('verifyRegOtpBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Verifying...';

    try {
      const { error } = await supabaseClient.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw error;
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa fa-check-circle"></i> Verify Code';
      document.getElementById('regOtpErrorMsg').textContent = 'Incorrect or expired code. Please try again.';
      oe.classList.add('show');
      for (let i = 0; i < 6; i++) document.getElementById('regOtp' + i).classList.add('error-box');
      return;
    }

    // Success
    _emailVerified = true;
    _verifiedEmail = email;
    if (_regResendTimer) clearInterval(_regResendTimer);

    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-check-circle"></i> Verify Code';
    oe.classList.remove('show');
    document.getElementById('otpVerifyPanel').classList.remove('show');

    const vbtn = document.getElementById('verifyEmailBtn');
    vbtn.innerHTML = '<i class="fa fa-check-circle"></i> Verified';
    vbtn.classList.add('verified');
    vbtn.disabled = true;

    document.getElementById('emailVerifiedBadge').classList.add('show');

    unlockRestOfForm();
    document.getElementById('lockedSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function startRegResendTimer() {
    let secs = 60;
    const timerEl  = document.getElementById('regResendTimer');
    const countEl  = document.getElementById('regResendCount');
    const resendBtn = document.getElementById('regResendBtn');

    timerEl.style.display = 'inline';
    resendBtn.style.display = 'none';
    countEl.textContent = secs;

    if (_regResendTimer) clearInterval(_regResendTimer);
    _regResendTimer = setInterval(() => {
      secs--;
      countEl.textContent = secs;
      if (secs <= 0) {
        clearInterval(_regResendTimer);
        timerEl.style.display = 'none';
        resendBtn.style.display = 'inline';
        resendBtn.disabled = false;
      }
    }, 1000);
  }

  // Auto-advance / auto-verify the 6 OTP boxes
  for (let i = 0; i < 6; i++) {
    const box = document.getElementById('regOtp' + i);
    box.addEventListener('input', (e) => {
      e.target.classList.remove('error-box');
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
      if (e.target.value && i < 5) document.getElementById('regOtp' + (i + 1)).focus();
      let all = '';
      for (let j = 0; j < 6; j++) all += document.getElementById('regOtp' + j).value;
      if (all.length === 6) setTimeout(window.doVerifyRegOtp, 150);
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && i > 0) {
        document.getElementById('regOtp' + (i - 1)).focus();
      }
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '').slice(0, 6);
      for (let k = 0; k < pasted.length && k < 6; k++) document.getElementById('regOtp' + k).value = pasted[k];
      if (pasted.length === 6) setTimeout(window.doVerifyRegOtp, 150);
    });
  }

  window._isEmailVerified = function () { return _emailVerified; };
  window._getVerifiedEmail = function () { return _verifiedEmail; };

  // ════════════════════════════════════════════════════════════
  //  CAPTCHA — random code, redrawn on load / refresh / each attempt
  // ════════════════════════════════════════════════════════════
const _captchaCode = { reg: '' };
window._regCaptchaDebug = _captchaCode;   // Testing ke liye — OTP jaisa hi trick

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

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(${100 + Math.random()*100|0},${100 + Math.random()*100|0},${100 + Math.random()*100|0},0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.random()*w, Math.random()*h);
      ctx.lineTo(Math.random()*w, Math.random()*h);
      ctx.stroke();
    }

    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(${Math.random()*180|0},${Math.random()*180|0},${Math.random()*180|0},0.4)`;
      ctx.fillRect(Math.random()*w, Math.random()*h, 1.5, 1.5);
    }

    const charWidth = w / code.length;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      const fontSize = 22 + Math.floor(Math.random() * 5);
      const angle = (Math.random() - 0.5) * 0.5;
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

  window.refreshCaptcha = function (which) {
    drawCaptcha(which);
    const input = document.getElementById(which + 'CaptchaInput');
    if (input) { input.value = ''; input.classList.remove('error'); }
    const err = document.getElementById(which + 'CaptchaErr');
    if (err) err.classList.remove('show');
  };

  window._checkCaptcha = function (which) {
    const input = document.getElementById(which + 'CaptchaInput');
    const err   = document.getElementById(which + 'CaptchaErr');
    const entered = (input.value || '').trim().toUpperCase();
    const expected = _captchaCode[which];

    if (!entered || entered !== expected) {
      err.textContent = 'Incorrect security code. Please try again.';
      err.classList.add('show');
      input.classList.add('error');
      window.refreshCaptcha(which);
      return false;
    }
    err.classList.remove('show');
    input.classList.remove('error');
    return true;
  };

  drawCaptcha('reg');

});