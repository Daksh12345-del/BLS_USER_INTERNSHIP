"""
user_demo_recording.py
────────────────────────
Drives the browser through the USER_PORTAL pages, slowly and visibly,
for screen recording on Windows. NOT a pytest test — run it directly.

BEFORE RUNNING:
  1. Start Live Server on the USER_PORTAL folder (right-click it in
     VS Code -> "Open with Live Server"). Note the port it shows,
     e.g. http://127.0.0.1:5500 — set BASE_URL to match if different.
  2. Make sure your backend is running too (node server.js in
     backend-api), since login/dashboard/etc. need the API.
  3. In Command Prompt / PowerShell, set your test credentials:
         set BASE_URL=http://127.0.0.1:5500
         set TEST_USER_EMAIL=your_test_email@example.com
         set TEST_USER_PASSWORD=your_test_password
  4. Start your screen recording (Win+Alt+R for Xbox Game Bar, or hit
     Start Recording in OBS).
  5. Then run:  python user_demo_recording.py

Only the LOGIN step is fully automated end-to-end (it matches your
real test_login.py flow). The other pages just navigate + pause so
you can see them — fill in the TODO sections with real form data if
you want the script to fill fields too, or just narrate live while
it sits on each page.
"""

import time
import os
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:5500")
TEST_EMAIL = os.environ.get("TEST_USER_EMAIL", "")
TEST_PASSWORD = os.environ.get("TEST_USER_PASSWORD", "")

PAUSE = 2.0
LONG_PAUSE = 4.0


def pause(seconds=PAUSE):
    time.sleep(seconds)


def main():
    if not TEST_EMAIL or not TEST_PASSWORD:
        print("WARNING: TEST_USER_EMAIL / TEST_USER_PASSWORD not set. "
              "Login step will fail. Set them as env vars first.")

    options = webdriver.ChromeOptions()
    options.add_argument("--start-maximized")
    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 15)

    try:
        # ── 1. LOGIN ────────────────────────────────────────────────
        driver.get(f"{BASE_URL}/login/login.html")
        wait.until(EC.presence_of_element_located((By.ID, "pwdEmail")))
        pause(LONG_PAUSE)

        driver.find_element(By.ID, "pwdEmail").send_keys(TEST_EMAIL)
        pause(1)
        driver.find_element(By.ID, "pwdPass").send_keys(TEST_PASSWORD)
        pause(1)

        captcha_answer = driver.execute_script("return _captchaCode.pwd;")
        driver.find_element(By.ID, "pwdCaptchaInput").send_keys(captcha_answer)
        pause(1)

        driver.find_element(By.ID, "pwdLoginBtn").click()
        pause(LONG_PAUSE)

        # ── 2. DASHBOARD ────────────────────────────────────────────
        wait.until(EC.presence_of_element_located((By.ID, "dashContent")))
        pause(LONG_PAUSE)
        # Real IDs here if you want to highlight things:
        #   heroName, statusBody, apptBody, personalBody

        # ── 3. VISA APPLICATION ─────────────────────────────────────
        driver.get(f"{BASE_URL}/Visa application/index.html")
        pause(LONG_PAUSE)
        # TODO: fill fields to show OCR/face-verify in action, e.g.:
        # driver.find_element(By.ID, "dob").send_keys("1998-05-12")
        # pause(1)
        # driver.find_element(By.ID, "destinationCountry").send_keys("Spain")
        # pause(LONG_PAUSE)

        # ── 4. DOCUMENT UPLOAD / LOOKUP ──────────────────────────────
        driver.get(f"{BASE_URL}/Document/document.html")
        wait.until(EC.presence_of_element_located((By.ID, "refInput")))
        pause(LONG_PAUSE)
        # TODO: e.g. driver.find_element(By.ID, "refInput").send_keys("REF123")
        #       driver.find_element(By.ID, "lookupBtn").click()
        #       pause(LONG_PAUSE)

        # ── 5. APPOINTMENT BOOKING ───────────────────────────────────
        driver.get(f"{BASE_URL}/appointment/appointment.html")
        pause(LONG_PAUSE)
        # Real field IDs available: af_name, af_email, af_mobile,
        # af_passport, af_country, af_state, af_centre, af_purpose

        # ── 6. APPOINTMENT MANAGE ────────────────────────────────────
        driver.get(f"{BASE_URL}/appointment/manage.html")
        # manageMain is display:none by default and only revealed after an
        # async login/auth check, so wait for it to become VISIBLE rather
        # than just present in the DOM (otherwise this can resolve before
        # the page has actually finished showing it).
        wait.until(EC.visibility_of_element_located((By.ID, "manageMain")))
        pause(LONG_PAUSE)

        # ── 7. TRACK APPLICATION ──────────────────────────────────────
        driver.get(f"{BASE_URL}/track/track.html")
        wait.until(EC.presence_of_element_located((By.ID, "refInput")))
        pause(LONG_PAUSE)
        # TODO: driver.find_element(By.ID, "refInput").send_keys("REF123")
        #       driver.find_element(By.ID, "trackBtn").click()
        #       pause(LONG_PAUSE)

        print("USER_PORTAL demo flow complete. Stop your recording now.")
        pause(3)

    finally:
        driver.quit()


if __name__ == "__main__":
    main()