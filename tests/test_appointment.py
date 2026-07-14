from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import json
import os
import traceback
import pytest

# ────────────────────────────────────────────
# Yeh file "registration_test.py" (test_visa_application.py) ke baad chalti
# hai. Registration wali file ek naya driver/browser use karti hai, aur yeh
# file bhi apna alag naya driver kholti hai — dono ka connection sirf
# SESSION_FILE (session_data.json) ke through hai.
#
# Kyunki appointment.js login check "sessionStorage.bls_logged_email"
# se karta hai (aur sessionStorage sirf usi tab/browser session mein
# rehta hai), hum yahan naye driver mein page load karke wahi key
# manually set karte hain — jaise ki user pehle se "logged in" ho.
# ────────────────────────────────────────────

SESSION_FILE = "session_data.json"
APPOINTMENT_URL = "http://127.0.0.1:5500/appointment/appointment.html"

# FIX: hardcoded Windows path ki jagah dynamic relative path — khud test
# file ke location se sample_files/ folder dhoondh lega (Windows + Linux
# dono pe, GitHub ke Ubuntu runner samet, kaam karega)
BASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample_files")


# FIX: pehle sara code module-level pe tha (import hote hi chal jaata tha),
# isliye pytest ko koi "test_*" function nahi milta tha -> "collected 0
# items" (exit code 5). Ab poora flow ek function ke andar hai.
def test_appointment_booking():
    if not os.path.exists(SESSION_FILE):
        pytest.skip(f"'{SESSION_FILE}' nahi mili. Pehle registration test (test_visa_application.py) run karo.")

    with open(SESSION_FILE, "r", encoding="utf-8") as f:
        session_data = json.load(f)

    test_email = session_data["email"]
    print("Continue kar rahe hain is email ke saath:", test_email)

    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 15)  # thoda badhaya, Supabase calls ke liye

    try:
        # ────────────────────────────────────────────
        # STEP 1: Page pehli baar kholo taaki origin set ho jaye,
        # phir sessionStorage set karke refresh karo — tabhi
        # appointment.js ka DOMContentLoaded check "logged in" dekhega.
        # ────────────────────────────────────────────
        driver.get(APPOINTMENT_URL)
        time.sleep(1)
        driver.execute_script(
            "window.sessionStorage.setItem('bls_logged_email', arguments[0]);",
            test_email,
        )
        driver.refresh()

        wait.until(EC.visibility_of_element_located((By.ID, "apptMain")))
        print("✅ Appointment page khul gaya (logged-in state simulate ho gaya), form auto-filled hoga")

        # Registration se auto-fill hone ka thoda time do (Supabase call async hai)
        time.sleep(2)

        # Purpose of visit select karo (static options, HTML mein hi hardcoded hain)
        Select(driver.find_element(By.ID, "af_purpose")).select_by_index(1)
        print("✅ Purpose select kiya")

        # af_country dropdown Supabase se ASYNC load hota hai (loadLocations()
        # ke andar). Options ke actually load hone ka wait karte hain.
        wait.until(lambda d: len(Select(d.find_element(By.ID, "af_country")).options) > 1)
        Select(driver.find_element(By.ID, "af_country")).select_by_index(1)
        print("✅ Country select kiya")
        time.sleep(1)

        wait.until(lambda d: d.find_element(By.ID, "af_state").is_enabled())
        Select(driver.find_element(By.ID, "af_state")).select_by_index(1)
        print("✅ State select kiya")
        time.sleep(1)

        # FIX: yahi line CI me TimeoutException de rahi thi (test_appointment.py:85).
        # 'wait' ka default timeout 15s tha jo CI ke slower real-Supabase
        # network ke liye kaafi nahi tha. Isliye is specific wait ke liye
        # alag se lamba (30s) WebDriverWait use kiya hai — sirf yahan,
        # baaki waits ko unnecessarily slow nahi karna.
        WebDriverWait(driver, 30).until(
            lambda d: d.find_element(By.ID, "af_centre").is_enabled(),
            message="❌ 30 second ke andar bhi Centre dropdown enable nahi hua — is State ke liye koi Centre configured nahi hai ya Supabase call CI me slow hai",
        )
        Select(driver.find_element(By.ID, "af_centre")).select_by_index(1)
        print("✅ Centre select kiya")

        # Agar koi extra documents maange (dynamic hote hain)
        time.sleep(1)
        doc_section = driver.find_element(By.ID, "apptDocSection")
        if doc_section.is_displayed():
            print("Extra documents maange gaye hain, unko bhi upload karte hain")
            file_inputs = doc_section.find_elements(By.CSS_SELECTOR, "input[type='file']")
            for inp in file_inputs:
                # FIX: BASE_PATH + r"\photo.jpg" sirf Windows pe kaam karta
                # tha (backslash). os.path.join dono OS pe sahi separator
                # use karega.
                inp.send_keys(os.path.join(BASE_PATH, "photo.jpg"))
                time.sleep(1)
            number_inputs = doc_section.find_elements(By.CSS_SELECTOR, "input[type='text']")
            for ninp in number_inputs:
                ninp.send_keys("TEST123456")

        print("✅ Appointment details bhar di")

        # "Choose Date & Time" button click karo
        driver.find_element(By.XPATH, "//button[@onclick='goToSlots()']").click()
        print("✅ Date/Time step khula")

        # Calendar mein pehli available date choose karo.
        # sticky "header-main" element date ke upar overlap karta hai,
        # isliye normal .click() par ElementClickInterceptedException aata
        # hai. scrollIntoView(center) + JS click se yeh bypass ho jaata hai.
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".cal-day.available")))
        available_dates = driver.find_elements(By.CSS_SELECTOR, ".cal-day.available")
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", available_dates[0])
        time.sleep(0.5)
        driver.execute_script("arguments[0].click();", available_dates[0])
        print("✅ Date select ki")

        # Pehla available time slot choose karo
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".slot-btn:not(.booked)")))
        time.sleep(1)
        available_slots = driver.find_elements(By.CSS_SELECTOR, ".slot-btn:not(.booked)")
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", available_slots[0])
        time.sleep(0.5)
        driver.execute_script("arguments[0].click();", available_slots[0])
        print("✅ Time slot select kiya")

        # Confirm Slot button click karo
        wait.until(EC.element_to_be_clickable((By.ID, "btnConfirm")))
        confirm_btn = driver.find_element(By.ID, "btnConfirm")
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", confirm_btn)
        time.sleep(0.5)
        driver.execute_script("arguments[0].click();", confirm_btn)
        print("✅ Confirm panel khula")

        # Final Submit
        time.sleep(1)
        submit_btn = driver.find_element(By.ID, "btnSubmit")
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", submit_btn)
        time.sleep(0.5)
        driver.execute_script("arguments[0].click();", submit_btn)
        time.sleep(3)

        # FIX: pehle yahan nested try/except tha jo error ko sirf print
        # karke nigal jaata tha — test hamesha "pass" dikhta chahe booking
        # fail ho jaye. Ab assert use kiya hai taaki asli failure CI me
        # bhi failure ki tarah dikhe.
        final_ref = driver.find_element(By.ID, "finalRef").text
        assert final_ref, "❌ Appointment booking fail hui ya result nahi mila"
        print("✅✅✅ APPOINTMENT BOOKED SUCCESSFULLY — Reference:", final_ref)

    except Exception:
        # FIX: pehle exception yahin silently nigal li jaati thi (sirf
        # print hota tha), isliye pytest ko pata hi nahi chalta tha ki
        # test fail hua. Ab traceback print hone ke baad exception ko
        # "raise" kiya hai taaki pytest ise FAIL ki tarah report kare.
        print("❌ Script crash hui, neeche poora error hai:")
        traceback.print_exc()
        raise

    finally:
        time.sleep(5)
        driver.quit()


if __name__ == "__main__":
    test_appointment_booking()