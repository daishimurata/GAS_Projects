
from google.cloud import bigquery_connection_v1 as bq_connection

def check_and_create_connection():
    project_id = 'gen-lang-client-0396634194'
    location = 'asia-northeast1'
    connection_id = 'gemini-connection-tokyo' # 名前の衝突を避ける
    
    client = bq_connection.ConnectionServiceClient()
    parent = f"projects/{project_id}/locations/{location}"
    
    # Check if exists
    connections = client.list_connections(request={"parent": parent})
    target_connection = None
    for conn in connections:
        if conn.name.endswith(f"/connections/{connection_id}"):
            target_connection = conn
            break
            
    if target_connection:
        print(f"ℹ️ Connection '{connection_id}' already exists.")
    else:
        print(f"🚀 Creating connection '{connection_id}'...")
        new_conn = bq_connection.Connection(
            cloud_resource=bq_connection.CloudResourceProperties()
        )
        target_connection = client.create_connection(
            request={
                "parent": parent,
                "connection_id": connection_id,
                "connection": new_conn
            }
        )
        print(f"✅ Connection created: {target_connection.name}")

    sa_email = target_connection.cloud_resource.service_account_id
    print(f"🔑 Service Account to authorize: {sa_email}")
    print(f"Full Connection ID for SQL: {target_connection.name.replace('projects/', '').replace('/locations/', '.').replace('/connections/', '.')}")

if __name__ == "__main__":
    try:
        check_and_create_connection()
    except Exception as e:
        print(f"❌ Error: {e}")
