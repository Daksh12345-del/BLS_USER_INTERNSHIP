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
# This file runs AFTER "registration_test.py" (test_visa_application.py).
# The registration file uses a new driver/browser, and this file also
# opens its own separate new driver — the two are connected only through
# SESSION_FILE (session_data.json).
#
# Because appointment.js checks login via "sessionStorage.bls_logged_email"
# (and sessionStorage only persists within that one tab/browser session),
# we load the page in this new driver and manually set that same key —
# as if the user were already "logged in".
# ────────────────────────────────────────────

def wait_for_stable_count(driver, by, selector, timeout=5, poll=0.2):
    """
    Waits until the number of elements matching a selector stops changing
    between consecutive checks — a real replacement for guessing how long
    a dynamically-rendered list takes to finish populating.
    """
    deadline = time.time() + timeout
    last_count = -1
    while time.time() < deadline:
        count = len(driver.find_elements(by, selector))
        if count == last_count and count > 0:
            return count
        last_count = count
        time.sleep(poll)
    return last_count


SESSION_FILE = "session_data.json"
APPOINTMENT_URL = "http://127.0.0.1:5500/appointment/appointment.html"


def scroll_and_click(driver, element, settle_timeout=3):
    """
    Scrolls an element into view, then waits for its position to actually
    stop moving (polls getBoundingClientRect) before clicking via JS —
    replaces a blind fixed-length sleep with a real "has the smooth-scroll
    animation finished" check.
    """
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", element)
    last_rect = None
    deadline = time.time() + settle_timeout
    while time.time() < deadline:
        rect = driver.execute_script(
            "const r = arguments[0].getBoundingClientRect(); return [r.top, r.left];", element
        )
        if rect == last_rect:
            break
        last_rect = rect
        time.sleep(0.1)
    driver.execute_script("arguments[0].click();", element)

# FIX: dynamic relative path instead of a hardcoded Windows path — this
# will find the sample_files/ folder relative to this test file's own
# location (works on Windows + Linux, including GitHub's Ubuntu runner)
BASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample_files")


