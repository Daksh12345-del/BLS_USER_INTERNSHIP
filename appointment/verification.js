/**
 * appointment/verification.js
 * ─────────────────────────────────────────────
 * Booking se theek pehle chalne wala AI identity-verification step.
 * Appointment form (naam, passport, dates, purpose, centre, etc.) jo
 * applicant ne bhara hai, uske basis par backend (Claude / Anthropic
 * API) 4 sawaal banata hai. Applicant apni marzi se ek mode chunta hai:
 *
 *   1) 🎤 Bol ke jawab do   — sawaal bola/dikhaya jata hai, applicant
 *      microphone se jawab bolta hai, jawab AI se semantically check
 *      hota hai (sirf exact text match nahi, matlab match hona chahiye).
 *   2) ✅ 4 options me se chuno (MCQ) — sawaal TTS se bola jata hai,
 *      applicant 4 options me se click karke chunta hai (exact match,
 *      server-side check).
 *
 * Dono modes ke liye same 4 sawaal use hote hai. Sab 4 sahi honi
 * chahiye — ek bhi galat = "wrong details verified" = booking ROK di
 * jaati hai, applicant ko details check karke phir try karna padega.
 *
 * ⚠️ ZAROORI: Yeh module sirf UI/UX handle karta hai. Asli
 * "sahi/galat" decision HAMESHA backend par hota hai
 * (routes/verificationController.js) — frontend kabhi khud decide
 * nahi karta ki jawab sahi hai ya nahi, warna koi bhi DevTools khol
 * ke seedha "correct" bhej sakta hai. Backend hi ek-baar-use-hone-wala
 * verification_token deta hai jo /book endpoint ko chahiye hota hai.
 *
 * DEPENDENCIES: shared/config.js (apiUsersBase()) is script se pehle
 * load hona chahiye. Web Speech API (SpeechRecognition / speechSynthesis)
 * optional hai — na hone par voice mode automatically MCQ ki taraf
 * fallback kar deta hai.
 */

