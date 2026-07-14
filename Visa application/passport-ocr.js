/**
 * passport-ocr.js
 * ─────────────────────────────────────────────
 * Passport ke JPG/PDF se data nikalta hai — poora client-side (browser me),
 * koi backend/server nahi chahiye. Free hai (Tesseract.js OCR engine).
 *
 * KAISE KAAM KARTA HAI:
 * 1. Image (ya PDF ka pehla page) ko OCR se text me convert karta hai
 * 2. Us text me se MRZ (Machine Readable Zone — passport ke neeche wali
 *    "P<INDDOE<<JOHN<<<<<<<<<<..." jaisi 2 lines) dhoondta hai
 * 3. MRZ ke har field ka CHECK DIGIT verify karta hai (ICAO 9303 standard)
 *    — isse pata chal jata hai OCR ne sahi padha ya nahi (galat digit ho
 *    to checksum fail ho jayega). Yehi wajah hai MRZ-based extraction
 *    normal OCR se zyada reliable hoti hai.
 *
 * ⚠️ ZAROORI LIMITATION (isko chhupana nahi hai):
 * MRZ me sirf yeh fields hoti hai: Name, Passport Number, Nationality,
 * Date of Birth, Sex, Expiry Date.
 * "Issue Date" aur "Place of Issue / Issuing Authority" MRZ ka HISSA
 * NAHI HAI (ICAO standard aisa hi hai) — yeh sirf passport ke normal
 * printed text me hoti hai. Is file me in dono ke liye ek "best-effort"
 * plain-OCR fallback bhi diya hai, lekin yeh MRZ jaisa 100% reliable
 * NAHI hoga — isliye UI me hamesha user ko final values verify/edit
 * karne dena chahiye, blindly trust nahi karna chahiye.
 *
 * DEPENDENCIES (apne HTML me <head> ya </body> se pehle add karo):
 *   <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
 *   <script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
 *   <script src="passport-ocr.js"></script>
 */

