
/**
 * 定数 ACCOUNTING_DATA_JSON に含まれるデータを分割して投入する
 */
function batchLoadAccountingData() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = Config.BIGQUERY.TABLES.ACCOUNTING_ATTENDANCE;
    const project = Config.BIGQUERY.PROJECT_ID;

    if (typeof ACCOUNTING_DATA_JSON === 'undefined') {
        throw new Error('ACCOUNTING_DATA_JSON is not defined. Make sure the JSON script is pushed.');
    }

    // 先にテーブルをリセット（スキーマ変更対応）
    try {
        BigQuery.Tables.remove(project, datasetId, tableId);
        console.log(`✅ Table removed: ${tableId}`);
    } catch (e) { }
    try {
        BigQuery.Tables.remove(project, datasetId, Config.BIGQUERY.TABLES.STAFF_ATTENDANCE);
        console.log(`✅ Table removed: ${Config.BIGQUERY.TABLES.STAFF_ATTENDANCE}`);
    } catch (e) { }

    // 削除反映を待機
    Utilities.sleep(2000);

    // テーブル再作成
    setupAttendanceDB();

    // 作成反映を待機
    Utilities.sleep(3000);
    const allRows = ACCOUNTING_DATA_JSON;
    const batchSize = 500;
    const timestamp = Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss');

    console.log(`Starting batch load: ${allRows.length} rows total.`);

    for (let i = 0; i < allRows.length; i += batchSize) {
        const chunk = allRows.slice(i, i + batchSize);

        // 利用者用とスタッフ用に振り分け
        const userRows = chunk.filter(item => item.type === 'USER').map(item => ({
            user_name: item.user_name,
            date: item.date,
            is_recorded: item.is_recorded,
            source_file: item.source_file,
            created_at: timestamp
        }));

        const staffRows = chunk.filter(item => item.type === 'STAFF').map(item => ({
            staff_name: item.user_name, // プロパティ名変換
            date: item.date,
            is_recorded: item.is_recorded,
            source_file: item.source_file,
            created_at: timestamp
        }));

        try {
            if (userRows.length > 0) bq.insertRows(datasetId, Config.BIGQUERY.TABLES.ACCOUNTING_ATTENDANCE, userRows);
            if (staffRows.length > 0) bq.insertRows(datasetId, Config.BIGQUERY.TABLES.STAFF_ATTENDANCE, staffRows);
            console.log(`✅ Progress: Processed rows ${i + 1} to ${Math.min(i + batchSize, allRows.length)}`);
        } catch (e) {
            console.error(`❌ Error at batch starting ${i}:`, e.message);
        }
    }

    console.log('🎉 Batch load completed.');
}
