from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import json
import os
import traceback
import pytest

# ────────────────────────────────────────────
# Dashboard (dashboard.html) automation.
# Dashboard sirf logged-in users ko dikhta hai, isliye pehle password
# login karte hain (test_login_success.py jaisa hi flow), phir dashboard
# pe redirect hone ka wait karte hain aur uske cards check karte hain.
#
# NOTE: Agar ye test fail ho "Dashboard turant login page pe bounce kar
# diya" jaisa error de — ye ek real bug tha jo humne pakda: login.js
# `bls_token` sessionStorage mein set hi nahi karta tha, jabki
# dashboard.js dono (`bls_logged_email` + `bls_token`) maangta hai.
# Fix already `login.js` mein daal diya gaya hai (loginSuccess ab token
# bhi save karta hai) — agar tumhare paas purana login.js hai jisme ye
# fix nahi hai, ye test isi wajah se fail hoga.
# ────────────────────────────────────────────

SESSION_FILE = "session_data.json"
LOGIN_URL = "http://127.0.0.1:5500/login/login.html"
DASHBOARD_URL_FRAGMENT = "dashboard/dashboard.html"

# test_login_success.py jaisa hi hardcoded test account — agar tumhare
# paas session_data.json mein email/password already hai toh wahi use
# kar lo, warna neeche wale defaults chalenge.
DEFAULT_EMAIL = "gradewallah@gmail.com"
DEFAULT_PASSWORD = "K9WdA6fueCjUspL"


def _get_login_credentials():
    if os.path.exists(SESSION_FILE):
        with open(SESSION_FILE, "r", encoding="utf-8") as f:
            session_data = json.load(f)
        email = session_data.get("email") or DEFAULT_EMAIL
        password = session_data.get("password") or DEFAULT_PASSWORD
        return email, password
    return DEFAULT_EMAIL, DEFAULT_PASSWORD


