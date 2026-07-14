from selenium.webdriver.common.by import By
import time

def login(driver, email, password):
    """Applicant login karta hai (login/login.html se)"""
    driver.get("http://127.0.0.1:5500/login/login.html")
    time.sleep(2)

    driver.find_element(By.ID, "pwdEmail").send_keys(email)
    driver.find_element(By.ID, "pwdPass").send_keys(password)

    captcha_answer = driver.execute_script("return _captchaCode.pwd;")
    driver.find_element(By.ID, "pwdCaptchaInput").send_keys(captcha_answer)

    time.sleep(1)
    driver.find_element(By.ID, "pwdLoginBtn").click()
    time.sleep(3)