const AppointmentVerify = (() => {
  function apiVerifyBase() {
    return `${apiUsersBase()}/appointment/verification`;
  }

  const hasSpeechRecognition = () =>
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const hasSpeechSynthesis = () => !!window.speechSynthesis;

  function speak(text) {
    if (!hasSpeechSynthesis()) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.95;
      window.speechSynthesis.speak(utter);
    } catch (e) { /* TTS best-effort only, never block the flow */ }
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ── Modal DOM scaffold ──────────────────────────────────────────
  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'apptVerifyOverlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(30,30,30,.72);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; padding: 16px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      background: #fff; border-radius: 10px; max-width: 560px; width: 100%;
      max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,.3);
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      background: #6B6B6B; padding: 18px 24px 22px; border-bottom: 3px solid #C8A951;
      color: #fff; display: flex; flex-direction: column; gap: 12px;
    `;
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <i class="fa fa-user-shield" style="font-size:22px;color:#C8A951;"></i>
        <div>
          <div style="font-size:16px;font-weight:700;">Confirm Your Identity</div>
          <div style="font-size:12px;opacity:.85;">4 quick questions based on the details you entered — required before booking.</div>
        </div>
      </div>
      <div id="apptVerifyVideoRow" style="width:100%;display:flex;justify-content:center;"></div>
    `;

    const body = document.createElement('div');
    body.id = 'apptVerifyBody';
    body.style.cssText = 'padding: 22px 24px;';

    card.appendChild(header);
    card.appendChild(body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    return { overlay, body, header };
  }

  function removeModal(overlay) {
    stopLiveCamera();
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (hasSpeechSynthesis()) window.speechSynthesis.cancel();
  }

  // ── Persistent live camera preview ───────────────────────────────
  // Applicant ka chehra camera se live dikhta rehta hai jab tak wo
  // 4 sawaalon ke jawab de raha hai — chahe voice mode ho ya MCQ mode,
  // dono me equally camera on rehta hai (identity ko visually confirm
  // karne ke liye). Yeh sirf ek visual/UX signal hai; asli decision
  // hamesha backend answer-matching se hoti hai, camera feed record ya
  // backend ko bheja nahi jaata.
  let liveStream = null;
  let liveVideoEl = null;

  function stopLiveCamera() {
    if (liveStream) {
      liveStream.getTracks().forEach((t) => t.stop());
      liveStream = null;
    }
    const wrap = document.getElementById('apptVerifyVideoWrap');
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    liveVideoEl = null;
  }

  async function startLiveCamera(header) {
    if (liveStream || document.getElementById('apptVerifyVideoWrap')) return; // already running

    const videoRow = header.querySelector('#apptVerifyVideoRow') || header;

    const wrap = document.createElement('div');
    wrap.id = 'apptVerifyVideoWrap';
    wrap.title = 'Your camera stays on while you answer';
    wrap.style.cssText = `
      width:180px; height:180px; border-radius:50%; overflow:hidden;
      border:3px solid #C8A951; flex-shrink:0; background:#000; position:relative;
      box-shadow:0 4px 14px rgba(0,0,0,.35);
    `;

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1);';

    const dot = document.createElement('div');
    dot.style.cssText = `
      position:absolute; top:10px; right:10px; width:14px; height:14px; border-radius:50%;
      background:#e74c3c; box-shadow:0 0 6px rgba(231,76,60,.9);
    `;

    wrap.appendChild(video);
    wrap.appendChild(dot);
    videoRow.appendChild(wrap);
    liveVideoEl = video;

    try {
      liveStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      video.srcObject = liveStream;
    } catch (e) {
      // Camera na milne par bhi verification block nahi karte — sirf
      // badge ko "camera unavailable" state me dikha dete hai.
      wrap.style.background = '#444';
      wrap.innerHTML = '<i class="fa fa-video-slash" style="color:#fff;font-size:32px;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"></i>';
    }
  }

  // ── Mode picker screen ──────────────────────────────────────────
  function renderModeChoice(body, onChoose) {
    body.innerHTML = `
      <p style="font-size:13px;color:#555;margin-bottom:18px;">
        To keep this appointment secure, please answer 4 short questions
        about the details you just entered. Choose how you'd like to answer:
      </p>
      <div style="display:flex;gap:14px;flex-wrap:wrap;">
        <button id="vChooseVoice" class="apptVerifyModeBtn">
          <i class="fa fa-microphone" style="font-size:20px;color:#C8A951;"></i>
          <div style="font-weight:700;margin-top:8px;">Speak Your Answers</div>
          <div style="font-size:11px;color:#888;margin-top:4px;">Answer out loud using your microphone</div>
        </button>
        <button id="vChooseMcq" class="apptVerifyModeBtn">
          <i class="fa fa-list-check" style="font-size:20px;color:#C8A951;"></i>
          <div style="font-weight:700;margin-top:8px;">Choose from Options</div>
          <div style="font-size:11px;color:#888;margin-top:4px;">Pick the correct answer from 4 choices</div>
        </button>
      </div>
      <div style="margin-top:20px;text-align:right;">
        <button id="vCancelBtn" style="background:none;border:none;color:#999;font-size:12px;cursor:pointer;text-decoration:underline;">Cancel &amp; go back to review details</button>
      </div>
    `;
    const style = document.createElement('style');
    style.textContent = `
      .apptVerifyModeBtn { flex:1; min-width:200px; border:2px solid #eee; background:#fafafa;
        border-radius:8px; padding:18px 14px; cursor:pointer; text-align:left; transition:.15s; }
      .apptVerifyModeBtn:hover { border-color:#C8A951; background:#fff8e8; }
    `;
    body.appendChild(style);

    document.getElementById('vChooseVoice').onclick = () => {
      if (!hasSpeechRecognition()) {
        alert('Your browser does not support voice input. Switching to MCQ mode instead.');
        onChoose('mcq');
      } else {
        onChoose('voice');
      }
    };
    document.getElementById('vChooseMcq').onclick = () => onChoose('mcq');
    document.getElementById('vCancelBtn').onclick = () => onChoose(null);
  }

  // ── Question progress screens ────────────────────────────────────
  function renderQuestionShell(body, idx, total, questionText) {
    body.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:#C8A951;text-transform:uppercase;letter-spacing:.5px;">
        Question ${idx + 1} of ${total}
      </div>
      <div style="display:flex;gap:6px;margin:8px 0 18px;">
        ${Array.from({ length: total }).map((_, i) =>
          `<div style="height:5px;flex:1;border-radius:3px;background:${i <= idx ? '#C8A951' : '#eee'};"></div>`
        ).join('')}
      </div>
      <div id="vQuestionText" style="font-size:15px;font-weight:600;color:#333;margin-bottom:20px;">${questionText}</div>
      <div id="vAnswerArea"></div>
      <div id="vFeedbackArea" style="margin-top:14px;"></div>
    `;
  }

  function renderMcqOptions(container, options, onPick) {
    container.innerHTML = options.map((opt, i) =>
      `<button class="vMcqOpt" data-i="${i}" style="display:block;width:100%;text-align:left;
        padding:12px 16px;margin-bottom:10px;border:2px solid #eee;border-radius:7px;background:#fff;
        cursor:pointer;font-size:13px;color:#333;transition:.15s;">${opt}</button>`
    ).join('');
    container.querySelectorAll('.vMcqOpt').forEach(btn => {
      btn.onclick = () => {
        container.querySelectorAll('.vMcqOpt').forEach(b => b.disabled = true);
        onPick(options[Number(btn.dataset.i)]);
      };
    });
  }

  function renderVoiceInput(container, onResult) {
    container.innerHTML = `
      <button id="vMicBtn" style="padding:12px 22px;border:none;border-radius:24px;background:#C8A951;
        color:#fff;font-weight:700;font-size:13px;cursor:pointer;">
        <i class="fa fa-microphone"></i> Tap to Speak
      </button>
      <div id="vTranscript" style="margin-top:14px;font-size:13px;color:#555;min-height:20px;"></div>
      <div id="vVoiceActions" style="margin-top:10px;display:none;gap:10px;">
        <button id="vUseAnswer" style="padding:9px 18px;border:none;border-radius:6px;background:#3a3a3a;color:#fff;font-size:12px;cursor:pointer;">Use This Answer</button>
        <button id="vRetryAnswer" style="padding:9px 18px;border:1px solid #ccc;border-radius:6px;background:#fff;color:#555;font-size:12px;cursor:pointer;">Try Again</button>
      </div>
    `;
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recog = new SpeechRecognitionCtor();
    recog.lang = 'en-IN';
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    let lastTranscript = '';
    const micBtn = document.getElementById('vMicBtn');
    const transcriptEl = document.getElementById('vTranscript');
    const actionsEl = document.getElementById('vVoiceActions');

    micBtn.onclick = () => {
      micBtn.disabled = true;
      micBtn.innerHTML = '<i class="fa fa-circle" style="color:#e74c3c;"></i> Listening...';
      transcriptEl.textContent = '';
      actionsEl.style.display = 'none';
      try { recog.start(); } catch (e) { /* already started */ }
    };
    recog.onresult = (ev) => {
      lastTranscript = ev.results[0][0].transcript;
      transcriptEl.textContent = `You said: "${lastTranscript}"`;
      actionsEl.style.display = 'flex';
    };
    recog.onerror = () => {
      transcriptEl.textContent = 'Could not hear you clearly — please try again.';
    };
    recog.onend = () => {
      micBtn.disabled = false;
      micBtn.innerHTML = '<i class="fa fa-microphone"></i> Tap to Speak';
    };
    document.getElementById('vUseAnswer') && (actionsEl.querySelector('#vUseAnswer').onclick = () => {
      actionsEl.querySelectorAll('button').forEach(b => b.disabled = true);
      micBtn.disabled = true;
      onResult(lastTranscript);
    });
    document.getElementById('vRetryAnswer') && (actionsEl.querySelector('#vRetryAnswer').onclick = () => {
      transcriptEl.textContent = '';
      actionsEl.style.display = 'none';
    });
  }

  function renderFeedback(container, correct, correctAnswerIfWrong) {
    if (correct) {
      container.innerHTML = `<div style="color:#1a7d3a;font-weight:700;font-size:13px;"><i class="fa fa-check-circle"></i> Correct!</div>`;
    } else {
      container.innerHTML = `<div style="color:#c0392b;font-weight:700;font-size:13px;"><i class="fa fa-times-circle"></i> That doesn't match your application details.</div>`;
    }
  }

  function renderFailureScreen(body, onGoBack) {
    body.innerHTML = `
      <div style="text-align:center;padding:10px 0 6px;">
        <i class="fa fa-triangle-exclamation" style="font-size:40px;color:#c0392b;"></i>
        <h3 style="color:#c0392b;margin:14px 0 6px;">Verification Failed</h3>
        <p style="font-size:13px;color:#666;max-width:400px;margin:0 auto;">
          One or more answers didn't match the details on this appointment form.
          For your security, we couldn't confirm your identity, so the appointment
          was not booked. Please review your details and try again.
        </p>
        <button id="vGoBackBtn" style="margin-top:20px;padding:11px 24px;background:#C8A951;
          border:none;border-radius:6px;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">
          <i class="fa fa-arrow-left"></i> Review My Details
        </button>
      </div>
    `;
    document.getElementById('vGoBackBtn').onclick = onGoBack;
  }

  function renderSuccessScreen(body, total, onContinue) {
    body.innerHTML = `
      <div style="text-align:center;padding:10px 0 6px;">
        <i class="fa fa-circle-check" style="font-size:40px;color:#1a7d3a;"></i>
        <h3 style="color:#1a7d3a;margin:14px 0 6px;">Identity Verified — ${total}/${total}</h3>
        <p style="font-size:13px;color:#666;">All answers matched your appointment details. Proceeding to book your appointment...</p>
      </div>
    `;
    setTimeout(onContinue, 900);
  }

  /**
   * MAIN ENTRY POINT.
   * @param {Object} appointmentData - fields already filled on the form
   *   (full_name, email, mobile, passport_number, passport_issue,
   *    passport_expiry, purpose_of_visit, destination_country,
   *    appointment_centre, appointment_date, slot_time, notes).
   * @returns {Promise<string|null>} resolves with a verification_token
   *   on 4/4 success, or null if the applicant cancelled/failed.
   */
  function runVerification(appointmentData) {
    return new Promise(async (resolve) => {
      const { overlay, body, header } = buildModal();
      body.innerHTML = `<div style="text-align:center;padding:30px 0;"><i class="fa fa-spinner fa-spin" style="font-size:26px;color:#C8A951;"></i><p style="margin-top:14px;color:#777;font-size:13px;">Preparing your verification questions...</p></div>`;

      let sessionId, questions;
      try {
        const res = await fetch(`${apiVerifyBase()}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appointmentData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not generate verification questions.');
        sessionId = data.sessionId;
        questions = data.questions; // [{id, question, options}]
      } catch (e) {
        body.innerHTML = `<div style="text-align:center;padding:20px 0;">
          <i class="fa fa-circle-exclamation" style="font-size:32px;color:#c0392b;"></i>
          <p style="margin-top:12px;color:#c0392b;font-size:13px;">${(e.message || 'Verification service is unavailable right now.')}</p>
          <button id="vCloseErr" style="margin-top:16px;padding:9px 20px;border:none;border-radius:6px;background:#6B6B6B;color:#fff;cursor:pointer;">Close</button>
        </div>`;
        document.getElementById('vCloseErr').onclick = () => { removeModal(overlay); resolve(null); };
        return;
      }

      renderModeChoice(body, async (mode) => {
        if (!mode) { removeModal(overlay); resolve(null); return; }
        await startLiveCamera(header); // camera on rehta hai chahe voice ho ya mcq
        await runQuestions(mode);
      });

      async function runQuestions(mode) {
        let qIdx = 0;
        let failed = false;

        while (qIdx < questions.length && !failed) {
          const q = questions[qIdx];
          renderQuestionShell(body, qIdx, questions.length, q.question);
          speak(q.question);

          const answerArea = document.getElementById('vAnswerArea');
          const feedbackArea = document.getElementById('vFeedbackArea');

          const userAnswer = await new Promise((res) => {
            if (mode === 'mcq') {
              renderMcqOptions(answerArea, shuffle(q.options), res);
            } else {
              renderVoiceInput(answerArea, res);
            }
          });

          let checkResult;
          try {
            const res = await fetch(`${apiVerifyBase()}/answer`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId, questionId: q.id, mode,
                answer: userAnswer,
              }),
            });
            checkResult = await res.json();
            if (!res.ok) throw new Error(checkResult.error || 'Could not verify that answer.');
          } catch (e) {
            checkResult = { correct: false, failed: true };
          }

          renderFeedback(feedbackArea, checkResult.correct);
          await new Promise(r => setTimeout(r, 900));

          if (!checkResult.correct) {
            failed = true;
            stopLiveCamera();
            renderFailureScreen(body, () => { removeModal(overlay); resolve(null); });
            return;
          }

          if (checkResult.completed && checkResult.verified) {
            stopLiveCamera();
            renderSuccessScreen(body, questions.length, () => {
              removeModal(overlay);
              resolve(checkResult.verificationToken);
            });
            return;
          }

          qIdx++;
        }
      }
    });
  }

  return { runVerification };
})();