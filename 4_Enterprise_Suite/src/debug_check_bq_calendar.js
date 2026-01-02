function debugCheckBQEvents() {
    const sync = new CalendarSyncEngine();
    const datasetId = sync.datasetId;
    const tableId = sync.tableId;
    const projectId = Config.BIGQUERY.PROJECT_ID;

    const query = `SELECT summary, start_time, status, last_synced_at 
                 FROM \`${projectId}.${datasetId}.${tableId}\` 
                 ORDER BY last_synced_at DESC 
                 LIMIT 10`;

    console.log(`Checking BigQuery: ${projectId}.${datasetId}.${tableId}`);

    try {
        const results = BigQuery.Jobs.query({ query: query, useLegacySql: false }, projectId);
        if (results.rows) {
            console.log("Latest 10 events in BigQuery:");
            results.rows.forEach(row => {
                console.log(`- ${row.f[3].v}: [${row.f[2].v}] ${row.f[0].v} (${row.f[1].v})`);
            });
        } else {
            console.log("No rows found in BigQuery.");
        }
    } catch (e) {
        console.error("BQ Query failed:", e);
    }
}
