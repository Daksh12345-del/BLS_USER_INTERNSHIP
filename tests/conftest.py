"""
conftest.py — shared pytest fixtures for the whole test suite.

Fixes three things that were duplicated (or missing) across every test file:
  1. Driver setup/teardown was copy-pasted in each test — now one fixture.
  2. No headless option — CI always needs headless; local debugging usually
     doesn't. Controlled by the HEADLESS env var (defaults to true in CI).
  3. No screenshot-on-failure — when a Selenium test fails in CI, you had
     no way to see *what the browser actually looked like*. Now every
     failing test automatically saves a screenshot to screenshots/.

Also centralizes BASE_URL so tests don't each hardcode
"http://127.0.0.1:5500" — override with the BASE_URL env var if your
local/CI port differs.
"""

import os
import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:5500")
HEADLESS = os.environ.get("HEADLESS", "true").lower() != "false"
SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")


@pytest.fixture
def base_url():
    return BASE_URL


@pytest.fixture
def driver():
    options = Options()
    if HEADLESS:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1400,1000")

    drv = webdriver.Chrome(options=options)
    drv.implicitly_wait(2)  # small implicit wait as a safety net; explicit
                             # WebDriverWait calls in tests still do the
                             # real work for anything async (Supabase calls etc.)
    yield drv
    drv.quit()


@pytest.hookimpl(hookwrapper=True, tryfirst=True)
def pytest_runtest_makereport(item, call):
    """
    After each test, if it failed AND it used the `driver` fixture,
    save a screenshot named after the test. This is what actually makes
    a CI failure debuggable instead of just a stack trace.
    """
    outcome = yield
    report = outcome.get_result()

    if report.when == "call" and report.failed:
        driver_fixture = item.funcargs.get("driver")
        if driver_fixture is not None:
            os.makedirs(SCREENSHOT_DIR, exist_ok=True)
            safe_name = item.name.replace("/", "_")
            path = os.path.join(SCREENSHOT_DIR, f"{safe_name}.png")
            try:
                driver_fixture.save_screenshot(path)
                print(f"\n📸 Screenshot saved: {path}")
            except Exception as e:
                print(f"\n⚠️  Could not save screenshot: {e}")