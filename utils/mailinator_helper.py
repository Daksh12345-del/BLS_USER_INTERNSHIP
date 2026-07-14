import requests
import time
import re

def get_otp_from_mailinator(inbox_name, max_wait_seconds=40):
    url = f"https://api.mailinator.com/api/v2/domains/public/inboxes/{inbox_name}"

    # Yeh function call hone ka waqt note kar lo (milliseconds mein)
    start_time_ms = int(time.time() * 1000)

    waited = 0
    while waited < max_wait_seconds:
        response = requests.get(url)

        print("Status code:", response.status_code)

        try:
            data = response.json()
        except Exception:
            print("JSON parse fail hua, dobara try kar rahe hain...")
            time.sleep(5)
            waited += 5
            continue

        if data.get("msgs"):
            # Sirf woh emails lo jo SCRIPT CHALNE KE BAAD aaye hain (purane ignore)
            new_msgs = [m for m in data["msgs"] if m.get("time", 0) > start_time_ms]

            if new_msgs:
                # In naye emails mein se bhi sabse latest wala lo
                new_msgs.sort(key=lambda m: m.get("time", 0), reverse=True)
                latest_msg_id = new_msgs[0]["id"]

                msg_url = f"https://api.mailinator.com/api/v2/domains/public/messages/{latest_msg_id}"
                msg_response = requests.get(msg_url)

                print("Message status code:", msg_response.status_code)

                try:
                    msg_data = msg_response.json()
                except Exception:
                    print("Message JSON parse fail hua, agla try karenge...")
                    time.sleep(5)
                    waited += 5
                    continue

                full_text = str(msg_data)
                match = re.search(r'\b\d{6}\b', full_text)
                if match:
                    return match.group()
            else:
                print("Naya email abhi tak nahi aaya (purane emails ignore kar rahe hain)...")

        print(f"OTP abhi tak nahi aaya, ruk rahe hain... ({waited}s)")
        time.sleep(5)
        waited += 5

    return None