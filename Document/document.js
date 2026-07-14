// ═══════════════════════════════════════════
//  BLS International — Documents Checklist (public, self-service)
//  Everything on this page — appointment lookup AND the document
//  checklist itself — now goes through the backend (userRoutes.js).
//  No Supabase client/key lives in the browser on this page.
// ═══════════════════════════════════════════

function $(id) { return document.getElementById(id); }

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

let currentRef = null;
let currentPassport = null;

function showLookupError(msg) {
  $('lookupMsgText').textContent = msg;
  $('lookupMsg').classList.add('show');
}
function hideLookupError() {
  $('lookupMsg').classList.remove('show');
}

window.resetLookup = function () {
  $('resultWrap').style.display = 'none';
  $('refInput').value = '';
  $('passportInput').value = '';
  hideLookupError();
  $('refInput').focus();
};

window.lookupDocuments = async function () {
  hideLookupError();

  const ref = $('refInput').value.trim().toUpperCase();
  const passport = $('passportInput').value.trim().toUpperCase();

  if (!ref) { showLookupError(i18nT('track.err.no_ref', 'Please enter your Appointment Number.')); $('refInput').focus(); return; }
  if (!passport) { showLookupError(i18nT('track.err.no_passport', 'Please enter your Passport Number.')); $('passportInput').focus(); return; }

  const btn = $('lookupBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Searching...';

  try {
    const res = await fetch(
      `/api/users/visa/documents/${encodeURIComponent(ref)}/${encodeURIComponent(passport)}`
    );
    const result = await res.json();

    if (!res.ok) throw new Error(result.error || 'Lookup failed');

    const data = result.application;

    if (!data) {
      showLookupError(i18nT('track.err.not_found', 'No appointment found. Please check your Appointment Number and Passport Number and try again.'));
      return;
    }

    currentRef = data.reference_number;
    currentPassport = data.passport_number;
    $('rsName').textContent = data.full_name || '—';
    $('rsRef').textContent = data.reference_number;

    await renderChecklist();
    $('resultWrap').style.display = 'block';
    $('resultWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error('Document lookup error:', err);
    showLookupError(i18nT('track.err.generic', 'Something went wrong while searching. Please try again in a moment.'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-magnifying-glass"></i> View Checklist';
  }
};

async function renderChecklist() {
  const list = $('docList');
  list.innerHTML = '<p style="font-size:12.5px;color:#999;"><i class="fa fa-spinner fa-spin"></i> Loading checklist...</p>';

  // Union of doc types used on either form — a document only needs to be
  // uploaded once regardless of which page originally asked for it.
  const [visaTypes, apptTypes, uploaded] = await Promise.all([
    docLoadTypes('visa_application'),
    docLoadTypes('appointment'),
    docLoadUploaded(currentRef),
  ]);

  const byKey = {};
  [...visaTypes, ...apptTypes].forEach(dt => { byKey[dt.key] = dt; });
  const allTypes = Object.values(byKey).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const uploadedCount = allTypes.filter(dt => uploaded[dt.key]).length;
  $('docUploadedCount').textContent = uploadedCount;
  $('docTotalCount').textContent = allTypes.length;

  if (!allTypes.length) {
    list.innerHTML = '<p style="font-size:12.5px;color:#999;">No document checklist has been configured yet.</p>';
    return;
  }

  list.innerHTML = allTypes.map(dt => {
    const row = uploaded[dt.key];
    const isUploaded = !!row;
    const maskedNumber = (isUploaded && row.document_number) ? docMaskNumber(row.document_number) : '';
    return `
      <div class="doc-row ${isUploaded ? 'uploaded' : ''}" data-doc-key="${dt.key}">
        <div class="doc-icon"><i class="fa ${dt.icon || 'fa-file'}"></i></div>
        <div class="doc-info">
          <div class="doc-name">${escDoc(dt.label)}${dt.required ? '<span class="req-tag">*</span>' : ''}</div>
          <div class="doc-desc">${escDoc(dt.description || '')}</div>
          ${isUploaded ? `<div class="doc-meta">Uploaded ${row.uploaded_by === 'admin' ? 'by BLS staff' : 'by you'} on ${fmtDateTime(row.uploaded_at)}${row.file_size_bytes ? ' · ' + docFormatSize(row.file_size_bytes) : ''}</div>` : ''}
          ${maskedNumber ? `<div class="doc-meta">${escDoc(dt.number_label)}: <strong style="color:var(--dark); letter-spacing:1px;">${escDoc(maskedNumber)}</strong></div>` : ''}
          ${dt.number_label ? `<input type="text" class="doc-number-input" id="rownum_${dt.key}" placeholder="${escDoc(dt.number_label)}" style="margin-top:8px; width:100%; max-width:220px; padding:7px 10px; border:1.5px solid #ddd; border-radius:5px; font-size:12.5px; font-family:inherit;" />` : ''}
        </div>
        <span class="doc-status-badge ${isUploaded ? 'ok' : 'missing'}">
          <i class="fa ${isUploaded ? 'fa-check' : 'fa-triangle-exclamation'}"></i> ${isUploaded ? i18nT('documents.status.uploaded', 'Uploaded') : i18nT('documents.status.missing', 'Missing')}
        </span>
        <div class="doc-actions">
          <span class="file-input-wrap">
            <button class="btn-gold" style="padding:8px 16px;"><i class="fa fa-upload"></i> ${isUploaded ? i18nT('documents.btn.replace', 'Replace') : i18nT('documents.btn.upload', 'Upload')}</button>
            <input type="file" accept="${escDoc(dt.accepted_formats || '')}" onchange="uploadDocument('${dt.key}', this)" />
          </span>
        </div>
      </div>`;
  }).join('');
}

window.uploadDocument = async function (docKey, inputEl) {
  if (!inputEl.files || !inputEl.files[0]) return;
  const file = inputEl.files[0];
  const rowEl = inputEl.closest('.doc-row');
  const btn = rowEl.querySelector('.btn-gold');
  const numberInput = rowEl.querySelector('#rownum_' + docKey);
  const originalBtn = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Uploading...';

  try {
    await docUploadFile({
      referenceNumber: currentRef,
      passportNumber: currentPassport,
      documentKey: docKey,
      file: file,
      uploadedBy: 'user',
      documentNumber: numberInput ? numberInput.value : undefined,
    });
    await renderChecklist();
  } catch (e) {
    console.error('Upload failed:', e);
    alert('Could not upload this document. Please try again.');
    btn.disabled = false;
    btn.innerHTML = originalBtn;
  }
};

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(i18nDateLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) { return d; }
}
function escDoc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}