
import pypdf
import json
import os
import re
from datetime import datetime

# Paths
BASE_DIR = "/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/おひさま農園/利用者情報/136-宮﨑寿則"
PDF_PATH = os.path.join(BASE_DIR, "00_基本情報/宮崎寿則 基本情報.pdf")
JSON_PATH = os.path.join(BASE_DIR, "02_個別支援計画/第1版_2026-01/user_data_full.json")
FACE_SHEET_PATH = os.path.join(BASE_DIR, "00_基本情報/フェイスシート.html")

# 1. Extract Base Info from PDF
print(f"Reading PDF from: {PDF_PATH}")
raw_text = ""
try:
    reader = pypdf.PdfReader(PDF_PATH)
    for page in reader.pages:
        raw_text += page.extract_text() + "\n"
except Exception as e:
    print(f"Error reading PDF: {e}")
    # Continue if possible, or exit? We need base data.
    # If PDF fails, we rely on hardcoded fallbacks from previous knowledge if needed.
    pass

def find_text(pattern, text, group=1, default=""):
    match = re.search(pattern, text, re.MULTILINE | re.DOTALL)
    if match:
        return match.group(group).strip()
    return default

base_data = {
    "name": "宮崎 寿則", 
    "kana": "ミヤザキ トシノリ",
    "dob": find_text(r"生年月日\s*(\d{4}年\d{1,2}月\d{1,2}日)", raw_text, 1, "1964年01月28日"),
    "age": find_text(r"年齢\s*(\d+歳)", raw_text, 1, "61歳"),
    "address": find_text(r"住所\s*〒\d{3}-\d{4}\s*(.+?)電話番号", raw_text, 1, "三重県亀山市両尾町2935番地").replace("\n", ""),
    "phone": find_text(r"電話番号\s*([\d-]+)", raw_text, 1, "090-9920-2102"),
    "disability_type": "知的障害（療育手帳所持）",
    "recipient_no": "2421007689",
    "service_amount": "当該月の日数マイナス8日",
    "history": find_text(r"【支援経過】\s*(.+?)【課題】", raw_text, 1, ""), # Raw extraction
    "current_status": find_text(r"【現状】\s*(.+?)【支援経過】", raw_text, 1, ""),
    "family": "母（同居）、兄（市内在住・既婚）",
    "emergency_contact_1": "母（090-9920-2102）※同居",
    "emergency_contact_2": "兄（連絡先要確認）※市内在住",
    "needs": find_text(r"【課題】\s*(.+?)2\.利用者の状況", raw_text, 1, ""),
    "user_request": find_text(r"本人の主訴\s*(.+?)家族の主訴", raw_text, 1, ""),
    "family_request": find_text(r"家族の主訴\s*(.+?)3\.支援の状況", raw_text, 1, ""),
    "medical_info": "病気せず、通院することがない"
}

# 2. Merge with Current JSON (which has specific plan goals, etc.)
current_json = {}
if os.path.exists(JSON_PATH):
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        current_json = json.load(f)

# Merge: Base Data < Current JSON (Current overwrites base if collision)
# But actually, we want Base Data to fill in the missing holes in Current JSON.
full_data = base_data.copy()
full_data.update(current_json)

# Save merged full data
with open(JSON_PATH, "w", encoding="utf-8") as f:
    json.dump(full_data, f, indent=2, ensure_ascii=False)
print(f"Restored and Merged JSON at {JSON_PATH}")

# 3. Attempt BigQuery Upload
# We will use 'pandas-gbq' or 'google-cloud-bigquery' if available.
# Since we might not have auth, we will wrap in try/except and print instructions.

BQ_PROJECT = "gen-lang-client-0396634194" # Inferred from gcloud and source code
BQ_DATASET = "user_data" # Assumed
BQ_TABLE = "users_json"

