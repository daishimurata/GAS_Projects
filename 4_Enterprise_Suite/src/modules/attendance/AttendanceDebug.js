/**
 * src/modules/attendance/AttendanceDebug.js
 * 勤怠データ化のテスト・実行用スクリプト
 */

function debug_ingestMasterRecords() {
    const service = new AttendanceIngestionService();
    // テストとして R6年7月のフォルダを指定
    const targetPath = '/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/おひさま農園/国保連請求/国保連提供実績記録表/国保連実績R6年7月';

    console.log('--- Starting Master Record Ingestion Test ---');
    service.processMasterRecords(targetPath);
    console.log('--- Master Record Ingestion Test Finished ---');
}

function debug_ingestAccountingRecords() {
    const service = new AttendanceIngestionService();
    const targetPath = '/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/経理関係/第２期（2024.3.1-2025.2.28)/勤務表（2024.3.1-2025.2.28)';

    console.log('--- Starting Accounting Record Ingestion Test ---');
    service.processAccountingRecords(targetPath);
    console.log('--- Accounting Record Ingestion Test Finished ---');
}

/**
 * 全期間の提供実績記録表を一括登録する
 */
function debug_ingestAllMasterRecords() {
    const service = new AttendanceIngestionService();
    const rootPath = '/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/おひさま農園/国保連請求/国保連提供実績記録表';

    console.log('--- Starting Bulk Master Record Ingestion ---');
    service.processMasterRecords(rootPath);
    console.log('--- Bulk Master Record Ingestion Finished ---');
}

/**
 * 全期間の経理勤務表を一括登録する
 */
function debug_ingestAllAccountingRecords() {
    const service = new AttendanceIngestionService();
    const periods = [
        '/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/経理関係/第２期（2024.3.1-2025.2.28)/勤務表（2024.3.1-2025.2.28)',
        '/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/経理関係/第３期（2025.3.1-2026.2.29)/勤務表（2025.3.1-2026.2.29)'
    ];

    console.log('--- Starting Bulk Accounting Record Ingestion ---');
    for (const path of periods) {
        try {
            service.processAccountingRecords(path);
            // processAccountingRecords内でshouldYield()により中断された場合、
            // すでにトリガーが設定されているので、ここでループを抜ける
            if (service.shouldYield()) break;
        } catch (e) {
            console.error(`Error processing path ${path}:`, e);
        }
    }
    console.log('--- Bulk Accounting Record Ingestion Loop Finished (Check logs for triggers) ---');
}

/**
 * R6.7のMarkdownファイルから直接データをパースして投入する（テスト用）
 */
function ingestMasterFromMarkdown_R6_7() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tableId = Config.BIGQUERY.TABLES.ATTENDANCE_MASTER;

    const batch1 = [
        { user_name: '川口 紀波', date: '2024-07-01', start_time: '09:30', end_time: '13:30', transportation: '往復', meal_provided: true, source_file: '📋 障害福祉サービス事業所運営記録_令和6年7月.md', created_at: new Date() },
        { user_name: '川口 紀波', date: '2024-07-02', start_time: '09:30', end_time: '13:30', transportation: '往復', meal_provided: true, source_file: '📋 障害福祉サービス事業所運営記録_令和6年7月.md', created_at: new Date() },
        { user_name: '川口 紀波', date: '2024-07-03', start_time: '09:30', end_time: '13:30', transportation: '往復', meal_provided: true, source_file: '📋 障害福祉サービス事業所運営記録_令和6年7月.md', created_at: new Date() },
        { user_name: '川口 紀波', date: '2024-07-04', start_time: '09:30', end_time: '13:30', transportation: '往復', meal_provided: true, source_file: '📋 障害福祉サービス事業所運営記録_令和6年7月.md', created_at: new Date() },
        { user_name: '川口 紀波', date: '2024-07-05', start_time: '09:30', end_time: '13:30', transportation: '往復', meal_provided: true, source_file: '📋 障害福祉サービス事業所運営記録_令和6年7月.md', created_at: new Date() }
    ];

    bq.insertRows(datasetId, tableId, batch1);
    console.log('Successfully ingested initial rows for Kawaguchi-san (R6.7).');
}

/**
 * テーブルの存在と件数を確認する診断関数
 */
function getAttendanceTableStatus() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const tables = [
        Config.BIGQUERY.TABLES.ATTENDANCE_MASTER,
        Config.BIGQUERY.TABLES.ACCOUNTING_ATTENDANCE,
        Config.BIGQUERY.TABLES.USER_MASTER
    ];

    const status = tables.map(tableId => {
        try {
            const table = BigQuery.Tables.get(Config.BIGQUERY.PROJECT_ID, datasetId, tableId);
            return {
                table: tableId,
                exists: true,
                numRows: table.numRows || 0,
                lastModified: new Date(parseInt(table.lastModifiedTime)).toLocaleString()
            };
        } catch (e) {
            return {
                table: tableId,
                exists: false,
                error: e.message
            };
        }
    });

    return status;
}

/**
 * 利用可能なGeminiモデルを一覧表示する
 */
function debug_listGeminiModels() {
    const gemini = new GeminiClient();
    const result = gemini.listModels();
    console.log('--- Available Gemini Models ---');
    console.log(JSON.stringify(result, null, 2));
    console.log('-------------------------------');
}
