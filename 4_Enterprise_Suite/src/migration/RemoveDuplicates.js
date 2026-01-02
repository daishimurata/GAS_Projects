/**
 * RemoveDuplicates.js
 * BigQuery上のチャットログテーブルから重複データを削除するスクリプト
 */

/**
 * チャットログテーブルの重複削除を実行する
 * message_id が同じレコードのうち、ingested_at が最新のものだけを残す
 */
function removeDuplicateChatLogs() {
    const bq = new BigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = Config.BIGQUERY.TABLES.CHAT_LOGS;

    console.log(`[RemoveDuplicates] Starting deduplication for ${datasetId}.${tableId}...`);

    // 重複排除クエリ
    // 行番号(rn)を付与し、rn=1のみを選択してテーブルを再作成（置換）する
    const sql = `
        CREATE OR REPLACE TABLE \`${datasetId}.${tableId}\` AS
        SELECT * EXCEPT(rn)
        FROM (
            SELECT 
                *, 
                ROW_NUMBER() OVER(PARTITION BY message_id ORDER BY ingested_at DESC) as rn
            FROM \`${datasetId}.${tableId}\`
        )
        WHERE rn = 1
    `;

    try {
        // BigQueryジョブとして実行（タイムアウト回避のため）
        // ※BigQueryClient.runDml は query execution なので、CREATE TABLE AS SELECT も実行可能
        bq.runDml(sql);
        console.log(`[RemoveDuplicates] Successfully deduplicated chat_logs.`);
    } catch (e) {
        console.error(`[RemoveDuplicates] Failed to deduplicate:`, e);
        throw e;
    }
}
