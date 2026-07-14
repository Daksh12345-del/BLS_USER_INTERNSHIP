from selenium import webdriver
from selenium.webdriver.common.by import By
import time


# FIX: pehle sara code top-level (module-level) pe tha, isliye pytest ko
# koi "test_*" function nahi milta tha -> "collected 0 items" (exit code 5).
# Ab poora flow ek "def test_...()" function ke andar hai, isliye pytest
# ise ek asli test case ki tarah collect + run karega.
def test_login_success():
    driver = webdriver.Chrome()
    try:
        driver.get("http://127.0.0.1:5500/login/login.html")
        time.sleep(2)

        # Email aur password bharo
        driver.find_element(By.ID, "pwdEmail").send_keys("gradewallah@gmail.com")
        driver.find_element(By.ID, "pwdPass").send_keys("K9WdA6fueCjUspL")

        # CAPTCHA nikal ke bharo
        captcha_answer = driver.execute_script("return _captchaCode.pwd;")
        print("Sahi CAPTCHA yeh hai:", captcha_answer)
        driver.find_element(By.ID, "pwdCaptchaInput").send_keys(captcha_answer)

        time.sleep(1)

        # Ab Sign In button click karo
        driver.find_element(By.ID, "pwdLoginBtn").click()

        time.sleep(3)  # login process hone ka time do

        # FIX: pehle try/except me sirf print hota tha, pytest ko pata hi
        # nahi chalta tha ki test fail hua ya pass. Ab assert use kiya hai
        # taaki login fail hone par test bhi CI me FAIL dikhe.
        profile = driver.find_element(By.ID, "profileCard")
        assert profile.is_displayed(), "❌ Login fail hua — profile card hidden hai"
        print("✅ LOGIN SUCCESSFUL — Profile card dikh raha hai!")

    finally:
        time.sleep(5)
        driver.quit()


# Isse yeh file standalone bhi chal sakti hai (bina pytest ke, seedha
# "python test_login_success.py" se), pytest ke through bhi.
if __name__ == "__main__":
    test_login_success()