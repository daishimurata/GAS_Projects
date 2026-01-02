function debugCheckStoreVariations() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = Config.BIGQUERY.TABLES.SALES;
    const projectId = Config.BIGQUERY.PROJECT_ID;

    const query = `
    SELECT store_name, COUNT(*) as count, SUM(amount) as total_amount
    FROM \`${projectId}.${datasetId}.${tableId}\`
    WHERE store_name LIKE '%一号館%' OR store_name LIKE '%1号館%'
    GROUP BY store_name
    ORDER BY total_amount DESC
  `;

    console.log(`Checking store variations in BigQuery...`);
    try {
        const results = BigQuery.Jobs.query({ query: query, useLegacySql: false }, projectId);
        if (results.rows) {
            console.log("Store name variations found:");
            results.rows.forEach(row => {
                console.log(`- ${row.f[0].v}: ${row.f[1].v} transactions, ¥${Number(row.f[2].v).toLocaleString()}`);
            });
        } else {
            console.log("No matching store names found.");
        }
    } catch (e) {
        console.error("Query failed:", e);
    }
}