# FIX: previously all the code was at module level (it ran as soon as it
# was imported), so pytest couldn't find any "test_*" function ->
# "collected 0 items" (exit code 5). Now the whole flow lives inside a function.
def test_appointment_booking():
    if not os.path.exists(SESSION_FILE):
        pytest.skip(f"'{SESSION_FILE}' not found. Run the registration test (test_visa_application.py) first.")

    with open(SESSION_FILE, "r", encoding="utf-8") as f:
        session_data = json.load(f)

    test_email = session_data["email"]
    print("Continuing with this email:", test_email)

    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 15)  # a bit longer, to allow for Supabase calls

    try:
        # ────────────────────────────────────────────
        # STEP 1: Load the page once so the origin is set, then set
        # sessionStorage and refresh — only then will appointment.js's
        # DOMContentLoaded check see "logged in".
        # ────────────────────────────────────────────
        driver.get(APPOINTMENT_URL)
        wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
        driver.execute_script(
            "window.sessionStorage.setItem('bls_logged_email', arguments[0]);",
            test_email,
        )
        driver.refresh()

        wait.until(EC.visibility_of_element_located((By.ID, "apptMain")))
        print("✅ Appointment page opened (logged-in state simulated), form should auto-fill")

        # Wait for the registration auto-fill to actually land in the fields
        # (checkRegistrationExists() -> setVal('af_mobile', ...)/af_passport
        # is an async fetch) instead of guessing how long it takes.
        wait.until(lambda d: d.find_element(By.ID, "af_mobile").get_attribute("value").strip() != "")

        # Select purpose of visit (static options, hardcoded directly in the HTML)
        Select(driver.find_element(By.ID, "af_purpose")).select_by_index(1)
        print("✅ Purpose selected")

        # The af_country dropdown loads ASYNC from Supabase (inside
        # loadLocations()). Wait for the options to actually finish loading.
        wait.until(lambda d: len(Select(d.find_element(By.ID, "af_country")).options) > 1)
        Select(driver.find_element(By.ID, "af_country")).select_by_index(1)
        print("✅ Country selected")

        wait.until(lambda d: d.find_element(By.ID, "af_state").is_enabled())
        Select(driver.find_element(By.ID, "af_state")).select_by_index(1)
        print("✅ State selected")

        # FIX: this exact line was throwing a TimeoutException in CI
        # (test_appointment.py:85). The default 'wait' timeout of 15s wasn't
        # enough for CI's slower real-Supabase network. So this specific
        # wait uses its own longer (30s) WebDriverWait — only here, so we
        # don't unnecessarily slow down the other waits.
        WebDriverWait(driver, 30).until(
            lambda d: d.find_element(By.ID, "af_centre").is_enabled(),
            message="❌ Centre dropdown still not enabled after 30 seconds — either no Centre is configured for this State, or the Supabase call is slow in CI",
        )
        Select(driver.find_element(By.ID, "af_centre")).select_by_index(1)
        print("✅ Centre selected")

        # If extra documents are required (this is dynamic)
        # loadMissingAppointmentDocs() sets apptDocSection's display style
        # asynchronously (after its own docLoadTypes/docLoadUploaded fetch)
        # during the initial autofill — wait for that to actually resolve
        # instead of guessing a fixed delay.
        wait.until(lambda d: d.execute_script(
            "return document.getElementById('apptDocSection').style.display"
        ) in ("none", "block"))
        doc_section = driver.find_element(By.ID, "apptDocSection")
        if doc_section.is_displayed():
            print("Extra documents were requested, uploading those too")
            file_inputs = doc_section.find_elements(By.CSS_SELECTOR, "input[type='file']")
            for inp in file_inputs:
                # FIX: BASE_PATH + r"\photo.jpg" only worked on Windows
                # (backslash). os.path.join uses the correct separator on both OSes.
                inp.send_keys(os.path.join(BASE_PATH, "photo.jpg"))
                # NOTE: kept as a real sleep, intentionally — checking
                # input.value here wouldn't actually wait for anything
                # useful, since Selenium sets that value synchronously.
                # There's no visible DOM signal (e.g. a preview thumbnail
                # or file-name element) we can reliably wait on without
                # seeing the actual upload-box markup for this section.
                # If apptDocSection's HTML exposes one (e.g. a class like
                # ".file-name" the way the Documents page does), replace
                # this with a wait on that instead.
                time.sleep(1)
            number_inputs = doc_section.find_elements(By.CSS_SELECTOR, "input[type='text']")
            for ninp in number_inputs:
                ninp.send_keys("TEST123456")

        print("✅ Appointment details filled in")

        # Click "Choose Date & Time" button
        driver.find_element(By.XPATH, "//button[@onclick='goToSlots()']").click()
        print("✅ Date/Time step opened")

        # Choose the first available date on the calendar.
        # The sticky "header-main" element overlaps the top of the calendar,
        # so a normal .click() throws ElementClickInterceptedException.
        # scrollIntoView(center) + a JS click bypasses that.
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".cal-day.available")))
        available_dates = driver.find_elements(By.CSS_SELECTOR, ".cal-day.available")
        scroll_and_click(driver, available_dates[0])
        print("✅ Date selected")

        # Choose the first available time slot
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".slot-btn:not(.booked)")))
        # Wait for the slot list to stop growing (rendering can add more
        # slots after the first one appears) instead of a blind fixed delay.
        wait_for_stable_count(driver, By.CSS_SELECTOR, ".slot-btn:not(.booked)")
        available_slots = driver.find_elements(By.CSS_SELECTOR, ".slot-btn:not(.booked)")
        scroll_and_click(driver, available_slots[0])
        print("✅ Time slot selected")

        # Click the "Confirm Slot" button
        wait.until(EC.element_to_be_clickable((By.ID, "btnConfirm")))
        confirm_btn = driver.find_element(By.ID, "btnConfirm")
        scroll_and_click(driver, confirm_btn)
        print("✅ Confirm panel opened")

        # Final Submit
        wait.until(EC.visibility_of_element_located((By.ID, "btnSubmit")))
        submit_btn = driver.find_element(By.ID, "btnSubmit")
        scroll_and_click(driver, submit_btn)

        # FIX: previously there was a nested try/except here that just
        # printed the error and swallowed it — the test always looked like
        # it "passed" even if booking actually failed. Now an assert is
        # used so a real failure shows up as a failure in CI too.
        wait.until(lambda d: d.find_element(By.ID, "finalRef").text.strip() != "")
        final_ref = driver.find_element(By.ID, "finalRef").text
        assert final_ref, "❌ Appointment booking failed or no result was returned"
        print("✅✅✅ APPOINTMENT BOOKED SUCCESSFULLY — Reference:", final_ref)

    except Exception:
        # FIX: previously the exception was silently swallowed here (only
        # printed), so pytest never knew the test had failed. Now the
        # traceback is printed and the exception is re-raised so pytest
        # reports it as a FAIL.
        print("❌ Script crashed, full error below:")
        traceback.print_exc()
        raise

    finally:
        driver.quit()


