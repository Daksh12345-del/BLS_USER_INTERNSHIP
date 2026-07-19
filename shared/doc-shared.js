// ═══════════════════════════════════════════════════════════
//  shared/doc-shared.js
//  DOCUMENT CHECKLIST — shared helpers
//  Used by: script.js (Visa Application), appointment.js,
//           document.js (user checklist page), admin.js
//
//  All calls go through the backend (userRoutes.js → /api/users/documents/*).
//  Postgres + Supabase Storage are only touched server-side, using the
//  service role key — no DB/storage key lives in the browser anymore.
//
//  THIS IS NOW THE ONLY COPY. It previously existed as three
//  byte-identical files (Visa application/docshared.js,
//  Document/doc-shared.js, appointment/docshared.js — 480 lines of
//  pure duplication) — a bug fix or feature change had to be applied
//  three times by hand, and it was easy for the copies to quietly
//  drift apart. Every page now includes this one file via a relative
//  path (`../shared/doc-shared.js`). Must load AFTER shared/config.js.
// ═══════════════════════════════════════════════════════════

const DOC_API_BASE = apiDocumentsBase(); // from shared/config.js — must load AFTER config.js

/**
 * Load active document type config rows, optionally filtered to
 * only the ones that apply to a given form ('visa_application' | 'appointment').
 * Always sorted by sort_order.
 */
async function docLoadTypes(appliesTo) {
  try {
    const url = appliesTo
      ? `${DOC_API_BASE}/types?appliesTo=${encodeURIComponent(appliesTo)}`
      : `${DOC_API_BASE}/types`;
    const res = await fetch(url);
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to load document types');
    return result.types || [];
  } catch (e) {
    console.warn('docLoadTypes failed:', e);
    return [];
  }
}

/**
 * Fetch all uploaded-document rows for a given Application Reference Number.
 * Returns a map keyed by document_key for easy lookup: { pan_card: {...row}, ... }
 */
async function docLoadUploaded(referenceNumber) {
  if (!referenceNumber) return {};
  try {
    const res = await fetch(`${DOC_API_BASE}/uploaded/${encodeURIComponent(referenceNumber)}`);
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to load uploaded documents');
    return result.uploaded || {};
  } catch (e) {
    console.warn('docLoadUploaded failed:', e);
    return {};
  }
}

/**
 * Upload a single file for one document type and record it in applicant_documents.
 * Overwrites any previous file for the same reference_number + document_key.
 */
async function docUploadFile({ referenceNumber, passportNumber, documentKey, file, uploadedBy, documentNumber }) {
  const fd = new FormData();
  fd.append('referenceNumber', referenceNumber);
  fd.append('passportNumber', passportNumber || '');
  fd.append('documentKey', documentKey);
  fd.append('uploadedBy', uploadedBy || 'user');
  if (documentNumber !== undefined) fd.append('documentNumber', documentNumber ? documentNumber.trim() : '');
  fd.append('file', file);

  const res = await fetch(`${DOC_API_BASE}/upload`, { method: 'POST', body: fd });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || 'Upload failed');
  return result.path;
}

/**
 * Masks a document number for display, keeping only the last 4 characters
 * visible. Used everywhere a stored document number is shown to an
 * applicant (Admin can still see the full value via an explicit reveal).
 */
function docMaskNumber(fullNumber) {
  if (!fullNumber) return '';
  const clean = String(fullNumber).trim();
  if (clean.length <= 4) return '•'.repeat(clean.length);
  return '•'.repeat(clean.length - 4) + clean.slice(-4);
}

/**
 * Get a temporary signed URL to view/download a stored file.
 */
async function docGetSignedUrl(filePath, expirySeconds) {
  if (!filePath) return null;
  try {
    const res = await fetch(`${DOC_API_BASE}/signed-url?path=${encodeURIComponent(filePath)}&expiry=${expirySeconds || 300}`);
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to get signed URL');
    return result.signedUrl || null;
  } catch (e) {
    console.warn('docGetSignedUrl failed:', e);
    return null;
  }
}

function docFormatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Builds the HTML for one upload box (matches the existing .upload-box
 * styling used across the site). Returns a string.
 */
function docBuildUploadBoxHtml(docType, uploadedRow, opts) {
  opts = opts || {};
  const inputId = `doc_${docType.key}`;
  const hasFile = !!uploadedRow;
  const reqTag = docType.required ? ' <span class="req">*</span>' : '';
  const statusLine = hasFile
    ? `✓ ${escapeHtmlDoc(uploadedRow.file_name || 'Uploaded')} ${uploadedRow.file_size_bytes ? '(' + docFormatSize(uploadedRow.file_size_bytes) + ')' : ''}`
    : '';

  const numberField = docType.number_label ? `
      <div style="margin-top:8px;">
        <label style="display:block; font-size:11px; font-weight:600; color:#777; margin-bottom:4px;">${escapeHtmlDoc(docType.number_label)}${reqTag}</label>
        <input type="text" id="docnum_${docType.key}" data-doc-number-for="${docType.key}"
               value="${uploadedRow && uploadedRow.document_number ? escapeHtmlDoc(uploadedRow.document_number) : ''}"
               placeholder="Enter ${escapeHtmlDoc(docType.number_label)}"
               style="width:100%; padding:9px 11px; border:1.5px solid #ddd; border-radius:5px; font-size:13px; font-family:inherit;" />
      </div>` : '';

  return `
    <div class="field">
      <label>${escapeHtmlDoc(docType.label)}${reqTag}</label>
      <div class="upload-box ${hasFile ? 'has-file' : ''}" data-doc-key="${docType.key}">
        <i class="fa ${docType.icon || 'fa-file'} uicon"></i>
        <p><span class="hl">Click to upload</span> ${hasFile ? '(replace)' : ''}</p>
        <p>${escapeHtmlDoc(docType.accepted_formats || '')} · Max ${docType.max_size_mb || 2}MB</p>
        <div class="file-name">${statusLine}</div>
        <input type="file" id="${inputId}" data-doc-key="${docType.key}" accept="${escapeHtmlDoc(docType.accepted_formats || '')}" />
      </div>
      ${numberField}
    </div>`;
}

function escapeHtmlDoc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function docGetNumberValue(docKey) {
  const el = document.getElementById('docnum_' + docKey);
  return el ? el.value.trim() : '';
}

// Wires up the standard "click box → open file picker → show filename" UX
// for any .upload-box created by docBuildUploadBoxHtml. Call after injecting HTML.
function docWireUploadBoxes(containerEl) {
  containerEl.querySelectorAll('.upload-box input[type="file"]').forEach(inp => {
    inp.addEventListener('change', function () {
      const box = this.closest('.upload-box');
      const nameEl = box.querySelector('.file-name');
      if (this.files && this.files[0]) {
        box.classList.add('has-file');
        nameEl.textContent = '✓ ' + this.files[0].name + ' (selected — not yet uploaded)';
      }
    });
  });
}