def test_dashboard_loads_after_login():
    email, password = _get_login_credentials()
    print("Login kar rahe hain:", email)

    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 15)

    try:
        # ── STEP 1: Login page pe jaake login karo ──────────────────
        driver.get(LOGIN_URL)
        time.sleep(2)

        driver.find_element(By.ID, "pwdEmail").send_keys(email)
        driver.find_element(By.ID, "pwdPass").send_keys(password)

        captcha_answer = driver.execute_script("return _captchaCode.pwd;")
        print("Sahi CAPTCHA yeh hai:", captcha_answer)
        driver.find_element(By.ID, "pwdCaptchaInput").send_keys(captcha_answer)

        time.sleep(1)
        driver.find_element(By.ID, "pwdLoginBtn").click()
        print("✅ Login button click kiya, dashboard redirect ka wait kar rahe hain...")

        # ── STEP 2: Dashboard pe redirect hone ka wait karo ─────────
        wait.until(EC.url_contains(DASHBOARD_URL_FRAGMENT))
        print("✅ Dashboard URL pe redirect ho gaya:", driver.current_url)

        # 🔒 Regression check for the bls_token bug — agar ye missing hai,
        # dashboard.js turant wapas login.html pe bhej dega, aur agla
        # assertion (URL check) khud hi fail ho jayega. Ye extra check
        # sirf isliye hai taaki failure ka *reason* clearly print ho.
        stored_token = driver.execute_script("return sessionStorage.getItem('bls_token');")
        assert stored_token, (
            "❌ sessionStorage mein 'bls_token' nahi mila — login.js token save nahi kar raha, "
            "isliye dashboard.js login page pe wapas bhej dega."
        )
        print("✅ bls_token sessionStorage mein mil gaya — session valid hai")

        # ── STEP 3: Loading state khatam hone ka wait karo ──────────
        wait.until(lambda d: d.find_element(By.ID, "dashLoading").value_of_css_property("display") == "none")
        assert driver.find_element(By.ID, "dashContent").value_of_css_property("display") != "none", (
            "❌ Dashboard content dikh nahi raha — dashLoading hat gaya par dashContent show nahi hua"
        )
        print("✅ Dashboard content load ho gaya (loading spinner hat gaya)")

        # ── STEP 4: Avatar / hero section check ─────────────────────
        hero_name = driver.find_element(By.ID, "heroName").text
        assert hero_name and hero_name != "—", "❌ heroName khaali hai"
        print("✅ Welcome message:", hero_name)

        avatar_initial = driver.find_element(By.ID, "avatarInitial").text
        assert avatar_initial and avatar_initial != "?", "❌ Avatar initial set nahi hua"
        print("✅ Avatar initial:", avatar_initial)

        # ── STEP 5: Teeno cards render hui ya nahi (Personal / Status / Appointment) ──
        personal_body = driver.find_element(By.ID, "personalBody").text
        assert personal_body.strip() != "", "❌ Personal Details card khaali hai"
        print("✅ Personal Details card render hua")

        status_body = driver.find_element(By.ID, "statusBody").text
        assert status_body.strip() != "", "❌ Application Status card khaali hai"
        print("✅ Application Status card render hua:")
        print("   ", status_body.replace("\n", " | "))

        appt_body = driver.find_element(By.ID, "apptBody").text
        assert appt_body.strip() != "", "❌ Appointment card khaali hai"
        print("✅ Appointment card render hua:")
        print("   ", appt_body.replace("\n", " | "))

        # ── STEP 6: Sidebar links sab present hain ──────────────────
        nav_links = driver.find_elements(By.CSS_SELECTOR, ".side-nav a")
        assert len(nav_links) >= 4, f"❌ Expected kam se kam 4 sidebar links, mile {len(nav_links)}"
        print(f"✅ Sidebar mein {len(nav_links)} links mile")

        # ── STEP 7: "View Application Form" modal khulta hai ya nahi (agar link mojood hai) ──
        view_form_links = driver.find_elements(By.ID, "viewFormLink")
        if view_form_links:
            view_form_links[0].click()
            wait.until(lambda d: "show" in d.find_element(By.ID, "vfModalOverlay").get_attribute("class"))
            print("✅ 'View Application Form' modal khul gaya")

            vf_body_text = driver.find_element(By.ID, "vfModalBody").text
            assert vf_body_text.strip() != "", "❌ Modal khula par andar kuch content nahi hai"
            print("✅ Modal ke andar application form ka data dikh raha hai")

            driver.find_element(By.ID, "vfModalCloseBtn").click()
            time.sleep(0.5)
            overlay_class = driver.find_element(By.ID, "vfModalOverlay").get_attribute("class")
            assert "show" not in overlay_class, "❌ Modal close button se modal band nahi hua"
            print("✅ Modal close button se band ho gaya")
        else:
            print("ℹ️ 'View Application Form' link nahi mila — shayad abhi tak koi application submit nahi hui, skip kar rahe hain")

        # ── STEP 8: Avatar dropdown open hota hai ya nahi ───────────
        driver.find_element(By.ID, "avatarBtn").click()
        time.sleep(0.5)
        menu_class = driver.find_element(By.ID, "avatarMenu").get_attribute("class")
        assert "open" in menu_class, "❌ Avatar dropdown open nahi hua click karne pe"
        print("✅ Avatar dropdown khul gaya")

        dd_email = driver.find_element(By.ID, "ddEmail").text
        assert dd_email.strip().lower() == email.strip().lower(), (
            f"❌ Dropdown mein email mismatch: expected {email}, mila {dd_email}"
        )
        print("✅ Dropdown mein sahi email dikh raha hai:", dd_email)

        print("\n🎉 TEST PASSED — dashboard sahi se load aur render ho raha hai.")

    except AssertionError as ae:
        print("❌ TEST FAILED (assertion):", ae)
        raise
    except Exception:
        print("❌ Script crash hui, neeche poora error hai:")
        traceback.print_exc()
        raise

    finally:
        time.sleep(5)
        driver.quit()


if __name__ == "__main__":
    test_dashboard_loads_after_login()