/**
 * ChatLogMigration.js
 * 過去のチャットログ（Spreadsheet）をBigQueryへ移行するためのスクリプト。
 * 
 * 移行元:
 * 1. 直売所管理システム（統合ログ） - チャットログ sheet (ID: 11xMsJN...)
 * 2. マスタースプレッドシート - メッセージ一覧 sheet (ID: 1eaR6...)
 */

function migrateChatLogs() {
    console.log('--- Starting Chat Log Migration ---');
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = Config.BIGQUERY.TABLES.CHAT_LOGS;

    // 1. 直売所管理システム（在庫管理用チャットログ）の移行
    migrateSpreadsheet(bq, datasetId, tableId, '11xMsJN1LwNaPL7XWJJf8cNxV2Y815ASG6HauD1LpCB8', 'チャットログ');

    // 2. マスタースプレッドシート（全チャットログ）の移行
    // ※重複チェックが必要だが、message_idがユニークキーならBigQuery側でDistinctするか、INSERT時にエラー無視設定を使用する
    migrateSpreadsheet(bq, datasetId, tableId, '1eaR6-XjnyoLBETO2B8SpO690uWRbsKJfBvLRJGYbXhs', 'メッセージ一覧');
}

/**
 * 指定されたスプレッドシートからチャットログを読み込み、BigQueryへアップロードする
 */
function migrateSpreadsheet(bq, datasetId, tableId, sheetId, sheetName) {
    console.log(`Processing Sheet: ${sheetName} (${sheetId})`);
    try {
        const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(sheetName);
        if (!sheet) {
            console.log(`Sheet '${sheetName}' not found. Skipping.`);
            return;
        }

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) {
            console.log('No data found.');
            return;
        }

        const headers = data[0];
        // ヘッダーマッピング (想定)
        // [日時, 送信者, チャンネル名, 本文, 添付ファイル, メッセージID...]
        const dateIdx = 0;
        const senderIdx = 1;
        const channelIdx = 2; // チャンネル名
        const contentIdx = 3;
        const msgIdIdx = headers.indexOf('メッセージID') > -1 ? headers.indexOf('メッセージID') : -1;

        let rows = [];
        const BATCH_SIZE = 500;

        for (let i = 1; i < data.length; i++) {
            const row = data[i];

            // BigQuery用スキーマに合わせて変換
            const bqRow = {
                message_id: (msgIdIdx > -1 && row[msgIdIdx]) ? String(row[msgIdIdx]) : `legacy_${i}_${Date.now()}`,
                channel_id: 'legacy_import', // IDが不明な場合が多いので仮置き、あるいはチャンネル名を入れる
                user_id: String(row[senderIdx]),
                content: String(row[contentIdx]),
                content_type: 'text',
                content_type: 'text',
                created_at: (function (d) {
                    try {
                        const dateObj = new Date(d);
                        if (isNaN(dateObj.getTime())) throw new Error('Invalid Date');
                        return dateObj.toISOString();
                    } catch (e) {
                        // 不正な日付の場合は現在日時あるいは特定の過去日時を入れる
                        return new Date().toISOString();
                    }
                })(row[dateIdx]),
                sentiment_score: 0.0, // 過去ログは未分析
                keywords: [],
                summary: `Imported from ${sheetName}`,
                ingested_at: new Date().toISOString()
            };

            // channel_idにチャンネル名を入れておく（検索用）
            if (row[channelIdx]) bqRow.channel_id = String(row[channelIdx]);

            rows.push(bqRow); // BigQueryClient.insertRowsは内部でjsonキー化してくれる

            // バッチサイズごとに送信
            if (rows.length >= BATCH_SIZE) {
                bq.insertRows(datasetId, tableId, rows);
                console.log(`Inserted ${rows.length} rows...`);
                rows = [];
            }
        }

        // 残りを送信
        if (rows.length > 0) {
            bq.insertRows(datasetId, tableId, rows);
            console.log(`Inserted final ${rows.length} rows.`);
        }

    } catch (e) {
        Logger.error(`Error processing sheet ${sheetId}`, e);
    }
}