const PassportOCR = (() => {
  // pdf.js ko apna worker file batana zaroori hai, warna PDF render nahi hoga
  const PDFJS_WORKER_URL =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  function ensurePdfWorkerConfigured() {
    if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    }
  }

  /**
   * File (image ya PDF) ko ek HTMLCanvasElement me convert karta hai,
   * jise OCR ke liye use kar sakein.
   */
  async function fileToCanvas(file) {
    if (file.type === "application/pdf") {
      ensurePdfWorkerConfigured();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1); // sirf pehla page (passport data page)
      const viewport = page.getViewport({ scale: 2.5 }); // zyada scale = behtar OCR accuracy

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas;
    }

    // Plain image (jpg/png/etc.)
    const imageBitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    canvas.getContext("2d").drawImage(imageBitmap, 0, 0);
    return canvas;
  }

  /**
   * ICAO 9303 check-digit algorithm. MRZ ke har numeric field ke saath
   * ek check digit hota hai jo confirm karta hai OCR ne sahi padha.
   */
  function charValue(ch) {
    if (ch === "<") return 0;
    if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
    if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 55; // A=10 ... Z=35
    return 0;
  }

  function computeCheckDigit(str) {
    const weights = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < str.length; i++) {
      sum += charValue(str[i]) * weights[i % 3];
    }
    return sum % 10;
  }

  function isDigit(ch) {
    return ch >= "0" && ch <= "9";
  }

  /**
   * OCR se aaye raw text me se MRZ ki 2 lines dhoondta hai.
   * TD3 (passport) format: har line 44 characters ki hoti hai,
   * pehli line "P<" se shuru hoti hai.
   */
  function findMrzLines(rawText) {
    const cleaned = rawText
      .split("\n")
      .map((l) => l.replace(/\s+/g, "").toUpperCase())
      .filter((l) => l.length > 20 && l.includes("<"));

    // "P<" se shuru hone wali line dhoondo (passport MRZ ki pehli line)
    const line1Index = cleaned.findIndex((l) => l.startsWith("P<"));

    if (line1Index === -1 || !cleaned[line1Index + 1]) {
      return null;
    }

    // Line ko 44 characters tak pad/truncate karo (OCR thodi kam/zyada de sakta hai)
    const pad44 = (s) => (s.length >= 44 ? s.slice(0, 44) : s.padEnd(44, "<"));

    return {
      line1: pad44(cleaned[line1Index]),
      line2: pad44(cleaned[line1Index + 1]),
    };
  }

  /**
   * MRZ ki 2 lines se saari fields nikalta hai + check digits verify karta hai.
   */
  function parseMrz(line1, line2) {
    // ── LINE 1: P<COUNTRYSURNAME<<GIVENNAMES<<<<<<<<<<<<<<<<<<<<<
    const issuingCountry = line1.slice(2, 5).replace(/</g, "");
    const namesPart = line1.slice(5);
    const [surnameRaw, givenNamesRaw = ""] = namesPart.split("<<");
    const surname = surnameRaw.replace(/</g, " ").trim();
    const givenNames = givenNamesRaw.replace(/</g, " ").trim();

    // ── LINE 2: PASSPORTNO+CHECK+NATIONALITY+DOB+CHECK+SEX+EXPIRY+CHECK+PERSONALNO+CHECK+COMPOSITECHECK
    const passportNumberRaw = line2.slice(0, 9);
    const passportNumberCheck = line2[9];
    const nationality = line2.slice(10, 13).replace(/</g, "");
    const dobRaw = line2.slice(13, 19); // YYMMDD
    const dobCheck = line2[19];
    const sex = line2[20];
    const expiryRaw = line2.slice(21, 27); // YYMMDD
    const expiryCheck = line2[27];
    const personalNumberRaw = line2.slice(28, 42);
    const personalNumberCheck = line2[42];
    const compositeCheck = line2[43];

    const passportNumber = passportNumberRaw.replace(/</g, "");

    // Check digits verify karo — yeh batayega OCR ne sahi padha ya nahi
    const passportNumberValid = computeCheckDigit(passportNumberRaw) === Number(passportNumberCheck);
    const dobValid = computeCheckDigit(dobRaw) === Number(dobCheck) && isDigit(dobCheck);
    const expiryValid = computeCheckDigit(expiryRaw) === Number(expiryCheck) && isDigit(expiryCheck);

    const compositeStr =
      passportNumberRaw + passportNumberCheck + dobRaw + dobCheck + expiryRaw + expiryCheck +
      personalNumberRaw + personalNumberCheck;
    const compositeValid = computeCheckDigit(compositeStr) === Number(compositeCheck) && isDigit(compositeCheck);

    const formatYYMMDD = (raw) => {
      if (!/^\d{6}$/.test(raw)) return null;
      const yy = raw.slice(0, 2);
      const mm = raw.slice(2, 4);
      const dd = raw.slice(4, 6);
      // Heuristic: 00-30 => 20XX, 31-99 => 19XX (passport dates ke liye standard heuristic)
      const century = Number(yy) <= 30 ? "20" : "19";
      return `${dd}/${mm}/${century}${yy}`; // DD/MM/YYYY
    };

    return {
      fullName: `${givenNames} ${surname}`.trim(),
      surname,
      givenNames,
      passportNumber,
      nationality,
      issuingCountry,
      sex: sex === "M" || sex === "F" ? sex : null,
      dateOfBirth: formatYYMMDD(dobRaw),
      dateOfExpiry: formatYYMMDD(expiryRaw),
      // ── Yeh confidence flags UI me dikhane chahiye — agar false hai,
      // to us field ko highlight karke user se manually verify karwao.
      confidence: {
        passportNumber: passportNumberValid,
        dateOfBirth: dobValid,
        dateOfExpiry: expiryValid,
        overall: compositeValid,
      },
    };
  }

  /**
   * BEST-EFFORT fallback: Issue Date / Place of Issue MRZ me nahi hoti,
   * isliye raw OCR text me common labels dhoond ke try karte hai.
   * ⚠️ Yeh MRZ jaisa reliable NAHI hai — UI me "verify karo" flag ke
   * saath hi dikhana chahiye.
   */
  function bestEffortExtraIssueFields(rawText) {
    const text = rawText.replace(/\n/g, " ");
    const dateRegex = /(\d{2}[\/\-. ]\d{2}[\/\-. ]\d{4}|\d{2}[\/\-. ][A-Z]{3}[\/\-. ]\d{4})/i;

    let dateOfIssue = null;
    const issueMatch = text.match(/(?:date\s*of\s*issue|issued\s*on|issue\s*date)[:\s]*([\s\S]{0,20})/i);
    if (issueMatch) {
      const m = issueMatch[1].match(dateRegex);
      if (m) dateOfIssue = m[0];
    }

    let placeOfIssue = null;
    const placeMatch = text.match(/(?:place\s*of\s*issue|authority)[:\s]*([A-Z ,.]{3,40})/i);
    if (placeMatch) {
      placeOfIssue = placeMatch[1].trim();
    }

    return { dateOfIssue, placeOfIssue };
  }

  /**
   * MAIN FUNCTION — isko call karo.
   * @param {File} file - user ne jo passport image/PDF upload ki
   * @param {function} onProgress - optional callback (0-100 progress %)
   * @returns {Promise<object>} extracted fields + confidence flags
   */
  async function extractFromFile(file, onProgress) {
    if (!window.Tesseract) {
      throw new Error("Tesseract.js load nahi hua — <script> tag check karo.");
    }

    const canvas = await fileToCanvas(file);

    const result = await window.Tesseract.recognize(canvas, "eng", {
      logger: (info) => {
        if (onProgress && info.status === "recognizing text") {
          onProgress(Math.round(info.progress * 100));
        }
      },
    });

    const rawText = result.data.text;
    const mrzLines = findMrzLines(rawText);

    if (!mrzLines) {
      return {
        success: false,
        error:
          "MRZ (passport ke neeche wali 2 lines) nahi mili. Photo clear nahi hai ya crop me MRZ area nahi aaya — kripya bottom strip clearly dikhne wali photo upload karo.",
        rawText,
      };
    }

    const parsed = parseMrz(mrzLines.line1, mrzLines.line2);
    const extra = bestEffortExtraIssueFields(rawText);

    return {
      success: true,
      ...parsed,
      dateOfIssue: extra.dateOfIssue, // ⚠️ best-effort, verify karwao
      placeOfIssue: extra.placeOfIssue, // ⚠️ best-effort, verify karwao
      rawMrz: mrzLines,
      rawText,
    };
  }

  return { extractFromFile };
})();
