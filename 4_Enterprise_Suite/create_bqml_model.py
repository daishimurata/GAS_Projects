
from google.cloud import bigquery

def create_model():
    project_id = 'gen-lang-client-0396634194'
    # Use the same project for both resource and billing
    client = bigquery.Client(project=project_id, location='asia-northeast1')
    
    sql = """
    CREATE OR REPLACE MODEL `enterprise_suite_data.gemini_flash_model`
    REMOTE WITH CONNECTION `gen-lang-client-0396634194.asia-northeast1.gemini-connection-tokyo`
    OPTIONS(ENDPOINT = 'gemini-2.5-flash');
    """
    
    print("🚀 Creating BigQuery ML remote model...")
    query_job = client.query(sql)
    query_job.result()  # Wait for query to finish
    print("✅ Remote model 'gemini_flash_model' created successfully in dataset 'enterprise_suite_data'.")

if __name__ == "__main__":
    try:
        create_model()
    except Exception as e:
        print(f"❌ Error creating model: {e}")
