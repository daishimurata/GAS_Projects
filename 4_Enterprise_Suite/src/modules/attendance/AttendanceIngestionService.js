/**
 * src/modules/attendance/AttendanceIngestionService.js
 * 提供実績記録表および経理勤務表のデータ化サービス
 */

class AttendanceIngestionService {
    constructor() {
        this.bq = getBigQueryClient();
        this.gemini = new GeminiClient();
        this.properties = PropertiesService.getScriptProperties();
        this.MAX_EXECUTION_TIME_MS = 300000; // 5分 (GAS制限6分に対し余裕を持つ)
        this.startTime = new Date().getTime();
    }

    /**
     * 提供実績記録表（マスター）を解析してBigQueryに投入する
     * @param {string} folderPath 
     */
    processMasterRecords(folderPath) {
        const folder = DriveApp.getFolderById(this.getFolderIdFromPath(folderPath));
        const subFolders = folder.getFolders();

        while (subFolders.hasNext()) {
            const subFolder = subFolders.next();
            console.log(`Processing monthly folder: ${subFolder.getName()}`);

            const files = subFolder.getFiles();
            while (files.hasNext()) {
                const file = files.next();
                const mimeType = file.getMimeType();

                if (mimeType === MimeType.PDF || mimeType.startsWith('image/')) {
                    if (this.isAlreadyIngested(file, Config.BIGQUERY.TABLES.ATTENDANCE_MASTER)) {
                        console.log(`Skipping already ingested file: ${file.getName()}`);
                        continue;
                    }

                    this.ingestFile(file, Config.BIGQUERY.TABLES.ATTENDANCE_MASTER);

                    // 実行時間チェック
                    if (this.shouldYield()) {
                        console.log('⏳ Time limit approaching. Setting up continuation trigger...');
                        this.setupContinuationTrigger('debug_ingestAllMasterRecords');
                        return;
                    }
                }
            }
        }
    }

    /**
     * 個別ファイルをAIで解析してDB投入
     */
    ingestFile(file, tableId) {
        console.log(`Parsing file: ${file.getName()}...`);

        const prompt = `
            以下の書類は障害福祉サービスの「提供実績記録表」または「出勤簿」です。
            表形式のデータを抽出し、以下の各行を含むJSON配列を返してください。
            Markdownのコードブロックは不要です。純粋なJSONのみを返してください。

            期待するJSON形式:
            [
              {
                "user_name": "氏名",
                "date": "YYYY-MM-DD",
                "start_time": "HH:MM",
                "end_time": "HH:MM",
                "transportation": "往復/片道/なし",
                "meal_provided": true/false
              }
            ]

            ※「実績」の印がある日付を抽出してください。
            ※時刻が不明な場合は null にしてください。
        `;

        try {
            const data = this.gemini.generateJson(prompt, [file.getBlob()]);

            if (data && Array.isArray(data) && data.length > 0) {
                // 共通フィールドの追加
                const now = new Date();
                const timestamp = Utilities.formatDate(now, 'JST', 'yyyy-MM-dd HH:mm:ss');
                const rows = data.map(item => ({
                    ...item,
                    source_file: file.getName(),
                    created_at: timestamp
                }));

                this.bq.insertRows(Config.BIGQUERY.DATASET_ID, tableId, rows);
                console.log(`Successfully ingested ${rows.length} rows from ${file.getName()}`);
            }
        } catch (e) {
            console.error(`Error parsing file ${file.getName()}:`, e);
        }
    }

    /**
     * 経理勤怠表（Excel）を解析してBigQueryに投入する
     * @param {string} folderPath 
     */
    processAccountingRecords(folderPath) {
        const folder = DriveApp.getFolderById(this.getFolderIdFromPath(folderPath));
        const files = folder.getFiles();

        while (files.hasNext()) {
            const file = files.next();
            if (file.getName().endsWith('.xlsx')) {
                if (this.isAlreadyIngested(file, Config.BIGQUERY.TABLES.ACCOUNTING_ATTENDANCE)) {
                    console.log(`Skipping already ingested file: ${file.getName()}`);
                    continue;
                }

                console.log(`Analyzing accounting Excel: ${file.getName()}`);
                this.ingestFile(file, Config.BIGQUERY.TABLES.ACCOUNTING_ATTENDANCE);

                // 実行時間チェック
                if (this.shouldYield()) {
                    console.log('⏳ Time limit approaching. Setting up continuation trigger...');
                    this.setupContinuationTrigger('debug_ingestAllAccountingRecords');
                    return;
                }
            }
        }
    }

    /**
     * パスからFolderIDを取得する簡易ユーティリティ
     */
    getFolderIdFromPath(path) {
        // 実装上の注意: プロパティサービスやConfigからIDを取得するように変更予定
        // ここでは便宜上、DriveAppの検索を使用
        const parts = path.split('/');
        const folderName = parts[parts.length - 1];
        const folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) {
            return folders.next().getId();
        }
        throw new Error(`Folder not found: ${path}`);
    }

    /**
     * 重複チェック
     */
    isAlreadyIngested(file, tableId) {
        const fileName = file.getName().replace(/'/g, "\\'");
        const query = `SELECT count(*) as count FROM \`${Config.BIGQUERY.DATASET_ID}.${tableId}\` WHERE source_file = '${fileName}'`;
        try {
            const results = this.bq.runQuery(query);
            return results.length > 0 && parseInt(results[0].count) > 0;
        } catch (e) {
            console.error('Check duplicate error:', e);
            return false;
        }
    }

    /**
     * 実行制限時間が近づいているか
     */
    shouldYield() {
        const currentTime = new Date().getTime();
        return (currentTime - this.startTime) > this.MAX_EXECUTION_TIME_MS;
    }

    /**
     * 次回実行用のトリガーを設定
     */
    setupContinuationTrigger(functionName) {
        // 同名の既存トリガーを削除（重複防止）
        const triggers = ScriptApp.getProjectTriggers();
        triggers.forEach(t => {
            if (t.getHandlerFunction() === functionName) {
                ScriptApp.deleteTrigger(t);
            }
        });

        // 1分後に再実行
        ScriptApp.newTrigger(functionName)
            .timeBased()
            .after(60000)
            .create();
    }
}
