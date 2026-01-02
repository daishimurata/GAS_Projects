
function dropAndRecreateAccountingTable() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = Config.BIGQUERY.TABLES.ACCOUNTING_ATTENDANCE;
    const project = Config.BIGQUERY.PROJECT_ID;

    console.log(`Dropping table: ${datasetId}.${tableId}`);
    try {
        // bq rm が使えないため、DML または API で削除を試みる
        // BigQuery.Tables.remove(projectId, datasetId, tableId)
        BigQuery.Tables.remove(project, datasetId, tableId);
        console.log('✅ Table dropped successfully.');
    } catch (e) {
        console.warn('Drop table warning (likely not exists):', e.message);
    }

    console.log('Recreating tables with new schema...');
    setupAttendanceDB();
    console.log('✅ Tables recreated successfully.');
}
