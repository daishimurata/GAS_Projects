
import pypdf
import json
import os

# Paths
BASE_DIR = "/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/おひさま農園/利用者情報/136-宮﨑寿則"
MONITORING_PDF = os.path.join(BASE_DIR, "99_各種書式/宮崎寿則 モニタリング報告書.pdf")
JSON_PATH = os.path.join(BASE_DIR, "02_個別支援計画/第1版_2026-01/user_data_full.json")

# 1. Extract Text
print(f"Reading PDF from: {MONITORING_PDF}")
monitoring_text = ""
try:
    reader = pypdf.PdfReader(MONITORING_PDF)
    for page in reader.pages:
        monitoring_text += page.extract_text() + "\n"
    print("--- Extracted Text ---")
    print(monitoring_text[:1000]) # Preview
except Exception as e:
    print(f"Error reading PDF: {e}")
    exit(1)

# 2. Update JSON
if os.path.exists(JSON_PATH):
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # Store the full text for reference or try to parse specific fields if structure is known
    # For now, appending as a raw text field "recent_monitoring_report"
    data["monitoring_report_raw"] = monitoring_text
    
    # Attempt to extract date if possible
    # e.g., "作成日: 2024年..."
    import re
    date_match = re.search(r"(\d{4}年\d{1,2}月\d{1,2}日)", monitoring_text)
    if date_match:
        data["last_monitoring_date"] = date_match.group(1)
        
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Updated JSON at {JSON_PATH} with monitoring data.")
else:
    print(f"JSON file not found at {JSON_PATH}")

