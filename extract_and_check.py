
import pypdf
import os
from google.cloud import bigquery

# PDF Path
pdf_path = "/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/おひさま農園/利用者情報/136-宮﨑寿則/00_基本情報/宮崎寿則 基本情報.pdf"

print(f"--- Extracting from {pdf_path} ---")
try:
    reader = pypdf.PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    print(text[:2000]) # Print first 2000 chars
except Exception as e:
    print(f"Error reading PDF: {e}")

# Check BigQuery
print("\n--- Listing BigQuery Tables ---")
PROJECT_ID = "ohisama-enterprise-suite"
DATASET_ID = "enterprise_suite_data"

try:
    client = bigquery.Client(project=PROJECT_ID)
    dataset_ref = client.dataset(DATASET_ID)
    tables = list(client.list_tables(dataset_ref))
    
    found_user_master = False
    for table in tables:
        print(f"Table: {table.table_id}")
        if "user_master" in table.table_id:
            found_user_master = True
            print(f"Found user_master! Schema for {table.table_id}:")
            t = client.get_table(table)
            for schema in t.schema:
                print(f" - {schema.name} ({schema.field_type})")
                
except Exception as e:
    print(f"Error checking BigQuery: {e}")
