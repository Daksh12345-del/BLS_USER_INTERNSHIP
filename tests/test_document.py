from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
import time
import json
import os
import traceback
import pytest

# ────────────────────────────────────────────
# Documents Checklist (documents.html) automation — HAPPY PATH ONLY.
# Sirf ref number + passport number daal ke check karta hai ki
# documents submit huye hain ya nahi (upload nahi karta).
# Public lookup hai (Reference Number + Passport Number), koi login
# guard nahi. Isliye registration ke baad hi chalao taaki
# session_data.json mein ref_number aur passport_number mil jayein.
# ────────────────────────────────────────────

SESSION_FILE = "session_data.json"
DOCS_URL = "http://127.0.0.1:5500/Document/document.html"


# FIX: pehle sara code module-level pe tha, isliye pytest ko koi "test_*"
# function nahi milta tha -> "collected 0 items" (exit code 5). Ab poora
# flow ek function ke andar hai.
def test_documents_checklist():
    doc_ref = None
    doc_passport = None

    if not os.path.exists(SESSION_FILE):
        pytest.skip(f"'{SESSION_FILE}' nahi mili. Pehle registration/appointment script run karo.")

    with open(SESSION_FILE, "r", encoding="utf-8") as f:
        session_data = json.load(f)

    # session_data.json mein key "ref_number" hoti hai (kabhi kabhi
    # reference_number/apptRef/ref bhi ho sakta hai, isliye sab check karo)
    doc_ref = (
        session_data.get("ref_number")
        or session_data.get("reference_number")
        or session_data.get("apptRef")
        or session_data.get("ref")
    )
    doc_passport = session_data.get("passport_number") or session_data.get("passport")

    if not doc_ref or not doc_passport:
        pytest.fail(f"❌ session_data.json mein ref_number/passport_number nahi mile: {session_data}")

    print("Documents check kar rahe hain — Ref:", doc_ref, "| Passport:", doc_passport)

    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 15)

    try:
        driver.get(DOCS_URL)

        ref_input = wait.until(lambda d: d.find_element(By.ID, "refInput"))
        ref_input.clear()
        ref_input.send_keys(doc_ref)
        print("✅ Reference number bhar diya")

        passport_input = driver.find_element(By.ID, "passportInput")
        passport_input.clear()
        passport_input.send_keys(doc_passport)
        print("✅ Passport number bhar diya")

        driver.find_element(By.ID, "lookupBtn").click()
        print("✅ 'View Checklist' click kiya, result ka wait kar rahe hain...")

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

        # renderChecklist() Supabase se doc types + uploaded status async
        # laata hai, isliye docList ke andar kam se kam ek .doc-row aane
        # tak poll karo (loading spinner replace hone ka wait).
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#docList .doc-row")) > 0)

        uploaded_count = driver.find_element(By.ID, "docUploadedCount").text
        total_count = driver.find_element(By.ID, "docTotalCount").text

        # Sanity checks
        assert name and name != "—", "❌ Name empty aa raha hai"
        assert ref == doc_ref, f"❌ Ref mismatch: expected {doc_ref}, got {ref}"
        assert total_count.isdigit() and int(total_count) > 0, "❌ Document checklist khaali aa raha hai (0 types configured?)"

        print("✅✅✅ APPLICATION FOUND")
        print("   Name        :", name)
        print("   Reference   :", ref)
        print(f"   Documents   : {uploaded_count} of {total_count} uploaded")

        # Har document row ka naam + status (Uploaded / Missing) print karo
        rows = driver.find_elements(By.CSS_SELECTOR, "#docList .doc-row")
        print(f"   Checklist ({len(rows)} document types):")
        missing_docs = []
        for row in rows:
            doc_name = row.find_element(By.CSS_SELECTOR, ".doc-name").text
            badge_classes = row.find_element(By.CSS_SELECTOR, ".doc-status-badge").get_attribute("class")
            is_uploaded = "ok" in badge_classes
            status = "✅ Uploaded" if is_uploaded else "⚠️  Missing"
            print(f"     [{status}] {doc_name}")
            if not is_uploaded:
                missing_docs.append(doc_name)

        # uploaded/total count DOM mein jo dikh raha hai, actual row status se match karna chahiye
        actual_uploaded = len(rows) - len(missing_docs)
        assert actual_uploaded == int(uploaded_count), (
            f"❌ Summary bar ({uploaded_count} uploaded) row-wise count ({actual_uploaded}) se match nahi kar raha"
        )

        if missing_docs:
            print("\n⚠️  Pending documents:", ", ".join(missing_docs))
        else:
            print("\n🎉 Sab documents submit ho chuke hain.")

        print("\n🎉 TEST PASSED — documents checklist page happy path working fine.")

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
    test_documents_checklist()