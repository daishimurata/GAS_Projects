function debug_check_acoop_sales() {
    const bq = getBigQueryClient();
    const tableId = Config.BIGQUERY.TABLES.SALES;
    const datasetId = Config.BIGQUERY.DATASET_ID;

    // 直近7日間の、店舗名に「コープ」を含むデータを検索
    const query = `
        SELECT transaction_date, store_name, item_name, quantity, amount, created_at
        FROM \`${datasetId}.${tableId}\`
        WHERE transaction_date >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 7 DAY)
        AND (store_name LIKE '%コープ%' OR store_name LIKE '%エーコープ%')
        ORDER BY transaction_date DESC, created_at DESC
        LIMIT 20
    `;

    try {
        const rows = bq.runQuery(query);
        console.log(`Found ${rows.length} A-Coop related rows.`);
        rows.forEach(r => {
            console.log(`[${r.transaction_date}] ${r.store_name}: ${r.item_name} (${r.quantity}) - Created at ${r.created_at}`);
        });
        return rows;
    } catch (e) {
        console.error('Query failed', e);
        return [];
    }
}
