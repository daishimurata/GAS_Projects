
from google.cloud import bigquery

def setup_bigquery():
    client = bigquery.Client(project='ohisama-enterprise-suite')
    dataset_id = 'enterprise_suite_data'
    
    # 1. スケジュール管理テーブル (document_schedule)
    schedule_table_id = f"{client.project}.{dataset_id}.document_schedule"
    schedule_schema = [
        bigquery.SchemaField("user_name", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("doc_type", "STRING", mode="REQUIRED"), # 'PLAN' (計画書), 'MONITORING' (モニタリング)
        bigquery.SchemaField("last_completed_date", "DATE"),
        bigquery.SchemaField("next_due_date", "DATE"),
        bigquery.SchemaField("status", "STRING"), # 'PENDING', 'GENERATED', 'SENT'
        bigquery.SchemaField("updated_at", "TIMESTAMP", default_value_expression="CURRENT_TIMESTAMP"),
    ]
    
    # 2. テンプレート管理テーブル (document_templates)
    template_table_id = f"{client.project}.{dataset_id}.document_templates"
    template_schema = [
        bigquery.SchemaField("doc_type", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("html_template", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("system_prompt", "STRING"),
        bigquery.SchemaField("version", "INTEGER"),
        bigquery.SchemaField("updated_at", "TIMESTAMP", default_value_expression="CURRENT_TIMESTAMP"),
    ]

    def create_or_update_table(table_id, schema):
        table = bigquery.Table(table_id, schema=schema)
        try:
            client.create_table(table)
            print(f"✅ Created table: {table_id}")
        except Exception as e:
            if "Already Exists" in str(e):
                print(f"ℹ️ Table already exists: {table_id}")
            else:
                print(f"❌ Error creating {table_id}: {e}")

    create_or_update_table(schedule_table_id, schedule_schema)
    create_or_update_table(template_table_id, template_schema)

    # 3. BigQuery ML リモートモデル作成用のSQL提供
    # 注意: 事前に「外部接続 (External Connection)」が作成されている必要があります。
    connection_id = "us.gemini-connection" # 適宜修正が必要な場合があります
    
    model_sql = f"""
    CREATE OR REPLACE MODEL `{dataset_id}.gemini_flash_model`
    REMOTE WITH CONNECTION `{client.project}.{connection_id}`
    OPTIONS(ENDPOINT = 'gemini-1.5-flash');
    """
    
    print("\n--- BigQuery ML Model Creation SQL ---")
    print("以下のSQLをBigQueryコンソールで実行するか、外部接続設定後にスクリプトで実行してください。")
    print(model_sql)

if __name__ == "__main__":
    setup_bigquery()
