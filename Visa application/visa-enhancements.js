/**
 * visa-enhancements.js
 * ─────────────────────────────────────────────
 * NAYA FEATURE: script.js ko bilkul touch/edit nahi kiya gaya hai. Yeh file
 * poori tarah ALAG (independent) hai — sirf apne khud ke event listeners
 * add karti hai. Agar kabhi yeh feature hatana ho, bas is file ka <script>
 * tag HTML se hata do, baaki sab waisa hi chalta rahega.
 *
 * DO CHEEZEIN karti hai:
 * 1. "Auto-fill from Passport" button — passport-ocr.js use karke
 *    Passport Number / DOB / Expiry / Issue Date / Place of Issue
 *    fields auto-fill karta hai.
 * 2. Photo document upload (doc_photo) par — script.js ke apne
 *    basic (skin-tone) check ke UPAR — face-verify.js se live camera
 *    khol ke real face-match verification karwata hai.
 */

document.addEventListener('DOMContentLoaded', function () {

  // ════════════════════════════════════════════
  // 1) PASSPORT AUTO-FILL (OCR + MRZ)
  // ════════════════════════════════════════════
  const autofillBtn = document.getElementById('passportAutofillBtn');
  const autofillFile = document.getElementById('passportAutofillFile');
  const autofillStatus = document.getElementById('passportAutofillStatus');
  const autofillProgress = document.getElementById('passportAutofillProgress');

  function setFieldValue(id, value) {
    if (!value) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    // 'input'/'change' events fire karo taaki script.js ki apni validation
    // aur duration-calculation jaisi logic bhi trigger ho jaye.
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // "DD/MM/YYYY" (ya DD-MM-YYYY) -> "YYYY-MM-DD" (HTML date input format)
  function toIsoDate(ddmmyyyy) {
    if (!ddmmyyyy) return null;
    const m = ddmmyyyy.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }

  if (autofillBtn) {
    autofillBtn.addEventListener('click', async function () {
      const file = autofillFile.files[0];
      if (!file) {
        autofillStatus.innerHTML = '<span style="color:#e74c3c;">Pehle passport ki photo/PDF select karo.</span>';
        return;
      }

      autofillBtn.disabled = true;
      autofillStatus.innerHTML = '';
      autofillProgress.style.display = 'block';
      autofillProgress.textContent = 'Passport padh rahe hain... 0%';

      try {
        const data = await PassportOCR.extractFromFile(file, function (pct) {
          autofillProgress.textContent = 'Passport padh rahe hain... ' + pct + '%';
        });

        autofillProgress.style.display = 'none';

        if (!data.success) {
          autofillStatus.innerHTML = '<span style="color:#e74c3c;">' + data.error + '</span>';
          autofillBtn.disabled = false;
          return;
        }

        // ── MRZ-verified fields (reliable) ──
        setFieldValue('passportNumber', data.passportNumber);
        setFieldValue('dob', toIsoDate(data.dateOfBirth));
        setFieldValue('passportExpiry', toIsoDate(data.dateOfExpiry));
        if (data.givenNames) setFieldValue('firstName', data.givenNames);
        if (data.surname) setFieldValue('lastName', data.surname);

        // ── Best-effort fields (Issue Date / Place of Issue MRZ me hoti
        // hi nahi hai, isliye yeh kam reliable hai — isliye hamesha
        // warning ke saath dikhate hai) ──
        if (data.placeOfIssue) setFieldValue('placeOfIssue', data.placeOfIssue);
        const isoIssueDate = toIsoDate(data.dateOfIssue);
        if (isoIssueDate) setFieldValue('passportIssue', isoIssueDate);

        const warnings = [];
        if (!data.confidence.passportNumber) warnings.push('Passport Number');
        if (!data.confidence.dateOfBirth) warnings.push('Date of Birth');
        if (!data.confidence.dateOfExpiry) warnings.push('Date of Expiry');
        if (!isoIssueDate) warnings.push('Date of Issue (khud bharo)');
        if (!data.placeOfIssue) warnings.push('Place of Issue (khud bharo)');

        let msg = '<span style="color:#1e9e6c;"><i class="fa fa-check-circle"></i> Fields auto-fill ho gaye.</span>';
        if (warnings.length) {
          msg +=
            '<br><span style="color:#d97706;"><i class="fa fa-triangle-exclamation"></i> In fields ko ek baar dobara check kar lo: ' +
            warnings.join(', ') +
            '</span>';
        }
        autofillStatus.innerHTML = msg;
      } catch (err) {
        autofillProgress.style.display = 'none';
        autofillStatus.innerHTML = '<span style="color:#e74c3c;">Error: ' + err.message + '</span>';
      } finally {
        autofillBtn.disabled = false;
      }
    });
  }

  // ════════════════════════════════════════════
  // 2) PHOTO UPLOAD → LIVE CAMERA FACE VERIFY
  // ════════════════════════════════════════════
  // Yeh script.js ke apne "change" listener (dynamicDocUploads pe) ko
  // REPLACE nahi karta — sirf ek ADDITIONAL listener add karta hai isi
  // container pe. Dono chalte hai: pehle script.js ka basic (skin-tone)
  // check, phir yeh wala real (face-api.js) verification — sirf docKey
  // === 'photo' ke liye.
  const docContainer = document.getElementById('dynamicDocUploads');
  if (docContainer) {
    docContainer.addEventListener('change', async function (e) {
      const inp = e.target;
      if (!inp.matches('input[type="file"]')) return;
      if (inp.getAttribute('data-doc-key') !== 'photo') return;
      if (!inp.files || !inp.files[0]) return;

      const file = inp.files[0];
      const box = inp.closest('.upload-box');
      const nameEl = box ? box.querySelector('.file-name') : null;

      // Thoda ruko taaki script.js ka apna basic (skin-tone) check pehle
      // complete ho jaye — agar wahi reject kar de to camera kholne ki
      // zarurat nahi hai.
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (box && !box.classList.contains('has-file')) return; // basic check hi fail ho gaya

      if (nameEl) {
        nameEl.textContent = '📷 Camera se face verify kar rahe hain...';
        nameEl.style.color = '#C8A951';
      }

      try {
        const result = await FaceVerify.verifyLiveFaceAgainstDocument(file);

        if (result.isMatch) {
          if (nameEl) {
            nameEl.textContent = '✓ ' + file.name + ' — Face verified (' + result.confidencePercent + '% match)';
            nameEl.style.color = '#1e9e6c';
          }
          if (box) {
            const icon = box.querySelector('.uicon');
            if (icon) icon.style.color = '#1e9e6c';
          }
        } else {
          if (box) box.classList.remove('has-file');
          if (nameEl) {
            nameEl.textContent =
              '✗ Face match nahi hua (' + result.confidencePercent + '%) — apni khud ki clear, front-facing photo upload karo.';
            nameEl.style.color = '#e74c3c';
          }
          inp.value = '';
        }
      } catch (err) {
        // Agar camera access na mile / user cancel kare, to poora block
        // nahi karte (genuine users jinka camera na chale unhe stuck nahi
        // karna) — basic (skin-tone) check ke bharose hi accept kar lete
        // hai, sirf ek warning dikhate hai.
        if (nameEl) {
          nameEl.textContent = '⚠ Camera verify nahi ho paya (' + err.message + ') — basic check ke aadhar pe accept kiya.';
          nameEl.style.color = '#d97706';
        }
      }
    });
  }
});
