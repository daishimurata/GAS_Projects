/**
 * index.js
 * アプリケーションのエントリーポイント
 */

/**
 * Webhook エントリーポイント (LINE WORKS Bot)
 */
function doPost(e) {
    const ts = new Date().toLocaleString('ja-JP');
    const props = PropertiesService.getScriptProperties();
    props.setProperty('LAST_WEBHOOK_AT', ts);

    let contentSnippet = 'NO_CONTENT';
    try {
        if (e && e.postData && e.postData.contents) {
            contentSnippet = e.postData.contents.substring(0, 150);
            props.setProperty('LAST_WEBHOOK_CONTENT', contentSnippet);

            // WebhookHandlerに委譲
            const response = handleWebhookRequest(e);
            console.log(`[Webhook Success] ${ts}`);
            return response;
        } else if (e && e.parameter && e.parameter.challenge) {
            // チャレンジレスポンス
            console.log(`[Challenge Response] ${ts}`);
            return ContentService.createTextOutput(e.parameter.challenge);
        }
    } catch (err) {
        console.error(`[Webhook Error] ${ts}: ${err}`);
        props.setProperty('LAST_WEBHOOK_ERROR', err.toString());
    }

    // デフォルトレスポンス (200 OK)
    return ContentService.createTextOutput(JSON.stringify({ status: "OK", timestamp: ts }))
        .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ブラウザからアクセスして設定診断を行うための簡易エンドポイント
 */
function doGet(e) {
    // セルフテスト実行 (接続確認)
    if (e.parameter.test === '1') {
        debug_testWebAppConnectivity();
    }
    // 監視チャンネルの初期設定実行
    if (e.parameter.setup === '1') {
        debug_setMonitorChannels();
    }
    // 売上データのバックフィル実行
    if (e.parameter.backfill === '1') {
        debug_runSalesBackfill();
    }
    // DBテーブルの存在確認
    if (e.parameter.dbcheck === '2') {
        const bq = getBigQueryClient();
        const datasetId = Config.BIGQUERY.DATASET_ID;
        const tables = ['user_master', 'user_profiles', 'user_families'];
        const results = tables.map(tableId => {
            try {
                BigQuery.Tables.get(Config.BIGQUERY.PROJECT_ID, datasetId, tableId);
                return { table: tableId, status: '✅ EXISTS' };
            } catch (e) {
                return { table: tableId, status: '❌ NOT FOUND', error: e.message };
            }
        });
        return ContentService.createTextOutput(JSON.stringify(results, null, 2))
            .setMimeType(ContentService.MimeType.JSON);
    }

    const props = PropertiesService.getScriptProperties();
    const botId = Config.LINEWORKS.BOT_ID;
    const auth = new LineWorksAuth();

    let output = {
        title: "Enterprise Suite Final Diagnostic Dashboard",
        serverTime: new Date().toLocaleString('ja-JP'),
        webhookStatus: {
            lastArrival: props.getProperty('LAST_WEBHOOK_AT') || "NEVER RECEIVED",
            lastSnippet: props.getProperty('LAST_WEBHOOK_CONTENT') || "NONE",
            lastError: props.getProperty('LAST_WEBHOOK_ERROR') || "NONE"
        },
        monitoringChannels: Config.LINEWORKS.MONITOR_CHANNEL_IDS,
        config: {
            botId: botId,
            bqProject: Config.BIGQUERY.PROJECT_ID,
            bqDataset: Config.BIGQUERY.DATASET_ID
        },
        apiDiagnosis: {}
    };

    // API Connectivity Checks
    try {
        const token = auth.getAccessToken('bot');
        const resInfo = UrlFetchApp.fetch(`https://www.worksapis.com/v1.0/bots/${botId}`, {
            headers: { Authorization: `Bearer ${token}` },
            muteHttpExceptions: true
        });
        output.apiDiagnosis.botConfig = JSON.parse(resInfo.getContentText());

        // Channels (API 1.0)
        const resCh = UrlFetchApp.fetch(`https://www.worksapis.com/v1.0/bots/${botId}/channels`, {
            headers: { Authorization: `Bearer ${token}` },
            muteHttpExceptions: true
        });
        output.apiDiagnosis.channels = JSON.parse(resCh.getContentText());
    } catch (apiErr) {
        output.apiDiagnosis.error = apiErr.toString();
    }

    // BQ User Master Check
    try {
        const bq = getBigQueryClient();
        const userCount = bq.runQuery(`SELECT COUNT(*) as cnt FROM \`${Config.BIGQUERY.DATASET_ID}.user_master\``);
        output.userMasterStatus = {
            count: userCount.length > 0 ? userCount[0].cnt : 0,
            exists: true
        };
    } catch (e) {
        output.userMasterStatus = { exists: false, error: e.toString() };
    }

    // 8. 利用者マスタのデータ確認 (最新10件)
    if (e.parameter.dbcheck === '1') {
        try {
            const bq = getBigQueryClient();
            const data = bq.runQuery(`SELECT * FROM \`${Config.BIGQUERY.DATASET_ID}.user_master\` ORDER BY last_updated DESC LIMIT 20`);
            return ContentService.createTextOutput(JSON.stringify(data, null, 2))
                .setMimeType(ContentService.MimeType.JSON);
        } catch (err) {
            return ContentService.createTextOutput(`❌ DB取得エラー: ${err.toString()}`)
                .setMimeType(ContentService.MimeType.TEXT);
        }
    }

    return ContentService.createTextOutput(JSON.stringify(output, null, 2))
        .setMimeType(ContentService.MimeType.JSON);
}

// ----------------------------------------------------------------------
// トリガーエントリーポイント
// ----------------------------------------------------------------------

/**
 * 毎時の定期実行
 * 売上メールの取込と、カレンダー同期を実行
 */
function scheduledHourly() {
    Logger.info('--- Hourly Sync Cycle Started ---');

    try {
        // 1. 設定チェック
        checkConfiguration();

        // 2. 売上連携 (Module 3)
        runSalesIngestion();

        // 3. カレンダー同期 (Module 1)
        runCalendarSync();

    } catch (e) {
        Logger.error('Error in scheduledHourly', e);
        notifyAdmin(`Error in scheduledHourly: ${e.message}`);
    }
}

/**
 * 売上サマリーをLINEで報告する (速報・確定報)
 * @param {boolean} isPreviousDay 前日分を集計する場合はtrue
 */
function scheduledSalesReport(isPreviousDay = false) {
    Logger.info(`--- Sales Report Execution Started (PreviousDay: ${isPreviousDay}) ---`);
    try {
        const d = new Date();
        if (isPreviousDay) d.setDate(d.getDate() - 1);
        const targetDate = `${d.getFullYear()}-${('0' + (d.getMonth() + 1)).slice(-2)}-${('0' + d.getDate()).slice(-2)}`;

        const bq = getBigQueryClient();
        // 店舗、商品ごとに集計
        const query = `
            WITH latest_sales AS (
                SELECT 
                    transaction_date, 
                    store_name, 
                    item_name, 
                    amount, 
                    quantity,
                    ROW_NUMBER() OVER(PARTITION BY transaction_date, store_name, item_name ORDER BY email_time DESC, created_at DESC) as rank
                FROM \`${Config.BIGQUERY.DATASET_ID}.${Config.BIGQUERY.TABLES.SALES}\`
                WHERE transaction_date = '${targetDate}'
            )
            SELECT 
                store_name, 
                item_name,
                quantity as total_qty,
                amount as total_amount 
            FROM latest_sales
            WHERE rank = 1
            ORDER BY store_name ASC, total_amount DESC
        `;

        const results = bq.runQuery(query);

        if (results.length > 0) {
            const title = isPreviousDay ? `🗓 【前日確定報】 ${targetDate}` : `🚀 【当日売上速報】 ${targetDate}時点`;
            let message = `${title}\n\n`;

            let currentStore = '';
            let storeTotal = 0;
            let grandTotal = 0;

            results.forEach((row, i) => {
                const storeName = row.store_name || '不明な店舗';
                if (currentStore !== storeName) {
                    // 前の店舗の合計を出力
                    if (currentStore !== '') {
                        message += `  >> 店舗計: ¥${storeTotal.toLocaleString()}\n\n`;
                    }
                    message += `🏪 ${storeName}\n`;
                    currentStore = storeName;
                    storeTotal = 0;
                }

                message += `  ・${row.item_name}: ${row.total_qty}点 / ¥${Number(row.total_amount).toLocaleString()}\n`;
                storeTotal += Number(row.total_amount);
                grandTotal += Number(row.total_amount);

                // 最後の行なら店舗計を出力
                if (i === results.length - 1) {
                    message += `  >> 店舗計: ¥${storeTotal.toLocaleString()}\n`;
                }
            });

            message += `\n━━━━━━━━━━━━\n💰 総合計: ¥${grandTotal.toLocaleString()}`;

            notifyLineWorks(message);
        } else if (isPreviousDay) {
            notifyLineWorks(`🗓 【前日確定報】 ${targetDate}\n売上データはありませんでした。`);
        }
    } catch (e) {
        Logger.error('Sales Report Failed', e);
    }
}

/**
 * 定時実行用のラッパー
 */
function scheduledDailyReport() { scheduledSalesReport(false); }
function scheduledMorningReport() { scheduledSalesReport(true); }

/**
 * 毎月の定期アーカイブ実行
 * 前月分のデータをBigQueryから抽出し、スプレッドシートに保存
 */
function runMonthlyArchive() {
    Logger.info('--- Monthly Archive Process Started ---');
    const archiver = new MonthlyArchiver();

    // 前月の年月を取得
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    try {
        archiver.archiveMonth(year, month);
        notifyAdmin(`✅ ${year}年${month}月のアーカイブが完了しました。`);
    } catch (e) {
        Logger.error('Monthly archive failed', e);
        notifyAdmin(`❌ 月次アーカイブに失敗しました: ${e.message}`);
    }
}

/**
 * プロジェクトの初期化
 * 初回同期を実行し、定期実行トリガーを設定する
 */
function initProjectSync() {
    console.log('--- Initializing Project Sync & Triggers ---');

    // 既存の同名トリガーを削除（重複防止）
    const triggers = ScriptApp.getProjectTriggers();
    const targetFunctions = ['scheduledHourly', 'scheduledDailyReport', 'scheduledMorningReport', 'runMonthlyArchive'];

    triggers.forEach(t => {
        if (targetFunctions.includes(t.getHandlerFunction())) {
            ScriptApp.deleteTrigger(t);
        }
    });

    // 1. 初回同期を今すぐ実行
    console.log('Running initial sync...');
    scheduledHourly();

    // 2. 1時間毎のトリガーを作成
    ScriptApp.newTrigger('scheduledHourly')
        .timeBased()
        .everyHours(1)
        .create();

    // 3. 当日速報トリガー (10:30, 12:30, 15:30, 18:30, 21:30)
    const quickHours = [10, 12, 15, 18, 21];
    quickHours.forEach(hour => {
        ScriptApp.newTrigger('scheduledDailyReport')
            .timeBased()
            .atHour(hour)
            .nearMinute(30)
            .everyDays(1)
            .create();
    });

    // 4. 翌朝の前日確定報 (07:30)
    ScriptApp.newTrigger('scheduledMorningReport')
        .timeBased()
        .atHour(7)
        .nearMinute(30)
        .everyDays(1)
        .create();

    // 5. 毎月1日の早朝にアーカイブトリガーを作成
    ScriptApp.newTrigger('runMonthlyArchive')
        .timeBased()
        .onMonthDay(1)
        .atHour(3)
        .create();

    console.log('Triggers set: scheduledHourly(hourly) and runMonthlyArchive(monthly).');
    console.log('--- Initialization Finished ---');

    notifyAdmin('🚀 Enterprise Suite は正常に起動しました。定期同期が有効になりました。');
}

/**
 * カレンダー同期を実行
 */
function runCalendarSync() {
    Logger.info('--- Starting Calendar Sync Cycle ---');
    const engine = new CalendarSyncEngine();

    // 1. LINE WORKS -> Google カレンダー (全ユーザー分)
    try {
        engine.syncAllUsers();
    } catch (e) {
        Logger.error('Error in LW -> Google sync', e);
    }

    // 2. Google カレンダー -> LINE WORKS (設定されたペア分)
    try {
        const pairs = Config.GOOGLE_CALENDAR.SYNC_PAIRS || [];
        pairs.forEach(pair => {
            engine.syncGoogleToLW(pair.gCalId, pair.lwUserId, pair.lwCalendarId);
        });
    } catch (e) {
        Logger.error('Error in Google -> LW sync', e);
    }
}

/**
 * 売上メールの取込とDB保存を実行する
 */
function runSalesIngestion() {
    Logger.info('Executing Sales Ingestion...');
    const ingestion = new SalesEmailIngestionService();
    const repository = new SalesRepository();

    // 1. 直近の既存の登録済みメールIDを取得 (重複回避のため)
    // Gmail検索範囲(newer_than:2d)より少し広めに取得
    const bq = getBigQueryClient();
    const existingResult = bq.runQuery(`
        SELECT DISTINCT email_id 
        FROM \`${Config.BIGQUERY.DATASET_ID}.${Config.BIGQUERY.TABLES.SALES}\` 
        WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 DAY)
    `);
    const excludedIds = existingResult.map(r => r.email_id);

    // 2. メール取込 (既読・未読問わず、重複を除外して解析)
    const results = ingestion.processNewEmails(null, excludedIds);

    if (results.length > 0) {
        // 通知抑制（ユーザー要望: 速報だけで良いので、取込報告は不要）
        // let notifyMessage = '📦 売上データを取り込みました\n\n';
        // results.forEach(result => {
        //     repository.processTransaction(result);
        //     ...
        // });
        // notifyLineWorks(notifyMessage);

        results.forEach(result => {
            repository.processTransaction(result);
        });
        Logger.info(`Ingested ${results.length} emails silently.`);
    }
}

// ----------------------------------------------------------------------
// ヘルパー関数
// ----------------------------------------------------------------------

/**
 * 管理者に通知を送る
 */
function notifyAdmin(message) {
    notifyLineWorks(`[ADMIN ALERT] ${message}`);
}

/**
 * LINE WORKS Botでメッセージを送信する
 * @param {string} message 
 */
function notifyLineWorks(message) {
    const lineAuth = new LineWorksAuth();
    const token = lineAuth.getAccessToken();
    const botId = Config.LINEWORKS.BOT_ID;

    // 日報チャンネルIDが設定されていれば優先、なければ通知用チャンネルID
    const channelId = Config.LINEWORKS.REPORT_CHANNEL_ID || PropertiesService.getScriptProperties().getProperty('NOTIFICATION_CHANNEL_ID');

    if (!channelId) {
        Logger.warn('Notification skipped: NOTIFICATION_CHANNEL_ID not set in Script Properties.');
        return;
    }

    const url = `https://www.worksapis.com/v1.0/bots/${botId}/channels/${channelId}/messages`;

    const payload = {
        content: {
            type: 'text',
            text: message
        }
    };

    const options = {
        method: 'post',
        headers: {
            Authorization: `Bearer ${token}`
        },
        payload: JSON.stringify(payload),
        contentType: 'application/json',
        muteHttpExceptions: true
    };

    try {
        const response = UrlFetchApp.fetch(url, options);
        const resCode = response.getResponseCode();
        if (resCode !== 200 && resCode !== 201) {
            Logger.error(`Failed to send LINE WORKS notification: ${response.getContentText()}`);
        }
    } catch (e) {
        Logger.error('Failed to send LINE WORKS notification', e);
    }
}
