from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
import time
import json
import os
import traceback
import pytest

# ────────────────────────────────────────────
# Track Application (track.html) automation — HAPPY PATH ONLY.
# Public lookup hai (Reference Number + Passport Number), koi login
# guard nahi. Isliye registration ke baad hi chalao taaki
# session_data.json mein ref_number aur passport_number mil jayein.
# ────────────────────────────────────────────

SESSION_FILE = "session_data.json"
TRACK_URL = "http://127.0.0.1:5500/track/track.html"


# FIX: pehle sara code module-level pe tha, isliye pytest ko koi "test_*"
# function nahi milta tha -> "collected 0 items" (exit code 5). Ab poora
# flow ek function ke andar hai.
def test_track_application():
    if not os.path.exists(SESSION_FILE):
        pytest.skip(f"'{SESSION_FILE}' nahi mili. Pehle registration/appointment script run karo.")

    with open(SESSION_FILE, "r", encoding="utf-8") as f:
        session_data = json.load(f)

    # Common possible key names — jo bhi mile use kar lo
    track_ref = (
        session_data.get("ref_number")
        or session_data.get("reference_number")
        or session_data.get("apptRef")
        or session_data.get("ref")
    )
    track_passport = session_data.get("passport_number") or session_data.get("passport")

    if not track_ref or not track_passport:
        pytest.fail(f"❌ session_data.json mein ref_number/passport_number nahi mile: {session_data}")

    print("Track kar rahe hain — Ref:", track_ref, "| Passport:", track_passport)

    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 15)

    try:
        driver.get(TRACK_URL)

        ref_input = wait.until(lambda d: d.find_element(By.ID, "refInput"))
        ref_input.clear()
        ref_input.send_keys(track_ref)
        print("✅ Reference number bhar diya")

        passport_input = driver.find_element(By.ID, "passportInput")
        passport_input.clear()
        passport_input.send_keys(track_passport)
        print("✅ Passport number bhar diya")

        driver.find_element(By.ID, "trackBtn").click()
        print("✅ Track button click kiya, result ka wait kar rahe hain...")

        # Result ya error, dono mein se jo pehle aaye uska wait karo.
        # Supabase call async hai isliye simple time.sleep() risky hai —
        # isliye dono conditions ko poll karte hain.
        def _result_or_error(d):
            result_shown = d.find_element(By.ID, "resultWrap").value_of_css_property("display") != "none"
            error_shown = "show" in d.find_element(By.ID, "lookupMsg").get_attribute("class")
            return result_shown or error_shown

        wait.until(_result_or_error)

        error_el = driver.find_element(By.ID, "lookupMsg")
        assert "show" not in error_el.get_attribute("class"), (
            "❌ Application nahi mili / error aaya: " + driver.find_element(By.ID, "lookupMsgText").text
        )

        name = driver.find_element(By.ID, "rsName").text
        ref = driver.find_element(By.ID, "rsRef").text
        status = driver.find_element(By.ID, "rsStatusPill").text
        visa_type = driver.find_element(By.ID, "rsVisaType").text
        destination = driver.find_element(By.ID, "rsDestination").text
        submitted = driver.find_element(By.ID, "rsSubmitted").text

        # Sanity checks — happy path fail ho jaye agar core fields khaali/wrong ref aaye
        assert name and name != "—", "❌ Name empty aa raha hai"
        assert ref == track_ref, f"❌ Ref mismatch: expected {track_ref}, got {ref}"
        assert status and status != "—", "❌ Status empty aa raha hai"

        print("✅✅✅ APPLICATION FOUND")
        print("   Name        :", name)
        print("   Reference   :", ref)
        print("   Status      :", status)
        print("   Visa Type   :", visa_type)
        print("   Destination :", destination)
        print("   Submitted   :", submitted)

        # Timeline ke saare stages bhi print kar do — kaunsa current hai
        steps = driver.find_elements(By.CSS_SELECTOR, "#timelineList .tl-step")
        assert len(steps) == 12, f"❌ Expected 12 timeline stages, mila {len(steps)}"
        print(f"   Timeline ({len(steps)} stages):")
        for step in steps:
            title = step.find_element(By.CSS_SELECTOR, ".tl-title").text
            is_done = "is-done" in step.get_attribute("class")
            is_current = bool(step.find_elements(By.CSS_SELECTOR, ".tl-current-tag"))
            tag = "→ CURRENT" if is_current else ("done" if is_done else "pending")
            print(f"     [{tag:9}] {title}")

        print("\n🎉 TEST PASSED — track page happy path working fine.")

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
    test_track_application()