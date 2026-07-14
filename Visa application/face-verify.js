/**
 * face-verify.js
 * ─────────────────────────────────────────────
 * Jab user "photo" document upload kare, uska webcam khol ke ek live
 * selfie leta hai aur uska chehra uploaded document-photo ke chehre se
 * compare karta hai. Poora client-side (browser me), free hai
 * (face-api.js — TensorFlow.js pe based).
 *
 * ⚠️ ZAROORI LIMITATION (portfolio-level, production-grade nahi):
 * Yeh SIMILARITY score deta hai (kitna match karta hai), koi "liveness
 * detection" (yeh confirm karna ki koi real insaan hai, screen pe photo
 * nahi dikha raha) nahi karta. Agar koi apni hi photo ka photo webcam ke
 * saamne dikha de, yeh usse bhi "match" bata sakta hai. Real production
 * identity-verification ke liye paid APIs (AWS Rekognition, Azure Face
 * API, Onfido) chahiye hote hai jo backend se call hoti hai.
 *
 * DEPENDENCIES (apne HTML me add karo):
 *   <script src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>
 *   <script src="face-verify.js"></script>
 */

const FaceVerify = (() => {
  // face-api.js ke pre-trained model weights — CDN se load honge,
  // kahin download/self-host karne ki zarurat nahi.
  const MODEL_URL =
    "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

  let modelsLoaded = false;

  /**
   * Models ek baar load karo (page load ke baad, ya jab pehli baar
   * feature use ho). Yeh thoda time leta hai (~1-2 second) isliye
   * form khulte hi background me call kar dena best hai.
   */
  async function loadModels() {
    if (modelsLoaded) return;
    if (!window.faceapi) {
      throw new Error("face-api.js load nahi hua — <script> tag check karo.");
    }
    await Promise.all([
      window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  }

  /**
   * Ek chhota modal overlay banata hai jisme webcam ka live preview
   * dikhta hai aur ek "Capture" button hota hai. User click karega to
   * us frame ka photo capture ho jayega.
   *
   * @returns {Promise<HTMLCanvasElement>} capture hui photo (canvas)
   */
  function openCameraModal() {
    return new Promise((resolve, reject) => {
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.75);
        display: flex; align-items: center; justify-content: center;
        z-index: 99999;
      `;

      const panel = document.createElement("div");
      panel.style.cssText = `
        background: #fff; border-radius: 12px; padding: 20px;
        max-width: 420px; width: 90%; text-align: center;
        font-family: Arial, sans-serif;
      `;

      const title = document.createElement("h3");
      title.textContent = "Apna chehra camera ke saamne rakho";
      title.style.marginTop = "0";

      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.style.cssText = "width: 100%; border-radius: 8px; background: #000; transform: scaleX(-1);";

      const btnRow = document.createElement("div");
      btnRow.style.cssText = "margin-top: 14px; display: flex; gap: 10px; justify-content: center;";

      const captureBtn = document.createElement("button");
      captureBtn.textContent = "📸 Capture";
      captureBtn.style.cssText =
        "padding: 10px 18px; border: none; border-radius: 6px; background: #2563eb; color: #fff; font-size: 15px; cursor: pointer;";

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      cancelBtn.style.cssText =
        "padding: 10px 18px; border: none; border-radius: 6px; background: #e5e7eb; color: #111; font-size: 15px; cursor: pointer;";

      btnRow.appendChild(captureBtn);
      btnRow.appendChild(cancelBtn);
      panel.appendChild(title);
      panel.appendChild(video);
      panel.appendChild(btnRow);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      let stream;

      const cleanup = () => {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
        }
        document.body.removeChild(overlay);
      };

      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "user" } })
        .then((s) => {
          stream = s;
          video.srcObject = stream;
        })
        .catch((err) => {
          cleanup();
          reject(new Error("Camera access nahi mila: " + err.message));
        });

      captureBtn.onclick = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        // Video mirrored dikhta hai (CSS scaleX(-1)) sirf preview ke liye —
        // actual capture normal (un-mirrored) honi chahiye taaki comparison
        // sahi ho, isliye canvas draw yahan mirror nahi karte.
        canvas.getContext("2d").drawImage(video, 0, 0);
        cleanup();
        resolve(canvas);
      };

      cancelBtn.onclick = () => {
        cleanup();
        reject(new Error("User ne camera cancel kar diya"));
      };
    });
  }

  /**
   * Ek image (canvas/img/File) me se face descriptor (128-number
   * "fingerprint" jo chehre ko represent karta hai) nikalta hai.
   */
  async function getFaceDescriptor(imageSource) {
    await loadModels();

    let element = imageSource;
    if (imageSource instanceof File) {
      element = await createImageBitmap(imageSource);
    }

    const detection = await window.faceapi
      .detectSingleFace(element, new window.faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      return null; // is image me koi chehra detect nahi hua
    }
    return detection.descriptor;
  }

  /**
   * MAIN FUNCTION — camera kholta hai, photo capture karwata hai, aur
   * usse document-photo (jo pehle upload hui thi) ke saath compare
   * karta hai.
   *
   * @param {File} documentPhotoFile - passport-size photo jo form me upload hui
   * @param {number} matchThreshold - default 0.6 (face-api.js recommended)
   *        — jitna kam distance utna zyada match; 0.6 se neeche = "same person"
   * @returns {Promise<{isMatch: boolean, distance: number, confidencePercent: number, capturedImage: HTMLCanvasElement}>}
   */
  async function verifyLiveFaceAgainstDocument(documentPhotoFile, matchThreshold = 0.6) {
    const [docDescriptor, capturedCanvas] = await Promise.all([
      getFaceDescriptor(documentPhotoFile),
      openCameraModal(),
    ]);

    if (!docDescriptor) {
      throw new Error(
        "Upload ki gayi document photo me chehra detect nahi hua — kripya clear front-facing photo upload karo."
      );
    }

    const liveDescriptor = await getFaceDescriptor(capturedCanvas);
    if (!liveDescriptor) {
      throw new Error("Camera se liya gaya photo me chehra detect nahi hua — kripya dobara try karo.");
    }

    const distance = window.faceapi.euclideanDistance(docDescriptor, liveDescriptor);
    const isMatch = distance < matchThreshold;
    // Distance ko rough "confidence %" me convert karna sirf UI-display
    // ke liye hai, koi official standard formula nahi hai.
    const confidencePercent = Math.max(0, Math.round((1 - distance / 1.0) * 100));

    return { isMatch, distance, confidencePercent, capturedImage: capturedCanvas };
  }

  return { loadModels, openCameraModal, getFaceDescriptor, verifyLiveFaceAgainstDocument };
})();
