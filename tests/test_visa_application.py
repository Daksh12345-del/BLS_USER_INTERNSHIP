from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import random
import string
import json
import os
import sys
import pytest

# FIX: pehle 'sys.path.append('../utils')' tha, jo current working
# directory (CWD) pe depend karta tha — agar pytest kahin aur se (root se)
# chalaya jaaye to yeh galat jagah point karta aur import silently fail ho
# jaata. Ab path is script ki apni file-location se relative hai, isliye
# CWD kuch bhi ho, hamesha sahi 'utils/' folder milega.
_UTILS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "utils")
sys.path.append(_UTILS_PATH)
from mailinator_helper import get_otp_from_mailinator

# ────────────────────────────────────────────
# Yeh file SIRF registration karti hai.
# Registration ke baad session/reference data ek JSON file mein
# save ho jata hai (SESSION_FILE), jise appointment_test.py
# padhke aage ka appointment booking flow chalata hai.
# Dono files isi tarah se "connected" hain.
# ────────────────────────────────────────────

SESSION_FILE = "session_data.json"


def random_passport_number():
    letter = random.choice(string.ascii_uppercase)
    digits = ''.join(random.choices(string.digits, k=7))
    return letter + digits


# FIX: pehle sara code module-level pe tha, isliye pytest ko koi "test_*"
# function nahi milta tha -> "collected 0 items" (exit code 5). Ab poora
# flow ek function ke andar hai. Har jagah jahan pehle sirf print hoke
# script chup-chap aage badh jaati thi (OTP na milna, registration fail
# hona, banner na milna), ab "pytest.fail()"/"assert" use kiya hai taaki
# asli failure CI me FAIL ki tarah dikhe.
def test_visa_application_registration():
    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 10)

    try:
        driver.get("http://127.0.0.1:5500/Visa application/index.html")
        time.sleep(2)

        # Short Stay select karo
        driver.find_element(By.ID, "cardShort").click()

        wait.until(EC.visibility_of_element_located((By.ID, "firstName")))

        # PERSONAL INFO
        driver.find_element(By.ID, "firstName").send_keys("Test")
        driver.find_element(By.ID, "lastName").send_keys("User")
        driver.find_element(By.ID, "dob").send_keys("01011995")
        Select(driver.find_element(By.ID, "gender")).select_by_visible_text("Male")
        Select(driver.find_element(By.ID, "nationality")).select_by_visible_text("Indian")

        # Har baar unique email (taaki "already registered" na aaye)
        test_inbox = "blstest" + ''.join(random.choices(string.digits, k=6))
        test_email = test_inbox + "@mailinator.com"
        test_mobile = "9876543210"
        test_password = "TestPass@123"
        print("Is baar ka email:", test_email)

        driver.find_element(By.ID, "email").send_keys(test_email)
        driver.find_element(By.ID, "mobileNumber").send_keys(test_mobile)

        # EMAIL VERIFY (OTP)
        driver.find_element(By.ID, "verifyEmailBtn").click()
        print("OTP bhej diya hai, Mailinator se check kar rahe hain...")

        otp = get_otp_from_mailinator(test_inbox)

        # FIX: pehle "if otp: ... else: print('OTP nahi mila')" tha — OTP na
        # milne par bhi test silently pass ho jaata (koi assertion nahi thi).
        # Ab assert use kiya hai taaki yeh CI me asli failure ki tarah dikhe.
        assert otp, "❌ OTP nahi mila time ke andar"
        print("✅ OTP mila:", otp)

        wait.until(EC.visibility_of_element_located((By.ID, "regOtp0")))

        for i in range(6):
            otp_box = wait.until(EC.element_to_be_clickable((By.ID, f"regOtp{i}")))
            otp_box.send_keys(otp[i])

        time.sleep(3)
        print("OTP bhar diya, auto-verify hona chahiye")

        wait.until(EC.visibility_of_element_located((By.ID, "passportNumber")))
        print("✅ Form unlock ho gaya, passport info bharte hain")

        # PASSPORT INFO (har baar unique passport number)
        passport_no = random_passport_number()
        print("Is baar ka passport number:", passport_no)

        driver.find_element(By.ID, "passportNumber").send_keys(passport_no)
        driver.find_element(By.ID, "passportIssue").send_keys("01012022")
        driver.find_element(By.ID, "passportExpiry").send_keys("01012032")
        driver.find_element(By.ID, "placeOfIssue").send_keys("Delhi, India")
        driver.find_element(By.ID, "issuingAuth").send_keys("Passport Seva Kendra")

        # TRAVEL INFO
        Select(driver.find_element(By.ID, "visaType")).select_by_index(1)
        Select(driver.find_element(By.ID, "destinationCountry")).select_by_index(1)
        time.sleep(1)

        wait.until(lambda d: d.find_element(By.ID, "appointmentState").is_enabled())
        Select(driver.find_element(By.ID, "appointmentState")).select_by_index(1)
        time.sleep(1)

        wait.until(lambda d: d.find_element(By.ID, "appointmentCity").is_enabled())
        Select(driver.find_element(By.ID, "appointmentCity")).select_by_index(1)

        driver.find_element(By.ID, "travelDate").send_keys("01092026")
        driver.find_element(By.ID, "returnDate").send_keys("15092026")

        driver.find_element(By.ID, "purposeOfVisit").send_keys("Tourist visit to Spain for sightseeing")

        print("✅ Passport aur travel info bhar di")

        # ────────────────────────────────────────────
        # DOCUMENT UPLOAD (required documents)
        #
        # base_path is test file ke apne folder (jaha ye .py file khud
        # hai) ke andar 'sample_files' folder dhoondta hai. Yeh Windows
        # aur Linux dono pe kaam karega, kyunki path OS ke hisaab se
        # khud-ba-khud sahi format (\ ya /) me ban jata hai.
        # ────────────────────────────────────────────
        base_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample_files")

        driver.find_element(By.ID, "doc_photo").send_keys(os.path.join(base_path, "photo.jpg"))
        time.sleep(3)  # face detection check hone ka time do

        driver.find_element(By.ID, "doc_pan_card").send_keys(os.path.join(base_path, "pan_card.jpg"))
        driver.find_element(By.ID, "docnum_pan_card").send_keys("ABCDE1234F")

        driver.find_element(By.ID, "doc_aadhar_card").send_keys(os.path.join(base_path, "aadhar_card.jpg"))
        driver.find_element(By.ID, "docnum_aadhar_card").send_keys("123456789012")

        driver.find_element(By.ID, "doc_signature").send_keys(os.path.join(base_path, "signature.jpg"))

        time.sleep(2)
        print("✅ Documents upload kar diye")

        # PASSWORD
        driver.find_element(By.ID, "regPassword").send_keys(test_password)
        driver.find_element(By.ID, "regPasswordConfirm").send_keys(test_password)

        # CAPTCHA (script.js mein add ki hui debug hook se nikala)
        reg_captcha = driver.execute_script("return window._regCaptchaDebug.reg;")
        print("Registration CAPTCHA:", reg_captcha)
        driver.find_element(By.ID, "regCaptchaInput").send_keys(reg_captcha)

        # CHECKBOXES
        driver.find_element(By.ID, "tnc").click()
        driver.find_element(By.ID, "consent").click()
        driver.find_element(By.ID, "authentic").click()

        time.sleep(1)

        # SUBMIT
        driver.find_element(By.ID, "submitBtn").click()

        # RESULT CHECK
        # FIX: pehle sirf "time.sleep(4)" karke result check hota tha.
        # CI ka network (real Supabase backend tak) local machine se
        # dheema hai — 4 second me registration process complete hi
        # nahi hota tha, isliye check karte waqt na success dikhta tha na
        # error (dono empty) -> confusing "Registration fail hua:" (blank).
        # Ab jab tak success ya error, dono mein se koi ek nazar na aaye,
        # tab tak poll karte hain (max 25 second) — bilkul waisa hi jaisa
        # test_document.py/test_track.py mein result_or_error ke liye
        # kiya tha.
        def _registration_result_ready(d):
            try:
                success_shown = d.find_element(By.ID, "successBanner").is_displayed()
            except Exception:
                success_shown = False
            try:
                error_shown = bool(d.find_element(By.ID, "errorMsg").text.strip())
            except Exception:
                error_shown = False
            return success_shown or error_shown

        WebDriverWait(driver, 25).until(
            _registration_result_ready,
            message="❌ 25 second ke andar registration ka result (success ya error) nahi aaya",
        )

        try:
            success = driver.find_element(By.ID, "successBanner")
        except Exception:
            pytest.fail("❌ Success/error banner nahi mila — kuch galat hua")

        if not success.is_displayed():
            error = driver.find_element(By.ID, "errorMsg").text
            pytest.fail(f"❌ Registration fail hua: {error}")

        ref = driver.find_element(By.ID, "refNumber").text
        assert ref, "❌ Reference number empty aaya"
        print("✅✅✅ REGISTRATION SUCCESSFUL — Reference Number:", ref)

        # ────────────────────────────────────────────
        # Yahi pe humara kaam khatam. Appointment booking
        # ab test_appointment.py ka kaam hai — usko chalne
        # ke liye zaroori data yahan JSON file mein save
        # kar dete hain.
        # ────────────────────────────────────────────
        session_data = {
            "email": test_email,
            "password": test_password,
            "mobile": test_mobile,
            "passport_number": passport_no,
            "ref_number": ref,
        }
        with open(SESSION_FILE, "w", encoding="utf-8") as f:
            json.dump(session_data, f, indent=2)

        print(f"✅ Session data '{SESSION_FILE}' mein save ho gaya.")
        print("Ab 'test_appointment.py' run karo — wahi appointment booking continue karega.")

    finally:
        time.sleep(3)
        driver.quit()


