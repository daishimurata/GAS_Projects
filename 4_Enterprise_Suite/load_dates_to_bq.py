
import json
from google.cloud import bigquery
from datetime import datetime

def load_extracted_dates_to_bq(json_file):
    client = bigquery.Client(project='ohisama-enterprise-suite')
    dataset_id = 'enterprise_suite_data'
    table_id = 'document_schedule'
    full_table_id = f"{client.project}.{dataset_id}.{table_id}"

    with open(json_file, 'r', encoding='utf-8') as f:
        extracted_data = json.load(f)

    rows_to_insert = []
    now = datetime.utcnow().isoformat()

    for user_name, data in extracted_data.items():
        # 1. 計画書 (PLAN) のスケジュール
        plan = data.get("plan_data")
        if plan:
            rows_to_insert.append({
                "user_name": user_name,
                "doc_type": "PLAN",
                "last_completed_date": plan.get("plan_start"), # 開始日を完了日として扱う
                "next_due_date": plan.get("plan_end"),
                "status": "GENERATED",
                "updated_at": now
            })
        
        # 2. 受給者証に基づくモニタリング等の補助情報 (必要に応じて拡張)
        cert = data.get("certificate_data")
        # ここでは例として受給者証の期限を別レコードで持つか、後でマスタと結合する
    
    if rows_to_insert:
        errors = client.insert_rows_json(full_table_id, rows_to_insert)
        if not errors:
            print(f"✅ Successfully loaded {len(rows_to_insert)} rows to {table_id}")
        else:
            print(f"❌ Errors occurred: {errors}")
    else:
        print("ℹ️ No data to insert.")

if __name__ == "__main__":
    load_extracted_dates_to_bq('user_master_dates_gemini.json')