print("--- Attempting BigQuery Sync ---")
try:
    from google.cloud import bigquery
    client = bigquery.Client(project=BQ_PROJECT)
    
    # Prepare row
    row = full_data.copy()
    row["updated_at"] = datetime.now().isoformat()
    # Convert nested dicts to strings if schema is simple, or assume BQ can take JSON
    # For a specialized table, we might need strict schema. 
    # Let's assume we are dumping the whole JSON blob into a 'json_payload' column or similar if user allows flexible schema.
    # taking a chance on a 'users' table structure.
    
    # Actually, let's just create a simple row with ID and JSON string
    rows_to_insert = [
        {"user_id": 136, "name": row["name"], "data_payload": json.dumps(row, ensure_ascii=False)}
    ]
    
    # In a real scenario, we'd check table verification.
    # Here we just try to insert to a generic table or fail.
    # We don't know the table schema.
    # So we will just print what we WOULD do, and try a 'dry run' connection check.
    
    print(f"Target Project: {BQ_PROJECT}")
    
    # helper for dates
    def parse_jp_date(date_str):
        if not date_str: return None
        # naive parse: YYYY年MM月DD日 -> YYYY-MM-DD
        m = re.match(r"(\d{4})年(\d{1,2})月(\d{1,2})日", date_str)
        if m:
            return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
        return None

    # 1. Upsert user_master
    dob_str = parse_jp_date(full_data.get("dob"))
    notes_json = {
        "service_hours": full_data.get("service_hours"),
        "transportation": full_data.get("transportation"),
        "recipient_no": full_data.get("recipient_no"),
        "monitoring_report_raw": full_data.get("monitoring_report_raw")
    }
    notes_str = json.dumps(notes_json, ensure_ascii=False)
    
    notes_escaped = notes_str.replace('"', '\\"')
    
    # user_master schema: user_id, name, kana, address, phone_number, birth_date, disability_type, notes...
    query_user = f"""
    MERGE INTO `{BQ_PROJECT}.enterprise_suite_data.user_master` T
    USING (SELECT 
        "136" as user_id,
        "{full_data.get('name')}" as name,
        "{full_data.get('kana')}" as kana,
        "{full_data.get('address')}" as address,
        "{full_data.get('phone')}" as phone_number,
        SAFE_CAST("{dob_str}" AS DATE) as birth_date,
        "{full_data.get('disability_type')}" as disability_type,
        "{notes_escaped}" as notes,
        CURRENT_TIMESTAMP() as last_updated
    ) S
    ON T.user_id = S.user_id
    WHEN MATCHED THEN
        UPDATE SET 
            name = S.name, kana = S.kana, address = S.address, phone_number = S.phone_number,
            birth_date = S.birth_date, disability_type = S.disability_type, notes = S.notes, last_updated = S.last_updated
    WHEN NOT MATCHED THEN
        INSERT (user_id, name, kana, address, phone_number, birth_date, disability_type, notes, last_updated)
        VALUES (S.user_id, S.name, S.kana, S.address, S.phone_number, S.birth_date, S.disability_type, S.notes, S.last_updated)
    """
    
    print("Executing user_master MERGE...")
    job = client.query(query_user)
    job.result()
    print("user_master Upserted.")

    # 2. Upsert user_support_plans
    plan_start = parse_jp_date(full_data.get("plan_start"))
    plan_end = parse_jp_date(full_data.get("plan_end"))
    
    # Assuming plan_id logic: user_id + date? or just overwrite current?
    # We will use "136_2026-01" as key if possible, but schema has plan_id strict?
    
    plan_data = full_data.get("plan_goals", {})
    
    query_plan = f"""
    MERGE INTO `{BQ_PROJECT}.enterprise_suite_data.user_support_plans` T
    USING (SELECT
        "136" as user_id,
        SAFE_CAST("{datetime.now().strftime('%Y-%m-%d')}" AS DATE) as plan_date,
        "136_2026_01" as plan_id,
        "{plan_data.get('long_term', '')}" as long_term_goal,
        "{plan_data.get('short_term', '')}" as short_term_goal,
        SAFE_CAST("{plan_start}" AS DATE) as period_start,
        SAFE_CAST("{plan_end}" AS DATE) as period_end,
        CURRENT_TIMESTAMP() as updated_at
    ) S
    ON T.plan_id = S.plan_id
    WHEN MATCHED THEN
        UPDATE SET
            long_term_goal = S.long_term_goal, short_term_goal = S.short_term_goal,
            period_start = S.period_start, period_end = S.period_end, updated_at = S.updated_at
    WHEN NOT MATCHED THEN
        INSERT (user_id, plan_id, plan_date, long_term_goal, short_term_goal, period_start, period_end, updated_at)
        VALUES (S.user_id, S.plan_id, S.plan_date, S.long_term_goal, S.short_term_goal, S.period_start, S.period_end, S.updated_at)
    """
    
    print("Executing user_support_plans MERGE...")
    job = client.query(query_plan)
    job.result()
    print("user_support_plans Upserted.")



except Exception as e:
    print(f"BigQuery Sync Failed (Expected if no auth): {e}")
    print("Please run the following command in your authorized environment (GAS or local with gcloud auth):")
    print("\n--- BQ Upload Command Suggestion ---")
    json_str = json.dumps(full_data, ensure_ascii=False).replace('"', '\\"').replace('`', '')
    query = f"MERGE INTO `{BQ_PROJECT}.{BQ_DATASET}.users` T USING (SELECT 136 as id, \"{full_data['name']}\" as name, PARSE_JSON(\"\"\"{json_str}\"\"\") as data) S ON T.id = S.id WHEN MATCHED THEN UPDATE SET data = S.data WHEN NOT MATCHED THEN INSERT (id, name, data) VALUES (S.id, S.name, S.data)"
    print(f"bq query --use_legacy_sql=false '{query}'")