# ────────────────────────────────────────────
# NEGATIVE PATH 1: no login session at all.
#
# appointment.js checks sessionStorage for 'bls_logged_email' and
# 'bls_token' on DOMContentLoaded. If either is missing, #accessGuard
# should be shown and #apptMain must stay hidden. This has no
# dependency on SESSION_FILE — it runs standalone, on a completely
# fresh browser session.
# ────────────────────────────────────────────
def test_appointment_page_blocks_unauthenticated_access():
    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 10)

    try:
        driver.get(APPOINTMENT_URL)  # fresh session — nothing set in sessionStorage

        guard = wait.until(EC.visibility_of_element_located((By.ID, "accessGuard")))
        assert guard.is_displayed(), "accessGuard should be shown with no login session"

        main_panels = driver.find_elements(By.ID, "apptMain")
        assert not any(m.is_displayed() for m in main_panels), \
            "apptMain should stay hidden when there is no login session"

        print("PASS: appointment page correctly blocked an unauthenticated visitor")

    finally:
        driver.quit()


# ────────────────────────────────────────────
# NEGATIVE PATH 2: an applicant who already has an appointment must be
# blocked from booking a second one ("Appointment Already Booked"
# screen from checkAlreadyBooked() / showAlreadyBookedScreen()).
#
# Runs AFTER test_appointment_booking has already booked one
# appointment for this session's email — reuses the same
# sessionStorage login, reloads the page, and expects the
# already-booked screen instead of the booking form.
# ────────────────────────────────────────────
def test_appointment_second_booking_is_blocked():
    if not os.path.exists(SESSION_FILE):
        pytest.skip(f"'{SESSION_FILE}' not found. Run test_visa_application.py and "
                     f"test_appointment_booking first so an appointment already exists.")

    with open(SESSION_FILE, "r", encoding="utf-8") as f:
        session_data = json.load(f)
    test_email = session_data["email"]

    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 15)

    try:
        driver.get(APPOINTMENT_URL)
        wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
        driver.execute_script(
            "window.sessionStorage.setItem('bls_logged_email', arguments[0]);",
            test_email,
        )
        driver.refresh()

        # The already-booked screen replaces apptMain/accessGuard entirely,
        # so wait for its heading text rather than a specific element id
        # (showAlreadyBookedScreen() builds the block without one).
        wait.until(lambda d: "Appointment Already Booked" in d.page_source)

        main_panels = driver.find_elements(By.ID, "apptMain")
        assert not any(m.is_displayed() for m in main_panels), \
            "The booking form should be hidden once an appointment already exists"

        print("PASS: a second booking attempt was correctly blocked")

    finally:
        driver.quit()


if __name__ == "__main__":
    test_appointment_page_blocks_unauthenticated_access()
    test_appointment_booking()
    test_appointment_second_booking_is_blocked()