# ────────────────────────────────────────────
# NEGATIVE PATH: invalid email must be rejected before an OTP is sent.
#
# This does NOT need Mailinator or the full registration flow — it only
# exercises the client-side check inside doSendRegOtp() (script.js),
# which is supposed to reject a malformed email before ever calling
# supabase.auth.signInWithOtp(). If that check is ever removed or
# broken, this test is what would catch it (previously nothing did —
# the only email-related test was the happy path in
# test_visa_application_registration, which always used a valid,
# freshly-generated address).
# ────────────────────────────────────────────
def test_visa_application_invalid_email_rejected():
    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 10)

    try:
        driver.get("http://127.0.0.1:5500/Visa application/index.html")
        wait.until(EC.visibility_of_element_located((By.ID, "cardShort")))
        driver.find_element(By.ID, "cardShort").click()

        wait.until(EC.visibility_of_element_located((By.ID, "email")))
        email_input = driver.find_element(By.ID, "email")
        email_input.send_keys("not-a-valid-email")
        driver.find_element(By.ID, "verifyEmailBtn").click()

        # The email field should get the .error class and its .err-msg
        # sibling should show the validation message.
        wait.until(lambda d: "error" in email_input.get_attribute("class"))

        err_text = driver.execute_script(
            "var f = document.getElementById('email').closest('.field');"
            "var e = f ? f.querySelector('.err-msg') : null;"
            "return e ? e.textContent : null;"
        )
        assert err_text, "Expected an inline error message for an invalid email"
        assert "valid email" in err_text.lower(), f"Unexpected error text: {err_text}"

        # Most importantly: the OTP panel must never open for a bad
        # email — otherwise an invalid address could still trigger a
        # real Supabase OTP send.
        otp_panels = driver.find_elements(By.ID, "otpVerifyPanel")
        assert not any("show" in p.get_attribute("class") for p in otp_panels), \
            "OTP verification panel should not open when the email is invalid"

        print("PASS: invalid email was rejected and no OTP panel was opened")

    finally:
        driver.quit()


if __name__ == "__main__":
    test_visa_application_registration()
    test_visa_application_invalid_email_rejected()