
from google.cloud import bigquery

def check_tables():
    project_id = 'gen-lang-client-0396634194'
    client = bigquery.Client(project=project_id)
    
    tables = ['document_schedule', 'document_templates']
    for table_id in tables:
        print(f"--- Checking {table_id} ---")
        sql = f"SELECT * FROM `enterprise_suite_data.{table_id}` LIMIT 5"
        try:
            results = client.query(sql).result()
            rows = list(results)
            print(f"Count: {len(rows)} rows found.")
            for row in rows:
                print(dict(row))
        except Exception as e:
            print(f"❌ Error querying {table_id}: {e}")

if __name__ == "__main__":
    check_tables()
