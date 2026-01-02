/**
 * Debug.js
 * 動作確認用および情報取得用のユーティリティ。
 * これを使用してBotの設定や接続確認を行います。
 */

/**
 * LINE WORKSとの疎通確認（アクセストークンの取得テスト）
 */
function testLineWorksAuth() {
    try {
        const auth = new LineWorksAuth();
        const token = auth.getAccessToken('bot');
        console.log('✅ Access Token retrieved successfully.');
        console.log('Token (first 10 chars): ' + token.substring(0, 10) + '...');
        return true;
    } catch (e) {
        console.error('❌ Line Works Auth Test Failed:', e.message);
        return false;
    }
}

/**
 * Botが参加しているトークルーム（チャンネル）の一覧を取得する
 * 通知を送信すべきチャンネルID（Channel ID）を特定するために使用します。
 */
function listBotChannels() {
    try {
        const auth = new LineWorksAuth();
        const token = auth.getAccessToken('bot');
        const botId = Config.LINEWORKS.BOT_ID;

        // API v1.0 endpoint (As confirmed in documentation)
        const url = `https://www.worksapis.com/v1.0/bots/${botId}/channels`;
        const options = {
            headers: { Authorization: `Bearer ${token}` },
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(url, options);
        const result = JSON.parse(response.getContentText());

        if (result.channels) {
            console.log('=== Bot Channels ===');
            result.channels.forEach(ch => {
                console.log(`- Name: ${ch.channelName || 'Private/No Name'} (ID: ${ch.channelId})`);
            });
        } else {
            console.log('No channels found or error:', result);
        }
    } catch (e) {
        console.error('Failed to list channels:', e);
    }
}

/**
 * 特定のチャンネルにテストメッセージを送る
 * @param {string} channelId 
 */
function sendTestMessage(channelId) {
    const lineAuth = new LineWorksAuth();
    const token = lineAuth.getAccessToken('bot');
    const botId = Config.LINEWORKS.BOT_ID;

    const url = `https://www.worksapis.com/v1.0/bots/${botId}/channels/${channelId}/messages`;

    const payload = {
        content: {
            type: 'text',
            text: '🤖 4_Enterprise_Suite からのテストメッセージです。接続は正常です！'
        }
    };

    const options = {
        method: 'post',
        headers: { Authorization: `Bearer ${token}` },
        payload: JSON.stringify(payload),
        contentType: 'application/json',
        muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    console.log('Response:', response.getContentText());
}

/**
 * ユーザー指定のチャンネルIDへテストメッセージを送信
 */
function finalTestSend() {
    sendTestMessage('2ddfe141-b9d5-6c2a-8027-43e009a916bc');
}

/**
 * ユーザー一覧を取得する
 */
function listUsers() {
    try {
        const auth = new LineWorksAuth();
        const token = auth.getAccessToken('directory'); // Directory scope
        const url = 'https://www.worksapis.com/v1.0/users';

        const options = {
            headers: { Authorization: `Bearer ${token}` },
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(url, options);
        const result = JSON.parse(response.getContentText());

        if (result.users) {
            console.log('=== Registered Users ===');
            result.users.forEach(u => {
                const n = u.userName || u.name;
                const lastName = (n && n.lastName) ? n.lastName : '';
                const firstName = (n && n.firstName) ? n.firstName : '';
                console.log(`- Name: ${lastName}${firstName} (${u.email || ''}) (ID: ${u.userId})`);
            });
        } else {
            console.log('No users found or error:', result);
        }
    } catch (e) {
        console.error('Failed to list users:', e);
    }
}

/**
 * カレンダーAPIの疎通確認（ユーザーのカレンダー一覧取得テスト）
 */
function testCalendarAuth() {
    const userId = 'd28b88f0-24ba-4fa0-1a14-046ff737ee66'; // 村田様の有効なID
    try {
        const service = new CalendarService();
        const calendars = service.getUserCalendars(userId);
        console.log(`✅ Successfully fetched ${calendars.length} calendars for user: ${userId}`);
        calendars.forEach(cal => {
            console.log(`- Calendar: ${cal.calendarName} (ID: ${cal.calendarId})`);
        });
        return true;
    } catch (e) {
        console.error('❌ Calendar Auth Test Failed:', e.message);
        return false;
    }
}

/**
 * カレンダー同期の詳細テスト
 * 実際の同期ロジック (SyncEngine) を動作させ、Googleカレンダーへの反映とBigQueryへの保存を確認する
 */
function debug_syncCalendarTest() {
    const userId = 'd28b88f0-24ba-4fa0-1a14-046ff737ee66'; // 村田様の有効なID
    console.log(`--- Starting Calendar Sync Test for User: ${userId} ---`);

    try {
        const engine = new CalendarSyncEngine();

        // テスト実行: runSyncForUserを直接呼び出す
        // ※注意: GoogleカレンダーIDが正しくConfigに設定されている必要があります。
        engine.runSyncForUser(userId, 'TestUser(Murata)', null);

        console.log('✅ Calendar Sync Test Execution Finished.');
        console.log('Please check:');
        console.log('1. Google Calendar for new/updated events.');
        console.log('2. BigQuery table `enterprise_suite_data.calendar_events` for logs.');

    } catch (e) {
        console.error('❌ Calendar Sync Test Failed:', e);
    }
}

/**
 * BigQueryのデータセットおよびテーブルを初期化する
 */
function initializeBigQueryTables() {
    const bq = getBigQueryClient();

    const queries = [
        // 1. データセットの作成
        "CREATE SCHEMA IF NOT EXISTS `enterprise_suite_data` OPTIONS (location = 'asia-northeast1')",

        // 2. 売上トランザクションテーブル
        `CREATE TABLE IF NOT EXISTS \`enterprise_suite_data.sales_transactions\`
        (
            transaction_date DATE,
            store_name STRING,
            item_name STRING,
            quantity INT64,
            amount INT64,
            created_at TIMESTAMP,
            email_subject STRING,
            email_id STRING,
            note STRING
        )
        PARTITION BY transaction_date
        CLUSTER BY store_name, item_name`,

        // 3. チャットログテーブル
        `CREATE TABLE IF NOT EXISTS \`enterprise_suite_data.chat_logs\`
        (
            message_id STRING,
            channel_id STRING,
            user_id STRING,
            content STRING,
            content_type STRING,
            created_at TIMESTAMP,
            sentiment_score FLOAT64,
            keywords ARRAY<STRING>,
            summary STRING,
            ingested_at TIMESTAMP
        )
        PARTITION BY DATE(created_at)
        CLUSTER BY channel_id, user_id`,

        // 4. カレンダーイベントテーブル
        `CREATE TABLE IF NOT EXISTS \`enterprise_suite_data.calendar_events\`
        (
            event_id STRING,
            lw_event_id STRING,
            calendar_id STRING,
            summary STRING,
            description STRING,
            start_time TIMESTAMP,
            end_time TIMESTAMP,
            location STRING,
            status STRING,
            html_link STRING,
            last_synced_at TIMESTAMP
        )
        PARTITION BY DATE(start_time)
        CLUSTER BY calendar_id, event_id`,

        // 5. 売上サマリービュー
        `CREATE OR REPLACE VIEW \`enterprise_suite_data.daily_sales_summary\` AS
        SELECT
            transaction_date,
            store_name,
            SUM(amount) as total_sales,
            SUM(quantity) as total_items,
            COUNT(*) as transaction_count
        FROM
            \`enterprise_suite_data.sales_transactions\`
        GROUP BY 1, 2`,

        // 6. 商品マスタ
        `CREATE TABLE IF NOT EXISTS \`enterprise_suite_data.product_master\`
        (
            store_name STRING,
            product_name STRING,
            price INT64,
            stock_quantity INT64,
            category STRING,
            last_updated TIMESTAMP
        )
        CLUSTER BY store_name, product_name`,

        // 7. 店舗マスタ
        `CREATE TABLE IF NOT EXISTS \`enterprise_suite_data.store_master\`
        (
            store_name STRING,
            store_id STRING,
            keywords ARRAY<STRING>,
            manager_email STRING
        )`
    ];

    console.log('--- Starting BigQuery Table Initialization ---');
    queries.forEach((q, i) => {
        try {
            bq.runQuery(q);
            console.log(`✅ Query ${i + 1} executed successfully.`);
        } catch (e) {
            console.error(`❌ Query ${i + 1} failed:`, e.message);
        }
    });
    console.log('--- Initialization Finished ---');
}

/**
 * BigQueryのチャットログ最新5件を取得して表示する
 */
function checkLatestChatLogs() {
    console.log('--- Checking Latest Chat Logs from BigQuery ---');
    const bq = getBigQueryClient();
    const query = 'SELECT * FROM `enterprise_suite_data.chat_logs` ORDER BY created_at DESC LIMIT 5';

    try {
        const results = bq.runQuery(query);
        if (results.length === 0) {
            console.log('No chat logs found.');
        } else {
            console.log(`Found ${results.length} recent logs:`);
            results.forEach((row, i) => {
                console.log(`[${i + 1}] ${row.created_at} | User:${row.user_id} | Msg:${row.content}`);
            });
        }
    } catch (e) {
        console.error('Failed to fetch chat logs:', e);
    }
}

/**
 * Botの設定情報をAPI経由で取得して確認する（Webhook設定診断用）
 */
function debug_getBotInfo() {
    console.log('--- Checking Bot Configuration via API ---');
    try {
        const token = LineWorksAuth.getAccessToken();
        const botId = Config.LINEWORKS.BOT_ID;

        console.log(`Fetching info for Bot ID: ${botId}`);

        // API 2.0 Bot Info Endpoint
        const url = `https://www.worksapis.com/v1.0/bots/${botId}`;
        const options = {
            method: 'get',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(url, options);
        const code = response.getResponseCode();
        const content = response.getContentText();

        console.log(`Response Code: ${code}`);

        if (code === 200) {
            const data = JSON.parse(content);
            console.log('Bot Info Retrieved Successfully:');
            console.log(`Name: ${data.botName}`);
            console.log(`Status: ${data.status}`);
            console.log(`Callback URL: ${data.callbackUrl}`);
            // Callback Eventsの確認 (API 1.0/2.0でフィールド名が異なる場合があるためDumpする)
            console.log('--- FULL BOT SETTINGS ---');
            console.log(JSON.stringify(data, null, 2));
            console.log('-------------------------');

            // 簡易診断
            if (data.status !== 'Activated' && data.status !== 'Normal') {
                console.warn('⚠️ WARNING: Bot status is NOT Active! (It is ' + data.status + ')');
            }
            if (!data.useCallback) {
                console.warn('⚠️ WARNING: useCallback is FALSE (or undefined). Webhook will not fire.');
            }

        } else {
            console.error(`Failed to get Bot info. Response: ${content}`);
        }
    } catch (e) {
        console.error('Error in debug_getBotInfo:', e);
    }
}

/**
 * Webhookの挙動をシミュレートするテスト関数
 */
function debug_testWebhookSimulated() {
    const testPayload = {
        "type": "message",
        "source": {
            "userId": "test_user_id",
            "roomId": "test_room_id"
        },
        "content": {
            "type": "text",
            "text": "これはGAS内部からのシミュレーションテストです"
        },
        "timestamp": Date.now()
    };

    console.log("Starting Webhook Simulation...");
    try {
        const chatLogger = new ChatLoggerService();
        chatLogger.handleWebhookMessage(testPayload);
        console.log("Simulation finished. Please check BigQuery 'chat_logs' table.");
    } catch (err) {
        console.error("Simulation failed: " + err.stack);
    }
}

/**
 * 売上メール取込のシミュレーション
 * Gemini APIとBigQueryへの保存テストを行います。
 */
function debug_verifySalesIngestion() {
    console.log('--- Starting Sales Ingestion Test ---');

    // 1. Mock Data作成
    const mockEmailData = {
        id: `mock_email_${Date.now()}`,
        date: new Date(),
        subject: '売上報告 四季菜 尾平店',
        from: 'store@example.com',
        body: `
        お疲れ様です。本日の売上報告です。
        
        店舗：四季菜 尾平店
        
        白ねぎ: 20束
        大根: 5本
        
        売上合計: 4500円
        
        よろしくお願いします。
        `
    };

    try {
        // 2. Gemini解析テスト (EmailIngestionServiceの一部ロジックを利用)
        // Note: privateメソッドへのアクセスは工夫が必要だが、ここではServiceごとテストする
        // ただしServiceはGmailApp.searchを使うため、モック注入が難しい。
        // ここでは直接GeminiClientとSalesRepositoryを使う。

        const gemini = getGeminiClient();
        const repository = new SalesRepository();

        console.log('Testing Gemini Analysis...');
        const prompt = `
        Extract sales data from this email:
        Subject: ${mockEmailData.subject}
        Body: ${mockEmailData.body}
        
        Output JSON: { "date": "YYYY-MM-DD", "store_name": "...", "total_sales_amount": ... }
        `;

        const analysis = gemini.generateJson(prompt);
        console.log('Analysis Result:', JSON.stringify(analysis, null, 2));

        if (analysis) {
            // 3. BigQuery保存テスト
            console.log('Testing BigQuery Insert...');
            repository.processTransaction({
                source: mockEmailData,
                data: analysis
            });
            console.log('✅ Sales Ingestion Test Completed. Check BigQuery tables.');
        } else {
            console.error('❌ Gemini Analysis failed.');
        }

    } catch (e) {
        console.error('❌ Sales Ingestion Test Failed:', e);
    }
}

/**
 * 店舗名正規化のテスト
 */
function debug_testStoreNormalization() {
    const repository = new SalesRepository();
    const cases = ["1号館常盤店", "(株)一号舘 常盤店", "Aコープ", "四季彩 常磐"];
    cases.forEach(c => {
        console.log(`Input: ${c} => Normalized: ${repository._normalizeStoreName(c)}`);
    });
}

/**
 * 利用可能なGeminiモデル一覧を取得してログ出力する
 */
function debug_listModels() {
    console.log('--- Checking Available Gemini Models ---');
    const apiKey = Config.GEMINI.API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        const data = JSON.parse(response.getContentText());

        if (data.models) {
            console.log(`Found ${data.models.length} models:`);
            data.models.forEach(m => {
                if (m.name.includes('gemini')) {
                    console.log(`- ${m.name} (${m.displayName})`);
                }
            });
        } else {
            console.error('No models found or error:', data);
        }
    } catch (e) {
        console.error('Failed to list models:', e);
    }
}

/**
 * 全ユーザーの過去（1年前から現在）および未来のイベントを同期・移行する
 * 注意: これを実行するとGoogleカレンダーに大量のイベントが作成される可能性があります。
 */
function runFullMigrationSync() {
    console.log('--- Starting Full Migration Sync for ALL Users ---');

    // 期間設定: 1年前 〜 60日後
    const now = new Date();
    const end = new Date(now);
    end.setDate(now.getDate() + 60);

    const start = new Date(now);
    start.setFullYear(now.getFullYear() - 1); // 1年前

    console.log(`Sync Period: ${start.toISOString()} ~ ${end.toISOString()}`);

    try {
        const directory = new DirectoryService();
        const engine = new CalendarSyncEngine();

        const users = directory.getUsers();
        console.log(`Found ${users.length} users in Directory.`);

        users.forEach(user => {
            const name = user.userName ? `${user.userName.lastName}${user.userName.firstName}` : user.userId;
            console.log(`>>> Processing User: ${name} (${user.userId})`);
            try {
                // カスタム期間で同期実行 (GCal反映スキップ: dryRun=true)
                // これにより、GCalには書き込まず、BigQueryにのみ「migrated_found」としてログが残る
                engine.runSyncForUser(user.userId, name, null, start, end, true);
            } catch (err) {
                console.error(`Failed to sync user ${name}:`, err);
            }
        });

        console.log('✅ Full Migration Sync Finished.');

    } catch (e) {
        console.error('❌ Migration Sync Failed:', e);
    }
}



/**
 * BigQueryのカレンダーテーブルのレコード数を確認する
 */
function checkCalendarBigQueryData() {
    const bq = getBigQueryClient();
    const query = 'SELECT COUNT(*) as count FROM `enterprise_suite_data.calendar_events`';

    try {
        console.log('--- Checking BigQuery Calendar Data ---');
        const results = bq.runQuery(query);
        console.log('Total Calendar Events in BigQuery:', results[0].count);

        // サンプル取得
        if (results[0].count > 0) {
            const sampleQuery = 'SELECT * FROM `enterprise_suite_data.calendar_events` LIMIT 3';
            const samples = bq.runQuery(sampleQuery);
            console.log('Sample Events:', JSON.stringify(samples, null, 2));
        }
    } catch (e) {
        console.error('Failed to check BQ data:', e.message);
    }
}


/**
 * Googleカレンダー（マスターカレンダー）の全イベントをBigQueryへ移行する
 * LINE WORKS APIからデータが取れない場合や、Googleカレンダーが正データである場合に使用
 */
function migrateGoogleCalendarToBigQuery() {
    console.log('--- Starting Migration from Google Calendar to BigQuery ---');

    const calendarId = Config.GOOGLE_CALENDAR.MASTER_CALENDAR_ID;
    if (!calendarId) {
        console.error('Master Calendar ID is not configured.');
        return;
    }

    // 期間設定: 1年前 〜 60日後
    const now = new Date();
    const end = new Date(now);
    end.setDate(now.getDate() + 60);

    const start = new Date(now);
    start.setFullYear(now.getFullYear() - 1);

    console.log(`Source Calendar: ${calendarId}`);
    console.log(`Period: ${start.toISOString()} ~ ${end.toISOString()}`);

    try {
        const gCal = CalendarApp.getCalendarById(calendarId);
        const events = gCal.getEvents(start, end);
        console.log(`Found ${events.length} events in Google Calendar.`);

        if (events.length > 0) {
            const rows = events.map(ev => {
                return {
                    event_id: ev.getId(),
                    lw_event_id: null, // GCal由来なのでnull、あるいはdescriptionから抽出も可
                    calendar_id: calendarId,
                    summary: ev.getTitle() || '(No Title)',
                    description: ev.getDescription() || '',
                    start_time: ev.getStartTime().toISOString(),
                    end_time: ev.getEndTime().toISOString(),
                    location: ev.getLocation() || '',
                    status: 'migrated_from_gcal',
                    html_link: '',
                    last_synced_at: new Date().toISOString()
                };
            });

            // Batch insert
            const bq = getBigQueryClient();
            const datasetId = Config.BIGQUERY.DATASET_ID;
            const tableId = Config.BIGQUERY.TABLES.CALENDAR_EVENTS;

            // Chunking
            const chunkSize = 500;
            for (let i = 0; i < rows.length; i += chunkSize) {
                const chunk = rows.slice(i, i + chunkSize);
                bq.insertRows(datasetId, tableId, chunk);
                console.log(`Inserted ${chunk.length} events to BigQuery.`);
            }
        }

        console.log('✅ Google Calendar Migration Finished.');

    } catch (e) {
        console.error('❌ GCal Migration Failed:', e);
    }
}
/**
 * Web App (doPost) への自己接続テスト
 */
function debug_testWebAppConnectivity() {
    console.log('--- Testing Web App Connectivity (Self-POST) ---');
    const webAppUrl = ScriptApp.getService().getUrl();
    if (!webAppUrl) {
        console.error('Web App URL not found. Deploy as Web App first.');
        return;
    }
    console.log(`Target URL: ${webAppUrl}`);

    const payload = {
        type: 'message',
        source: { userId: 'connectivity_test_user' },
        content: { type: 'text', text: 'Self-test reached doPost!' }
    };

    const options = {
        method: 'post',
        payload: JSON.stringify(payload),
        contentType: 'application/json',
        muteHttpExceptions: true
    };

    try {
        const response = UrlFetchApp.fetch(webAppUrl, options);
        console.log(`Response Code: ${response.getResponseCode()}`);
        console.log(`Response Body: ${response.getContentText()}`);

        // プロパティが更新されたか確認
        const lastAt = PropertiesService.getScriptProperties().getProperty('LAST_WEBHOOK_AT');
        console.log(`LAST_WEBHOOK_AT in Properties: ${lastAt}`);

        if (lastAt && lastAt.includes(new Date().toLocaleDateString('ja-JP'))) {
            console.log('✅ Connectivity Test SUCCESS: doPost successfully triggered and saved property.');
        } else {
            console.warn('⚠️ Connectivity Test INCOMPLETE: doPost reached but property NOT updated (or delayed).');
        }
    } catch (e) {
        console.error('❌ Connectivity Test FAILED:', e);
    }
}

/**
 * 監視対象のチャンネルIDを設定する (一度だけ実行)
 */
function debug_setMonitorChannels() {
    const ids = [
        '2ddfe141-b9d5-6c2a-8027-43e009a916bc',
        '7d6b452d-2dce-09ac-7663-a2f47d622e91',
        'f1e89203-beae-c706-b132-29d954384b4b'
    ];
    PropertiesService.getScriptProperties().setProperty('MONITOR_CHANNEL_IDS', ids.join(','));
    console.log('✅ MONITOR_CHANNEL_IDS set successfully:', ids);
}

/**
 * BIGQUERY_PROJECT_ID を表示する
 */
function debug_printProjectId() {
    const projectId = PropertiesService.getScriptProperties().getProperty('BIGQUERY_PROJECT_ID');
    console.log('--- Current BigQuery Project ID ---');
    console.log(projectId);

    // フォルダ検索
    const folders = DriveApp.getFoldersByName('BigQuery 可視化ダッシュボード');
    if (folders.hasNext()) {
        const folder = folders.next();
        console.log('--- Visualization Folder URL ---');
        console.log(folder.getUrl());
    } else {
        console.log('Visualization folder not found yet.');
    }
    return projectId;
}

/**
 * 12月8日以降の売上メールをバックフィル（再取り込み）する
 * レポートの提言に基づき、過去の欠損データをGmailから復旧します。
 */
function debug_runSalesBackfill() {
    console.log('--- Starting Sales History Backfill (from 2024/12/08) ---');
    const ingestion = new SalesEmailIngestionService();
    const repository = new SalesRepository();

    // 12/08以降を指定して取得 (既読分も対象)
    const results = ingestion.runBackfill('2024/12/08');

    if (results.length > 0) {
        console.log(`Found ${results.length} emails to process.`);
        results.forEach((result, i) => {
            console.log(`[${i + 1}/${results.length}] Processing: ${result.source.subject}`);
            repository.processTransaction(result);
        });
        console.log('✅ Backfill Completed. Please check BigQuery sales_transactions table.');
    } else {
        console.log('No results found for the backfill period.');
    }
}

/**
 * 月次アーカイブの手動テスト（前月分）
 */
function debug_testMonthlyArchive() {
    runMonthlyArchive();
}

/**
 * 過去分のアーカイブを一括作成
 * 2025年1月から前月分までをBigQueryから抽出してシート化します。
 */
function debug_backfillArchives() {
    console.log('--- Starting Archive Backfill (from 2025/01) ---');
    const archiver = new MonthlyArchiver();
    try {
        archiver.backfill(2025, 1);
        console.log('✅ Archive Backfill Completed.');
    } catch (e) {
        console.error('❌ Archive Backfill Failed:', e);
    }
}

/**
 * 不要なアーカイブ用フォルダのクリーンアップ
 */
/**
 * チャット履歴のリカバリを実行
 * 欠落している12/8〜現在までのログをAPIで取得し、BigQueryに保存します。
 */
function debug_recoverChatLogs() {
    const recoverer = new ChatHistoryRecoverer();
    // ユーザー指定の12/8からリカバリを開始
    recoverer.recoverAll('2025-12-08');
}

/**
 * LINE WORKSコンソールからエクスポートしたCSVをBigQueryにインポート
 */
function debug_importChatCsv() {
    const importer = new ChatCsvImporter();
    // ユーザー指定のファイルをインポート
    importer.importFromDrive('message-contents_20251223_2306.csv');
}

/**
 * 既存のチャットログに対して利用者情報の紐付け（ターゲティング）を再スキャンして実行
 */
function debug_enrichChatLogs() {
    const enricher = new ChatDataEnricher();
    enricher.enrichExistingLogs(Config.BIGQUERY.DATASET_ID, Config.BIGQUERY.TABLES.CHAT_LOGS);
}

/**
 * 当月（12月）の売上・チャットデータを強制的にスプレッドシートにアーカイブする
 * ユーザーが即座に結果を確認するために使用。
 */
function debug_archiveCurrentMonth() {
    console.log('--- Forcing Archive for Current Month ---');
    const archiver = new MonthlyArchiver();
    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    try {
        archiver.archiveMonth(year, month);
        console.log(`✅ ${year}年${month}月のアーカイブが完了しました。スプレッドシートを確認してください。`);
    } catch (e) {
        console.error('❌ Manual archive failed:', e);
    }
}

/**
 * 本日の売上サマリーをLINEに手動送信テストする（19時の自動報告のテスト用）
 */
/**
 * 売上データの蓄積・転記状況を診断し、ログに出力する
 */
function debug_diagnoseSalesStatus() {
    console.log('--- 🛡 売上データ稼働状況 診断開始 ---');
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = Config.BIGQUERY.TABLES.SALES;

    // 1. BigQueryの登録状況確認 (直近7日間)
    try {
        const query = `
            SELECT transaction_date, COUNT(*) as count, SUM(amount) as total 
            FROM \`${datasetId}.${tableId}\` 
            WHERE transaction_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
            GROUP BY transaction_date 
            ORDER BY transaction_date DESC
        `;
        const results = bq.runQuery(query);
        if (results.length > 0) {
            console.log('✅ BigQuery登録状況 (直近7日):');
            results.forEach(r => {
                console.log(` - ${r.transaction_date}: ${r.count}件 (計 ¥${Number(r.total).toLocaleString()})`);
            });
        } else {
            console.warn('⚠️ BigQueryに直近7日間の売上データが見つかりません。');
        }
    } catch (e) {
        console.error('❌ BigQuery確認エラー:', e.message);
    }

    // 2. スプレッドシートの転記状況確認
    try {
        const archiver = new MonthlyArchiver();
        const year = new Date().getFullYear();
        const month = new Date().getMonth() + 1;
        const targetFolderName = '01_売上明細（全期間）';
        const fileName = `${year}_${('0' + month).slice(-2)}_売上明細`;

        const rootFolderId = Config.ARCHIVE.ROOT_FOLDER_ID;
        const parentId = archiver.findSubFolderIdREST(rootFolderId, targetFolderName);
        const fileId = archiver.findFileInFolderIdREST(parentId, fileName);

        if (fileId) {
            const ss = SpreadsheetApp.openById(fileId);
            const sheet = ss.getSheets()[0];
            const rows = sheet.getLastRow();
            console.log(`✅ スプレッドシート確認: ${fileName}`);
            console.log(` - ファイルID: ${fileId}`);
            console.log(` - 現在の行数: ${rows}行 (1行目はヘッダー)`);
            if (rows <= 1) {
                console.warn(' ⚠️ ファイルはありますが、データが転記されていない可能性があります。debug_archiveCurrentMonth を実行してください。');
            }
        } else {
            console.error(`❌ ${fileName} が見つかりません。転記が一度も行われていない可能性があります。`);
        }
    } catch (e) {
        console.error('❌ スプレッドシート確認エラー:', e.message);
    }
    console.log('--- 🛡 診断完了 ---');
}

/**
 * BigQuery内の売上データを月別に集計して表示する
 */
function debug_diagnoseAllSalesByMonth() {
    console.log('--- 🛡 月別売上データ蓄積状況 調査開始 ---');
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = Config.BIGQUERY.TABLES.SALES;

    const query = `
        SELECT 
            FORMAT_DATE('%Y-%m', transaction_date) as month,
            COUNT(*) as record_count,
            SUM(amount) as total_amount,
            COUNT(DISTINCT transaction_date) as active_days
        FROM \`${datasetId}.${tableId}\`
        GROUP BY month
        ORDER BY month DESC
    `;

    try {
        const results = bq.runQuery(query);
        if (results.length > 0) {
            console.log('📅 月別集計結果:');
            results.forEach(r => {
                console.log(` - ${r.month}: ${r.record_count}件 / 稼働${r.active_days}日 (計 ¥${Number(r.total_amount).toLocaleString()})`);
            });
        } else {
            console.warn('⚠️ 売上データが1件も見つかりませんでした。');
        }
    } catch (e) {
        console.error('❌ BigQuery集計エラー:', e.message);
    }
    console.log('--- 🛡 調査完了 ---');
}

/**
 * 現在の設定で売上メールが正しくヒットするかテストする
 */
function debug_testGmailSearch() {
    const ingestion = new SalesEmailIngestionService();
    const query = ingestion.searchQuery;
    console.log(`--- Gmail Search Test ---`);
    console.log(`Query: ${query}`);

    const threads = GmailApp.search(query, 0, 10);
    console.log(`Found ${threads.length} threads.`);

    threads.forEach((thread, i) => {
        const msg = thread.getMessages()[0];
        console.log(`[${i + 1}] Subject: ${msg.getSubject()} (Date: ${msg.getDate()})`);
    });

    if (threads.length === 0) {
        console.warn('⚠️ 指定されたキーワードでメールが見つかりませんでした。件名に「売上」「速報」「報告」のいずれかが含まれているか確認してください。');
    }
}

/**
 * 直近のメール20件の件名を表示して、売上メールの正しいキーワードを見つける
 */
function debug_discoverGmailKeywords() {
    console.log(`--- Gmail Keyword Discovery (Recent 20 Messages) ---`);
    const threads = GmailApp.getInboxThreads(0, 20);

    threads.forEach((thread, i) => {
        const msg = thread.getMessages()[0];
        console.log(`[${i + 1}] Subject: ${msg.getSubject()} | From: ${msg.getFrom()}`);
    });
    console.log(`---------------------------------------------------`);
    console.log(`上記の一覧から、売上報告メールを探してみてください。`);
    console.log(`その件名に含まれる特徴的な単語（例：「実績」「店舗別」「明細」など）を教えていただければ設定を修正します。`);
}

/**
 * BigQueryの sales_transactions テーブルに email_time カラム（TIMESTAMP型）を追加する。
 * 最新報告優先ロジックへの移行のために1回だけ実行が必要。
 */
function debug_updateSalesSchema_AddEmailTime() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = Config.BIGQUERY.TABLES.SALES;
    const query = `ALTER TABLE \`${datasetId}.${tableId}\` ADD COLUMN IF NOT EXISTS email_time TIMESTAMP`;

    console.log(`Executing schema update: ${query}`);
    try {
        bq.runQuery(query);
        console.log('✅ Added email_time column to sales_transactions table.');
    } catch (e) {
        console.error('❌ Failed to update schema:', e.message);
    }
}

/**
 * 全期間（2024/01/01〜）の売上メールを再取得し、最新ロジック（email_time付き）で再取込する。
 * 既存のデータ（email_id）をチェックし、未処理のメールのみをAI解析対象とする（高速化）。
 */
function debug_runSalesBackfillAllTime() {
    console.log('--- 🚀 全期間売上データバックフィル開始 (2024/01/01〜) ---');
    const ingestion = new SalesEmailIngestionService();
    const repository = new SalesRepository();
    const bq = getBigQueryClient();

    // 1. BigQueryから既存の email_id を取得
    console.log('BigQueryから既存の登録済みメールIDを取得しています...');
    let excludedIds = [];
    try {
        const existingResult = bq.runQuery(`
            SELECT DISTINCT email_id 
            FROM \`${Config.BIGQUERY.DATASET_ID}.${Config.BIGQUERY.TABLES.SALES}\`
        `);
        excludedIds = existingResult.map(r => r.email_id).filter(id => id);
        console.log(`登録済みメール数: ${excludedIds.length}件`);
    } catch (e) {
        console.warn('BigQueryからのID取得に失敗しました（初回実行の場合は正常です）:', e.message);
    }

    // 2. 2024年1月1日以降のメールを、既存分を除外して取得・解析
    const backfillQuery = `(${Config.GMAIL.SEARCH_QUERY}) after:2024/01/01`;
    const results = ingestion.processNewEmails(backfillQuery, excludedIds, 2000);

    if (results.length === 0) {
        console.log('未登録の新しいメールは見つかりませんでした。');
        console.log('（全ての対象メールが処理済みか、検索条件に一致するものがありません）');
        return;
    }

    console.log(`${results.length} 通の新規メールを解析しました。BigQueryに保存を開始します...`);

    results.forEach((result, index) => {
        try {
            repository.processTransaction(result);
            if ((index + 1) % 10 === 0) {
                console.log(`進行状況: ${index + 1} / ${results.length} 件保存完了`);
            }
        } catch (e) {
            console.error(`Error saving email ID ${result.source.id}:`, e.message);
        }
    });

    console.log('--- ✅ 本回分のバックフィル処理完了 ---');
    console.log('※Gmailスキャン数が多い場合、一度の実行では終わりません。');
    console.log('  ログを確認し、「未登録の新しいメールは見つかりませんでした」と出るまで繰り返し実行してください。');
}

/**
 * 過去全期間（2024/01〜現在）のデータを月別スプレッドシートとしてアーカイブする。
 * BQに再取込された正確なデータをSSに反映させるために使用。
 */
function debug_archiveAllPastMonths() {
    console.log('--- 🚀 全期間アーカイブ転記開始 (2024/01〜) ---');
    const archiver = new MonthlyArchiver();
    try {
        // 2024年1月から現在までをループ処理
        archiver.backfill(2024, 1);
        console.log('--- ✅ 全期間アーカイブ完了 ---');
    } catch (e) {
        console.error('❌ 全期間アーカイブ中にエラーが発生しました:', e.message);
    }
}



/**
 * Gmailのラベル構成と各ラベルのメール件数を診断する
 */
function debug_diagnoseGmailLabels() {
    const targetLabels = [
        '直売所売上',
        '直売所売上/エーコープ',
        '直売所売上/みどりの大地',
        '直売所売上/一号館',
        '直売所売上/四季彩'
    ];

    console.log('--- 🛡️ Gmail Label Diagnosis ---');
    const allLabels = GmailApp.getUserLabels().map(l => l.getName());

    targetLabels.forEach(labelPath => {
        const found = allLabels.find(l => l === labelPath);
        if (found) {
            const count = GmailApp.search(`label:${labelPath}`).length;
            console.log(`✅ [FOUND] "${labelPath}": ${count} threads`);
        } else {
            console.warn(`⚠️ [NOT FOUND] "${labelPath}"`);
        }
    });

    console.log('\n--- 📝 Current Labels in Gmail ---');
    allLabels.filter(l => l.includes('直売所')).forEach(l => console.log(` - ${l}`));
}

/**
 * Webhookの受信状況を確認する
 */
function debug_checkWebhookStatus() {
    const props = PropertiesService.getScriptProperties();
    const lastAt = props.getProperty('LAST_WEBHOOK_AT');
    const lastContent = props.getProperty('LAST_WEBHOOK_CONTENT');
    const lastError = props.getProperty('LAST_WEBHOOK_ERROR');

    console.log('--- Webhook Status Check ---');
    console.log(`Last Received At: ${lastAt || 'NEVER'}`);
    console.log(`Last Content Snippet: ${lastContent || 'NONE'}`);
    console.log(`Last Error: ${lastError || 'NONE'}`);
}

/**
 * カレンダー同期を手動で即時実行する
 */
function debug_runCalendarSync() {
    console.log('--- 🗓️ Manual Calendar Sync Triggered ---');
    try {
        runCalendarSync();
        console.log('✅ カレンダー同期が正常に完了しました。');
    } catch (e) {
        console.error('❌ カレンダー同期中にエラーが発生しました:', e.message);
    }
}

/**
 * 過去のチャットログより休み予定を抽出し、カレンダーに登録する
 */
function debug_backfillCalendarFromChat() {
    const chatLogger = new ChatLoggerService();
    // 直近60日間のログを再スキャン
    const days = 60;
    const count = chatLogger.backfillCalendarFromChat(days);
    console.log(`--- 📅 Chat Calendar Backfill Finished: ${count} events processed (Last ${days} days) ---`);
}

/**
 * LINE WORKS のカレンダーID一覧を取得する
 */
function debug_listLwCalendars() {
    console.log('--- 📅 Listing LINE WORKS Calendars for Sync Pairs ---');
    const service = new CalendarService();
    const pairs = Config.GOOGLE_CALENDAR.SYNC_PAIRS;

    pairs.forEach(pair => {
        console.log(`User: ${pair.displayName} (${pair.lwUserId})`);
        const cals = service.getUserCalendars(pair.lwUserId);
        if (cals && cals.length > 0) {
            cals.forEach(c => {
                console.log(` - ID: ${c.calendarId} | Name: ${c.calendarName}`);
            });
        } else {
            console.log(' ❌ No calendars found or Error occurred.');
        }
    });
}

/**
 * LINE WORKS のユーザー一覧（ID、名前、メール）を表示する
 */
function debug_listLwUsers() {
    console.log('--- 👤 Listing LINE WORKS Users ---');
    const service = new DirectoryService();
    const users = service.getUsers();

    if (users && users.length > 0) {
        users.forEach(u => {
            console.log(` - Name: ${u.userName} | Email: ${u.email} | ID: ${u.userId}`);
        });
    } else {
        console.log(' ❌ No users found or Error occurred.');
    }
}

/**
 * 最小限のペイロードでイベント作成テストを行う
 */
/**
 * カレンダーの重複予定を削除する（クリーニング）
 * チャット自動登録などで重複してしまった予定を整理します。
 */
function debug_removeDuplicateEvents() {
    console.log('--- 🧹 Starting Calendar Deduplication ---');
    const calendarId = Config.GOOGLE_CALENDAR.MASTER_CALENDAR_ID;
    if (!calendarId) {
        console.error('Master Calendar ID not set.');
        return;
    }
    const gCal = CalendarApp.getCalendarById(calendarId);

    // 期間: 過去3ヶ月〜未来3ヶ月
    const now = new Date();
    const start = new Date(now);
    start.setMonth(now.getMonth() - 3);
    const end = new Date(now);
    end.setMonth(now.getMonth() + 3);

    const events = gCal.getEvents(start, end);
    console.log(`Scanning ${events.length} events from ${start.toDateString()} to ${end.toDateString()}...`);

    const uniqueMap = {};
    let deletedCount = 0;

    events.forEach(e => {
        // 重複判定キー: タイトル + 開始時間 + 終了時間
        const key = `${e.getTitle()}_${e.getStartTime().toISOString()}_${e.getEndTime().toISOString()}`;

        // 自動生成されたイベントかどうかの判定 (説明文にタグがあるか)
        const desc = e.getDescription() || '';
        const isBotEvent = desc.includes('【Chat Source】') || desc.includes('【LW Sync】') || desc.includes('GCalID:');

        if (!uniqueMap[key]) {
            // まだ登録されていない場合はマップに登録
            uniqueMap[key] = e;
        } else {
            // 既にキーが存在する場合、重複とみなす
            const existing = uniqueMap[key];
            const existingIsBot = (existing.getDescription() || '').includes('【Chat Source】') || (existing.getDescription() || '').includes('【LW Sync】');

            if (isBotEvent) {
                // 今回のがBot生成なら問答無用で削除（後から来たものを消す＝古い方を残す）
                console.log(`🗑 Deleting duplicate (Bot): ${e.getTitle()} (${e.getStartTime().toLocaleDateString()})`);
                e.deleteEvent();
                deletedCount++;
            } else if (existingIsBot) {
                // 今回のが手動っぽくて、既存のがBot生成なら、既存を消して今回の方を残す（手動優先）
                console.log(`🗑 Deleting duplicate (Swapping manual over bot): ${existing.getTitle()}`);
                existing.deleteEvent();
                uniqueMap[key] = e; // マップを更新
                deletedCount++;
            } else {
                // 両方手動（またはタグなし）の場合は慎重に...今回はスキップしてログのみ
                console.warn(`⚠️ Both verify as manual/unknown. Skipping duplicate: ${e.getTitle()}`);
            }
        }
    });

    console.log(`--- Deduplication Finished. Deleted ${deletedCount} events. ---`);
}

/**
 * LINE WORKS カレンダーの重複予定を削除する（クリーニング）
 * Googleカレンダーだけでなく、LINE WORKS側で重複してしまった予定も整理します。
 */
function debug_removeDuplicateEventsLW() {
    console.log('--- 🧹 Starting LINE WORKS Calendar Deduplication ---');

    // 1. 対象ユーザーの特定
    // ConfigのSYNC_PAIRSに登録されているユーザー + Adminユーザーを対象とする
    const targetUsers = [];
    if (Config.GOOGLE_CALENDAR.SYNC_PAIRS) {
        Config.GOOGLE_CALENDAR.SYNC_PAIRS.forEach(p => {
            if (p.lwUserId) targetUsers.push({ id: p.lwUserId, name: p.displayName, calendarId: p.lwCalendarId });
        });
    }

    // 重複を避けるためのSet
    const uniqueTargets = new Map();
    targetUsers.forEach(u => uniqueTargets.set(u.id, u));

    const service = new CalendarService();
    const now = new Date();
    // 期間: 過去3ヶ月〜未来3ヶ月
    const start = new Date(now);
    start.setMonth(now.getMonth() - 3);
    const end = new Date(now);
    end.setMonth(now.getMonth() + 3);

    console.log(`Scanning period: ${start.toISOString().split('T')[0]} ~ ${end.toISOString().split('T')[0]}`);

    uniqueTargets.forEach(user => {
        console.log(`Processing User: ${user.name} (${user.id}) ...`);

        let calendarId = user.calendarId;
        if (!calendarId || calendarId === '1') {
            // カレンダーIDが未定の場合は既定を取得
            const cals = service.getUserCalendars(user.id);
            const def = cals.find(c => c.calendarName === '既定のカレンダー' || c.calendarName === 'マイカレンダー') || cals[0];
            if (def) calendarId = def.calendarId;
        }

        if (!calendarId) {
            console.warn(`Skipping ${user.name}: No Calendar ID found.`);
            return;
        }

        try {
            const events = service.getEvents(user.id, calendarId, start, end);
            console.log(`  -> Found ${events.length} events in calendar ${calendarId}`);

            const groupMap = {};
            let deletedCount = 0;

            events.forEach(ev => {
                // 不正データの除外
                if (!ev || !ev.start || !ev.end) {
                    console.warn(`Skipping invalid event data: ${JSON.stringify(ev)}`);
                    return;
                }

                // キー: タイトル + 開始日時 + 終了日時 (Timezone考慮なしの文字列一致で十分)
                // start/end は { dateTime: ... } or { date: ... }
                const sVal = ev.start.dateTime || ev.start.date;
                const eVal = ev.end.dateTime || ev.end.date;

                if (!sVal || !eVal) { // 日時取得不可の場合もスキップ
                    console.warn(`Skipping event with missing date/time properties: ${ev.summary}`);
                    return;
                }

                const key = `${ev.summary}_${sVal}_${eVal}`;

                if (!groupMap[key]) {
                    groupMap[key] = [];
                }
                groupMap[key].push(ev);
            });

            // 重複チェックと削除
            Object.keys(groupMap).forEach(key => {
                const duplicates = groupMap[key];
                if (duplicates.length > 1) {
                    console.log(`  Targeting duplicates for: "${duplicates[0].summary}" (Count: ${duplicates.length})`);

                    // 1つだけ残して他を削除
                    for (let i = 1; i < duplicates.length; i++) {
                        const target = duplicates[i];
                        console.log(`    🗑 Deleting duplicate LW Event ID: ${target.eventId}`);
                        const success = service.deleteEvent(user.id, calendarId, target.eventId);
                        if (success) deletedCount++;
                        // Rate Limit考慮が必要だが、同期実行で少し時間がかかるため簡易waitは入れない
                        Utilities.sleep(500);
                    }
                }
            });

            console.log(`  -> Deleted ${deletedCount} duplicate events for ${user.name}.`);

        } catch (e) {
            console.error(`Error processing user ${user.name}:`, e);
        }
    });

    console.log('--- LW Deduplication Finished ---');
}
