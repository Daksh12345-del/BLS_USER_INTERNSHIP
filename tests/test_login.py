"""
test_login.py

Replaces test_login_success.py. Two changes from the original:

1. Credentials no longer hardcoded. Set these as GitHub Actions secrets
   (or local env vars) before running:
       TEST_USER_EMAIL, TEST_USER_PASSWORD
   Locally: export TEST_USER_EMAIL=... TEST_USER_PASSWORD=...
   In CI: add them under repo Settings > Secrets > Actions, then pass
   them into the workflow's `env:` block (see selenium-tests.yml).

2. Added a negative-path test (wrong password) — the original suite only
   ever tested the happy path, so a regression that broke error handling
   (e.g. wrong password silently logging someone in) would never be caught.
"""

import os
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

TEST_EMAIL = os.environ.get("TEST_USER_EMAIL")
TEST_PASSWORD = os.environ.get("TEST_USER_PASSWORD")


def _fill_and_submit(driver, base_url, email, password):
    driver.get(f"{base_url}/login/login.html")
    wait = WebDriverWait(driver, 10)
    wait.until(EC.presence_of_element_located((By.ID, "pwdEmail")))

    driver.find_element(By.ID, "pwdEmail").send_keys(email)
    driver.find_element(By.ID, "pwdPass").send_keys(password)

    captcha_answer = driver.execute_script("return _captchaCode.pwd;")
    driver.find_element(By.ID, "pwdCaptchaInput").send_keys(captcha_answer)

    driver.find_element(By.ID, "pwdLoginBtn").click()


@pytest.mark.skipif(
    not TEST_EMAIL or not TEST_PASSWORD,
    reason="Set TEST_USER_EMAIL and TEST_USER_PASSWORD env vars to run this test.",
)
def test_login_success(driver, base_url):
    _fill_and_submit(driver, base_url, TEST_EMAIL, TEST_PASSWORD)

    wait = WebDriverWait(driver, 10)
    profile = wait.until(EC.visibility_of_element_located((By.ID, "profileCard")))
    assert profile.is_displayed(), "Login failed — profile card never appeared"


@pytest.mark.skipif(
    not TEST_EMAIL,
    reason="Set TEST_USER_EMAIL env var to run this test.",
)
def test_login_wrong_password_is_rejected(driver, base_url):
    """
    Negative path: a wrong password must show an error and must NOT
    reveal the profile card. This is the test that would have caught a
    regression where login silently succeeds regardless of password.
    """
    _fill_and_submit(driver, base_url, TEST_EMAIL, "definitely-the-wrong-password")

    wait = WebDriverWait(driver, 10)
    error_box = wait.until(EC.visibility_of_element_located((By.ID, "pwdError")))
    assert error_box.is_displayed(), "Expected a visible error message for wrong password"

    profile_cards = driver.find_elements(By.ID, "profileCard")
    assert not any(p.is_displayed() for p in profile_cards), \
        "Profile card should NOT be visible after a failed login"