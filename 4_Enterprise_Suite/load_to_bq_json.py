
import json
from google.cloud import bigquery
from datetime import datetime

# 設定
PROJECT_ID = "ohisama-enterprise-suite"
DATASET_ID = "enterprise_suite_data"
TABLE_ID = "accounting_attendance"

def upload_to_bigquery():
    client = bigquery.Client(project=PROJECT_ID)
    table_ref = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"

    # JSONデータの読み込み
    with open('attendance_combined_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    # created_at 追加と型の調整
    now_str = datetime.now().isoformat()
    rows_to_insert = []
    for item in data:
        rows_to_insert.append({
            "user_name": str(item["user_name"]),
            "type": str(item["type"]),
            "date": str(item["date"]),
            "is_recorded": bool(item["is_recorded"]),
            "source_file": str(item["source_file"]),
            "created_at": now_str
        })

    # テーブルの削除と再作成
    schema = [
        bigquery.SchemaField("user_name", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("type", "STRING"),
        bigquery.SchemaField("date", "DATE", mode="REQUIRED"),
        bigquery.SchemaField("is_recorded", "BOOLEAN"),
        bigquery.SchemaField("source_file", "STRING"),
        bigquery.SchemaField("created_at", "TIMESTAMP"),
    ]

    print(f"Deleting table {table_ref} if exists...")
    client.delete_table(table_ref, not_found_ok=True)

    print(f"Creating table {table_ref}...")
    table = bigquery.Table(table_ref, schema=schema)
    client.create_table(table)

    print(f"Loading {len(rows_to_insert)} rows into {table_ref}...")
    
    # insert_rows を使用して投入
    errors = client.insert_rows_json(table_ref, rows_to_insert)
    if errors == []:
        print(f"✅ Successfully loaded {len(rows_to_insert)} rows to BigQuery.")
    else:
        print(f"Encountered errors while inserting rows: {errors}")

if __name__ == "__main__":
    upload_to_bigquery()
