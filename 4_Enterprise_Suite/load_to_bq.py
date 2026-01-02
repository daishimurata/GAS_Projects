
import json
import pandas as pd
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

    df = pd.DataFrame(data)
    df['date'] = pd.to_datetime(df['date']).dt.date
    df['created_at'] = datetime.now()
    
    # 型を明示
    df['is_recorded'] = df['is_recorded'].astype(bool)
    df['user_name'] = df['user_name'].astype(str)
    df['type'] = df['type'].astype(str)
    df['source_file'] = df['source_file'].astype(str)

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

    print(f"Loading {len(df)} rows into {table_ref}...")
    job_config = bigquery.LoadJobConfig(schema=schema)
    job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
    job.result()  # 実行完了を待機

    print(f"✅ Successfully loaded {len(df)} rows to BigQuery.")

if __name__ == "__main__":
    upload_to_bigquery()
