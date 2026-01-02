/**
 * 指定したスプレッドシートに BigQuery の全テーブルをシートごとに接続する
 * 実行前に：スプレッドシートのIDを正しく設定してください
 */
function syncAllBigQueryTablesToSheets() {
    // BigQuery 連携を有効化 (oauthScopes update forced)
    SpreadsheetApp.enableBigQueryExecution();

    const spreadsheetId = '1y8ziiAAHD70izwNNitv2nuDjHuv6sZfH3jcLqYoEdOg';
    const projectId = 'gen-lang-client-0396634194';
    const datasetId = 'enterprise_suite_data';

    const ss = SpreadsheetApp.openById(spreadsheetId);

    // 接続したいテーブル一覧 (自動取得も可能ですが、主要なものを明示)
    const tables = [
        'user_master',
        'document_schedule',
        'document_templates',
        'user_support_plans',
        'user_daily_records',
        'staff_attendance',
        'chat_logs',
        'user_assessments',
        'user_profiles',
        'transport_records',
        'user_evaluation_records',
        'user_support_goals',
        'user_families',
        'user_life_histories',
        'user_support_plan_changes',
        'user_support_process_records',
        'product_master',
        'sales_transactions',
        'store_master',
        'ohisama_master_view' // 統合ビューも追加
    ];

    tables.forEach(tableName => {
        let sheet = ss.getSheetByName(tableName);
        if (sheet) {
            console.log(`Sheet ${tableName} already exists. Skipping.`);
            return;
        }

        try {
            // BigQuery データソースの構築
            const dataSourceSpec = SpreadsheetApp.newDataSourceSpec()
                .asBigQuery()
                .setProjectId(projectId)
                .setRawQuery(`SELECT * FROM \`${projectId}.${datasetId}.${tableName}\``)
                .build();

            // 新しいシートを作成し、そこにデータソーステーブルを挿入する
            ss.insertSheetWithDataSourceTable(dataSourceSpec);

            // 作成されたシートの名前をテーブル名に変更 (最新のシートがそれになる)
            const newSheet = ss.getSheets()[ss.getSheets().length - 1];
            // ただし、insertSheetWithDataSourceTable は自動で名前が付く場合があるため、
            // 既存のシート名と重複しないようにリネーム
            newSheet.setName(tableName);

            console.log(`Successfully connected ${tableName} to a new sheet.`);
        } catch (e) {
            console.error(`Error connecting ${tableName}: ${e.message}`);
        }
    });

    console.log('全テーブルの接続設定が完了しました！スプレッドシートを開いてデータを確認してください。');
}

/**
 * カスタムメニューを追加
 */
function onOpen() {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('おひさまAI連携')
        .addItem('全データ同期 (BQ → Sheet)', 'syncAllBigQueryTablesToSheets')
        .addSeparator()
        .addItem('チャットログ取込 (CSV → BQ)', 'runChatLogImport')
        .addToUi();
}
