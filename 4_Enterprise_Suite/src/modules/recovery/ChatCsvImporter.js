/**
 * ChatCsvImporter.js
 * LINE WORKS コンソールからエクスポートされたCSVをBigQueryに登録するクラス。
 */
class ChatCsvImporter {
    constructor() {
        this.bq = new BigQueryClient();
    }

    /**
     * 指定された名前のCSVファイルをGoogleドライブから探し、BigQueryにインポートする
     * @param {string} fileName ファイル名
     */
    importFromDrive(fileName) {
        console.log(`[ChatCsvImporter] Searching for file: ${fileName}`);
        const files = DriveApp.getFilesByName(fileName);
        if (!files.hasNext()) {
            console.error(`[ChatCsvImporter] File not found in Drive: ${fileName}`);
            return;
        }

        const file = files.next();
        const blob = file.getBlob();
        // LINE WORKSのエクスポートCSVはUTF-8（BOMなし）
        const csvContent = blob.getDataAsString('UTF-8');

        console.log('[ChatCsvImporter] Parsing CSV content...');
        const rows = Utilities.parseCsv(csvContent);
        if (rows.length < 2) {
            console.log('[ChatCsvImporter] No data (only header or empty).');
            return;
        }

        const enricher = new ChatDataEnricher();
        const dataRows = rows.slice(1);

        const bqRows = dataRows.map(row => {
            const createdAt = row[0]; // 例: 2025-12-23T21:51:03+09:00
            const sender = row[1];    // 例: 名前(email)
            const channelId = row[3]; // 例: 2ddfe141-...
            const content = row[4];   // メッセージ内容

            // 送信者列からメールアドレス部分のみを抽出 (userIDとして使用)
            const userIdMatch = sender.match(/\(([^)]+)\)/);
            const userId = userIdMatch ? userIdMatch[1] : sender;

            // 重複排除用のメッセージID生成
            const hashKey = `${createdAt}_${channelId}_${content}`;
            const messageId = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, hashKey, Utilities.Charset.UTF_8)
                .map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');

            // 自動タグ付け（ターゲティング）
            const enrichment = enricher.analyzeMention(content);

            return {
                message_id: messageId,
                channel_id: channelId,
                user_id: userId,
                content: content,
                content_type: 'text',
                created_at: createdAt,
                ingested_at: new Date().toISOString(),
                // 将来のデータ統合用フィールド
                mention_user_ids: enrichment.mention_user_ids,
                is_confirmed: enrichment.is_confirmed,
                confidence: enrichment.confidence
            };
        });

        console.log(`[ChatCsvImporter] Prepared ${bqRows.length} rows. Inserting into BigQuery...`);

        // 1000件ずつ分割して挿入（BigQueryの制限考慮）
        const chunkSize = 1000;
        for (let i = 0; i < bqRows.length; i += chunkSize) {
            const chunk = bqRows.slice(i, i + chunkSize);
            this.bq.insertRows(Config.BIGQUERY.DATASET_ID, Config.BIGQUERY.TABLES.CHAT_LOGS, chunk);
            console.log(`[ChatCsvImporter] Inserted chunk ${Math.floor(i / chunkSize) + 1}`);
        }

        console.log('[ChatCsvImporter] All data imported successfully.');
    }
}
