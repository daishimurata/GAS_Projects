function debugFixStoreNamesInBQ() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = Config.BIGQUERY.TABLES.SALES;
    const projectId = Config.BIGQUERY.PROJECT_ID;

    console.log(`--- Starting Store Name Unification in BigQuery ---`);

    // 1. 店舗マスタを取得
    const mastersQuery = `SELECT store_name, keywords FROM \`${projectId}.${datasetId}.store_master\``;
    const masters = bq.runQuery(mastersQuery);

    if (!masters || masters.length === 0) {
        console.error("Store master data not found. Please run migrateStoreMaster first.");
        return;
    }

    // 2. 各店舗ごとにUPDATEクエリを発行
    masters.forEach(master => {
        const canonicalName = master.store_name;
        const keywords = master.keywords || [];

        if (keywords.length === 0) return;

        // キーワードのいずれかに一致する場合を抽出
        // 例: name LIKE '%一号館%' OR name LIKE '%1号館%'
        const likeClauses = keywords.map(k => `store_name LIKE '%${k}%'`).join(' OR ');

        // 現在の名称と異なる場合のみ更新
        const updateQuery = `
      UPDATE \`${projectId}.${datasetId}.${tableId}\`
      SET store_name = '${canonicalName}'
      WHERE (${likeClauses}) AND store_name != '${canonicalName}'
    `;

        console.log(`Updating variations for: ${canonicalName}...`);
        try {
            bq.runQuery(updateQuery);
            console.log(`✅ Update query for ${canonicalName} issued.`);
        } catch (e) {
            console.error(`❌ Failed to update ${canonicalName}:`, e.message);
        }
    });

    console.log(`--- Store Name Unification Finished ---`);
}
